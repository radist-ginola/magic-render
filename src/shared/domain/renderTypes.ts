import type { ProjectData } from './projectTypes';
import type { GpuInfo } from './settingsTypes';

export type RenderStatus =
  | 'idle'
  | 'processing_audio'
  | 'assembling_overlay'
  | 'composing_text'
  | 'compressing_video'
  | 'done'
  | 'error'
  | 'paused'
  | 'cancelled';

export type RenderStage =
  | 'main-media-preparation'
  | 'visual-layer-composition'
  | 'content-flow'
  | 'audio-management'
  | 'output';

export type RenderProgress = {
  projectId: string;
  status: RenderStatus;
  percent: number;
  currentTimeSec: number;
  totalDurationSec: number;
  speedMultiplier: number;
  elapsedRenderSec: number;
  logLine: string;
  errorMessage: string | null;
};

export type RenderStartResult = {
  projectId: string;
  outputPath: string;
  timestampPath?: string;
  status: RenderStatus;
  fileSizeBytes?: number;
  renderDevice?: 'cpu' | 'gpu';
  gpu?: GpuInfo;
};

export type RenderControlAction = 'pause' | 'resume' | 'cancel' | 'reset';

export type RenderControlRequest = {
  projectId: string;
  action: RenderControlAction;
};

export type RenderRequest = ProjectData;
