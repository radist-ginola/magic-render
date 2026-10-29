import type { ProjectSticker } from '../../../shared/domain/stickerTypes';
import { validateStickerShape } from '../stickerValidator';
import { buildScheduleWindows } from '../stickerScheduler';
import { OverlayFilterBuilder } from './filterGraphBuilder/overlayFilterBuilder';
import { BlendFilterBuilder } from './filterGraphBuilder/blendFilterBuilder';

const n = (v: number) => String(Number(v.toFixed(6)));
const color = (v: string) => v.replace(/^0x/, '');

export function buildStickerFilterGraph(
  sticker: ProjectSticker,
  baseLabel: string,
  stickerLabel: string,
  width: number,
  height: number,
  totalDurationSec: number,
  stickerDurationSec = sticker.config.durationSec,
  canvasScale = 1,
): { filterGraph: string; finalLabel: string } {
  validateStickerShape(sticker);
  if (!(width > 0 && height > 0 && totalDurationSec > 0)) throw new Error('Parameter canvas/durasi sticker tidak valid.');
  const c = sticker.config;
  const parts: string[] = [];
  const prepared = `${stickerLabel}_prepared`;
  const prep: string[] = [];
  if (c.speed !== 1 && sticker.type === 'video') prep.push(`setpts=PTS/${n(c.speed)}`);
  // Preview places sticker media inside a 220x124 frame with object-fit:
  // contain. Fit the decoded source into that same frame before compositing;
  // large source videos should not be blended at their native resolution.
  const targetWidth = Math.max(1, Math.round(220 * c.scale * canvasScale));
  const targetHeight = Math.max(1, Math.round(124 * c.scale * canvasScale));
  const directOverlay = c.blendMode === 'normal' && c.backgroundRemoval === 'none'
    && c.rotation === 0 && c.opacity === 1 && c.fade.fadeInSec === 0 && c.fade.fadeOutSec === 0;
  prep.push(`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos`);
  // A plain sticker can be placed with FFmpeg's overlay dimensions. Avoid
  // converting every frame to RGBA and padding an otherwise opaque video.
  if (!directOverlay) prep.push('format=rgba');
  // Key the source before adding transparent padding. chromakey in YUV made
  // white lettering and even alpha-zero black padding partly opaque. RGB
  // colorkey follows the preview's RGB-distance controls and preserves both.
  if (c.backgroundRemoval === 'chroma' && c.chromaKey.enabled) prep.push(`colorkey=${color(c.chromaKey.color)}:${n(Math.max(.00001,c.chromaKey.similarity))}:${n(c.chromaKey.blend)}`);
  if (c.backgroundRemoval === 'color' && c.colorKey.enabled) prep.push(`colorkey=${color(c.colorKey.color)}:${n(Math.max(.00001,c.colorKey.similarity))}:${n(c.colorKey.blend)}`);
  if (!directOverlay) prep.push(`pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`);
  if (c.rotation !== 0) prep.push(`rotate=${n(c.rotation * Math.PI / 180)}:fillcolor=black@0`);
  parts.push(`[${stickerLabel}]${prep.join(',')}[${prepared}]`);

  const windows = buildScheduleWindows(c.schedule, totalDurationSec, stickerDurationSec);
  if (windows.length === 0) throw new Error('Tidak ada window scheduling sticker yang berada dalam durasi video.');
  // Preview allows the sticker frame to be moved partially outside the canvas.
  // FFmpeg also accepts signed overlay coordinates; clamping here moved it on export.
  const positionX = c.position.x * canvasScale;
  const positionY = c.position.y * canvasScale;
  const placed = `${stickerLabel}_placed`;
  // Apply configured opacity once; scheduled fades are applied separately.
  parts.push(`[${prepared}]setpts=PTS-STARTPTS${c.opacity < 1 ? `,colorchannelmixer=aa=${n(c.opacity)}` : ''}[${placed}]`);
  const sources = windows.map((_window, index) => `${stickerLabel}_window_${index}`);
  if (sources.length > 1) parts.push(`[${placed}]split=${sources.length}${sources.map(label => `[${label}]`).join('')}`);
  let current = baseLabel;
  windows.forEach((window, index) => {
    const source = sources.length > 1 ? sources[index] : placed;
    const timed = `${stickerLabel}_timed_${index}`;
    const faded = `${stickerLabel}_faded_${index}`;
    const fadeFilters: string[] = [];
    const length = window.endSec - window.startSec;
    const fadeIn = Math.min(c.fade.fadeInSec, length / 2);
    const fadeOut = Math.min(c.fade.fadeOutSec, length / 2);
    if (fadeIn > 0) fadeFilters.push(`fade=t=in:st=${n(window.startSec)}:d=${n(fadeIn)}:alpha=1`);
    if (fadeOut > 0) fadeFilters.push(`fade=t=out:st=${n(window.endSec - fadeOut)}:d=${n(fadeOut)}:alpha=1`);
    // Restart the sticker media at each window and align its timestamps to
    // the requested position. A shared source at PTS=0 can already be at EOF
    // when a timestamp or repeat window is reached.
    parts.push(`[${source}]trim=duration=${n(length)},setpts=PTS-STARTPTS+${n(window.startSec)}/TB[${timed}]`);
    parts.push(`[${timed}]${fadeFilters.length ? fadeFilters.join(',') : 'null'}[${faded}]`);
    const composite = `${stickerLabel}_composite_${index}`;
    const enabled = `between(t,${n(window.startSec)},${n(window.endSec)})`;
    if (c.blendMode === 'normal') {
      // The sticker pipeline is straight RGBA. Explicit alpha prevents
      // FFmpeg auto-detection from interpreting it as premultiplied color.
      const x = directOverlay ? `${n(positionX)}+(${targetWidth}-overlay_w)/2` : n(positionX);
      const y = directOverlay ? `${n(positionY)}+(${targetHeight}-overlay_h)/2` : n(positionY);
      parts.push(`[${current}][${faded}]overlay=x=${x}:y=${y}:format=yuv420:alpha=straight:eof_action=pass:enable='${enabled}'[${composite}]`);
    } else {
      const positioned = `${stickerLabel}_positioned_${index}`;
      parts.push(new OverlayFilterBuilder().buildPositionedLayer(faded, positioned, width, height, positionX, positionY));
      parts.push(new BlendFilterBuilder().build(current, positioned, composite, c.blendMode, enabled));
    }
    current = composite;
  });
  return { filterGraph: parts.join(';'), finalLabel: current };
}
