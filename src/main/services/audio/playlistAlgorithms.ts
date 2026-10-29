import type { AudioCompositionPlan, PlaylistTrack } from '../../../shared/domain/playlistTypes';

export function calculateTotalDuration(tracks: PlaylistTrack[]): number {
  return tracks.reduce((sum, track) => sum + Math.max(0, track.durationSeconds ?? 0), 0);
}

export function normalizeTracks(paths: string[], durations: Array<number | null>): PlaylistTrack[] {
  if (paths.length !== durations.length) throw new Error('Jumlah path playlist dan durasi harus sama.');
  return paths.map((filePath, index) => ({ path: filePath, durationSeconds: durations[index] ?? null, order: index }));
}

export function reorderTracks(tracks: PlaylistTrack[], fromIndex: number, toIndex: number): PlaylistTrack[] {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) throw new Error('Index reorder playlist tidak valid.');
  const result = [...tracks];
  const moved = result[fromIndex];
  if (!moved) throw new Error('Track playlist tidak ditemukan untuk reorder.');
  result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result.map((track, index) => ({ ...track, order: index }));
}

export function removeTrack(tracks: PlaylistTrack[], index: number): PlaylistTrack[] {
  if (!Number.isInteger(index) || index < 0 || index >= tracks.length) throw new Error('Index remove playlist tidak valid.');
  return tracks.filter((_, currentIndex) => currentIndex !== index).map((track, order) => ({ ...track, order }));
}

export function shuffleTracks<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const left = result[i];
    const right = result[j];
    if (left === undefined || right === undefined) throw new Error('Shuffle index tidak valid.');
    result[i] = right;
    result[j] = left;
  }
  return result;
}

export function buildPlaybackOrder(tracks: PlaylistTrack[], shuffle: boolean, random: () => number = Math.random): PlaylistTrack[] {
  const normalized = tracks.map((track, index) => ({ ...track, order: index }));
  return shuffle ? shuffleTracks(normalized, random) : normalized;
}

export function buildExactDurationComposition(tracks: PlaylistTrack[], targetDurationSeconds: number, shuffle: boolean, random: () => number = Math.random): AudioCompositionPlan {
  if (!(Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0)) throw new Error('Target duration harus lebih besar dari 0.');
  const orderedTracks = buildPlaybackOrder(tracks.filter((track) => (track.durationSeconds ?? 0) > 0), shuffle, random);
  if (orderedTracks.length === 0) throw new Error('Playlist kosong atau semua track tidak memiliki durasi valid.');
  const segments: AudioCompositionPlan['segments'] = [];
  let elapsed = 0;
  let cursor = 0;
  while (elapsed + 1e-9 < targetDurationSeconds) {
    const track = orderedTracks[cursor % orderedTracks.length];
    if (!track) throw new Error('Playlist track tidak ditemukan.');
    const remaining = targetDurationSeconds - elapsed;
    const duration = Math.min(track.durationSeconds as number, remaining);
    segments.push({ path: track.path, startSeconds: elapsed, durationSeconds: duration, sourceTrackIndex: track.order });
    elapsed += duration;
    cursor += 1;
    if (cursor > 100000) throw new Error('Playlist duration expansion exceeded safe iteration limit.');
  }
  if (Math.abs(elapsed - targetDurationSeconds) > 1e-6) throw new Error('Audio composition tidak mencapai durasi target secara presisi.');
  return { orderedTracks, segments, totalDurationSeconds: elapsed, targetDurationSeconds, shuffle };
}
