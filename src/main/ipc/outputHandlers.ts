import { registerIpcHandler } from './loggedHandler';

import { showOpenDialog } from './dialogHelper';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { assertAllowedString, assertProjectData } from './validation';
import { OutputService } from '../services/render/outputService';
import { normalizeBitrate } from '../services/render/encodingBuilder';
import { shell } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const outputService = new OutputService();


export function registerOutputIpcHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.OUTPUT_OPEN_VIDEO, async (_event, videoPath: unknown) => {
    assertAllowedString(videoPath, 'video output', 32767);
    const file = path.resolve(videoPath as string);
    if (path.extname(file).toLowerCase() !== '.mp4' || !(await stat(file)).isFile()) throw new Error('Video MP4 hasil render tidak ditemukan.');
    const error = await shell.openPath(file);
    if (error) throw new Error(`Gagal membuka video: ${error}`);
  });
  registerIpcHandler(IPC_CHANNELS.OUTPUT_CHOOSE_DIRECTORY, async () => {
    const result = await showOpenDialog( {
      title: 'Choose Default Output Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerIpcHandler(IPC_CHANNELS.OUTPUT_VALIDATE, async (_event, project: unknown) => {
    const validProject = assertProjectData(project);
    const estimatedBytes = estimateOutputBytes(validProject);
    return outputService.validateDirectory(validProject.settings.outputDir, '.mp4', estimatedBytes);
  });

  registerIpcHandler(IPC_CHANNELS.OUTPUT_UPDATE_SETTINGS, async (_event, project: unknown, outputDir: unknown, resolution: unknown, bitrateKbps: unknown) => {
    const validProject = assertProjectData(project);
    assertAllowedString(outputDir, 'output directory', 32767);
    if (resolution !== '720p' && resolution !== '1080p' && resolution !== '2K' && resolution !== '4K') throw new Error('Invalid output resolution.');
    if (typeof bitrateKbps !== 'number' || !Number.isFinite(bitrateKbps)) throw new Error('Invalid output bitrate.');
    const normalizedBitrate = normalizeBitrate(bitrateKbps);
    const validation = await outputService.validateDirectory(outputDir, '.mp4');
    if (!validation.valid) throw new Error(validation.errors.join(' ') || 'Output configuration tidak valid.');
    return { project: { ...validProject, settings: { ...validProject.settings, outputDir: validation.directory, resolution, bitrateKbps: normalizedBitrate } } satisfies ProjectData, validation };
  });
}

function estimateOutputBytes(project: ProjectData): number {
  const duration = project.mainMedia?.durationSeconds ?? 60;
  return Math.ceil(duration * project.settings.bitrateKbps * 1000 / 8 * 1.15);
}
