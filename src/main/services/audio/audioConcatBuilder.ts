import type { AudioCompositionPlan } from '../../../shared/domain/playlistTypes';
import type { SpawnCommand } from '../ffmpegEngine/commandBuilder';

export function buildAudioConcatCommand(ffmpegExecutable: string, plan: AudioCompositionPlan, outputPath: string, introDurationSeconds = 0): SpawnCommand {
  if (!Number.isFinite(plan.targetDurationSeconds) || plan.targetDurationSeconds <= 0) throw new Error('Durasi playlist audio tidak valid.');
  if (!Number.isFinite(introDurationSeconds) || introDurationSeconds < 0) throw new Error('Durasi intro audio tidak valid.');
  if (Math.abs(plan.totalDurationSeconds - plan.targetDurationSeconds) > 1e-6) throw new Error('Audio composition belum mencapai durasi playlist secara presisi.');
  if (plan.segments.length === 0) throw new Error('Tidak ada segment audio untuk digabungkan.');
  const args: string[] = ['-y'];
  const inputIndexByPath = new Map<string, number>();
  for (const segment of plan.segments) {
    if (!inputIndexByPath.has(segment.path)) {
      inputIndexByPath.set(segment.path, inputIndexByPath.size);
      args.push('-i', segment.path);
    }
  }
  const filters: string[] = plan.segments.map((segment, index) => {
    const inputIndex = inputIndexByPath.get(segment.path);
    if (inputIndex === undefined) throw new Error('Audio input tidak ditemukan pada composition map.');
    return `[${inputIndex}:a]atrim=duration=${segment.durationSeconds.toFixed(6)},asetpts=N/SR/TB[a${index}]`;
  });
  const concatInputs = plan.segments.map((_segment, index) => `[a${index}]`).join('');
  filters.push(`${concatInputs}concat=n=${plan.segments.length}:v=0:a=1[playlist]`);
  const audioOutputLabel = introDurationSeconds > 0
    ? 'audio_delayed'
    : 'playlist';
  if (introDurationSeconds > 0) {
    const delayMs = Math.round(introDurationSeconds * 1000);
    filters.push(`[playlist]adelay=${delayMs}:all=1[${audioOutputLabel}]`);
  }
  const finalAudioDuration = introDurationSeconds + plan.targetDurationSeconds;
  args.push('-filter_complex', filters.join(';'), '-map', `[${audioOutputLabel}]`, '-c:a', 'aac', '-b:a', '320k', '-t', finalAudioDuration.toFixed(6), outputPath);
  return { executable: ffmpegExecutable, args };
}
