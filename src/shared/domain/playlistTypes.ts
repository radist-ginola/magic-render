export type PlaylistTrack = {
  path: string;
  durationSeconds: number | null;
  order: number;
};

export type PlaylistState = {
  tracks: PlaylistTrack[];
  shuffle: boolean;
  playbackOrder: string[];
  totalDurationSeconds: number;
};

export type AudioConcatSegment = {
  path: string;
  startSeconds: number;
  durationSeconds: number;
  sourceTrackIndex: number;
};

export type AudioCompositionPlan = {
  orderedTracks: PlaylistTrack[];
  segments: AudioConcatSegment[];
  totalDurationSeconds: number;
  targetDurationSeconds: number;
  shuffle: boolean;
};
