import type { MainMediaControls } from '../../../shared/domain/mediaTypes';
import { getResolution } from './resolutionMap';
import type { ProjectResolution } from '../../../shared/domain/projectTypes';
import type { SpawnCommand } from './commandBuilder';
import { buildMainMediaRenderPlan } from './commandBuilder';

export function buildVideoNormalizationCommand(
  ffmpegExecutable: string,
  inputPath: string,
  outputPath: string,
  resolution: ProjectResolution,
  controls: MainMediaControls,
  durationSeconds: number | null = null,
): SpawnCommand {
  const { width, height } = getResolution(resolution);
  const args = ['-y'];
  if (durationSeconds && durationSeconds > 0) args.push('-stream_loop', '-1');
  args.push('-i', inputPath, '-map', '0:v:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', buildMainMediaRenderPlan(controls, width, height, durationSeconds).videoFilterGraph);
  if (controls.autoMute) args.push('-an');
  else args.push('-map', '0:a:0?', '-c:a', 'aac');
  if (durationSeconds && durationSeconds > 0) args.push('-t', durationSeconds.toFixed(6));
  args.push(outputPath);
  return { executable: ffmpegExecutable, args };
}
