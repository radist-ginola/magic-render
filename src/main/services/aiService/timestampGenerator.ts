import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { AudioCompositionPlan } from '../../../shared/domain/playlistTypes';

export type TimestampInput = {
  project: ProjectData;
  finalDurationSeconds: number;
  outputVideoPath: string;
  introDurationSeconds: number;
  audioPlan: AudioCompositionPlan | null;
};

export function cleanTrackTitle(value: string): string {
  const separated = value.replace(/_/g, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/^[\s.#–—-]+/, '').replace(/\s+/g, ' ').trim();
  const title = separated || 'Untitled Track';
  return title.toLocaleLowerCase('en-US').replace(/(^|[\s/()[\]{}:–—-])(\p{L})/gu, (_all, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase('en-US')}`);
}

export function buildYoutubeTimestampText(input: TimestampInput): string {
  const lines: string[] = [];
  const introOffset = Math.max(0, input.introDurationSeconds);
  if (introOffset > 0.001) lines.push(`00:00 Intro`);

  const plan = input.audioPlan;
  if (plan && plan.segments.length > 0) {
    const uniqueStarts = new Map<number, string>();
    for (const segment of plan.segments) {
      const start = segment.startSeconds + introOffset;
      if (start >= input.finalDurationSeconds) continue;
      const track = plan.orderedTracks.find((candidate) => candidate.order === segment.sourceTrackIndex);
      const label = track?.path ? cleanTrackTitle(path.basename(track.path, path.extname(track.path))) : `Track ${segment.sourceTrackIndex + 1}`;
      if (!uniqueStarts.has(start)) uniqueStarts.set(start, label);
    }
    for (const [start, label] of uniqueStarts) lines.push(`${formatTimestamp(start)} ${label}`);
  } else if (input.finalDurationSeconds > 0) {
    lines.push(`00:00 ${cleanTrackTitle(input.project.name)}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function writeYoutubeTimestampText(input: TimestampInput): Promise<string> {
  const target = youtubeTimestampPath(input.project, input.outputVideoPath);
  await fs.writeFile(target, buildYoutubeTimestampText(input), 'utf8');
  return target;
}

export function youtubeTimestampPath(project: ProjectData, outputVideoPath: string): string {
  const folder = path.dirname(outputVideoPath);
  return project.bulkItemId
    ? path.join(folder, `${path.basename(outputVideoPath, path.extname(outputVideoPath))}-timestamp.txt`)
    : path.join(folder, 'timestamp.txt');
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
