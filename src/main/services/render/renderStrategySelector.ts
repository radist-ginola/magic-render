import type { ProjectData } from '../../../shared/domain/projectTypes';
import { activeIntroMediaPath } from '../../../shared/domain/introTypes';

export type RenderStrategy = 'single-pass' | 'multi-stage';

export function selectRenderStrategy(project: ProjectData, options: { requireCheckpointPause?: boolean } = {}): RenderStrategy {
  const needsVisualComposition = project.overlays.length > 0 || (project.textOverlaysEnabled !== false && (project.textOverlays?.length ?? 0) > 0) || Boolean(project.stickerSubscribe || project.stickerSubscribes?.length) || (project.mainMediaEffects?.length ?? 0) > 0 || (project.particleEffectsEnabled !== false && (project.particleEffects?.length ?? 0) > 0);
  const needsContentFlow = Boolean(activeIntroMediaPath(project));
  const needsAudio = (project.playlistTracks?.length ?? project.playlist.files.length) > 0;
  if (!needsVisualComposition && !needsContentFlow && !needsAudio && project.mainMedia?.type === 'video' && !options.requireCheckpointPause) return 'single-pass';
  return 'multi-stage';
}
