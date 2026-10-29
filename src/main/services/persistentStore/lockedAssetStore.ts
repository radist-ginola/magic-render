import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LockedAsset, LockedAssetMenu, LockedAssetValidation } from '../../../shared/domain/lockedAssetTypes';
import { getElectronStore } from './electronStoreAdapter';
import { validateLockedAssetPath } from './lockedAssetValidator';

const STORAGE_KEY = 'lockedAssets';

type StoreDocument = { lockedAssets: LockedAsset[] };

function cloneConfig(config: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!config) return {};
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function parseAssets(value: unknown): LockedAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((asset): asset is LockedAsset => {
    if (!asset || typeof asset !== 'object') return false;
    const candidate = asset as Record<string, unknown>;
    return typeof candidate.assetId === 'string'
      && typeof candidate.menu === 'string'
      && ['intro', 'overlay', 'stickerSubscribe', 'playlist'].includes(candidate.menu)
      && typeof candidate.path === 'string'
      && typeof candidate.lockedAt === 'string'
      && typeof candidate.config === 'object'
      && candidate.config !== null;
  });
}

export class LockedAssetStore {
  async list(): Promise<LockedAsset[]> {
    const store = await getElectronStore();
    return parseAssets(store.get<LockedAsset[]>(STORAGE_KEY));
  }

  async lock(menu: LockedAssetMenu, filePath: string, config?: Record<string, unknown>, assetDir?: string): Promise<LockedAsset> {
    const resolved = path.resolve(filePath);
    const validation = await validateLockedAssetPath(menu, resolved);
    if (!validation.valid) throw new Error(validation.reason ?? 'Invalid asset path.');

    const stats = await fs.stat(resolved);
    const assets = await this.list();
    const existing = assets.find((asset) => asset.menu === menu &&
      (path.resolve(asset.path).toLowerCase() === resolved.toLowerCase() || asset.metadata.sourcePath?.toLowerCase() === resolved.toLowerCase()));
    const metadata = {
      originalName: path.basename(resolved),
      ...(assetDir ? { sourcePath: resolved } : {}),
      extension: path.extname(resolved).toLowerCase(),
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };

    if (existing) {
      const updated: LockedAsset = { ...existing, metadata: { ...existing.metadata, originalName: metadata.originalName }, config: cloneConfig(config ?? existing.config) };
      await this.persist(assets.map((asset) => asset.assetId === existing.assetId ? updated : asset));
      return updated;
    }

    const assetId = randomUUID();
    let storedPath = resolved;
    if (assetDir) {
      const folder = path.resolve(assetDir, menu);
      // Never overwrite another asset with the same original filename.
      await fs.mkdir(folder, { recursive: true });
      storedPath = path.join(folder, `${assetId}${path.extname(resolved).toLowerCase()}`);
      if (storedPath !== resolved) await fs.copyFile(resolved, storedPath, (await import('node:fs')).constants.COPYFILE_EXCL);
    }
    const asset: LockedAsset = {
      assetId,
      menu,
      path: storedPath,
      metadata,
      config: cloneConfig(config),
      pinned: true,
      lockedAt: new Date().toISOString(),
    };
    try { await this.persist([...assets, asset]); }
    catch (error) { if (storedPath !== resolved) await fs.unlink(storedPath).catch(() => undefined); throw error; }
    return asset;
  }

  async unlock(assetId: string): Promise<void> {
    const assets = await this.list();
    const next = assets.filter((asset) => asset.assetId !== assetId);
    if (next.length === assets.length) throw new Error('Locked asset not found.');
    await this.persist(next);
  }

  async update(assetId: string, patch: { pinned?: boolean; config?: Record<string, unknown> }): Promise<LockedAsset> {
    const assets = await this.list();
    const existing = assets.find((asset) => asset.assetId === assetId);
    if (!existing) throw new Error('Asset tidak ditemukan.');
    const updated = { ...existing, pinned: patch.pinned ?? existing.pinned ?? true, config: cloneConfig(patch.config ?? existing.config) };
    await this.persist(assets.map((asset) => asset.assetId === assetId ? updated : asset));
    return updated;
  }


  async replaceEditedMedia(assetId: string, newPath: string, config: Record<string, unknown>, assetDir: string): Promise<LockedAsset> {
    const assets = await this.list();
    const existing = assets.find((asset) => asset.assetId === assetId);
    if (!existing) throw new Error('Asset tidak ditemukan.');
    const menuDir = path.resolve(assetDir, existing.menu);
    const resolvedNewPath = path.resolve(newPath);
    if (!resolvedNewPath.startsWith(`${menuDir}${path.sep}`) || !['.png', '.mov'].includes(path.extname(resolvedNewPath).toLowerCase())) {
      throw new Error('Path hasil edit tidak berada di folder Asset Library yang diizinkan.');
    }
    const stats = await fs.stat(resolvedNewPath);
    if (!stats.isFile() || stats.size < 128) throw new Error('File hasil edit tidak valid.');
    const updated: LockedAsset = {
      ...existing,
      path: resolvedNewPath,
      // Do not retain sourcePath: the baked output is now the only media
      // represented by this library item. The external source file stays intact.
      metadata: {
        originalName: `${path.parse(existing.metadata.originalName).name.replace(/-edited$/i, '')}-edited${path.extname(resolvedNewPath)}`,
        extension: path.extname(resolvedNewPath).toLowerCase(),
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      },
      config: cloneConfig(config),
      pinned: true,
    };
    await this.persist(assets.map((asset) => asset.assetId === assetId ? updated : asset));

    const oldPath = path.resolve(existing.path);
    // Delete only a previous managed copy inside the app's menu folder. A
    // source file selected directly from elsewhere on disk is never removed.
    const oldPathLower = process.platform === 'win32' ? oldPath.toLowerCase() : oldPath;
    const menuDirLower = process.platform === 'win32' ? menuDir.toLowerCase() : menuDir;
    if (oldPath !== resolvedNewPath && oldPathLower.startsWith(`${menuDirLower}${path.sep}`)) {
      await fs.rm(oldPath, { force: true }).catch(() => undefined);
    }
    return updated;
  }

  async validate(assetId: string): Promise<LockedAssetValidation> {
    const assets = await this.list();
    const asset = assets.find((entry) => entry.assetId === assetId);
    if (!asset) return { valid: false, exists: false, reason: 'Locked asset not found.' };
    return validateLockedAssetPath(asset.menu, asset.path);
  }

  async removeMissing(): Promise<LockedAsset[]> {
    const assets = await this.list();
    const validAssets: LockedAsset[] = [];
    for (const asset of assets) {
      const validation = await validateLockedAssetPath(asset.menu, asset.path);
      if (validation.valid) validAssets.push(asset);
    }
    if (validAssets.length !== assets.length) await this.persist(validAssets);
    return validAssets;
  }

  private async persist(assets: LockedAsset[]): Promise<void> {
    const store = await getElectronStore();
    const document: StoreDocument = { lockedAssets: assets };
    store.set(STORAGE_KEY, document.lockedAssets);
  }
}

let singleton: LockedAssetStore | null = null;

export function getLockedAssetStore(): LockedAssetStore {
  if (!singleton) singleton = new LockedAssetStore();
  return singleton;
}
