import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Keyframe } from '../../../shared/domain/aiTypes';
import type { ProjectData } from '../../../shared/domain/projectTypes';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const FRAME_TIMEOUT_MS = 45_000;
const MAX_FRAME_BYTES = 24 * 1024 * 1024;

type FrameAttempt = { args: string[]; timestampSec: number; label: string };
type FrameAttemptResult = { code: number | null; buffer: Buffer; stderr: string };

export class KeyframeExtractor {
  constructor(private readonly ffmpegExecutable: string) {}

  async extract(project: ProjectData, sourcePath?: string, sourceDurationSeconds?: number): Promise<Keyframe[]> {
    if (!project.mainMedia?.path && !sourcePath) throw new Error('Media belum tersedia untuk analisis AI.');
    const input = path.resolve(sourcePath ?? project.mainMedia!.path);
    const stat = await fs.stat(input).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Main media tidak ditemukan: ${input}`);

    const ext = path.extname(input).toLowerCase();
    // Resize still media too: sending a 4K original consumes upload bandwidth
    // and vision tokens without improving an SEO description.
    if (IMAGE_EXTENSIONS.has(ext)) return [await this.extractFrame(input, 0)];

    const rawDuration = sourceDurationSeconds ?? project.mainMedia?.durationSeconds ?? project.mainMedia?.metadata?.durationSeconds ?? 0;
    const duration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
    const timestamps = representativeTimestamps(duration);
    const frames: Keyframe[] = [];
    for (const timestampSec of timestamps) {
      const frame = await this.extractFrame(input, timestampSec);
      // A timestamp fallback can legitimately return the first decodable frame.
      // Do not send identical timestamps to the model multiple times.
      if (!frames.some((existing) => Math.abs(existing.timestampSec - frame.timestampSec) < 0.001)) frames.push(frame);
    }
    if (!frames.length) throw new Error('FFmpeg tidak menghasilkan keyframe untuk analisis SEO. Pastikan media memiliki video/gambar yang bisa dibaca.');
    return frames;
  }

  private async extractFrame(input: string, timestampSec: number): Promise<Keyframe> {
    if (!this.ffmpegExecutable.trim()) throw new Error('FFmpeg executable belum dikonfigurasi.');
    const safeTimestamp = Number.isFinite(timestampSec) ? Math.max(0, timestampSec) : 0;
    const timestamp = safeTimestamp.toFixed(3);
    const outputArgs = ['-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2', '-an', '-sn', '-dn', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1'];
    const attempts: FrameAttempt[] = [
      { label: 'fast seek', timestampSec: safeTimestamp, args: ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', timestamp, '-i', input, ...outputArgs] },
      { label: 'accurate seek', timestampSec: safeTimestamp, args: ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, '-ss', timestamp, ...outputArgs] },
    ];
    if (safeTimestamp > 0.001) {
      attempts.push({ label: 'first-frame fallback', timestampSec: 0, args: ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, ...outputArgs] });
    }

    const diagnostics: string[] = [];
    for (const attempt of attempts) {
      try {
        const result = await this.runFrameAttempt(attempt.args);
        if (result.code === 0 && result.buffer.length > 0) {
          return { timestampSec: attempt.timestampSec, mimeType: 'image/jpeg', base64: result.buffer.toString('base64') };
        }
        const cause = result.stderr.trim() || (result.code === 0
          ? 'FFmpeg selesai dengan exit code 0 tetapi tidak menghasilkan data gambar.'
          : `FFmpeg keluar dengan kode ${result.code ?? 'tidak tersedia'}.`);
        diagnostics.push(`${attempt.label}: ${cause}`);
      } catch (error) {
        diagnostics.push(`${attempt.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`Ekstraksi keyframe gagal pada ${timestamp}s setelah ${attempts.length} percobaan. ${diagnostics.join(' | ')}`);
  }

  private runFrameAttempt(args: string[]): Promise<FrameAttemptResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      let totalBytes = 0;
      const chunks: Buffer[] = [];
      const child = spawn(this.ffmpegExecutable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const finish = (error?: Error, result?: FrameAttemptResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(result ?? { code: null, buffer: Buffer.alloc(0), stderr });
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`FFmpeg tidak menghasilkan keyframe dalam ${FRAME_TIMEOUT_MS / 1000} detik.`));
      }, FRAME_TIMEOUT_MS);
      child.stdout.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_FRAME_BYTES) {
          child.kill();
          finish(new Error(`Keyframe melebihi batas ${Math.round(MAX_FRAME_BYTES / (1024 * 1024))} MB.`));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000); });
      child.once('error', (error) => finish(new Error(`FFmpeg tidak dapat dijalankan: ${error.message}`)));
      child.once('close', (code) => finish(undefined, { code, buffer: Buffer.concat(chunks), stderr }));
    });
  }
}

function representativeTimestamps(duration: number): number[] {
  if (!(duration > 0)) return [0];
  if (duration < 3) return [Math.max(0, duration / 2)];
  return [Math.min(duration - 0.1, duration * 0.1), Math.min(duration - 0.1, duration * 0.5), Math.min(duration - 0.1, duration * 0.9)];
}
