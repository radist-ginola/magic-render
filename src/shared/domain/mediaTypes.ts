export type SupportedMainMediaType = 'image' | 'video';
export type VideoResolution = { width: number; height: number };
export type MediaMetadata = {
  type: SupportedMainMediaType;
  path: string;
  durationSeconds: number | null;
  resolution: VideoResolution | null;
  fps: number | null;
  hasAudioTrack: boolean;
  formatName: string;
  sizeBytes: number;
};
export type MainMediaControls = {
  autoMute: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  resize: VideoResolution | null;
  position: { x: number; y: number };
  rotation: number;
};
