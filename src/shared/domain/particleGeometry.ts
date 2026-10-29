import type { ParticleEffect, ParticleKind } from './effectTypes';

// Both the HTML preview and the FFmpeg graph use these same coordinates and glyphs.
export const particleGlyph: Record<ParticleKind, string> = {
  firefly:'✦',dust:'·',smoke:'●',stars:'★',colors:'●',lines:'│',rain:'│',snow:'❄',embers:'•',petals:'✿',sparks:'✧',bubbles:'○',confetti:'■',leaves:'❧',fire:'▲',meteor:'╱',glitter:'✧',
  firefliesBlue:'✦',pollen:'·',ash:'▪',ice:'✳',neon:'✦',hearts:'♥',diamonds:'◆',twinkle:'✴',
};
const palettes: Partial<Record<ParticleKind,string[]>> = {
  colors:['#ff5ac8','#66dfff','#ffd76b'],confetti:['#ff5ac8','#66dfff','#ffd76b'],firefly:['#ffef9c'],firefliesBlue:['#71dbff'],smoke:['#b0b8c7'],rain:['#a4c9ff'],snow:['#f2faff'],embers:['#ff9c37','#ffdd7f'],sparks:['#ff9c37','#ffdd7f'],fire:['#ff9c37','#ffdd7f'],meteor:['#ff9c37'],petals:['#ff91bc'],bubbles:['#a0e7ff'],leaves:['#a0d56e','#e2b765'],glitter:['#fff7af'],pollen:['#f9e9a5'],ash:['#c8c6c6'],ice:['#a9eaff'],neon:['#42ffc8','#ff46dd'],hearts:['#ff738d'],diamonds:['#c8f6ff'],twinkle:['#fff5bd'],
};
export function particleColor(effect: ParticleEffect, index: number): string { return effect.color ?? (palettes[effect.kind] ?? ['#e3e9ff'])[index % (palettes[effect.kind]?.length ?? 1)]!; }
export function particleSize(effect: ParticleEffect): number { return effect.size ?? (effect.kind === 'smoke' ? 72 : ['lines','rain','meteor'].includes(effect.kind) ? 26 : 18); }
function hash(value: number): number { const x = Math.sin(value * 127.1 + 78.233) * 43758.5453123; return x - Math.floor(x); }
export function particleSeed(effect: ParticleEffect, index: number): { x: number; y: number; phase: number } {
  // Effect id makes two particle layers independent. A rectangular distribution
  // has no radial spokes and covers the whole frame even when spacing is high.
  let salt = 0; for (const char of effect.id) salt = (salt * 31 + char.charCodeAt(0)) % 100003;
  return { x: hash(index * 3 + salt * .01), y: hash(index * 3 + salt * .01 + 1), phase: hash(index * 3 + salt * .01 + 2) };
}
export function particleBounds(effect: ParticleEffect, index: number, width = 1920, height = 1080): { x: number; y: number; amplitude: number; margin: number; phase: number } {
  const seed = particleSeed(effect,index);
  const margin = Math.max(10, particleSize(effect) * width / 1920);
  const x = margin + seed.x * Math.max(1,width - 2*margin);
  const y = margin + seed.y * Math.max(1,height - 2*margin);
  const requested = Math.max(0,effect.minDistance + (effect.maxDistance-effect.minDistance)*seed.phase) * width / 1920 * .12;
  // Keep the full motion path inside the frame instead of repeatedly clipping
  // the glyph at its edges (which formed artificial lines of particles).
  const amplitude = Math.max(0,Math.min(requested,Math.min(width,height)*.18,x-margin,width-margin-x,y-margin,height-margin-y));
  return { x, y, amplitude, margin, phase: seed.phase * Math.PI * 2 };
}
export function inFrame(value: number, margin: number, extent: number): number { return Math.max(margin, Math.min(extent - margin, value)); }
export const particleTravelPixelsPerSecond = 24;
export const particleOscillationsPerSecond = 0.1;
export function particleMotionFactor(effect: ParticleEffect, bpm: number): number { return effect.speed * (effect.beatSync ? bpm/120 : 1); }
