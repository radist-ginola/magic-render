import type { ProjectOverlay } from '../../../../shared/domain/overlayTypes';

const escapeNumber = (value: number): string => String(Number(value.toFixed(6)));

export class OverlayFilterBuilder {
  buildPreOverlayFilters(overlay: ProjectOverlay, inputLabel: string, outputLabel: string, fps = 30): string {
    const filters: string[] = [];
    const { config } = overlay;
    if (overlay.type === 'video' && config.trim) {
      const { startSec, endSec, sourceDurationSec } = config.trim;
      // Select frames from every source iteration without caching entire HD
      // frames or encoding an intermediate clip. Reset PTS after selection.
      const number = (value: number) => escapeNumber(value);
      filters.push(`fps=${fps}`, `select='gte(mod(t\\,${number(sourceDurationSec)})\\,${number(startSec)})*lt(mod(t\\,${number(sourceDurationSec)})\\,${number(endSec)})'`, `setpts=N/(${fps}*TB)`);
    }
    if (config.crop) {
      const { left, right, top, bottom } = config.crop;
      filters.push(`crop='max(2\\,iw*${escapeNumber((100-left-right)/100)})':'max(2\\,ih*${escapeNumber((100-top-bottom)/100)})':iw*${escapeNumber(left/100)}:ih*${escapeNumber(top/100)}`);
    }
    if (config.speed !== 1 && overlay.type === 'video') filters.push(`setpts=PTS/${escapeNumber(config.speed)}`);
    if (config.resize) filters.push(`scale=${Math.round(config.resize.width)}:${Math.round(config.resize.height)}:flags=lanczos`);
    filters.push('format=rgba');
    return `[${inputLabel}]${filters.join(',')}[${outputLabel}]`;
  }

  buildPositionedLayer(inputLabel: string, outputLabel: string, width: number, height: number, x: number, y: number): string {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Posisi overlay tidak valid.');
    const bg = `${outputLabel}_bg`;
    return `color=c=black@0:s=${width}x${height}:r=30,format=rgba[${bg}];[${bg}][${inputLabel}]overlay=x=${escapeNumber(x)}:y=${escapeNumber(y)}:eof_action=pass:format=auto,format=rgba[${outputLabel}]`;
  }
}
