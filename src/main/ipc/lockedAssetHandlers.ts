import { app } from 'electron';
import { showOpenDialog } from './dialogHelper';
import path from 'node:path';
import fs from 'node:fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { LockedAssetMenu } from '../../shared/domain/lockedAssetTypes';
import {
  listLockedAssets,
  lockAsset,
  updateLockedAsset,
  unlockAsset,
  removeMissingLockedAssets,
  validateLockedAsset,
} from '../services/persistentStore';
import { registerIpcHandler } from './loggedHandler';
import { assertAllowedString } from './validation';
import { validateOverlayShape } from '../services/overlay/overlayValidator';
import { validateStickerShape } from '../services/stickerValidator';
import { defaultStickerConfig } from '../../shared/domain/stickerTypes';
import { settingsService } from './settingsHandlers';
import { createSmoothLoopAsset } from '../services/overlay/smoothLoopService';
import { applyEditedOverlayAsset } from '../services/overlay/applyEditedAssetService';

const MENUS = new Set<LockedAssetMenu>(['intro', 'overlay', 'stickerSubscribe', 'playlist']);

function assertMenu(value: unknown): asserts value is LockedAssetMenu {
  if (typeof value !== 'string' || !MENUS.has(value as LockedAssetMenu)) throw new Error('Invalid locked asset menu.');
}

function assertPlainConfig(value: unknown): asserts value is Record<string, unknown> | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid locked asset config.');
}


export function registerLockedAssetIpcHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_LIST, async (_event, ...args: unknown[]) => {
    if (args.length) throw new Error('locked-assets:list does not accept arguments.');
    return listLockedAssets();
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_LOCK, async (_event, menu: unknown, filePath?: unknown, config?: unknown) => {
    assertMenu(menu);
    if (filePath !== undefined) assertAllowedString(filePath, 'asset file path', 32767);
    assertPlainConfig(config);

    const result = typeof filePath === 'string'
      ? filePath
      : await chooseAsset(menu);
    if (!result) return null;
    return lockAsset(menu, result, config, settingsService.get().assetDir);
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_UPDATE, async (_event, assetId: unknown, patch: unknown) => {
    assertAllowedString(assetId, 'asset id', 128);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Perubahan asset tidak valid.');
    const input = patch as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['pinned','config'].includes(key))) throw new Error('Field perubahan asset tidak didukung.');
    if (input.pinned !== undefined && typeof input.pinned !== 'boolean') throw new Error('Status kunci asset tidak valid.');
    assertPlainConfig(input.config);
    const asset = (await listLockedAssets()).find((entry) => entry.assetId === assetId);
    if (!asset) throw new Error('Asset tidak ditemukan.');
    if (input.config !== undefined) {
      if (asset.menu === 'overlay') validateOverlayShape({ id: asset.assetId, path: asset.path, type: /\.(mp4|mov|mkv|webm|gif|avi)$/i.test(asset.path) ? 'video' : 'image', config: input.config });
      else if (asset.menu === 'stickerSubscribe') {
        const config = { ...defaultStickerConfig(), ...input.config, schedule: defaultStickerConfig().schedule, fade: defaultStickerConfig().fade, durationSec: 3 };
        validateStickerShape({ id: asset.assetId, path: asset.path, type: /\.gif$/i.test(asset.path) ? 'gif' : /\.(mp4|mov|mkv|webm)$/i.test(asset.path) ? 'video' : 'image', config });
      } else throw new Error('Pengaturan visual hanya tersedia untuk overlay dan sticker.');
    }
    return updateLockedAsset(assetId as string, { pinned: input.pinned as boolean | undefined, config: input.config as Record<string, unknown> | undefined });
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_APPLY_EDIT, async (_event, assetId: unknown, input: unknown) => {
    assertAllowedString(assetId, 'asset id', 128);
    assertPlainConfig(input);
    if (!input) throw new Error('Konfigurasi edit overlay tidak ditemukan.');
    const asset = (await listLockedAssets()).find((item) => item.assetId === assetId);
    if (!asset || asset.menu !== 'overlay') throw new Error('Asset overlay tidak ditemukan.');
    const type = /\.(mp4|mov|mkv|webm|gif|avi)$/i.test(asset.path) ? 'video' : 'image';
    const validated = validateOverlayShape({ id: asset.assetId, path: asset.path, type, config: input });
    const settings = settingsService.get();
    return applyEditedOverlayAsset(asset, validated.config, settings.ffmpegPath, settings.ffprobePath, settings.assetDir);
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_SMOOTH_LOOP, async (_event, assetId: unknown, input: unknown) => {
    assertAllowedString(assetId, 'asset id', 128);
    const asset = (await listLockedAssets()).find((item) => item.assetId === assetId);
    if (!asset || asset.menu !== 'overlay') throw new Error('Overlay asset tidak ditemukan.');
    const config = validateOverlayShape({ id: asset.assetId, path: asset.path, type: 'video', config: input }).config;
    const settings = settingsService.get();
    return createSmoothLoopAsset(asset, config, settings.ffmpegPath, settings.ffprobePath, settings.assetDir);
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_UNLOCK, async (_event, assetId: unknown) => {
    assertAllowedString(assetId, 'asset id', 128);
    const asset = (await listLockedAssets()).find((item) => item.assetId === assetId);
    if (!asset) throw new Error('Asset tidak ditemukan.');
    await unlockAsset(assetId);
    const managedFolder = path.resolve(settingsService.get().assetDir, asset.menu);
    const oldPath = path.resolve(asset.path);
    const root = process.platform === 'win32' ? managedFolder.toLowerCase() : managedFolder;
    const candidate = process.platform === 'win32' ? oldPath.toLowerCase() : oldPath;
    // Only remove copies managed under the app's own asset folder. Files
    // selected directly from elsewhere on disk remain untouched.
    if (candidate.startsWith(`${root}${path.sep}`)) await fs.rm(oldPath, { force: true });
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_REMOVE_MISSING, async (_event, ...args: unknown[]) => {
    if (args.length) throw new Error('locked-assets:remove-missing does not accept arguments.');
    return removeMissingLockedAssets();
  });

  registerIpcHandler(IPC_CHANNELS.LOCKED_ASSETS_VALIDATE, async (_event, assetId: unknown) => {
    assertAllowedString(assetId, 'asset id', 128);
    return validateLockedAsset(assetId);
  });
}

async function chooseAsset(menu: LockedAssetMenu): Promise<string | undefined> {
  const filters = menu === 'playlist'
    ? [{ name: 'MP3 Audio', extensions: ['mp3'] }]
    : menu === 'intro'
      ? [{ name: 'Intro', extensions: ['png', 'jpg', 'jpeg', 'mp4', 'mov', 'mkv', 'webm'] }]
      : [{ name: menu === 'overlay' ? 'Overlay' : 'Sticker Subscribe', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'mkv', 'webm'] }];
  const result = await showOpenDialog( {
    title: `Tambahkan ${menu === 'stickerSubscribe' ? 'Sticker Subscribe' : menu} ke Asset Library`,
    defaultPath: settingsService.get().assetDir,
    properties: ['openFile'],
    filters,
  });
  return result.canceled ? undefined : result.filePaths[0];
}
