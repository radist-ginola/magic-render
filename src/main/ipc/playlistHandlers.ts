import { registerIpcHandler } from './loggedHandler';

import { showOpenDialog } from './dialogHelper';
import path from 'node:path';
import type { ApplicationConfig } from '../config/appConfig';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { IPC_CHANNELS } from '../../shared/ipc';
import { assertAllowedString, assertProjectData, assertPlaylistTracks } from './validation';
import { PlaylistService } from '../services/audio/playlistService';
import { buildAudioConcatCommand } from '../services/audio/audioConcatBuilder';

let service: PlaylistService | null = null;
export function refreshPlaylistService(): void { service = null; }
function getService(): PlaylistService {
  if (!service) service = new PlaylistService(runtimeConfig?.runtime.ffprobePath ?? '');
  return service;
}
let runtimeConfig: ApplicationConfig | null = null;
function assertNonNegativeInt(value: unknown, name: string): number { if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`Invalid ${name}.`); return value as number; }

export function registerPlaylistIpcHandlers(config: ApplicationConfig): void {
  runtimeConfig = config;
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_IMPORT, async (_event, project: unknown) => {
    const validProject = assertProjectData(project);
    const result = await showOpenDialog( { title: 'Import Playlist MP3', properties: ['openFile', 'multiSelections'], filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return getService().importFiles(validProject, result.filePaths);
  });
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_RESET_METADATA, async (_event, project: unknown) => getService().resetMetadata(assertProjectData(project), runtimeConfig?.runtime.ffmpegPath ?? ''));
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_SET_TRACKS, async (_event, project: unknown, tracks: unknown) => getService().updateTracks(assertProjectData(project), assertPlaylistTracks(tracks)));
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_REORDER, async (_event, project: unknown, fromIndex: unknown, toIndex: unknown) => getService().reorder(assertProjectData(project), assertNonNegativeInt(fromIndex, 'fromIndex'), assertNonNegativeInt(toIndex, 'toIndex')));
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_REMOVE, async (_event, project: unknown, index: unknown) => getService().remove(assertProjectData(project), assertNonNegativeInt(index, 'index')));
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_SHUFFLE, async (_event, project: unknown, shuffle: unknown) => { if (typeof shuffle !== 'boolean') throw new Error('shuffle harus boolean.'); return getService().setShuffle(assertProjectData(project), shuffle); });
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_SUMMARY, async (_event, project: unknown) => { const valid = assertProjectData(project); const tracks = valid.playlist.shuffle ? getService().getPlaybackOrder(valid) : getService().getTracks(valid); return { tracks, totalDurationSeconds: getService().getTotalDuration(valid), shuffle: valid.playlist.shuffle }; });
  registerIpcHandler(IPC_CHANNELS.PLAYLIST_BUILD_AUDIO, async (_event, project: unknown, outputPath: unknown) => {
    const valid = assertProjectData(project);
    assertAllowedString(outputPath, 'audio output path', 32767);
    const plan = getService().buildComposition(valid);
    const executable = runtimeConfig?.runtime.ffmpegPath ?? '';
    return { command: buildAudioConcatCommand(executable, plan, path.resolve(outputPath as string)), plan };
  });
}
