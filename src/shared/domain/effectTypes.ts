export type BeatSegment = { startSec: number; endSec: number; bpm: number; phaseSec: number; source: 'audio' | 'fallback' };
export type BeatSync = { bpm: number; phaseSec: number; source: 'audio' | 'fallback'; segments?: BeatSegment[] };

export type MainEffectKind = 'blink' | 'pulse' | 'sway' | 'shake' | 'zoom' | 'light' | 'glitch' | 'flicker' | 'float' | 'tint' | 'wobble';
export type MainMediaEffect = {
  id: string;
  kind: MainEffectKind;
  opacity: number;
  axisX: number;
  axisY: number;
  speed: number;
  beatSync: boolean;
  /** Seconds used to ramp this effect from zero to full strength. */
  fadeInSec?: number;
};

export type ParticleKind = 'firefly' | 'dust' | 'smoke' | 'stars' | 'colors' | 'lines' | 'rain' | 'snow' | 'embers' | 'petals' | 'sparks' | 'bubbles' | 'confetti' | 'leaves' | 'fire' | 'meteor' | 'glitter' | 'firefliesBlue' | 'pollen' | 'ash' | 'ice' | 'neon' | 'hearts' | 'diamonds' | 'twinkle';
export type ParticleMotion = 'spread' | 'fall' | 'drift' | 'evaporate' | 'orbit' | 'spiral' | 'zigzag' | 'bounce' | 'rise';
export type ParticleEffect = {
  id: string;
  kind: ParticleKind;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  minCount: number;
  maxCount: number;
  minDistance: number;
  maxDistance: number;
  motion: ParticleMotion;
  speed: number;
  beatSync: boolean;
  /** Override the default palette; old projects retain the style palette. */
  color?: string;
  /** Particle glyph size in design pixels. */
  size?: number;
  /** Seconds used to ramp particle opacity from zero to full strength. */
  fadeInSec?: number;
};

export const DEFAULT_BEAT: BeatSync = { bpm: 120, phaseSec: 0, source: 'fallback' };
export function beatAt(time: number, beat: BeatSync): BeatSegment | BeatSync {
  return beat.segments?.find((segment) => time >= segment.startSec && time < segment.endSec) ?? beat.segments?.at(-1) ?? beat;
}
export function beatPulse(time: number, beat: BeatSync, speed = 1): number {
  const active = beatAt(time, beat);
  return Math.pow(Math.max(0, Math.cos(2 * Math.PI * (time - active.phaseSec) * active.bpm / 60 * speed)), 4);
}
