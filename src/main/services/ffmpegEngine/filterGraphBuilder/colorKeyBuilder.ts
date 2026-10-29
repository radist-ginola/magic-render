import type { OverlayColorKey } from '../../../../shared/domain/overlayTypes';

export class ColorKeyBuilder {
  build(inputLabel: string, outputLabel: string, config: OverlayColorKey): string {
    if (!config.enabled) return `[${inputLabel}]format=rgba[${outputLabel}]`;;
    return `[${inputLabel}]colorkey=color=${normalizeColor(config.color)}:similarity=${Math.max(0.00001,config.similarity)}:blend=${config.blend}[${outputLabel}]`;
  }
}

function normalizeColor(input: string): string {
  const raw = input.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) throw new Error('Color key harus hex RGB 6 digit.');
  return `0x${raw.toUpperCase()}`;
}
