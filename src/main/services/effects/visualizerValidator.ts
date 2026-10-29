import { STEREO_VISUALIZER_STYLES } from '../../../shared/domain/visualizerTypes';
import type { VisualizerEffect } from '../../../shared/domain/visualizerTypes';

export function validateVisualizer(value: unknown): VisualizerEffect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Konfigurasi visualizer harus berupa objek.');
  const raw = value as Record<string, unknown>;
  if (raw.stereoStyle !== undefined && (typeof raw.stereoStyle !== 'string' || !(STEREO_VISUALIZER_STYLES as readonly string[]).includes(raw.stereoStyle))) {
    throw new Error(`Model visualizer tidak didukung: ${String(raw.stereoStyle)}.`);
  }
  const v = value as VisualizerEffect;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!v || typeof v.id !== 'string' || !/^[\w-]{1,80}$/.test(v.id) || !['mediaLogo','bars','line','dots','wave','mirror','spectrum','smoothBars','waveLine','wavePoints','spectrumFire','spectrumCool','spectrumScroll','solidBars','sparkDots','wavePeak','spectrumViridis','spectrumMagma'].includes(v.kind)
      || (v.sourcePath !== undefined && (typeof v.sourcePath !== 'string' || v.sourcePath.trim() === '' || v.sourcePath.length > 32767))
      || (v.kind === 'mediaLogo' && (typeof v.sourcePath !== 'string' || !/\.(png|jpe?g|webp|bmp)$/i.test(v.sourcePath)))
      || (v.sourceCrop !== undefined && (!v.sourceCrop || !['left','right','top','bottom'].every((edge) => finite(v.sourceCrop?.[edge as keyof NonNullable<VisualizerEffect['sourceCrop']>]) && (v.sourceCrop?.[edge as keyof NonNullable<VisualizerEffect['sourceCrop']>] ?? -1) >= 0 && (v.sourceCrop?.[edge as keyof NonNullable<VisualizerEffect['sourceCrop']>] ?? 101) <= 95) || (v.sourceCrop.left + v.sourceCrop.right >= 99) || (v.sourceCrop.top + v.sourceCrop.bottom >= 99)))
      || (v.mediaMotion !== undefined && !['none','pulse','float','pulse-float','rotate'].includes(v.mediaMotion))
      || (v.motionAmount !== undefined && (!finite(v.motionAmount) || v.motionAmount < 0 || v.motionAmount > 0.3))
      || (v.motionSpeed !== undefined && (!finite(v.motionSpeed) || v.motionSpeed < 0.1 || v.motionSpeed > 4))
      || (v.blendMode !== undefined && !['normal','screen','multiply','overlay','lighten','add'].includes(v.blendMode))
      || (v.chromaKeyEnabled !== undefined && typeof v.chromaKeyEnabled !== 'boolean')
      || (v.chromaKeyColor !== undefined && (typeof v.chromaKeyColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.chromaKeyColor)))
      || (v.chromaSimilarity !== undefined && (!finite(v.chromaSimilarity) || v.chromaSimilarity < 0 || v.chromaSimilarity > 1))
      || (v.chromaBlend !== undefined && (!finite(v.chromaBlend) || v.chromaBlend < 0 || v.chromaBlend > 1))
      || !v.position || !finite(v.position.x) || !finite(v.position.y) || Math.abs(v.position.x) > 16384 || Math.abs(v.position.y) > 16384
      || !v.size || !finite(v.size.width) || !finite(v.size.height) || v.size.width < 32 || v.size.height < 16 || v.size.width > 3840 || v.size.height > 2160
      || typeof v.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.color)
      || !finite(v.opacity) || v.opacity < 0 || v.opacity > 1 || !finite(v.sensitivity) || v.sensitivity < 0.2 || v.sensitivity > 4
      || (v.smoothing !== undefined && (!finite(v.smoothing) || v.smoothing < 0 || v.smoothing > 0.97))
      || (v.colorMode !== undefined && !['single','gradient','neon','amber'].includes(v.colorMode))
      || (v.gradientEndColor !== undefined && (typeof v.gradientEndColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.gradientEndColor)))
      || (v.thickness !== undefined && (!finite(v.thickness) || v.thickness < 1 || v.thickness > 12))
      || (v.barCount !== undefined && (!finite(v.barCount) || v.barCount < 16 || v.barCount > 256 || !Number.isInteger(v.barCount)))
      || (v.symmetry !== undefined && typeof v.symmetry !== 'boolean')
      || (v.frequencyMinHz !== undefined && (!finite(v.frequencyMinHz) || v.frequencyMinHz < 20 || v.frequencyMinHz > 2000))
      || (v.frequencyMaxHz !== undefined && (!finite(v.frequencyMaxHz) || v.frequencyMaxHz < 1000 || v.frequencyMaxHz > 20000))
      || (v.alphaFormat !== undefined && !['rgba','yuva444p10le'].includes(v.alphaFormat))
      || (v.frequencyScale !== undefined && !['log','linear'].includes(v.frequencyScale))
      || (v.waveformMode !== undefined && !['line','cline','p2p','point'].includes(v.waveformMode))
      || (v.waveformScale !== undefined && !['lin','log','sqrt','cbrt'].includes(v.waveformScale))
      || (v.frequencyMode !== undefined && !['bar','line','dot'].includes(v.frequencyMode))
      || (v.spectrumSlide !== undefined && !['scroll','replace','rscroll'].includes(v.spectrumSlide))
      || (v.volumeMode !== undefined && !['peak','rms'].includes(v.volumeMode))
      || (v.volumeOrientation !== undefined && !['horizontal','vertical'].includes(v.volumeOrientation))
      || (v.vectorScopeMode !== undefined && !['lissajous','lissajous_xy','polar'].includes(v.vectorScopeMode))
      || (v.palette !== undefined && !['rainbow','fire','cool','viridis','magma','custom'].includes(v.palette))
      || (v.peakPosition !== undefined && !['left','center','right'].includes(v.peakPosition))
      || (v.density !== undefined && ![16,32,64,128].includes(v.density))
      || (v.bandSpacing !== undefined && (!finite(v.bandSpacing) || v.bandSpacing<0 || v.bandSpacing>.8))
      || (v.roundedTop !== undefined && typeof v.roundedTop!=='boolean')
      || (v.cornerRadius !== undefined && (!finite(v.cornerRadius) || v.cornerRadius<0 || v.cornerRadius>24))
      || (v.showPeakMarker !== undefined && typeof v.showPeakMarker !== 'boolean')
      || (v.glow !== undefined && (!finite(v.glow) || v.glow < 0 || v.glow > 5))
      || (v.fadeInSec !== undefined && (!finite(v.fadeInSec) || v.fadeInSec < 0 || v.fadeInSec > 30))) throw new Error('Konfigurasi visualizer tidak valid.');
  return v;
}
