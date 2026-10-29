import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SpawnCommand } from './commandBuilder';
import { FfmpegProgressParser, type ParsedFfmpegProgress } from './progressParser';
import { applyFfmpegThreadMapping, detectLogicalCoreCount, getCpuAllocation } from '../cpuController';

export type FfmpegRunResult = {
  exitCode: number | null;
  stderr: string;
  stdout: string;
  cancelled: boolean;
  interrupted: boolean;
};

export type FfmpegRunOptions = {
  onOutput?: (line: string) => void;
  onProgress?: (progress: ParsedFfmpegProgress) => void;
};

const WINDOWS_COMMAND_LINE_SAFE_LIMIT = 24_000;
const FILTER_GRAPH_SCRIPT_THRESHOLD = 12_000;
export type FilterGraphFileOption = '-filter_complex_script' | '-/filter_complex';
const filterGraphFileOptionCache = new Map<string, Promise<FilterGraphFileOption>>();

type PreparedFfmpegSpawnArgs = { args: string[]; cleanup: () => void; externalizedFilterGraph: boolean };

function estimatedCommandLineLength(executable: string, args: readonly string[]): number {
  // Includes room for Windows quoting/escaping and spaces between arguments.
  return executable.length + 4 + args.reduce((length, arg) => length + arg.length + 4, 0);
}

/**
 * Move large filter graphs to a temporary script file before spawn().
 * Windows CreateProcess command lines are limited to 32,767 UTF-16 code units;
 * complex scenes with many overlays/stickers/visualizers can otherwise make
 * Node reject FFmpeg with ENAMETOOLONG before FFmpeg even starts.
 */
export function prepareFfmpegSpawnArgs(
  executable: string,
  originalArgs: readonly string[],
  platform: NodeJS.Platform = process.platform,
  windowsLimit = WINDOWS_COMMAND_LINE_SAFE_LIMIT,
  filterGraphFileOption: FilterGraphFileOption = '-/filter_complex',
): PreparedFfmpegSpawnArgs {
  const args = [...originalArgs];
  const graphIndex = args.indexOf('-filter_complex');
  const graph = graphIndex >= 0 ? args[graphIndex + 1] : undefined;
  const longWindowsCommand = platform === 'win32' && estimatedCommandLineLength(executable, args) > windowsLimit;
  const shouldExternalize = typeof graph === 'string' && (
    graph.length >= FILTER_GRAPH_SCRIPT_THRESHOLD || longWindowsCommand
  );

  if (!shouldExternalize) {
    if (longWindowsCommand) {
      const error = new Error('FFmpeg command exceeds the safe Windows command-line length and has no large -filter_complex graph to move into a script. Shorten source/output paths or reduce the number of simultaneous inputs.');
      Object.assign(error, { code: 'ERR_FFMPEG_ARGV_TOO_LONG' });
      throw error;
    }
    return { args, cleanup: () => undefined, externalizedFilterGraph: false };
  }

  const tempDirectory = mkdtempSync(path.join(tmpdir(), 'mrp-ffmpeg-filter-'));
  const filterPath = path.join(tempDirectory, 'filter-complex.txt');
  try {
    writeFileSync(filterPath, graph, { encoding: 'utf8', flag: 'wx' });
    // FFmpeg 9 removed -filter_complex_script. The modern generic option-file
    // syntax (-/filter_complex FILE) is preferred when capability probing says
    // the legacy flag is absent. Older FFmpeg builds keep the legacy option.
    args.splice(graphIndex, 2, filterGraphFileOption, filterPath);
    if (platform === 'win32' && estimatedCommandLineLength(executable, args) > windowsLimit) {
      throw new Error('FFmpeg command still exceeds the safe Windows command-line length after moving its filter graph into a temporary script. Reduce the number of simultaneous media inputs or shorten their paths.');
    }
  } catch (error) {
    rmSync(tempDirectory, { recursive: true, force: true });
    throw error;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    rmSync(tempDirectory, { recursive: true, force: true });
  };
  return { args, cleanup, externalizedFilterGraph: true };
}

/**
 * Detect option-file syntax by executing a tiny real filter graph with the
 * selected FFmpeg binary. Help text alone is unreliable for vendor builds:
 * some builds advertise compatibility flags that are not accepted by the
 * parser actually shipped in the executable.
 */
