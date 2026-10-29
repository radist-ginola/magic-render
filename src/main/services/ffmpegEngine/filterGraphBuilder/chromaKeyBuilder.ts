import type { OverlayChromaKey } from '../../../../shared/domain/overlayTypes';

export class ChromaKeyBuilder {
  build(inputLabel: string, outputLabel: string, config: OverlayChromaKey): string {
    if (!config.enabled) return `[${inputLabel}]format=rgba[${outputLabel}]`;
    // Both preview canvases key in RGB. FFmpeg chromakey measures YUV distance,
    // which removed a different amount of green and shifted edge transparency.
    return `[${inputLabel}]colorkey=color=${normalizeColor(config.color)}:similarity=${Math.max(0.00001,config.similarity)}:blend=${config.blend}[${outputLabel}]`;
  }
}

function normalizeColor(input: string): string {
  const raw = input.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) throw new Error('Chroma key color harus hex RGB 6 digit.');
  return `0x${raw.toUpperCase()}`;
}
