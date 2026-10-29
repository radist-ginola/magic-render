import { registerIpcHandler } from './loggedHandler';

import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApplicationConfig } from '../config/appConfig';
import { PreviewFrameService } from '../services/preview/previewFrameService';
import { assertAllowedString } from './validation';

export function registerPreviewIpcHandlers(config: ApplicationConfig): void {
  registerIpcHandler(IPC_CHANNELS.PREVIEW_EXTRACT_FRAME, async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') throw new Error('Preview frame request tidak valid.');
    const value = request as Record<string, unknown>;
    assertAllowedString(value.projectId, 'projectId', 128);
    assertAllowedString(value.mediaPath, 'mediaPath', 32767);
    if (typeof value.timestampSec !== 'number' || !Number.isFinite(value.timestampSec) || value.timestampSec < 0) throw new Error('Timestamp preview tidak valid.');
    return new PreviewFrameService(config.runtime.ffmpegPath).extract({ projectId: value.projectId, mediaPath: value.mediaPath, timestampSec: value.timestampSec });
  });
}