export function detectFilterGraphFileOption(executable: string): Promise<FilterGraphFileOption> {
  const cacheKey = process.platform === 'win32' ? executable.toLowerCase() : executable;
  const cached = filterGraphFileOptionCache.get(cacheKey);
  if (cached) return cached;

  const probeOption = (option: FilterGraphFileOption): Promise<boolean> => new Promise((resolve, reject) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'mrp-ffmpeg-probe-'));
    const graphPath = path.join(directory, 'probe-filter.txt');
    writeFileSync(graphPath, '[0:v]null[p28_probe_out]', { encoding: 'utf8', flag: 'wx' });
    let child: ReturnType<typeof spawn> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const cleanup = () => rmSync(directory, { recursive: true, force: true });
    const finish = (success: boolean, error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child && child.exitCode === null && !child.killed) {
        child.kill();
        child.once('close', cleanup);
      } else {
        cleanup();
      }
      if (error) reject(error);
      else resolve(success);
    };
    try {
      child = spawn(executable, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=1:d=1',
        option, graphPath, '-map', '[p28_probe_out]', '-frames:v', '1', '-f', 'null', '-',
      ], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      // `spawn`'s public return type allows stderr to be null for inherited/ignored
      // stdio configurations. This probe requests a pipe, but keep the drain guarded
      // so strict null checking remains sound if the stream shape changes.
      const stderrStream = child.stderr;
      if (stderrStream) {
        stderrStream.setEncoding('utf8');
        stderrStream.resume();
      }
      child.once('error', (error) => finish(false, error));
      child.once('close', (code) => finish(code === 0));
      timer = setTimeout(() => finish(false), 3500);
    } catch (error) {
      finish(false, error instanceof Error ? error : new Error(String(error)));
    }
  });

  const detection = (async (): Promise<FilterGraphFileOption> => {
    // FFmpeg 7.1+ provides generic option-file parsing (`-/option file`).
    // Try it first, then fall back to the legacy syntax for older binaries.
    if (await probeOption('-/filter_complex')) return '-/filter_complex';
    if (await probeOption('-filter_complex_script')) return '-filter_complex_script';
    throw new Error(`FFmpeg at "${executable}" does not accept either generic -/filter_complex FILE or legacy -filter_complex_script FILE syntax. Confirm that this is the expected FFmpeg executable and that it supports filter-complex option files.`);
  })();
  filterGraphFileOptionCache.set(cacheKey, detection);
  return detection;
}

function filterGraphRequiresFile(executable: string, args: readonly string[], platform: NodeJS.Platform): boolean {
  const index = args.indexOf('-filter_complex');
  const graph = index >= 0 ? args[index + 1] : undefined;
  return typeof graph === 'string' && (graph.length >= FILTER_GRAPH_SCRIPT_THRESHOLD || (platform === 'win32' && estimatedCommandLineLength(executable, args) > WINDOWS_COMMAND_LINE_SAFE_LIMIT));
}

export async function runFfmpeg(command: SpawnCommand, options: FfmpegRunOptions = {}, cpuLoadPercent: number | null = null): Promise<FfmpegRunResult> {
  return new FfmpegProcess(cpuLoadPercent).run(command, options);
}

