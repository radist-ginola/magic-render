import fs from 'node:fs/promises';
import path from 'node:path';
import type { PlaylistTrack } from '../../../shared/domain/playlistTypes';

const MP3_EXTENSION = '.mp3';

export async function validatePlaylistTrack(filePath: string): Promise<string> {
  if (typeof filePath !== 'string' || filePath.trim() === '') throw new Error('Path track playlist kosong.');
  const absolutePath = path.resolve(filePath);
  if (path.extname(absolutePath).toLowerCase() !== MP3_EXTENSION) throw new Error(`Track playlist harus berupa MP3: ${absolutePath}`);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`Track playlist tidak ditemukan: ${absolutePath}`);
  return absolutePath;
}

export function validatePlaylistShape(tracks: PlaylistTrack[]): PlaylistTrack[] {
  if (!Array.isArray(tracks)) throw new Error('Playlist harus berupa array.');
  return tracks.map((track, index) => {
    if (!track || typeof track !== 'object') throw new Error(`Track playlist #${index + 1} tidak valid.`);
    if (typeof track.path !== 'string' || track.path.trim() === '') throw new Error(`Path track playlist #${index + 1} tidak valid.`);
    if (track.durationSeconds !== null && (!Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0)) throw new Error(`Durasi track playlist #${index + 1} tidak valid.`);
    return { path: path.resolve(track.path), durationSeconds: track.durationSeconds, order: index };
  });
}
