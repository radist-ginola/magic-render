import fs from 'node:fs/promises';
import path from 'node:path';
import type { LockedAssetMenu, LockedAssetValidation } from '../../../shared/domain/lockedAssetTypes';

const EXTENSIONS: Record<LockedAssetMenu, Set<string>> = {
  intro: new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.png', '.jpg', '.jpeg']),
  overlay: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.mkv', '.webm', '.avi']),
  stickerSubscribe: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.mkv', '.webm', '.avi']),
  playlist: new Set(['.mp3']),
};

export async function validateLockedAssetPath(menu: LockedAssetMenu, filePath: string): Promise<LockedAssetValidation> {
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (!EXTENSIONS[menu].has(extension)) {
    return { valid: false, exists: false, reason: `Unsupported file type for ${menu}.` };
  }

  try {
    const stats = await fs.stat(resolved);
    if (!stats.isFile()) return { valid: false, exists: false, reason: 'Asset path is not a file.' };
    return { valid: true, exists: true };
  } catch {
    return { valid: false, exists: false, reason: `Asset file does not exist: ${resolved}` };
  }
}
