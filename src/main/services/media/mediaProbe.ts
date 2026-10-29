import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { detectMainMediaType } from './mediaValidator';
import type { MediaMetadata } from '../../../shared/domain/mediaTypes';
type ProbeJson = { streams?: Array<{codec_type?: string;width?:number;height?:number;r_frame_rate?:string;avg_frame_rate?:string}>; format?: {duration?:string|number;format_name?:string} };
function parseFps(value?: string): number | null {
  if (!value || value === '0/0') return null;
  const [n, d] = value.split('/').map(Number);
  if (n !== undefined && d !== undefined && Number.isFinite(n) && Number.isFinite(d) && d !== 0) return n / d;
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}
export class MediaProbe {
  constructor(private readonly ffprobeExecutable: string, private readonly timeoutMs = 30_000) {}

  async probe(filePath: string, signal?: AbortSignal): Promise<MediaMetadata> {
    const absolutePath = path.resolve(filePath);
    const stat = await fs.stat(absolutePath);
    if (signal?.aborted) throw new Error('Pemeriksaan media dibatalkan.');
    if (!stat.isFile()) throw new Error('Media path bukan file.');
    const type = detectMainMediaType(absolutePath);
    const json = await this.execute(absolutePath, signal);
    const streams = json.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === 'video');
    const duration = Number(json.format?.duration);
    return {
      type, path: absolutePath,
      durationSeconds: Number.isFinite(duration) ? duration : null,
      resolution: video?.width && video?.height ? { width: Number(video.width), height: Number(video.height) } : null,
      fps: parseFps(video?.r_frame_rate ?? video?.avg_frame_rate),
      hasAudioTrack: streams.some((stream) => stream.codec_type === 'audio'),
      formatName: String(json.format?.format_name ?? path.extname(absolutePath).slice(1)),
      sizeBytes: stat.size,
    };
  }
  private execute(filePath: string, signal?: AbortSignal): Promise<ProbeJson> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffprobeExecutable, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error: Error | null, data?: ProbeJson) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(data ?? {});
      };
      const stopProbe = () => {
        child.kill('SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin.destroy();
      };
      const onAbort = () => { stopProbe(); finish(new Error('Pemeriksaan media dibatalkan.')); };
      const timer = setTimeout(() => {
        stopProbe();
        finish(new Error(`FFprobe tidak merespons saat memeriksa ${path.basename(filePath)} (${Math.max(1, Math.ceil(this.timeoutMs / 1000))} detik). Periksa file sumber dan Path FFprobe di Settings.`));
      }, this.timeoutMs);
      if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (stdout.length > 8 * 1024 * 1024) { stopProbe(); finish(new Error('Metadata media terlalu besar untuk dibaca.')); }
      });
      child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-4096); });
      child.on('error', (error) => finish(new Error(`FFprobe tidak dapat dijalankan: ${error.message}. Periksa Path FFprobe di Settings.`)));
      child.on('close', (code) => {
        if (code !== 0) return finish(new Error(`FFprobe gagal memeriksa ${path.basename(filePath)} (exit ${code}): ${stderr.trim()}`));
        try { finish(null, JSON.parse(stdout) as ProbeJson); } catch { finish(new Error('Output metadata FFprobe tidak valid.')); }
      });
    });
  }
}
