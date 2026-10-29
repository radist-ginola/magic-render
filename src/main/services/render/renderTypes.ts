import type { SpawnCommand } from '../ffmpegEngine/commandBuilder';
import type { RenderStage, RenderProgress, RenderRequest, RenderStartResult, RenderStatus } from '../../../shared/domain/renderTypes';

export type RenderStagePlan = {
  stage: RenderStage;
  status: RenderStatus;
  label: string;
  command: SpawnCommand;
  outputPath?: string;
  durationSeconds: number;
};

export type RenderPlan = {
  strategy: 'single-pass' | 'multi-stage';
  outputPath: string;
  totalDurationSeconds: number;
  stages: RenderStagePlan[];
  artifacts: string[];
};

export type RenderExecutionResult = RenderStartResult;
export type RenderProgressCallback = (progress: RenderProgress) => void;
export type RenderRequestType = RenderRequest;
