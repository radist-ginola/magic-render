export type OverlayMediaType = 'image' | 'video';
export type OverlayBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
export type OverlayKeyMode = 'none' | 'chroma' | 'color';

export type OverlayChromaKey = {
  enabled: boolean;
  color: string;
  similarity: number;
  blend: number;
};

export type OverlayColorKey = {
  enabled: boolean;
  color: string;
  similarity: number;
  blend: number;
};

export type OverlayMask = {
  shape: 'rectangle' | 'square' | 'circle' | 'oval' | 'freehand';
  /** Normalized coordinates relative to the cropped and resized overlay. */
  x: number; y: number; width: number; height: number;
  points?: { x: number; y: number }[];
};

export type OverlayConfig = {
  opacity: number;
  position: { x: number; y: number };
  resize: { width: number; height: number } | null;
  rotation: number;
  speed: number;
  /** Seconds to fade the overlay alpha in at the start of its content timeline. */
  fadeInSec?: number;
  blendMode: OverlayBlendMode;
  chromaKey: OverlayChromaKey;
  colorKey: OverlayColorKey;
  /** Percentage of source edges removed before resizing. */
  crop?: { left: number; right: number; top: number; bottom: number };
  mask?: OverlayMask;
  /** Video source in/out points; the selected clip repeats for the whole output. */
  trim?: { startSec: number; endSec: number; sourceDurationSec: number };
};

export type ProjectOverlay = {
  id: string;
  locked?: boolean;
  hiddenInPreview?: boolean;
  path: string;
  type: OverlayMediaType;
  config: OverlayConfig;
};

export function defaultOverlayConfig(): OverlayConfig {
  return { opacity: 1, position: { x: 0, y: 0 }, resize: null, rotation: 0, speed: 1, fadeInSec: 0, blendMode: 'normal', chromaKey: { enabled: false, color: '0x00FF00', similarity: 0.3, blend: 0.1 }, colorKey: { enabled: false, color: '0x000000', similarity: 0.3, blend: 0.1 } };
}
