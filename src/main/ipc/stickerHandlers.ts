import { registerIpcHandler } from './loggedHandler';

import { showOpenDialog } from './dialogHelper';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApplicationConfig } from '../config/appConfig';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { ProjectSticker, StickerMediaType } from '../../shared/domain/stickerTypes';
import { assertAllowedString, assertProjectData } from './validation';
import { StickerService } from '../services/stickerService';

let service = new StickerService();


export function registerStickerIpcHandlers(config: ApplicationConfig): void {
  service = new StickerService(config.runtime.ffprobePath);
  registerIpcHandler(IPC_CHANNELS.STICKER_ADD, async (_event, project: unknown, type: unknown, filePath?: unknown) => {
    const validProject = assertProjectData(project);
    if (type !== 'image' && type !== 'video' && type !== 'gif') throw new Error('Tipe sticker tidak valid.');
    const selected = typeof filePath === 'string' && filePath.length > 0 ? filePath : await chooseStickerFile(type as StickerMediaType);
    if (!selected) return null;
    assertAllowedString(selected, 'sticker file path', 32767);
    return { project: await service.addSticker(validProject, selected, type as StickerMediaType) };
  });

  registerIpcHandler(IPC_CHANNELS.STICKER_UPDATE, async (_event, project: unknown, sticker: unknown) => {
    const validProject = assertProjectData(project);
    return { project: service.updateSticker(validProject, sticker as ProjectSticker) };
  });

  registerIpcHandler(IPC_CHANNELS.STICKER_REMOVE, async (_event, project: unknown, stickerId?: unknown) => {
    if (stickerId !== undefined) assertAllowedString(stickerId, 'sticker id', 128);
    return { project: service.removeSticker(assertProjectData(project), typeof stickerId === 'string' ? stickerId : undefined) };
  });

  registerIpcHandler(IPC_CHANNELS.STICKER_VALIDATE, async (_event, sticker: unknown) => {
    await service.validateSticker(sticker as ProjectSticker);
    return { valid: true };
  });

  registerIpcHandler(IPC_CHANNELS.STICKER_BUILD_FILTER_GRAPH, async (_event, project: unknown, totalDurationSec: unknown) => {
    const validProject = assertProjectData(project);
    if (typeof totalDurationSec !== 'number' || !Number.isFinite(totalDurationSec) || totalDurationSec <= 0) throw new Error('Durasi video sticker tidak valid.');
    return service.buildFilterGraph(validProject, totalDurationSec);
  });
}

async function chooseStickerFile(type: StickerMediaType): Promise<string | undefined> {
  const extensions = type === 'image' ? ['png', 'jpg', 'jpeg', 'webp'] : type === 'video' ? ['mp4', 'mov', 'mkv', 'webm'] : ['gif'];
  const result = await showOpenDialog( { title: `Import ${type} Sticker`, properties: ['openFile'], filters: [{ name: 'Sticker', extensions }] });
  if (result.canceled || result.filePaths.length === 0) return undefined;
  return result.filePaths[0];
}
