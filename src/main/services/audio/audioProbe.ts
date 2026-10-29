import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

type FFprobeAudioJson = { format?: { duration?: string | number; format_name?: string }; streams?: Array<{ codec_type?: string; duration?: string | number }> };

export type AudioMetadata = { path: string; durationSeconds: number; formatName: string; sizeBytes: number };

export async function probeAudioFile(ffprobeExecutable: string, filePath: string): Promise<AudioMetadata> {
  if (!ffprobeExecutable) throw new Error('FFprobe executable belum dikonfigurasi.');
  const absolutePath = path.resolve(filePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`File audio tidak ditemukan: ${absolutePath}`);
  if (path.extname(absolutePath).toLowerCase() !== '.mp3') throw new Error(`File playlist harus MP3: ${absolutePath}`);
  const json = await new Promise<FFprobeAudioJson>((resolve, reject) => {
    const child = spawn(ffprobeExecutable, ['-v', 'error', '-show_entries', 'format=duration,format_name', '-show_entries', 'stream=codec_type,duration', '-of', 'json', absolutePath], { shell: false, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(JSON.parse(stdout) as FFprobeAudioJson) : reject(new Error(stderr || `ffprobe exited with code ${code}`)));
  });
  const durationRaw = Number(json.format?.duration ?? json.streams?.find((stream) => stream.codec_type === 'audio')?.duration);
  if (!Number.isFinite(durationRaw) || durationRaw <= 0) throw new Error(`Durasi audio tidak valid: ${absolutePath}`);
  return { path: absolutePath, durationSeconds: durationRaw, formatName: String(json.format?.format_name ?? 'mp3'), sizeBytes: stat.size };
}
