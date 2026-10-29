import { registerIpcHandler } from './loggedHandler';

import { showOpenDialog } from './dialogHelper';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApplicationConfig } from '../config/appConfig';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { OverlayMediaType, ProjectOverlay } from '../../shared/domain/overlayTypes';
import { assertAllowedString, assertProjectData, assertProjectOverlay } from './validation';
import { OverlayService } from '../services/overlay/overlayService';
import { validateOverlayFile } from '../services/overlay/overlayValidator';

let service = new OverlayService();


export function registerOverlayIpcHandlers(_config: ApplicationConfig): void {
  registerIpcHandler(IPC_CHANNELS.VISUALIZER_CHOOSE_MEDIA, async () => {
    const result = await showOpenDialog({ title: 'Pilih logo atau gambar untuk Audio Visualizer', properties: ['openFile'], filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  registerIpcHandler(IPC_CHANNELS.OVERLAY_ADD, async (_event, project: unknown, type: unknown, filePath?: unknown) => {
    const validProject = assertProjectData(project);
    if (type !== 'image' && type !== 'video') throw new Error('Tipe overlay tidak valid.');
    const selected = typeof filePath === 'string' && filePath.length > 0
      ? filePath
      : await chooseOverlayFile(type as OverlayMediaType);
    if (!selected) return null;
    assertAllowedString(selected, 'overlay file path', 32767);
    return { project: await service.addOverlay(validProject, selected, type as OverlayMediaType) };
  });

  registerIpcHandler(IPC_CHANNELS.OVERLAY_UPDATE, async (_event, project: unknown, overlay: unknown) => {
    const validProject = assertProjectData(project);
    const validOverlay = assertProjectOverlay(overlay);
    return { project: service.updateOverlay(validProject, validOverlay) };
  });

  registerIpcHandler(IPC_CHANNELS.OVERLAY_REMOVE, async (_event, project: unknown, overlayId: unknown) => {
    const validProject = assertProjectData(project);
    assertAllowedString(overlayId, 'overlay id', 120);
    return { project: service.removeOverlay(validProject, overlayId) };
  });

  registerIpcHandler(IPC_CHANNELS.OVERLAY_VALIDATE, async (_event, overlay: unknown) => {
    const validOverlay = assertProjectOverlay(overlay);
    await validateOverlayFile(validOverlay.path, validOverlay.type);
    return { valid: true };
  });

  registerIpcHandler(IPC_CHANNELS.OVERLAY_BUILD_FILTER_GRAPH, async (_event, project: unknown) => {
    const validProject = assertProjectData(project);
    return service.buildFilterGraph(validProject);
  });
}

async function chooseOverlayFile(type: OverlayMediaType): Promise<string | undefined> {
  const extensions = type === 'image' ? ['png', 'jpg', 'jpeg', 'webp'] : ['mp4', 'mov', 'mkv', 'webm', 'gif'];
  const result = await showOpenDialog( { title: `Import ${type} Overlay`, properties: ['openFile'], filters: [{ name: 'Overlay', extensions }] });
  if (result.canceled || result.filePaths.length === 0) return undefined;
  return result.filePaths[0];
}

