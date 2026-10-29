import type { RenderProgress } from '../../shared/domain/renderTypes';

export type EtaSnapshot = { projectId: string; elapsed: number; remaining: number };

export function countdownEta(progress: RenderProgress | null, previous: EtaSnapshot | null): { seconds: number | null; snapshot: EtaSnapshot | null } {
  if (!progress || ['done', 'error', 'cancelled'].includes(progress.status)) return { seconds: null, snapshot: null };
  if (progress.status === 'paused') return { seconds: previous?.remaining ?? null, snapshot: previous };
  // The media clock can reach its target before the encoder flushes packets,
  // writes the MP4 index, and the job removes temporary files. That phase has
  // no trustworthy duration estimate, so never show a finished countdown.
  if (progress.status === 'compressing_video' && (progress.percent >= 95 || progress.currentTimeSec >= progress.totalDurationSec * .995)) return { seconds: null, snapshot: null };
  if (progress.status !== 'compressing_video' || progress.speedMultiplier <= 0 || progress.currentTimeSec < 2 || progress.totalDurationSec <= 0) return { seconds: null, snapshot: null };
  const raw = Math.max(0, (progress.totalDurationSec - progress.currentTimeSec) / progress.speedMultiplier);
  // Refreshes from FFmpeg can briefly report a slower speed and make a raw
  // ETA jump upward. Hold the estimate to a countdown within the same stage.
  const remaining = Math.max(1, previous?.projectId === progress.projectId
    ? Math.min(raw, previous.remaining - Math.max(0, progress.elapsedRenderSec - previous.elapsed))
    : raw);
  return { seconds: remaining, snapshot: { projectId: progress.projectId, elapsed: progress.elapsedRenderSec, remaining } };
}
