import type { ApplicationConfig } from '../config/appConfig';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { ProjectTextOverlay, TextOverlayConfig } from '../../shared/domain/textOverlayTypes';
import { IPC_CHANNELS } from '../../shared/ipc';
import { registerIpcHandler } from './loggedHandler';

import { addTextOverlay, updateTextOverlay, removeTextOverlay, buildTextFilterGraph, validateTextConfig } from '../services/ffmpegEngine/textOverlayService';
import { listDeviceFonts } from '../services/ffmpegEngine/deviceFonts';

export function registerTextOverlayIpcHandlers(_config: ApplicationConfig): void {
  registerIpcHandler(IPC_CHANNELS.TEXT_LIST_FONTS, () => listDeviceFonts());
  registerIpcHandler(IPC_CHANNELS.TEXT_ADD, (_event, project: ProjectData, config: TextOverlayConfig) => ({ project: addTextOverlay(project, config) }));
  registerIpcHandler(IPC_CHANNELS.TEXT_UPDATE, (_event, project: ProjectData, overlay: ProjectTextOverlay) => ({ project: updateTextOverlay(project, overlay) }));
  registerIpcHandler(IPC_CHANNELS.TEXT_REMOVE, (_event, project: ProjectData, overlayId: string) => ({ project: removeTextOverlay(project, overlayId) }));
  registerIpcHandler(IPC_CHANNELS.TEXT_VALIDATE, (_event, config: TextOverlayConfig) => {
    try { validateTextConfig(config); return { valid: true }; } catch (error) { return { valid: false, error: error instanceof Error ? error.message : 'Konfigurasi teks tidak valid.' }; }
  });
  registerIpcHandler(IPC_CHANNELS.TEXT_BUILD_FILTER_GRAPH, (_event, project: ProjectData) => buildTextFilterGraph(project));
}
