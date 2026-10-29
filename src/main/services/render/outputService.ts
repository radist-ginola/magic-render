import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { SpawnCommand } from '../ffmpegEngine/commandBuilder';

export const OUTPUT_EXTENSION = '.mp4';
const MIN_FREE_BYTES = 100 * 1024 * 1024;

export type OutputValidation = {
  valid: boolean;
  directory: string;
  extension: string;
  writable: boolean;
  availableBytes: number | null;
  sufficientStorage: boolean | null;
  exists: boolean;
  errors: string[];
  warnings: string[];
};

export class OutputService {
  async validateDirectory(directory: string, expectedExtension = OUTPUT_EXTENSION, estimatedBytes?: number): Promise<OutputValidation> {
    const resolvedDirectory = path.resolve(directory.trim());
    const errors: string[] = [];
    const warnings: string[] = [];
    let writable = false;
    let availableBytes: number | null = null;

    if (!directory.trim()) errors.push('Output directory wajib diisi.');
    const extension = expectedExtension.toLowerCase().startsWith('.') ? expectedExtension.toLowerCase() : `.${expectedExtension.toLowerCase()}`;
    if (extension !== OUTPUT_EXTENSION) errors.push(`Extension output harus ${OUTPUT_EXTENSION}.`);

    try {
      await fs.mkdir(resolvedDirectory, { recursive: true });
      await fs.access(resolvedDirectory, fs.constants.W_OK);
      writable = true;
    } catch {
      errors.push('Output directory tidak dapat ditulis.');
    }

    if (writable) {
      try {
        const stats = await fs.statfs(resolvedDirectory);
        availableBytes = Number(stats.bavail) * Number(stats.bsize);
      } catch {
        warnings.push('Kapasitas storage tidak dapat diperiksa pada environment ini.');
      }
    }

    const requiredBytes = Math.max(estimatedBytes ?? 0, MIN_FREE_BYTES);
    const sufficientStorage = availableBytes === null ? null : availableBytes >= requiredBytes;
    if (sufficientStorage === false) warnings.push('Ruang kosong pada output directory lebih kecil dari kebutuhan minimum yang diperkirakan.');

    return {
      valid: errors.length === 0 && sufficientStorage !== false,
      directory: resolvedDirectory,
      extension,
      writable,
      availableBytes,
      sufficientStorage,
      exists: false,
      errors,
      warnings,
    };
  }

  async prepareOutputPath(directory: string, baseName: string, options: { overwrite?: boolean; extension?: string; estimatedBytes?: number } = {}): Promise<{ outputPath: string; validation: OutputValidation }> {
    const extension = (options.extension ?? OUTPUT_EXTENSION).toLowerCase();
    const validation = await this.validateDirectory(directory, extension, options.estimatedBytes);
    if (!validation.valid) throw new Error(validation.errors.join(' ') || validation.warnings.join(' '));

    const safeBaseName = sanitizeBaseName(baseName);
    const initialPath = path.join(validation.directory, `${safeBaseName}${extension}`);
    if (options.overwrite) {
      return { outputPath: initialPath, validation: { ...validation, exists: await fileExists(initialPath) } };
    }

    if (!(await fileExists(initialPath))) return { outputPath: initialPath, validation };
    for (let index = 1; index <= 1000; index += 1) {
      const candidate = path.join(validation.directory, `${safeBaseName}-${index}${extension}`);
      if (!(await fileExists(candidate))) return { outputPath: candidate, validation: { ...validation, exists: true } };
    }
    throw new Error('Tidak dapat menemukan nama output unik setelah 1000 percobaan.');
  }
}

function sanitizeBaseName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Magic-Render-Pro';
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}


// Final render validation and a rare Windows playback compatibility fallback.

export type FinalMp4Assessment = {
  compatible: boolean;
  reason: string;
  sizeBytes: number;
  durationSeconds: number | null;
  videoCodec: string | null;
  pixelFormat: string | null;
  audioCodec: string | null;
  formatName: string | null;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
};

type ProbePayload = {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string | number };
};

const PROBE_TIMEOUT_MS = 30_000;
const MIN_COMPATIBLE_PIX_FORMATS = new Set(['yuv420p']);

/**
 * Confirm that the completed render is a readable MP4 using broadly supported
 * H.264 8-bit 4:2:0 video and, when present/expected, AAC audio. A successful
 * FFmpeg exit code alone is not treated as proof that the final file is usable.
 */
