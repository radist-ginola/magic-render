import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { PreviewFrameRequest, PreviewFrameResult } from '../../../shared/domain/previewTypes';

export class PreviewFrameService {
  constructor(private readonly ffmpegExecutable: string) {}

  async extract(request: PreviewFrameRequest): Promise<PreviewFrameResult> {
    const input = path.resolve(request.mediaPath);
    const stat = await fs.stat(input).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Media preview tidak ditemukan: ${input}`);
    if (!(Number.isFinite(request.timestampSec) && request.timestampSec >= 0)) throw new Error('Timestamp preview tidak valid.');
    if (!this.ffmpegExecutable.trim()) throw new Error('FFmpeg executable belum dikonfigurasi.');

    const args = ['-hide_banner', '-loglevel', 'error', '-ss', request.timestampSec.toFixed(3), '-i', input, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'];
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegExecutable, args, { shell: false, windowsHide: true });
      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0 || chunks.length === 0) return reject(new Error(stderr.trim() || `FFmpeg frame extraction gagal (exit ${code}).`));
        resolve({ projectId: request.projectId, timestampSec: request.timestampSec, mimeType: 'image/png', base64: Buffer.concat(chunks).toString('base64') });
      });
    });
  }
}
