import type { ProjectOverlay } from '../../../../shared/domain/overlayTypes';
import { OverlayFilterBuilder } from './overlayFilterBuilder';
import { BlendFilterBuilder } from './blendFilterBuilder';
import { ChromaKeyBuilder } from './chromaKeyBuilder';
import { ColorKeyBuilder } from './colorKeyBuilder';
import { maskAlphaExpression } from '../../../../shared/domain/overlayMask';

export type FilterGraphInput = { sourceIndex: number; sourceLabel: string; overlay: ProjectOverlay };
export type FilterGraphOutput = { filterGraph: string; finalLabel: string };

export class FilterGraphBuilder {
  constructor(
    private readonly overlayFilterBuilder = new OverlayFilterBuilder(),
    private readonly blendFilterBuilder = new BlendFilterBuilder(),
    private readonly chromaKeyBuilder = new ChromaKeyBuilder(),
    private readonly colorKeyBuilder = new ColorKeyBuilder(),
  ) {}

  build(baseLabel: string, overlays: FilterGraphInput[], canvasWidth: number, canvasHeight: number, fps = 30): FilterGraphOutput {
    if (!(canvasWidth > 0 && canvasWidth <= 16384 && canvasHeight > 0 && canvasHeight <= 16384)) throw new Error('Ukuran canvas filtergraph tidak valid.');
    let currentBase = baseLabel;
    const chains: string[] = [];
    overlays.forEach((item, index) => {
      const source = item.sourceLabel;
      const prepared = `ov${index}_prepared`;
      let keyed = prepared;
      const positioned = `ov${index}_positioned`;
      const composite = `composite_${index}`;
      const needsChroma = item.overlay.config.chromaKey.enabled;
      const needsColorKey = item.overlay.config.colorKey.enabled;
      let layerX=item.overlay.config.position.x,layerY=item.overlay.config.position.y;

      chains.push(this.overlayFilterBuilder.buildPreOverlayFilters(item.overlay, source, prepared, fps));
      // Do not emit identity `format=rgba` chains for disabled keyers. Repeating
      // identity filters caused noisy/fragile graphs such as format→format→format.
      if (needsChroma) {
        const chroma = `ov${index}_chroma`;
        chains.push(this.chromaKeyBuilder.build(keyed, chroma, item.overlay.config.chromaKey));
        keyed = chroma;
      }
      if (needsColorKey) {
        const colorKeyed = `ov${index}_keyed`;
        chains.push(this.colorKeyBuilder.build(keyed, colorKeyed, item.overlay.config.colorKey));
        keyed = colorKeyed;
      }
      if (item.overlay.config.mask) {
        const masked = `ov${index}_masked`;
        // Shape clipping happens after keying so existing transparent pixels
        // stay transparent inside the user mask.
        const alpha = maskAlphaExpression(item.overlay.config.mask);
        chains.push(`[${keyed}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${alpha})'[${masked}]`);
        keyed = masked;
      }
      if (item.overlay.config.rotation !== 0) {
        const rotated=`ov${index}_rotated`;
        const angle=item.overlay.config.rotation*Math.PI/180;
        const original=item.overlay.config.resize ?? {width:320,height:180};
        const expandedWidth=Math.ceil(Math.abs(original.width*Math.cos(angle))+Math.abs(original.height*Math.sin(angle))-1e-8);
        const expandedHeight=Math.ceil(Math.abs(original.width*Math.sin(angle))+Math.abs(original.height*Math.cos(angle))-1e-8);
        layerX+=(original.width-expandedWidth)/2;
        layerY+=(original.height-expandedHeight)/2;
        chains.push(`[${keyed}]format=rgba,rotate=${Number(angle.toFixed(6))}:ow=${expandedWidth}:oh=${expandedHeight}:fillcolor=black@0[${rotated}]`);
        keyed=rotated;
      }
      if (item.overlay.config.opacity !== 1) {
        const alpha = `ov${index}_alpha`;
        chains.push(`[${keyed}]colorchannelmixer=aa=${Number(item.overlay.config.opacity.toFixed(6))}[${alpha}]`);
        keyed = alpha;
      }
      const fadeInSec = item.overlay.config.fadeInSec ?? 0;
      if (fadeInSec > 0) {
        const faded = `ov${index}_fadein`;
        chains.push(`[${keyed}]fade=t=in:st=0:d=${Number(fadeInSec.toFixed(4))}:alpha=1[${faded}]`);
        keyed = faded;
      }

      if (item.overlay.config.blendMode === 'normal') {
        // A normal overlay needs only one composition. Building a transparent
        // full-frame canvas first doubles the 1080p/4K blending work per layer.
        chains.push(`[${currentBase}][${keyed}]overlay=x=${Math.round(layerX)}:y=${Math.round(layerY)}:eof_action=repeat:format=auto[${composite}]`);
      } else {
        // Blend modes operate on equal-sized frames, so retain their canvas.
        chains.push(this.overlayFilterBuilder.buildPositionedLayer(keyed, positioned, canvasWidth, canvasHeight, layerX, layerY));
        chains.push(this.blendFilterBuilder.build(currentBase, positioned, composite, item.overlay.config.blendMode));
      }
      currentBase = composite;
    });
    return { filterGraph: chains.join(';'), finalLabel: currentBase };
  }
}
