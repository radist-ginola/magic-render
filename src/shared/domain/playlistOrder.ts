import type { PlaylistTrack } from './playlistTypes';

/** Resolve a saved order without losing duplicate paths or keeping stale IDs. */
export function orderedPlaylistTracks(tracks: PlaylistTrack[], playbackOrder: string[] | undefined): PlaylistTrack[] {
  if (!playbackOrder || playbackOrder.length !== tracks.length) return tracks;
  const remaining = [...tracks];
  const ordered: PlaylistTrack[] = [];
  for (const path of playbackOrder) {
    const index = remaining.findIndex((track) => track.path === path);
    if (index < 0) return tracks;
    ordered.push(remaining.splice(index, 1)[0]!);
  }
  return ordered;
}
