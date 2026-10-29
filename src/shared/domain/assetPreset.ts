import type { LockedAsset } from './lockedAssetTypes';
import { defaultOverlayConfig, type OverlayConfig } from './overlayTypes';
import { defaultStickerConfig, type StickerConfig } from './stickerTypes';

export function overlayAssetPreset(asset: LockedAsset): OverlayConfig {
  const base = defaultOverlayConfig();
  if (asset.menu !== 'overlay' || !asset.config || !Object.keys(asset.config).length) return base;
  const saved = asset.config as Partial<OverlayConfig>;
  return { ...base, ...saved, position: { ...base.position, ...saved.position }, resize: saved.resize === undefined ? base.resize : saved.resize, crop: saved.crop ? { ...saved.crop } : undefined, mask: saved.mask ? { ...saved.mask, points:saved.mask.points?.map(p=>({...p})) } : undefined, trim: saved.trim ? { ...saved.trim } : undefined, chromaKey: { ...base.chromaKey, ...saved.chromaKey }, colorKey: { ...base.colorKey, ...saved.colorKey } };
}

export function stickerAssetPreset(asset: LockedAsset): StickerConfig {
  const base = defaultStickerConfig();
  if (asset.menu !== 'stickerSubscribe' || !asset.config || !Object.keys(asset.config).length) return base;
  const saved = asset.config as Partial<StickerConfig>;
  // Scheduling belongs to the video timeline, so the library only stores visual settings.
  return { ...base, ...saved, schedule: base.schedule, fade: base.fade, durationSec: base.durationSec, position: { ...base.position, ...saved.position }, chromaKey: { ...base.chromaKey, ...saved.chromaKey }, colorKey: { ...base.colorKey, ...saved.colorKey } };
}
