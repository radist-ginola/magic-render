import type { LockedAsset, LockedAssetMenu, LockedAssetValidation } from '../../../shared/domain/lockedAssetTypes';
import { getLockedAssetStore } from './lockedAssetStore';

export async function initializeLockedAssetPersistence(): Promise<LockedAsset[]> {
  return getLockedAssetStore().removeMissing();
}

export async function listLockedAssets(): Promise<LockedAsset[]> {
  return getLockedAssetStore().list();
}

export async function lockAsset(menu: LockedAssetMenu, filePath: string, config?: Record<string, unknown>, assetDir?: string): Promise<LockedAsset> {
  return getLockedAssetStore().lock(menu, filePath, config, assetDir);
}

export async function unlockAsset(assetId: string): Promise<void> {
  return getLockedAssetStore().unlock(assetId);
}

export async function updateLockedAsset(assetId: string, patch: { pinned?: boolean; config?: Record<string, unknown> }): Promise<LockedAsset> {
  return getLockedAssetStore().update(assetId, patch);
}

export async function removeMissingLockedAssets(): Promise<LockedAsset[]> {
  return getLockedAssetStore().removeMissing();
}

export async function validateLockedAsset(assetId: string): Promise<LockedAssetValidation> {
  return getLockedAssetStore().validate(assetId);
}
