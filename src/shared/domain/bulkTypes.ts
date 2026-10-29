import type { ProjectData, MediaType } from './projectTypes';
import type { StickerSchedule } from './stickerTypes';

export type TracklistFolder = { id: string; name: string; path: string; sourcePath?: string; mp3Paths: string[] };
export type BulkMediaItem = { id: string; path: string; type: MediaType };
export type BulkRenderOptions = { metadataMode?: 'timestamp' | 'timestamp-seo' | 'none'; overlay: boolean; intro: boolean; fadeIn: boolean; fadeInSec: number; fadeInStyle?: 'dark' | 'blur'; fadeInBlur?: number; fadeInBrightness?: number; fadeOut: boolean; fadeOutSec: number; sticker: boolean; stickerSchedule?: StickerSchedule; /** null = length of selected video/GIF, 3s for image */ stickerDurationSec?: number | null };
export type BulkRenderRequest = { media: BulkMediaItem[]; tracklistId: string; mp3Count: number; options: BulkRenderOptions; seoTemplate?: ProjectData['youtubeSEO'] };
export type BulkPreparedItem = { media: BulkMediaItem; tracks: string[]; project: ProjectData };
export type BulkItemResult = { id: string; name: string; status: 'queued' | 'rendering' | 'done' | 'error' | 'cancelled'; percent: number; currentTimeSec?: number; totalDurationSec?: number; speedMultiplier?: number; outputPath?: string; timestampPath?: string; metadataPath?: string; error?: string };
