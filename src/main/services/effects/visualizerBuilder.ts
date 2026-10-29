import type { VisualizerEffect } from '../../../shared/domain/visualizerTypes';
import { resolveVisualizerColors } from '../../../shared/domain/visualizerPalette';

/** Generate visualizer frames from the exact playlist audio used in the MP4. */
export function buildVisualizerFilters(items: VisualizerEffect[], input: string, audioIndex: number, canvasScale: number, fps: number, timelineOffsetSec = 0, sourceInputIndices: Record<string, number> = {}): { filters: string[]; output: string } {
  items = items.filter((item) => item.stereoStyle !== 'onix-blank' && !(item.kind === 'mediaLogo' && !item.sourcePath) && !(['onix-logo','onix-album-art'].includes(item.stereoStyle ?? '') && (item.kind !== 'mediaLogo' || !item.sourcePath || sourceInputIndices[item.id] === undefined)));
  if (!items.length) return { filters: [], output: input };
  const filters: string[] = [];
  const sources = items.map((_, index) => `[visual_audio_${index}]`).join('');
  filters.push(`[${audioIndex}:a]asplit=${items.length}${sources}`);
  let output = input;
  items.forEach((item, index) => {
    const width = Math.max(32, Math.round(item.size.width * canvasScale / 2) * 2);
    const height = Math.max(16, Math.round(item.size.height * canvasScale / 2) * 2);
    const strength = Math.min(4, Math.max(0.2, item.sensitivity));
    const stereoStyle = item.stereoStyle ?? 'basic-split';
    const splitSource = `visual_audio_${index}`;
    const source = `visual_tuned_audio_${index}`, next = `visual_composite_${index}`;
    const minHz = Math.max(20, Math.min(20000, Math.round(item.frequencyMinHz ?? 40)));
    const maxHz = Math.max(minHz + 1, Math.min(22000, Math.round(item.frequencyMaxHz ?? 16000)));
    const frequencyFilter = `${minHz > 20 ? `,highpass=f=${minHz}` : ''}${maxHz < 22000 ? `,lowpass=f=${maxHz}` : ''}`;
    filters.push(`[${splitSource}]aformat=channel_layouts=stereo${frequencyFilter}[${source}]`);
    const fadeStart = Math.max(0, Number.isFinite(timelineOffsetSec) ? timelineOffsetSec : 0);
    const fadeIn = (item.fadeInSec ?? 0) > 0 ? `,fade=t=in:st=${Number(fadeStart.toFixed(4))}:d=${Number(item.fadeInSec!.toFixed(4))}:alpha=1` : '';
    if (item.kind === 'mediaLogo' && sourceInputIndices[item.id] !== undefined) {
      const logoInput = sourceInputIndices[item.id];
      const crop = item.sourceCrop ?? { left: 0, right: 0, top: 0, bottom: 0 };
      const cropWidth = Math.max(0.01, 1 - (crop.left + crop.right) / 100);
      const cropHeight = Math.max(0.01, 1 - (crop.top + crop.bottom) / 100);
      const cropFilter = `crop=w=iw*${cropWidth.toFixed(4)}:h=ih*${cropHeight.toFixed(4)}:x=iw*${(crop.left / 100).toFixed(4)}:y=ih*${(crop.top / 100).toFixed(4)}`;
      const logo = `visual_logo_${index}`;
      const motion = (stereoStyle === 'onix-logo' || stereoStyle === 'onix-album-art') ? 'none' : (item.mediaMotion ?? 'pulse-float');
      const motionAmount = Math.max(0, Math.min(0.3, item.motionAmount ?? 0.08));
      const motionSpeed = Math.max(0.1, Math.min(4, item.motionSpeed ?? 1));
      const overlayX = Math.round(item.position.x * canvasScale);
      const overlayY = Math.round(item.position.y * canvasScale);
      const pulseAmp = (motion === 'pulse' || motion === 'pulse-float') ? Math.min(.15, motionAmount) : 0;
      const zoom = pulseAmp > 0
        ? `,zoompan=z='1+${pulseAmp.toFixed(4)}*(0.5+0.5*sin(2*PI*on/${Math.max(1, fps * 2 / motionSpeed).toFixed(4)}))':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=${fps}`
        : '';
      const rotate = motion === 'rotate'
        ? `,rotate=angle='${(motionAmount * 0.85).toFixed(4)}*sin(2*PI*t*${(motionSpeed * .35).toFixed(3)})':ow=${width}:oh=${height}:c=black@0`
        : '';
      const keyColor = (item.chromaKeyColor ?? '#00ff00').slice(1).replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
      const chroma = item.chromaKeyEnabled
        ? `,colorkey=0x${keyColor}:${Math.max(0,Math.min(1,item.chromaSimilarity ?? .12)).toFixed(4)}:${Math.max(.001,Math.min(.8,item.chromaBlend ?? .06)).toFixed(4)}`
        : '';
      filters.push(`[${logoInput}:v]setpts=PTS-STARTPTS,format=rgba,${cropFilter},scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0${zoom}${rotate},fps=${fps},format=rgba${chroma}${fadeIn},colorchannelmixer=aa=${item.opacity.toFixed(3)},format=${item.alphaFormat === 'yuva444p10le' ? 'yuva444p10le' : 'rgba'}[${logo}]`);
      // The image itself is animated instead of rendering an EQ bar layer.
      // Consume the parallel audio branch because FFmpeg requires every asplit
      // output to be connected, while preview still uses the live analyser to
      // modulate the logo motion smoothly.
      filters.push(`[${source}]anullsink`);
      const driftX = (motion === 'float' || motion === 'pulse-float') ? Math.round(width * motionAmount * .42) : 0;
      const driftY = (motion === 'float' || motion === 'pulse-float') ? Math.round(height * motionAmount * .28) : 0;
      const xExpr = driftX ? `'${overlayX}+${driftX}*sin(2*PI*t*${(motionSpeed * .42).toFixed(4)})'` : String(overlayX);
      const yExpr = driftY ? `'${overlayY}+${driftY}*cos(2*PI*t*${(motionSpeed * .31).toFixed(4)})'` : String(overlayY);
      const blend = item.blendMode ?? 'normal';
      const stageWidth = Math.max(2, Math.round(1920 * canvasScale / 2) * 2);
      const stageHeight = Math.max(2, Math.round(1080 * canvasScale / 2) * 2);
      if (blend !== 'normal') {
        const transparent = `visual_blend_transparent_${index}`, logoFull = `visual_blend_logo_full_${index}`;
        const baseA = `visual_blend_base_${index}`, baseB = `visual_blend_base_mask_${index}`;
        const logoRgbSource = `visual_blend_logo_source_${index}`, logoMaskSource = `visual_blend_logo_mask_source_${index}`;
        const baseRgb = `visual_blend_base_rgb_${index}`, logoRgb = `visual_blend_logo_rgb_${index}`;
        const mixedRgb = `visual_blend_mixed_rgb_${index}`, alphaMask = `visual_blend_alpha_${index}`;
        const baseMaskRgb = `visual_blend_base_mask_rgb_${index}`;
        const mode = blend === 'add' ? 'addition' : blend;
        filters.push(`color=c=black@0:s=${stageWidth}x${stageHeight}:r=${fps},format=rgba[${transparent}]`);
        filters.push(`[${transparent}][${logo}]overlay=x=${xExpr}:y=${yExpr}:eof_action=pass:shortest=1:format=auto[${logoFull}]`);
        filters.push(`[${output}]split=2[${baseA}][${baseB}]`);
        filters.push(`[${baseA}]format=gbrp[${baseRgb}]`);
        filters.push(`[${logoFull}]format=rgba,split=2[${logoRgbSource}][${logoMaskSource}]`);
        filters.push(`[${logoRgbSource}]format=gbrp[${logoRgb}]`);
        filters.push(`[${baseRgb}][${logoRgb}]blend=all_mode=${mode}[${mixedRgb}]`);
        filters.push(`[${logoMaskSource}]alphaextract,format=gray[${alphaMask}]`);
        filters.push(`[${baseB}]format=gbrp[${baseMaskRgb}]`);
        filters.push(`[${baseMaskRgb}][${mixedRgb}][${alphaMask}]maskedmerge,format=yuv420p[${next}]`);
      } else {
        filters.push(`[${output}][${logo}]overlay=x=${xExpr}:y=${yExpr}:eof_action=pass:shortest=0:format=auto[${next}]`);
      }
      output = next;
      return;
    }
    // All non-logo visualizers use the stereo display modes described in the
    // referenced FFmpeg guide: channel split, mirrored, gap, split-colors,
    // showcqt, hue-rotated rainbow, glow, reflection, and avectorscope.
    const stereoFrame = `visual_stereo_frame_${index}`;
    const stereoFinal = `visual_stereo_alpha_${index}`;
    const { primary: visualPrimary, secondary: visualSecondary } = resolveVisualizerColors(item);
    const safeHex = (value: string) => value.replace(/^#/, '').replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
    const leftColor = `0x${safeHex(visualPrimary)}`;
    const rightColor = `0x${safeHex(visualSecondary)}`;
    const primaryHex = safeHex(visualPrimary);
    const secondaryHex = safeHex(visualSecondary);
    const winSize = 2 ** Math.round(Math.log2(Math.max(512, Math.min(16384, (item.barCount ?? item.density ?? 64) * 32))));
    const bandStyles = ['onix-analyzer','onix-modern','vertical-spectrum-bars'];
    const isFrequencyBarStyle = stereoStyle === 'frequency' && (item.frequencyMode ?? 'bar') === 'bar';
    const radialStyles = ['circular-spectrum','radial-spectrum','onix-hawking','onix-core','onix-reactor','onix-spotlight','onix-neon','onix-infinity','circular-waveform','lissajous','onix-ripple','onix-pulsar'];
    const waveStyles = ['onix-classic','oscilloscope','waveform-progress','onix-plasma','onix-twirl','onix-warp','onix-hallucia'];
    if (stereoStyle === 'onix-blank') {
      filters.push(`[${source}]anullsink`);
      return;
    } else if (bandStyles.includes(stereoStyle) || isFrequencyBarStyle) {
      // Use a fixed number of bars in export, then scale each bar as one unit. This mirrors
      // the Canvas preview's barCount and bandSpacing instead of letting showfreqs choose an
      // unrelated density from output width. Dots are generated from the same audio branch.
      const barCount = Math.max(16, Math.min(256, Math.round(item.barCount ?? item.density ?? 64)));
      const slotWidth = 16;
      const intermediateWidth = barCount * slotWidth;
      const spacing = Math.max(0, Math.min(0.8, item.bandSpacing ?? 0.15));
      const fillWidth = Math.max(1, Math.min(slotWidth, Math.round(slotWidth * (1 - spacing))));
      const pad = Math.floor((slotWidth - fillWidth) / 2);
      const targetSlot = width / barCount;
      const cornerRadius = item.roundedTop === false ? 0 : Math.max(0, Math.min(7, Math.round((item.cornerRadius ?? 6) * slotWidth / Math.max(1, targetSlot))));
      const rgb = (hex: string, channel: number) => parseInt(hex.replace(/^#/, '').slice(channel * 2, channel * 2 + 2), 16) || 0;
      const primaryRgb = [rgb(visualPrimary,0),rgb(visualPrimary,1),rgb(visualPrimary,2)];
      const secondaryRgb = [rgb(visualSecondary,0),rgb(visualSecondary,1),rgb(visualSecondary,2)];
      const gradientChannel = (channel: number) => `if(gt(alpha(X,Y),0),${primaryRgb[channel]}+(${secondaryRgb[channel]}-${primaryRgb[channel]})*X/W,0)`;
      const localX = `mod(X,${slotWidth})`;
      let topDistance = String(Math.max(1, cornerRadius));
      if (cornerRadius > 0) {
        for (let scan = cornerRadius + 1; scan >= 1; scan--) topDistance = `if(eq(alpha(X,Y-${scan}),0),${scan - 1},${topDistance})`;
      }
      const leftX = `(${localX}-${pad})`;
      const rightX = `(${pad + fillWidth - 1}-${localX})`;
      const leftCut = cornerRadius > 0 ? `(lt(${leftX},${cornerRadius})*lt(${topDistance},${cornerRadius})*gt((${leftX}-${cornerRadius})*(${leftX}-${cornerRadius})+(${topDistance}-${cornerRadius})*(${topDistance}-${cornerRadius}),${cornerRadius * cornerRadius}))` : '0';
      const rightCut = cornerRadius > 0 ? `(lt(${rightX},${cornerRadius})*lt(${topDistance},${cornerRadius})*gt((${rightX}-${cornerRadius})*(${rightX}-${cornerRadius})+(${topDistance}-${cornerRadius})*(${topDistance}-${cornerRadius}),${cornerRadius * cornerRadius}))` : '0';
      const gapCut = `(lt(${localX},${pad})+gte(${localX},${pad + fillWidth}))`;
      const alphaExpression = `if(gt(alpha(X,Y),0),if(gte(${gapCut}+${leftCut}+${rightCut},1),0,alpha(X,Y)),0)`;
      const spectrumHeight = item.symmetry ? Math.max(8, Math.floor(height / 2 / 2) * 2) : height;
      const paintedBars = `visual_onix_spectrum_bars_painted_${index}`;
      const scaledBars = `visual_onix_spectrum_bars_scaled_${index}`;
      const barsFrame = item.symmetry ? scaledBars : paintedBars;
      const barAudio = item.showPeakMarker === false ? source : `visual_onix_bars_audio_${index}`;
      const peakAudio = `visual_onix_peaks_audio_${index}`;
      if (item.showPeakMarker !== false) filters.push(`[${source}]asplit=2[${barAudio}][${peakAudio}]`);
      filters.push(`[${barAudio}]volume=${strength.toFixed(2)},showfreqs=s=${barCount}x${spectrumHeight}:rate=${fps}:mode=bar:fscale=${item.frequencyScale === 'linear' ? 'lin' : 'log'}:ascale=${item.waveformScale ?? 'sqrt'}:cmode=combined:colors=white:win_size=${winSize},format=rgba,colorkey=0x000000:0.025:0.02,scale=${intermediateWidth}x${spectrumHeight}:flags=neighbor,geq=r='${gradientChannel(0)}':g='${gradientChannel(1)}':b='${gradientChannel(2)}':a='${alphaExpression}',scale=${width}x${spectrumHeight}:flags=neighbor[${paintedBars}]`);
      if (item.symmetry) {
        filters.push(`[${paintedBars}]split=2[visual_onix_spectrum_top_${index}][visual_onix_spectrum_bottom_${index}]`);
        filters.push(`[visual_onix_spectrum_bottom_${index}]vflip[visual_onix_spectrum_mirrored_${index}]`);
        filters.push(`[visual_onix_spectrum_top_${index}][visual_onix_spectrum_mirrored_${index}]vstack=inputs=2[${scaledBars}]`);
      }
      if (item.showPeakMarker !== false) {
        const peakHalf = item.symmetry ? Math.max(8, Math.floor(height / 2 / 2) * 2) : height;
        const peakPainted = `visual_onix_spectrum_peaks_painted_${index}`;
        filters.push(`[${peakAudio}]volume=${strength.toFixed(2)},showfreqs=s=${barCount}x${peakHalf}:rate=${fps}:mode=dot:fscale=${item.frequencyScale === 'linear' ? 'lin' : 'log'}:ascale=${item.waveformScale ?? 'sqrt'}:cmode=combined:colors=white:win_size=${winSize},format=rgba,colorkey=0x000000:0.025:0.02,scale=${width}x${peakHalf}:flags=lanczos,geq=r='${gradientChannel(0)}':g='${gradientChannel(1)}':b='${gradientChannel(2)}':a='alpha(X,Y)'[${peakPainted}]`);
        if (item.symmetry) {
          filters.push(`[${peakPainted}]split=2[visual_onix_peak_top_${index}][visual_onix_peak_bottom_${index}]`);
          filters.push(`[visual_onix_peak_bottom_${index}]vflip[visual_onix_peak_mirrored_${index}]`);
          filters.push(`[visual_onix_peak_top_${index}][visual_onix_peak_mirrored_${index}]vstack=inputs=2[visual_onix_spectrum_peaks_full_${index}]`);
        }
        const peakFrame = item.symmetry ? `visual_onix_spectrum_peaks_full_${index}` : peakPainted;
        filters.push(`[${barsFrame}][${peakFrame}]overlay=x=0:y=0:eof_action=pass:shortest=1:format=auto[${stereoFrame}]`);
      } else {
        filters.push(`[${barsFrame}]null[${stereoFrame}]`);
      }
    } else if (radialStyles.includes(stereoStyle)) {
      const vectorMode = ['circular-spectrum','radial-spectrum','onix-hawking','onix-core','onix-reactor','onix-spotlight','onix-neon','onix-infinity','circular-waveform','onix-ripple','onix-pulsar'].includes(stereoStyle) ? 'polar' : (item.vectorScopeMode ?? 'lissajous_xy');
      const zoom = Math.max(.1, Math.min(10, 1 + strength * .5));
      filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,avectorscope=s=${width}x${height}:m=${vectorMode}:zoom=${zoom.toFixed(2)}:r=${fps}:draw=aaline:rc=${parseInt(primaryHex.slice(0,2),16)}:gc=${parseInt(primaryHex.slice(2,4),16)}:bc=${parseInt(primaryHex.slice(4,6),16)},format=rgba,colorkey=0x000000:0.025:0.02[${stereoFrame}]`);
    } else if (waveStyles.includes(stereoStyle)) {
      const waveMode = item.waveformMode ?? 'cline';
      const lineColor = visualPrimary;
      if (stereoStyle === 'onix-plasma') {
        const halfHeight = Math.max(8, Math.floor(height / 2 / 2) * 2);
        filters.push(`[${source}]aformat=channel_layouts=stereo,channelsplit=channel_layout=stereo[visual_onix_left_audio_${index}][visual_onix_right_audio_${index}]`);
        filters.push(`[visual_onix_left_audio_${index}]volume=${strength.toFixed(2)},showwaves=s=${width}x${halfHeight}:rate=${fps}:mode=${waveMode}:colors=${lineColor}:draw=full:scale=${item.waveformScale ?? 'sqrt'},format=rgba,colorkey=0x000000:0.025:0.02[visual_onix_left_wave_${index}]`);
        filters.push(`[visual_onix_right_audio_${index}]volume=${strength.toFixed(2)},showwaves=s=${width}x${halfHeight}:rate=${fps}:mode=${waveMode}:colors=${visualSecondary}:draw=full:scale=${item.waveformScale ?? 'sqrt'},format=rgba,colorkey=0x000000:0.025:0.02[visual_onix_right_wave_${index}]`);
        filters.push(`[visual_onix_left_wave_${index}][visual_onix_right_wave_${index}]vstack=inputs=2[${stereoFrame}]`);
      } else {
        const colorStr = `${lineColor}|${visualSecondary}`; // single mode resolves both values to the same shared primary color.
        const mode = (stereoStyle === 'onix-classic' || stereoStyle === 'oscilloscope') ? waveMode : 'cline';
        const visualFilter = stereoStyle === 'onix-warp' ? ',lenscorrection=k1=0.15:k2=0.03' : stereoStyle === 'onix-twirl' ? `,rotate=angle='0.25*sin(2*PI*t)':ow=${width}:oh=${height}:c=black@0` : stereoStyle === 'onix-hallucia' ? ",hue=h='t*70':s=1,rotate=angle='0.18*sin(2*PI*t)':ow=iw:oh=ih:c=black@0" : '';
        const thicknessFilter = Math.max(1, item.thickness ?? 2) > 1 ? `,gblur=sigma=${Math.min(5,Math.max(0,(item.thickness ?? 2)-1)*.42).toFixed(2)}:steps=1` : '';
        const progressFilter = stereoStyle === 'waveform-progress' ? `,drawbox=x='mod(t*${Math.max(1,width/12).toFixed(3)},${Math.max(1,width-4)})':y=0:w=${Math.max(2,Math.round(item.thickness ?? 2))}:h=${height}:color=#${primaryHex}@0.9:t=fill` : '';
        filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,showwaves=s=${width}x${height}:rate=${fps}:mode=${mode}:colors=${colorStr}:draw=full:scale=${item.waveformScale ?? 'sqrt'}${visualFilter}${thicknessFilter}${progressFilter},format=rgba,colorkey=0x000000:0.025:0.02[${stereoFrame}]`);
      }
    } else if (stereoStyle === 'spectrum') {
      // A scrolling spectrogram/spectrum palette. Every option below is supported by
      // FFmpeg's showspectrum filter; guide-only values are intentionally not passed through.
      const spectrumPalette = ({ rainbow: 'rainbow', fire: 'fire', cool: 'cool', viridis: 'viridis', magma: 'magma', custom: 'channel' } as const)[item.palette ?? 'rainbow'];
      filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,showspectrum=s=${width}x${height}:fps=${fps}:mode=combined:color=${spectrumPalette}:slide=${item.spectrumSlide ?? 'scroll'}:scale=${item.waveformScale ?? 'sqrt'}:fscale=${item.frequencyScale === 'linear' ? 'lin' : 'log'}:legend=0,format=rgba,colorkey=0x000000:0.04:0.02[${stereoFrame}]`);
    } else if (stereoStyle === 'frequency') {
      const frequencyColors = `${visualPrimary}|${visualSecondary}`;
      filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,showfreqs=s=${width}x${height}:rate=${fps}:mode=${item.frequencyMode ?? 'bar'}:fscale=${item.frequencyScale === 'linear' ? 'lin' : 'log'}:ascale=${item.waveformScale ?? 'log'}:cmode=separate:colors=${frequencyColors},format=rgba,colorkey=0x000000:0.04:0.02[${stereoFrame}]`);
    } else if (stereoStyle === 'vu-meter') {
      const rgb = visualPrimary.replace(/^#/, '').replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
      const orientation = item.volumeOrientation === 'vertical' ? 'v' : 'h';
      const mode = item.volumeMode === 'rms' ? 'r' : 'p';
      filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,showvolume=w=${width}:h=${height}:r=${fps}:o=${orientation}:m=${mode}:t=0:v=0:c=0x${rgb}ff:p=0.15,format=rgba,colorkey=0x000000:0.04:0.02[${stereoFrame}]`);
    } else if (stereoStyle === 'polar' || stereoStyle === 'vector') {
      const rgb = visualPrimary.replace(/^#/, '').replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
      const vectorR = parseInt(rgb.slice(0, 2), 16), vectorG = parseInt(rgb.slice(2, 4), 16), vectorB = parseInt(rgb.slice(4, 6), 16);
      const mode = stereoStyle === 'polar' ? 'polar' : (item.vectorScopeMode ?? 'lissajous_xy');
      const zoom = Math.max(.1, Math.min(10, 1 + strength * .5));
      filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,avectorscope=s=${width}x${height}:m=${mode}:zoom=${zoom.toFixed(2)}:r=${fps}:draw=aaline:rc=${vectorR}:gc=${vectorG}:bc=${vectorB},format=rgba,colorkey=0x000000:0.04:0.02[${stereoFrame}]`);
    } else if (stereoStyle === 'cqt') {
      filters.push(`[${source}]volume=${strength.toFixed(2)},aformat=channel_layouts=stereo,showcqt=s=${width}x${height}:r=${fps},format=rgba,colorkey=0x000000:0.04:0.02[${stereoFrame}]`);
    } else {
      const isGap = stereoStyle === 'gap';
      const isGlow = stereoStyle === 'glow';
      const isReflection = stereoStyle === 'reflection';
      const waveHeight = isReflection ? Math.max(16, Math.floor(height / 4) * 2) : height;
      const gapWidth = isGap ? Math.max(6, Math.round(width * .025)) : 0;
      const halfWidth = Math.max(16, Math.floor((width - gapWidth) / 4) * 2);
      const leftAudio = `visual_stereo_left_audio_${index}`;
      const rightAudio = `visual_stereo_right_audio_${index}`;
      const leftCore = `visual_stereo_left_core_${index}`;
      const rightRaw = `visual_stereo_right_raw_${index}`;
      const rightCore = `visual_stereo_right_core_${index}`;
      const stackedCore = `visual_stereo_core_${index}`;
      filters.push(`[${source}]aformat=channel_layouts=stereo,channelsplit=channel_layout=stereo[${leftAudio}][${rightAudio}]`);
      const rainbowLeft = stereoStyle === 'rainbow';
      const colorLeft = rainbowLeft ? 'red' : leftColor;
      const colorRight = rainbowLeft ? 'red' : rightColor;
      const hueLeft = rainbowLeft ? ",hue=h='t*100':s=1" : '';
      const hueRight = rainbowLeft ? ",hue=h='t*100+180':s=1" : '';
      filters.push(`[${leftAudio}]volume=${strength.toFixed(2)},showwaves=s=${halfWidth}x${waveHeight}:rate=${fps}:mode=${item.waveformMode ?? 'cline'}:colors=${colorLeft}:draw=full:scale=${item.waveformScale ?? 'sqrt'}${hueLeft},format=rgba,colorkey=0x000000:0.04:0.02[${leftCore}]`);
      filters.push(`[${rightAudio}]volume=${strength.toFixed(2)},showwaves=s=${halfWidth}x${waveHeight}:rate=${fps}:mode=${item.waveformMode ?? 'cline'}:colors=${colorRight}:draw=full:scale=${item.waveformScale ?? 'sqrt'}${hueRight},format=rgba,colorkey=0x000000:0.04:0.02[${rightRaw}]`);
      const rightTransform = stereoStyle === 'mirrored' || isGap || rainbowLeft || isGlow || isReflection;
      if (rightTransform) filters.push(`[${rightRaw}]hflip[${rightCore}]`);
      else filters.push(`[${rightRaw}]null[${rightCore}]`);
      if (isGap) {
        const gapSpacer = `visual_stereo_gap_spacer_${index}`;
        filters.push(`color=c=black@0:s=${gapWidth}x${waveHeight}:r=${fps},format=rgba[${gapSpacer}]`);
        filters.push(`[${leftCore}][${gapSpacer}][${rightCore}]hstack=inputs=3[${stackedCore}]`);
      } else {
        filters.push(`[${leftCore}][${rightCore}]hstack=inputs=2[${stackedCore}]`);
      }
      let composite = stackedCore;
      if (isGap) {
        const gapped = `visual_stereo_gapped_${index}`;
        filters.push(`[${stackedCore}]pad=${width}:${waveHeight}:(ow-iw)/2:0:color=black,format=rgba,colorkey=0x000000:0.04:0.02[${gapped}]`);
        composite = gapped;
      } else if (2 * halfWidth !== width) {
        const padded = `visual_stereo_padded_${index}`;
        filters.push(`[${stackedCore}]pad=${width}:${waveHeight}:(ow-iw)/2:0:color=black,format=rgba,colorkey=0x000000:0.04:0.02[${padded}]`);
        composite = padded;
      }
      if (isGlow) {
        const leftGlow = `visual_stereo_left_glow_${index}`;
        const rightGlow = `visual_stereo_right_glow_${index}`;
        const glowStack = `visual_stereo_glow_stack_${index}`;
        const glowBase = `visual_stereo_glow_base_${index}`;
        const glowCanvas = `visual_stereo_glow_canvas_${index}`;
        const glowAmount = Math.max(0, Math.min(5, item.glow ?? 2));
        const glowRadius = Math.max(1, Math.min(10, Math.round(1 + glowAmount * 1.8)));
        const glowAlpha = (glowAmount / 7).toFixed(3);
        filters.push(`[${leftCore}]boxblur=${glowRadius}:1,colorchannelmixer=aa=${glowAlpha}[${leftGlow}]`);
        filters.push(`[${rightCore}]boxblur=${glowRadius}:1,colorchannelmixer=aa=${glowAlpha}[${rightGlow}]`);
        filters.push(`[${leftGlow}][${rightGlow}]hstack=inputs=2[${glowStack}]`);
        filters.push(`color=c=black@0:s=${width}x${height}:r=${fps},format=rgba[${glowBase}]`);
        filters.push(`[${glowBase}][${glowStack}]overlay=x=0:y=0:eof_action=pass:shortest=1:format=auto[${glowCanvas}]`);
        filters.push(`[${glowCanvas}][${composite}]overlay=x=0:y=0:eof_action=pass:shortest=1:format=auto[${stereoFrame}]`);
      } else if (isReflection) {
        const reflectionHeight = Math.max(2, Math.floor(height / 2 / 2) * 2);
        const reflectionBase = `visual_stereo_reflection_base_${index}`;
        const reflectionCore = `visual_stereo_reflection_core_${index}`;
        const reflection = `visual_stereo_reflection_${index}`;
        const reflectionBelow = `visual_stereo_reflection_below_${index}`;
        filters.push(`[${composite}]scale=${width}:${reflectionHeight}:flags=lanczos,format=rgba[${reflectionCore}]`);
        filters.push(`[${reflectionCore}]hflip,vflip,colorchannelmixer=aa=0.22[${reflection}]`);
        filters.push(`color=c=black@0:s=${width}x${height}:r=${fps},format=rgba[${reflectionBase}]`);
        filters.push(`[${reflectionBase}][${reflection}]overlay=x=0:y=${reflectionHeight}:eof_action=pass:shortest=1:format=auto[${reflectionBelow}]`);
        filters.push(`[${reflectionBelow}][${reflectionCore}]overlay=x=0:y=0:eof_action=pass:shortest=1:format=auto[${stereoFrame}]`);
      } else {
        filters.push(`[${composite}]null[${stereoFrame}]`);
      }
    }
    const smoothing = Math.max(0, Math.min(0.97, item.smoothing ?? 0.9));
    const smoothingFrames = Math.max(1, Math.min(6, Math.round(1 + smoothing * 5)));
    const temporalMix = smoothingFrames > 1
      ? `,tmix=frames=${smoothingFrames}:weights='${Array(smoothingFrames).fill('1').join(' ')}':scale=${(1 / smoothingFrames).toFixed(4)}`
      : '';
    const alphaFormat = item.alphaFormat === 'yuva444p10le' ? 'yuva444p10le' : 'rgba';
    filters.push(`[${stereoFrame}]format=${alphaFormat}${temporalMix}${fadeIn},colorchannelmixer=aa=${item.opacity.toFixed(3)}[${stereoFinal}]`);
    filters.push(`[${output}][${stereoFinal}]overlay=x=${Math.round(item.position.x * canvasScale)}:y=${Math.round(item.position.y * canvasScale)}:eof_action=pass:shortest=0:format=auto[${next}]`);
    output = next;
    return;
  });
  return { filters, output };
}
