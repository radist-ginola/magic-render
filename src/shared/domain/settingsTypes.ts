import type { AiProvider } from './aiTypes';
import type { ProjectResolution } from './projectTypes';

export type GlobalSettings = {
  outputDir: string;
  uploadDir: string;
  assetDir: string;
  renderDevice: 'cpu' | 'gpu';
  resolution: ProjectResolution;
  bitrateKbps: number;
  bitrateMode: 'cbr' | 'vbr';
  fps: 24 | 25 | 30 | 50 | 60;
  cpuLoadPercent: number;
  renderPreset: 'fast' | 'standard' | 'slow';
  aiProvider: AiProvider;
  aiModel: string;
  ffmpegPath: string;
  ffprobePath: string;
};

export type GlobalSettingsUpdate = Partial<GlobalSettings>;
export type GpuInfo = { name: string; vramMb: number | null; encoder: 'h264_nvenc' | 'h264_amf' | 'h264_qsv' | null; available: boolean; message: string };

export type GlobalAiStatus = {
  provider: AiProvider;
  model: string;
  configured: boolean;
  valid: boolean;
  checkedAt: string | null;
  message: string;
};
