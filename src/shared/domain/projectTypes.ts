import type { MediaMetadata } from './mediaTypes';
import type { ProjectOverlay } from './overlayTypes';
import type { ProjectTextOverlay } from './textOverlayTypes';
import type { ProjectSticker } from './stickerTypes';
import type { PlaylistTrack } from './playlistTypes';
import type { ProjectIntro } from './introTypes';
import type { MainMediaEffect, ParticleEffect } from './effectTypes';
import type { VisualizerEffect } from './visualizerTypes';
export type ProjectResolution = '720p' | '1080p' | '2K' | '4K';
export type MediaType = 'image' | 'video';

export type ProjectMainMedia = {
  type: MediaType;
  metadata: MediaMetadata | null;
  path: string;
  durationSeconds: number | null;
  resize: { width: number; height: number } | null;
  position: { x: number; y: number };
  rotation: number;
  fade: { fadeInSec: number; fadeOutSec: number };
  autoMute: boolean;
};

export type ProjectOverlayReference = ProjectOverlay;

export type ProjectStickerReference = ProjectSticker;

export type ProjectSettings = {
  outputDir: string;
  resolution: ProjectResolution;
  bitrateKbps: number;
  fps?: 24 | 25 | 30 | 50 | 60;
  cpuLoadPercent: number;
  renderPreset?: 'fast' | 'standard' | 'slow';
  gpuEncoder?: 'h264_nvenc' | 'h264_amf' | 'h264_qsv';
  bitrateMode?: 'cbr' | 'vbr';
};

export type ProjectData = {
  projectId: string;
  schemaVersion: 1;
  name: string;
  exportFileName?: string;
  /** Output sidecars in Bulk Render are named after the corresponding MP4. */
  bulkItemId?: string;
  /** Fade applied to the complete visual composition, including sticker layers. */
  finalFadeOutSec?: number;
  projectDir: string;
  createdAt: string;
  updatedAt: string;
  mainMedia: ProjectMainMedia | null;
  mainMediaEffects?: MainMediaEffect[];
  particleEffects?: ParticleEffect[];
  /** Optional feature switches; legacy projects default to enabled when omitted. */
  particleEffectsEnabled?: boolean;
  visualizers?: VisualizerEffect[];
  visualizersEnabled?: boolean;
  overlays: ProjectOverlayReference[];
  textOverlays?: ProjectTextOverlay[];
  textOverlaysEnabled?: boolean;
  stickerSubscribe: ProjectStickerReference | null;
  /** New multi-sticker representation; legacy stickerSubscribe remains for backward compatibility. */
  stickerSubscribes?: ProjectStickerReference[];
  playlist: { files: string[]; shuffle: boolean; playbackOrder: string[] };
  playlistTracks?: PlaylistTrack[];
  intro: ProjectIntro;
  settings: ProjectSettings;
  youtubeSEO: {
    enabled: boolean;
    mainKeyword: string;
    analysisSource?: 'main' | 'manual';
    analysisMediaPath?: string | null;
    /** Optional user prompt for SEO production; core validation/schema constraints always remain in force. */
    customPromptEnabled?: boolean;
    customPrompt?: string;
    provider: import('./aiTypes').AiProvider;
    model: string;
    context?: import('./aiTypes').SeoContext;
    /** timestamp writes timestamp.txt, timestamp-seo writes youtubeseo.txt, none writes no metadata sidecar. */
    mode?: 'timestamp' | 'timestamp-seo' | 'none';
  };
};

export type RecentProject = {
  projectId: string;
  name: string;
  projectFilePath: string;
  lastOpenedAt: string;
  mainMediaPath?: string;
};