export class FfmpegProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private cancelled = false;
  private interrupted = false;

  constructor(private readonly cpuLoadPercent: number | null = null) {}

  private preparing = false;

  async run(command: SpawnCommand, options: FfmpegRunOptions = {}): Promise<FfmpegRunResult> {
    if (this.child || this.preparing) throw new Error('FFmpeg process already running.');
    this.preparing = true;
    try {
      const fileOption = filterGraphRequiresFile(command.executable, command.args, process.platform)
        ? await detectFilterGraphFileOption(command.executable)
        : '-/filter_complex';
      return await new Promise((resolve, reject) => {
      let cleanupPrepared: () => void = () => undefined;
      let child: ChildProcessWithoutNullStreams;
      try {
        const prepared = prepareFfmpegSpawnArgs(command.executable, command.args, process.platform, WINDOWS_COMMAND_LINE_SAFE_LIMIT, fileOption);
        cleanupPrepared = prepared.cleanup;
        if (prepared.externalizedFilterGraph) {
          options.onOutput?.(`[FFMPEG] Filter graph besar dipindahkan ke file sementara menggunakan opsi ${fileOption}; executable aktif: ${command.executable}.`);
        }
        const progressArgs = injectProgressArgs(prepared.args);
        const args = this.cpuLoadPercent === null
          ? progressArgs
          : applyFfmpegThreadMapping(progressArgs, this.cpuLoadPercent, detectLogicalCoreCount());
        child = spawn(command.executable, args, {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        cleanupPrepared();
        reject(error);
        return;
      }
      this.child = child;
      if (this.cpuLoadPercent !== null && child.pid) {
        const allocation = getCpuAllocation(this.cpuLoadPercent);
        if (allocation.ffmpegThreads < allocation.logicalCoreCount) {
          limitProcessAffinity(child.pid, allocation.ffmpegThreads, options.onOutput);
        }
      }
      this.cancelled = false;
      this.interrupted = false;
      const progressParser = new FfmpegProgressParser();
      let stderr = '';
      let stdout = '';
      let stderrPending = '';
      let stdoutPending = '';
      let settled = false;

      const processLines = (chunk: string, stream: 'stdout' | 'stderr') => {
        const combined = (stream === 'stderr' ? stderrPending : stdoutPending) + chunk;
        const lines = combined.split(/\r\n|\n|\r/);
        const pending = lines.pop() ?? '';
        if (stream === 'stderr') stderrPending = pending;
        else stdoutPending = pending;
        for (const line of lines) {
          if (!line.trim()) continue;
          if (stream === 'stdout') options.onProgress?.(progressParser.parseLine(line));
          else {
            options.onOutput?.(line.trim());
            const stats = progressParser.parseStats(line);
            if (stats) options.onProgress?.(stats);
            else if (/^(?:out_time_ms|out_time_us|out_time|speed|progress)=/.test(line.trim())) options.onProgress?.(progressParser.parseLine(line));
          }
        }
      };

      const finish = (result: FfmpegRunResult) => {
        if (settled) return;
        settled = true;
        this.child = null;
        resolve(result);
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk: string) => {
        stdout = (stdout + chunk).slice(-131072);
        processLines(chunk, 'stdout');
      });

      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-131072);
        processLines(chunk, 'stderr');
      });

      child.once('error', (error) => {
        cleanupPrepared();
        this.child = null;
        if (settled) return;
        settled = true;
        reject(error);
      });

      child.once('close', (exitCode) => {
        cleanupPrepared();
        if (stdoutPending.trim()) options.onProgress?.(progressParser.parseLine(stdoutPending));
        if (stderrPending.trim()) {
          options.onOutput?.(stderrPending.trim());
          const stats = progressParser.parseStats(stderrPending);
          if (stats) options.onProgress?.(stats);
        }
        finish({ exitCode, stderr, stdout, cancelled: this.cancelled, interrupted: this.interrupted });
      });
    });
    } finally {
      this.preparing = false;
    }
  }

  cancel(): void {
    this.cancelled = true;
    if (this.child && !this.child.killed) {
      this.child.kill('SIGKILL');
    }
  }

  forceStop(): void {
    const pid = this.child?.pid;
    this.cancel();
    if (process.platform === 'win32' && pid) {
      // TerminateProcess may leave decoder subprocesses behind on Windows.
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false, windowsHide: true, stdio: 'ignore',
      });
      killer.on('error', () => undefined);
    }
  }

  interrupt(): void {
    this.interrupted = true;
    if (this.child && !this.child.killed) this.child.kill('SIGKILL');
  }

  gracefulStop(timeoutMs = 1500): void {
    const child = this.child;
    if (!child || child.killed) return;
    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.write('q\n');
      const timer = setTimeout(() => {
        if (this.child === child && !child.killed) child.kill();
      }, timeoutMs);
      child.once('close', () => clearTimeout(timer));
      return;
    }
    child.kill();
  }

  isRunning(): boolean {
    return this.child !== null;
  }
}

function limitProcessAffinity(pid: number, cores: number, onOutput?: (line: string) => void): void {
  let executable: string;
  let args: string[];
  if (process.platform === 'win32') {
    // SetProcessorAffinityMask constrains the whole FFmpeg process, including
    // decoder, filter workers and encoder threads (up to one 64-core group).
    const mask = ((1n << BigInt(Math.min(cores, 63))) - 1n).toString();
    executable = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${pid} -ErrorAction Stop).ProcessorAffinity = [IntPtr]${mask}`];
  } else if (process.platform === 'linux') {
    // Container/VM affinity may begin at a nonzero core number.
    let allowed = '';
    try { allowed = readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1] ?? ''; }
    catch { return; }
    const ids = allowed.split(',').flatMap((range) => {
      const [first, last] = range.split('-').map(Number);
      if (first === undefined || !Number.isInteger(first)) return [];
      const end = last ?? first;
      return Number.isInteger(end) && end >= first
        ? Array.from({ length: end - first + 1 }, (_, offset) => first + offset) : [];
    });
    if (!ids.length) return;
    executable = 'taskset';
    args = ['-pc', ids.slice(0, cores).join(','), String(pid)];
  } else return;
  const setter = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errorText = '';
  setter.stderr.on('data', (chunk: Buffer) => { errorText += chunk.toString(); });
  setter.on('error', (error) => onOutput?.(`[CPU] Batas inti tidak dapat diterapkan: ${error.message}`));
  setter.on('close', (code) => {
    if (code !== 0 && !/No such process|Cannot find a process/i.test(errorText)) {
      onOutput?.(`[CPU] Batas inti tidak dapat diterapkan: ${errorText.trim() || 'izin sistem ditolak'}`);
    }
  });
}

function injectProgressArgs(args: string[]): string[] {
  if (args.includes('-progress')) return [...args];
  const clone = [...args];
  const insertAt = clone[0] === '-y' ? 1 : 0;
  clone.splice(insertAt, 0, '-progress', 'pipe:1', '-stats_period', '0.5');
  return clone;
}
