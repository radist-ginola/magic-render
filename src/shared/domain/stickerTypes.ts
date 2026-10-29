export type StickerMediaType = 'image' | 'video' | 'gif';
export type StickerScheduleMode = 'iterative' | 'timestamp' | 'full-duration';
export type StickerBackgroundRemoval = 'none' | 'chroma' | 'color';

export type StickerFade = { fadeInSec: number; fadeOutSec: number };
export type StickerChromaKey = { enabled: boolean; color: string; similarity: number; blend: number };
export type StickerColorKey = { enabled: boolean; color: string; similarity: number; blend: number };

export type StickerSchedule = {
  mode: StickerScheduleMode;
  /** Interval size; legacy projects without iterativeUnit default to minutes. */
  iterativeCount: number | null;
  iterativeUnit?: 'seconds' | 'minutes';
  timestamps: string[];
};

export type StickerBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export type StickerConfig = {
  audioMuted: boolean;
  fade: StickerFade;
  scale: number;
  speed: number;
  position: { x: number; y: number };
  rotation: number;
  opacity: number;
  blendMode: StickerBlendMode;
  durationSec: number;
  schedule: StickerSchedule;
  backgroundRemoval: StickerBackgroundRemoval;
  chromaKey: StickerChromaKey;
  colorKey: StickerColorKey;
};

export type ProjectSticker = {
  id: string;
  locked?: boolean;
  hiddenInPreview?: boolean;
  path: string;
  type: StickerMediaType;
  config: StickerConfig;
};

export type StickerScheduleWindow = { startSec: number; endSec: number };

export function defaultStickerConfig(): StickerConfig {
  return { audioMuted: true, fade: { fadeInSec: 0, fadeOutSec: 0 }, scale: 1, speed: 1, position: { x: 1600, y: 900 }, rotation: 0, opacity: 1, blendMode: 'normal', durationSec: 3, schedule: { mode: 'full-duration', iterativeCount: null, timestamps: [] }, backgroundRemoval: 'none', chromaKey: { enabled: false, color: '0x00FF00', similarity: 0.3, blend: 0.1 }, colorKey: { enabled: false, color: '0x000000', similarity: 0.3, blend: 0.1 } };
}
