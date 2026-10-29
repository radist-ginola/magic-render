import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { SpawnCommand } from '../ffmpegEngine/commandBuilder';
import { getIntroMode } from '../../../shared/domain/introTypes';

/** Encode one repeatable visual unit, then mux copies up to playlist duration. */
export function bulkFastUnitSeconds(project: ProjectData, sourceDuration: number, targetDuration: number): number | null {
  const main = project.mainMedia;
  if (!project.bulkItemId || !main || !(targetDuration > 0) || !Number.isFinite(sourceDuration)) return null;
  if (getIntroMode(project.intro) === 'media' || (getIntroMode(project.intro) === 'fade' && project.intro.fallbackFadeInSec > 0) || (project.finalFadeOutSec ?? 0) > 0) return null;
  if (main.fade.fadeInSec > 0 || main.fade.fadeOutSec > 0 || !main.autoMute) return null;
  if (project.stickerSubscribe || project.stickerSubscribes?.length || (project.textOverlaysEnabled !== false && project.textOverlays?.length) || project.mainMediaEffects?.length || (project.particleEffectsEnabled !== false && project.particleEffects?.length) || (project.visualizersEnabled !== false && project.visualizers?.length)) return null;
  if (project.overlays.some((overlay) => overlay.type !== 'image')) return null;
  const fps = project.settings.fps ?? 30;
  // Video units must contain exactly one source cycle. A varying video overlay
  // or a time-based filter cannot be repeated without changing the result.
  const unit = main.type === 'image' ? 2 : Math.round(sourceDuration * fps) / fps;
  if (!(unit > 0) || unit > 30 || targetDuration < unit * 2.5) return null;
  if (main.type === 'video' && Math.abs(unit - sourceDuration) > 0.5 / fps) return null;
  return unit;
}

export function buildBulkCopyOutputCommand(ffmpegExecutable: string, tilePath: string, audioPath: string, outputPath: string, targetDuration: number): SpawnCommand {
  if (!(targetDuration > 0)) throw new Error('Durasi Bulk Render tidak valid.');
  return { executable: ffmpegExecutable, args: ['-y', '-stream_loop', '-1', '-i', tilePath, '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-t', targetDuration.toFixed(6), '-movflags', '+faststart', outputPath] };
}
