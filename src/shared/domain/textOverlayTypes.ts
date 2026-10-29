export type TextFontStyle = 'normal' | 'italic';
export type TextEffect = 'none' | 'glow' | 'shadow' | 'outline';
export type TextAnimation = 'none' | 'fade-in' | 'fade-out' | 'pulse' | 'running-left' | 'running-right';

export type TextOverlayConfig = {
  text: string;
  fontFamily: string;
  fontStyle: TextFontStyle;
  fontColor: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  neonGlow: boolean;
  glowColor: string;
  glowBlur: number;
  effect: TextEffect;
  animation: TextAnimation;
  /** Independent fade-in duration in seconds; animation remains separately configurable. */
  fadeInSec?: number;
  position: { x: number; y: number };
  width?: number;
  /** Canvas editor scale/rotation; persisted for final rendering. */
  scale?: number;
  rotation?: number;
  speed: number;
};

export type ProjectTextOverlay = {
  id: string;
  hiddenInPreview?: boolean;
  locked?: boolean;
  config: TextOverlayConfig;
};
