import type { OverlayBlendMode } from '../../../../shared/domain/overlayTypes';

export class BlendFilterBuilder {
  build(baseLabel: string, overlayLabel: string, outputLabel: string, mode: OverlayBlendMode, enable?: string): string {
    if (mode === 'normal') return `[${baseLabel}][${overlayLabel}]overlay=eof_action=repeat[${outputLabel}]`;
    if (!['multiply', 'screen', 'overlay'].includes(mode)) throw new Error(`Blend mode unsupported: ${mode}`);
    // YUV chroma planes are centered at 128, not black. Blending them as RGB
    // shifts screen/multiply toward purple. Blend RGB, then use the positioned
    // layer's actual alpha as a mask so pixels outside it remain untouched.
    const baseBlend = `${outputLabel}_base_blend`;
    const baseMask = `${outputLabel}_base_mask`;
    const layerRgb = `${outputLabel}_layer_rgb`;
    const layerMask = `${outputLabel}_layer_mask`;
    const blended = `${outputLabel}_blended`;
    const baseFinal = `${outputLabel}_base_final`;
    const merged = enable ? `${outputLabel}_merged` : outputLabel;
    return [
      `[${baseLabel}]format=gbrp,split=${enable ? 3 : 2}[${baseBlend}][${baseMask}]${enable ? `[${baseFinal}]` : ''}`,
      `[${overlayLabel}]split[${outputLabel}_layer_color][${outputLabel}_layer_alpha]`,
      `[${outputLabel}_layer_color]format=gbrp[${layerRgb}]`,
      `[${outputLabel}_layer_alpha]alphaextract[${layerMask}]`,
      `[${baseBlend}][${layerRgb}]blend=all_mode=${mode}[${blended}]`,
      `[${baseMask}][${blended}][${layerMask}]maskedmerge[${merged}]`,
      ...(enable ? [`[${baseFinal}][${merged}]overlay=enable='${enable}':eof_action=pass[${outputLabel}]`] : []),
    ].join(';');
  }
}
