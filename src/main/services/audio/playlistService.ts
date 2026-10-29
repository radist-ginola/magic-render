import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { AudioCompositionPlan, PlaylistTrack } from '../../../shared/domain/playlistTypes';
import { probeAudioFile } from './audioProbe';
import { validatePlaylistTrack, validatePlaylistShape } from './playlistValidator';
import { buildExactDurationComposition, calculateTotalDuration, removeTrack, reorderTracks, shuffleTracks } from './playlistAlgorithms';
import { orderedPlaylistTracks } from '../../../shared/domain/playlistOrder';
import { logger } from '../../utils/logger';

export class PlaylistService {
  constructor(private readonly ffprobeExecutable: string) {}

  async importFiles(project: ProjectData, filePaths: string[]): Promise<ProjectData> {
    if (filePaths.length === 0) throw new Error('Pilih minimal satu file MP3.');
    const imported: PlaylistTrack[] = [];
    for (const filePath of filePaths) {
      const validPath = await validatePlaylistTrack(filePath);
      const metadata = await probeAudioFile(this.ffprobeExecutable, validPath);
      imported.push({ path: metadata.path, durationSeconds: metadata.durationSeconds, order: imported.length });
      logger.info(`[INPUT] Menambahkan lagu baru: ${path.basename(metadata.path)}`);
    }
    const existing = this.getPlaybackOrder(project);
    const tracks = [...existing, ...imported].map((track, index) => ({ ...track, order: index }));
    const playback = project.playlist.shuffle ? shuffleTracks(tracks).map((track) => track.path) : tracks.map((track) => track.path); return this.withTracks(project, tracks, project.playlist.shuffle, playback);
  }

  /** Repackage audio frames into tag-free MP3 copies; leave original files intact. */
  async resetMetadata(project: ProjectData, ffmpegExecutable: string): Promise<ProjectData> {
    if (!ffmpegExecutable) throw new Error('Path FFmpeg belum disetel.');
    const tracks = this.getTracks(project);
    if (!tracks.length) throw new Error('Import MP3 ke playlist sebelum menghapus metadata.');
    const targetDir = path.join(path.resolve(project.projectDir), 'audio-metadata-cleaned', randomUUID());
    await fs.mkdir(targetDir, { recursive: true });
    const replaced = new Map<string, string>();
    const cleaned: PlaylistTrack[] = [];
    try {
      for (const [index, track] of tracks.entries()) {
        const target = path.join(targetDir, `${String(index + 1).padStart(3, '0')}-${path.basename(track.path)}`);
        await new Promise<void>((resolve, reject) => {
          const child = spawn(ffmpegExecutable, ['-hide_banner', '-nostdin', '-y', '-i', track.path, '-map', '0:a:0', '-c:a', 'copy', '-map_metadata', '-1', '-map_metadata:s:a', '-1', '-map_chapters', '-1', '-id3v2_version', '0', '-write_id3v1', '0', '-f', 'mp3', target], { shell: false, windowsHide: true });
          let errorOutput = '';
          child.stderr.on('data', (chunk: Buffer) => { errorOutput = (errorOutput + String(chunk)).slice(-3000); });
          child.on('error', reject);
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Gagal membersihkan ${path.basename(track.path)}: ${errorOutput.slice(-700)}`)));
        });
        const info = await probeAudioFile(this.ffprobeExecutable, target);
        replaced.set(track.path, target);
        cleaned.push({ path: target, durationSeconds: info.durationSeconds, order: index });
        logger.info(`[AUDIO] Metadata dibersihkan: ${path.basename(track.path)} (salinan audio tanpa re-encode).`);
      }
      const order = (project.playlist.playbackOrder ?? tracks.map(track => track.path)).map(filePath => replaced.get(filePath) ?? filePath);
      return this.withTracks(project, cleaned, project.playlist.shuffle, order);
    } catch (error) {
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  updateTracks(project: ProjectData, tracks: PlaylistTrack[]): ProjectData {
    const normalized = validatePlaylistShape(tracks);
    return this.withTracks(project, normalized, project.playlist.shuffle, normalized.map((track) => track.path));
  }

  reorder(project: ProjectData, fromIndex: number, toIndex: number): ProjectData {
    const tracks = reorderTracks(this.getPlaybackOrder(project), fromIndex, toIndex);
    // Manual movement defines the actual playback order, even after Shuffle.
    return this.withTracks(project, tracks, false, tracks.map((track) => track.path));
  }

  remove(project: ProjectData, index: number): ProjectData {
    const tracks = removeTrack(this.getPlaybackOrder(project), index);
    return this.withTracks(project, tracks, false, tracks.map((track) => track.path));
  }

  setShuffle(project: ProjectData, shuffle: boolean, random: () => number = Math.random): ProjectData {
    const tracks = this.getTracks(project);
    const order = (shuffle ? shuffleTracks(tracks, random) : tracks).map((track) => track.path);
    if (shuffle) logger.info('[AKSI] Mengacak urutan daftar lagu secara otomatis.');
    return this.withTracks(project, tracks, shuffle, order);
  }

  getTracks(project: ProjectData): PlaylistTrack[] {
    if (Array.isArray(project.playlistTracks) && project.playlistTracks.length > 0) return validatePlaylistShape(project.playlistTracks);
    return project.playlist.files.map((filePath, index) => ({ path: path.resolve(filePath), durationSeconds: null, order: index }));
  }

  getTotalDuration(project: ProjectData): number { return calculateTotalDuration(this.getTracks(project)); }

  getPlaybackOrder(project: ProjectData): PlaylistTrack[] {
    return orderedPlaylistTracks(this.getTracks(project), project.playlist.playbackOrder);
  }

  buildComposition(project: ProjectData): AudioCompositionPlan {
    const ordered = this.getPlaybackOrder(project);
    if (ordered.length === 0) throw new Error('Playlist kosong.');
    if (ordered.some((track) => track.durationSeconds === null)) throw new Error('Durasi semua track playlist harus diketahui sebelum audio composition.');
    const targetDurationSeconds = this.getTotalDuration(project);
    if (!(targetDurationSeconds > 0)) throw new Error('Durasi total playlist tidak valid.');
    return buildExactDurationComposition(ordered, targetDurationSeconds, false);
  }

  private withTracks(project: ProjectData, tracks: PlaylistTrack[], shuffle: boolean, playbackOrder: string[]): ProjectData {
    const finalOrder = orderedPlaylistTracks(tracks, playbackOrder).map((track) => track.path);
    return {
      ...project,
      updatedAt: new Date().toISOString(),
      playlistTracks: tracks,
      playlist: { files: tracks.map((track) => track.path), shuffle, playbackOrder: finalOrder },
    };
  }
}