export async function inspectFinalMp4(
  ffprobeExecutable: string,
  filePath: string,
  expectedDurationSeconds: number,
  requireAudio: boolean,
  signal?: AbortSignal,
): Promise<FinalMp4Assessment> {
  let sizeBytes = 0;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return failure('File output bukan file biasa.');
    sizeBytes = stat.size;
    if (sizeBytes <= 0) return failure('File output kosong.');
  } catch (error) {
    return failure(`File output tidak dapat dibaca: ${error instanceof Error ? error.message : String(error)}`);
  }

  let payload: ProbePayload;
  try {
    payload = await runProbe(ffprobeExecutable, filePath, signal);
  } catch (error) {
    return failure(`FFprobe tidak dapat membaca MP4 final: ${error instanceof Error ? error.message : String(error)}`, sizeBytes);
  }

  const streams = payload.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const formatName = String(payload.format?.format_name ?? '');
  const durationValue = Number(payload.format?.duration);
  const durationSeconds = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : null;
  const videoCodec = video?.codec_name ?? null;
  const pixelFormat = video?.pix_fmt ?? null;
  const audioCodec = audio?.codec_name ?? null;

  const fail = (reason: string): FinalMp4Assessment => ({ compatible: false, reason, sizeBytes, durationSeconds, videoCodec, pixelFormat, audioCodec, formatName: formatName || null });
  if (!formatName.split(',').some((name) => name.trim().toLowerCase() === 'mp4')) return fail(`Container final bukan MP4 yang dikenali FFprobe (${formatName || 'tidak diketahui'}).`);
  if (!video) return fail('MP4 final tidak memiliki video stream.');
  if (!(Number(video.width) > 0) || !(Number(video.height) > 0)) return fail('Resolusi video final tidak valid.');
  if (Number(video.width) % 2 !== 0 || Number(video.height) % 2 !== 0) return fail('Resolusi video final ganjil dan perlu dinormalisasi ke dimensi genap.');
  if (videoCodec !== 'h264') return fail(`Codec video final ${videoCodec ?? 'tidak diketahui'} tidak termasuk H.264 yang diprioritaskan untuk kompatibilitas Windows.`);
  if (!pixelFormat || !MIN_COMPATIBLE_PIX_FORMATS.has(pixelFormat)) return fail(`Format piksel video final ${pixelFormat ?? 'tidak diketahui'} bukan yuv420p 8-bit yang umum didukung pemutar Windows.`);
  if (requireAudio && !audio) return fail('Audio diharapkan tersedia, tetapi MP4 final tidak memiliki audio stream.');
  if (requireAudio && audioCodec !== 'aac') return fail(`Codec audio final ${audioCodec ?? 'tidak diketahui'} bukan AAC yang diprioritaskan untuk kompatibilitas MP4/Windows.`);
  if (!durationSeconds) return fail('Durasi MP4 final tidak terbaca atau bernilai nol.');
  const tolerance = Math.max(0.25, Math.min(1, expectedDurationSeconds * 0.01));
  if (Number.isFinite(expectedDurationSeconds) && expectedDurationSeconds > 0 && durationSeconds < expectedDurationSeconds - tolerance) {
    return fail(`Durasi MP4 final ${durationSeconds.toFixed(3)} detik lebih pendek daripada target ${expectedDurationSeconds.toFixed(3)} detik.`);
  }

  return { compatible: true, reason: 'Container MP4 terbaca; video H.264 yuv420p dan track audio yang diharapkan lolos validasi.', sizeBytes, durationSeconds, videoCodec, pixelFormat, audioCodec, formatName };
}

/** Build a rare fallback encode used only when output validation fails. */
export function buildWindowsCompatibleOutputCommand(
  ffmpegExecutable: string,
  inputPath: string,
  outputPath: string,
): SpawnCommand {
  return {
    executable: ffmpegExecutable,
    args: [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-map_metadata', '0', '-map_chapters', '0',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_range=tv,setsar=1,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-tag:v', 'avc1',
      '-c:a', 'aac', '-b:a', '256k',
      '-movflags', '+faststart', '-brand', 'mp42', '-f', 'mp4', outputPath,
    ],
  };
}

function failure(reason: string, sizeBytes = 0): FinalMp4Assessment {
  return { compatible: false, reason, sizeBytes, durationSeconds: null, videoCodec: null, pixelFormat: null, audioCodec: null, formatName: null };
}

function runProbe(executable: string, filePath: string, signal?: AbortSignal): Promise<ProbePayload> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Pemeriksaan output dibatalkan.'));
    const child = spawn(executable, [
      '-v', 'error', '-show_entries',
      'format=format_name,duration:stream=codec_type,codec_name,codec_tag_string,pix_fmt,width,height',
      '-of', 'json', filePath,
    ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error: Error | null, payload?: ProbePayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(payload ?? {});
    };
    const onAbort = () => {
      child.kill('SIGKILL');
      finish(new Error('Pemeriksaan output dibatalkan.'));
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`FFprobe tidak merespons dalam ${PROBE_TIMEOUT_MS / 1000} detik.`));
    }, PROBE_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 2 * 1024 * 1024) {
        child.kill('SIGKILL');
        finish(new Error('Metadata MP4 final terlalu besar untuk divalidasi.'));
      }
    });
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4096); });
    child.once('error', (error) => finish(new Error(`FFprobe gagal dijalankan: ${error.message}`)));
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) return finish(new Error(`exit code ${code}: ${stderr.trim() || 'tidak ada detail dari FFprobe'}`));
      try { finish(null, JSON.parse(stdout) as ProbePayload); }
      catch { finish(new Error('Respons metadata FFprobe bukan JSON yang valid.')); }
    });
  });
}
