import type { ApplicationConfig } from '../config/appConfig';
import { registerAppIpcHandlers } from './appHandlers';
import { registerProjectIpcHandlers } from './projectHandlers';
import { registerLockedAssetIpcHandlers } from './lockedAssetHandlers';
import { registerBulkIpcHandlers } from './bulkHandlers';
import { registerOverlayIpcHandlers } from './overlayHandlers';
import { registerTextOverlayIpcHandlers } from './textOverlayHandlers';
import { registerStickerIpcHandlers } from './stickerHandlers';
import { registerPlaylistIpcHandlers } from './playlistHandlers';
import { registerIntroIpcHandlers } from './introHandlers';
import { registerPreviewIpcHandlers } from './previewHandlers';
import { registerRenderIpcHandlers } from './renderHandlers';
import { registerCpuIpcHandlers } from './cpuHandlers';
import { registerSeoIpcHandlers } from './seoHandlers';
import { registerOutputIpcHandlers } from './outputHandlers';
import { registerSettingsIpcHandlers } from './settingsHandlers';
import { RenderOrchestrator } from '../services/render/renderOrchestrator';

export function registerIpcHandlers(config: ApplicationConfig): RenderOrchestrator {
  registerAppIpcHandlers(config);
  registerProjectIpcHandlers(config);
  registerLockedAssetIpcHandlers();
  registerBulkIpcHandlers();
  registerOverlayIpcHandlers(config);
  registerTextOverlayIpcHandlers(config);
  registerStickerIpcHandlers(config);
  registerPlaylistIpcHandlers(config);
  registerIntroIpcHandlers(config);
  registerPreviewIpcHandlers(config);
  const renderOrchestrator = new RenderOrchestrator(config.runtime.ffmpegPath, config.runtime.ffprobePath);
  registerRenderIpcHandlers(config, renderOrchestrator);
  registerCpuIpcHandlers();
  registerSeoIpcHandlers(config);
  registerOutputIpcHandlers();
  registerSettingsIpcHandlers(renderOrchestrator, config);
  return renderOrchestrator;
}
