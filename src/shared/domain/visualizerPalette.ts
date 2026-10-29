import type { VisualizerEffect, VisualizerPalette } from './visualizerTypes';

export const visualizerPaletteStops: Record<Exclude<VisualizerPalette,'custom'>,string[]> = {
  rainbow:['#2cf9ff','#8b5cf6','#ff38d1'], fire:['#ff5515','#ff9c37','#fff05a'], cool:['#2ca0ff','#70d9ff','#b4ffff'],
  viridis:['#440154','#21918c','#fde725'],magma:['#521150','#b73779','#fcfdbf'],
};

export function visualizerColors(item: VisualizerEffect): string[] {
  if(item.palette==='custom') return [item.color,item.color,item.color];
  const preset = item.palette??(item.kind==='spectrumFire'?'fire':item.kind==='spectrumCool'?'cool':item.kind==='spectrumViridis'?'viridis':item.kind==='spectrumMagma'?'magma':'rainbow');
  return visualizerPaletteStops[preset??'rainbow'];
}

export function frequencyFraction(fraction:number,position:VisualizerEffect['peakPosition']):number {
  return position==='right'?1-fraction:position==='center'?Math.abs(2*fraction-1):fraction;
}


/** Resolve one user-selected visualizer color into the exact pair shared by preview and FFmpeg render.
 * Legacy stereoLeftColor/stereoRightColor/gradientEndColor fields are intentionally ignored.
 */
export function resolveVisualizerColors(item: VisualizerEffect): { primary: string; secondary: string } {
  const mode = item.colorMode ?? 'gradient';
  const base = /^#[0-9a-f]{6}$/i.test(item.color ?? '') ? item.color : '#2cf9ff';
  if (mode === 'single') return { primary: base, secondary: base };
  if (mode === 'amber') return { primary: '#ffbd66', secondary: '#ff6438' };
  const secondary = shiftHue(base, mode === 'neon' ? 155 : 72, mode === 'neon' ? 1.18 : 1, mode === 'neon' ? 0.58 : 0.54);
  return { primary: base, secondary };
}

function shiftHue(hex: string, degrees: number, saturationScale: number, lightnessTarget: number): string {
  const numeric = hex.replace('#', '');
  const r = parseInt(numeric.slice(0, 2), 16) / 255;
  const g = parseInt(numeric.slice(2, 4), 16) / 255;
  const b = parseInt(numeric.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2; let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  h = (h * 360 + degrees + 360) % 360 / 360;
  s = Math.max(0.45, Math.min(1, s * saturationScale));
  const targetL = Math.max(0.35, Math.min(0.7, (l + lightnessTarget) / 2));
  const q = targetL < 0.5 ? targetL * (1 + s) : targetL + s - targetL * s;
  const p = 2 * targetL - q;
  const hue = (t: number): number => {
    let value = t; if (value < 0) value += 1; if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  const rgb = [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((value) => Math.round(value * 255).toString(16).padStart(2, '0'));
  return `#${rgb.join('')}`;
}
