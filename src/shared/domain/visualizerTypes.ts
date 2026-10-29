/** Single source of truth shared by UI options and main-process project validation. */
export const STEREO_VISUALIZER_STYLES = [
  'onix-analyzer', 'onix-classic', 'onix-modern', 'onix-plasma', 'onix-infinity', 'onix-neon',
  'onix-hawking', 'onix-core', 'onix-reactor', 'onix-spotlight', 'onix-twirl', 'onix-warp',
  'onix-ripple', 'onix-pulsar', 'onix-hallucia', 'onix-logo', 'onix-album-art', 'onix-blank',
  'vertical-spectrum-bars', 'circular-spectrum', 'circular-waveform', 'radial-spectrum',
  'oscilloscope', 'lissajous', 'waveform-progress',
  'basic-split', 'mirrored', 'gap', 'split-colors', 'cqt', 'rainbow', 'glow', 'reflection',
  'vector', 'spectrum', 'frequency', 'vu-meter', 'polar',
] as const;
export type StereoVisualizerStyle = (typeof STEREO_VISUALIZER_STYLES)[number];
export type VisualizerColorMode = 'single' | 'gradient' | 'neon' | 'amber';
export type VisualizerAlphaFormat = 'rgba' | 'yuva444p10le';
export type VisualizerKind = 'mediaLogo' | 'bars' | 'line' | 'dots' | 'wave' | 'mirror' | 'spectrum' | 'smoothBars' | 'waveLine' | 'wavePoints' | 'spectrumFire' | 'spectrumCool' | 'spectrumScroll' | 'solidBars' | 'sparkDots' | 'wavePeak' | 'spectrumViridis' | 'spectrumMagma';
export type VisualizerPalette = 'rainbow' | 'fire' | 'cool' | 'viridis' | 'magma' | 'custom';
export type VisualizerSourceCrop = { left: number; right: number; top: number; bottom: number };
export type VisualizerMediaMotion = 'none' | 'pulse' | 'float' | 'pulse-float' | 'rotate';
export type VisualizerBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'lighten' | 'add';
export type VisualizerEffect = {
  id: string;
  /** Source image used as an audio-reactive logo visualizer. */
  sourcePath?: string;
  /** Source crop percentages, applied before scaling in preview and export. */
  sourceCrop?: VisualizerSourceCrop;
  /** Motion applied to the image itself when kind is mediaLogo. */
  mediaMotion?: VisualizerMediaMotion;
  motionAmount?: number;
  motionSpeed?: number;
  blendMode?: VisualizerBlendMode;
  chromaKeyEnabled?: boolean;
  chromaKeyColor?: string;
  chromaSimilarity?: number;
  chromaBlend?: number;
  kind: VisualizerKind;
  /** Stereo visualization model; legacy kind remains for loading older projects. */
  stereoStyle?: StereoVisualizerStyle;
  stereoLeftColor?: string;
  stereoRightColor?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: string;
  opacity: number;
  sensitivity: number;
  smoothing?: number;
  frequencyScale?: 'log' | 'linear';
  /** Valid showwaves modes exposed by FFmpeg: line, cline, p2p, point. */
  waveformMode?: 'line' | 'cline' | 'p2p' | 'point';
  /** Amplitude axis scale supported by showwaves/showspectrum. */
  waveformScale?: 'lin' | 'log' | 'sqrt' | 'cbrt';
  /** Display style for FFmpeg showfreqs. */
  frequencyMode?: 'bar' | 'line' | 'dot';
  /** User-facing style controls shared by Onix-inspired spectrum and waveform models. */
  colorMode?: VisualizerColorMode;
  gradientEndColor?: string;
  thickness?: number;
  barCount?: number;
  symmetry?: boolean;
  frequencyMinHz?: number;
  frequencyMaxHz?: number;
  /** Temporary alpha format used before final MP4 conversion. */
  alphaFormat?: VisualizerAlphaFormat;
  /** Color theme for showspectrum; custom maps to channel-based coloring. */
  spectrumSlide?: 'scroll' | 'replace' | 'rscroll';
  volumeMode?: 'peak' | 'rms';
  volumeOrientation?: 'horizontal' | 'vertical';
  vectorScopeMode?: 'lissajous' | 'lissajous_xy' | 'polar';
  palette?: VisualizerPalette;
  peakPosition?: 'left' | 'center' | 'right';
  density?: 16 | 32 | 64 | 128;
  /** Fraction of each frequency band's width reserved for clear space. */
  bandSpacing?: number;
  roundedTop?: boolean;
  cornerRadius?: number;
  /** Draw a circular marker at each current spectrum-bar peak. */
  showPeakMarker?: boolean;
  glow?: number;
  /** Seconds used to fade the visualizer in after the content starts. */
  fadeInSec?: number;
};
export function defaultVisualizer(id: string): VisualizerEffect {
  return { id, kind: 'wave', stereoStyle: 'onix-analyzer', stereoLeftColor: '#ff3b30', stereoRightColor: '#2f80ff', position: { x: 280, y: 760 }, size: { width: 1360, height: 210 }, color: '#2cf9ff', opacity: 0.8, sensitivity: 1, smoothing: 0.9, frequencyScale: 'log', waveformMode: 'cline', waveformScale: 'sqrt', frequencyMode: 'bar', spectrumSlide: 'scroll', volumeMode: 'peak', volumeOrientation: 'horizontal', vectorScopeMode: 'lissajous_xy', palette: 'rainbow', peakPosition:'left', density:64, bandSpacing:.15, roundedTop:true, cornerRadius:6, showPeakMarker:true, glow:0, fadeInSec:0, colorMode:'gradient', gradientEndColor:'#ff49d4', thickness:2, barCount:64, symmetry:false, frequencyMinHz:40, frequencyMaxHz:16000, alphaFormat:'rgba', mediaMotion:'pulse-float', motionAmount:0.08, motionSpeed:1, blendMode:'normal', chromaKeyEnabled:false, chromaKeyColor:'#00ff00', chromaSimilarity:0.12, chromaBlend:0.06 };
}
