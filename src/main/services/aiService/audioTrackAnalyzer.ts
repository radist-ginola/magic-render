import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Keyframe } from '../../../shared/domain/aiTypes';
import type { PlaylistTrack } from '../../../shared/domain/playlistTypes';
import { probeAudioFile } from '../audio/audioProbe';

export type PlaylistAudioEvidence = {
  trackName: string;
  durationSeconds: number;
  sampleStartSec: number;
  sampleDurationSec: number;
  formatName: string;
  spectrogram: Keyframe;
};

function unitRandom(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0;
}

/** Select exactly one random playlist track and render a short log-frequency spectrogram for AI inspection. */
export async function analyzeRandomPlaylistTrack(
  ffmpegExecutable: string,
  ffprobeExecutable: string,
  tracks: PlaylistTrack[],
  random: () => number = Math.random,
): Promise<PlaylistAudioEvidence | null> {
  if (!tracks.length) return null;
  if (!ffmpegExecutable.trim()) throw new Error('FFmpeg belum dikonfigurasi untuk analisis lagu playlist.');
  const selected = tracks[Math.floor(unitRandom(random) * tracks.length)]!;
  const metadata = await probeAudioFile(ffprobeExecutable, selected.path);
  const sampleDurationSec = Math.min(24, metadata.durationSeconds);
  const latestStart = Math.max(0, metadata.durationSeconds - sampleDurationSec);
  const sampleStartSec = Math.round(unitRandom(random) * latestStart * 1000) / 1000;
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', sampleStartSec.toFixed(3),
    '-i', metadata.path, '-t', sampleDurationSec.toFixed(3), '-vn',
    '-filter_complex', 'showspectrumpic=s=1280x512:mode=combined:color=fiery:scale=log:legend=0',
    '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
  ];
  const spectrogram = await new Promise<Keyframe>((resolve, reject) => {
    const child = spawn(ffmpegExecutable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Waktu pembuatan spectrogram lagu playlist habis.'));
    }, 90000);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          child.kill();
          reject(new Error('Gambar spektrum lagu terlalu besar untuk analisis SEO.'));
        }
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const buffer = Buffer.concat(chunks);
      if (code !== 0 || buffer.length < 128) return reject(new Error(stderr.trim() || `FFmpeg gagal membuat spectrogram lagu playlist (exit ${code}).`));
      resolve({ timestampSec: sampleStartSec, mimeType: 'image/png', base64: buffer.toString('base64') });
    });
  });
  return {
    trackName: path.basename(metadata.path),
    durationSeconds: metadata.durationSeconds,
    sampleStartSec,
    sampleDurationSec,
    formatName: metadata.formatName,
    spectrogram,
  };
}

/** Pure selector exported for deterministic tests. */
export function selectRandomPlaylistTrack<T>(tracks: T[], random: () => number = Math.random): T | null {
  if (!tracks.length) return null;
  return tracks[Math.floor(unitRandom(random) * tracks.length)] ?? null;
}
