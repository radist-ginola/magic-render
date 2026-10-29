export const IPC_CHANNELS = Object.freeze({
  APP_GET_RUNTIME_INFO: 'app:get-runtime-info',
  APP_CHECK_FOR_UPDATES: 'app:check-for-updates',
  APP_OPEN_UPDATE_URL: 'app:open-update-url',
  APP_PING: 'app:ping',
  APP_PREPARE_CLOSE: 'app:prepare-close',
  APP_CLOSE_READY: 'app:close-ready',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  HELP_OPEN: 'help:open',
  APP_LOG: 'app:log',
  APP_GET_RECENT_LOGS: 'app:get-recent-logs',
  PROJECT_CREATE: 'project:create',
  PROJECT_LOAD: 'project:load',
  PROJECT_SAVE: 'project:save',
  PROJECT_GET_RECENT: 'project:get-recent',
  PROJECT_REMOVE_RECENT: 'project:remove-recent',
  PROJECT_OPEN_FOLDER: 'project:open-folder',
  PROJECT_IMPORT_MAIN_MEDIA: 'project:import-main-media',
  MEDIA_PROBE: 'media:probe',
  MEDIA_CONVERT_IMAGE: 'media:convert-image',
  MEDIA_UPDATE_CONTROLS: 'media:update-controls',
  OVERLAY_ADD: 'overlay:add',
  OVERLAY_UPDATE: 'overlay:update',
  OVERLAY_REMOVE: 'overlay:remove',
  OVERLAY_VALIDATE: 'overlay:validate',
  OVERLAY_BUILD_FILTER_GRAPH: 'overlay:build-filter-graph',
  VISUALIZER_CHOOSE_MEDIA: 'visualizer:choose-media',
  TEXT_ADD: 'text:add',
  TEXT_UPDATE: 'text:update',
  TEXT_REMOVE: 'text:remove',
  TEXT_VALIDATE: 'text:validate',
  TEXT_BUILD_FILTER_GRAPH: 'text:build-filter-graph',
  TEXT_LIST_FONTS: 'text:list-fonts',
  STICKER_ADD: 'sticker:add',
  STICKER_UPDATE: 'sticker:update',
  STICKER_REMOVE: 'sticker:remove',
  STICKER_VALIDATE: 'sticker:validate',
  STICKER_BUILD_FILTER_GRAPH: 'sticker:build-filter-graph',
  LOCKED_ASSETS_LIST: 'locked-assets:list',
  LOCKED_ASSETS_LOCK: 'locked-assets:lock',
  LOCKED_ASSETS_UNLOCK: 'locked-assets:unlock',
  LOCKED_ASSETS_UPDATE: 'locked-assets:update',
  LOCKED_ASSETS_APPLY_EDIT: 'locked-assets:apply-edit',
  LOCKED_ASSETS_SMOOTH_LOOP: 'locked-assets:smooth-loop',
  LOCKED_ASSETS_REMOVE_MISSING: 'locked-assets:remove-missing',
  LOCKED_ASSETS_VALIDATE: 'locked-assets:validate',
  TRACKLIST_LIST: 'tracklist:list',
  TRACKLIST_ADD: 'tracklist:add',
  TRACKLIST_REMOVE: 'tracklist:remove',
  BULK_CHOOSE_MEDIA: 'bulk:choose-media',
  BULK_PREPARE: 'bulk:prepare',
  PLAYLIST_IMPORT: 'playlist:import',
  PLAYLIST_RESET_METADATA: 'playlist:reset-metadata',
  PLAYLIST_SET_TRACKS: 'playlist:set-tracks',
  PLAYLIST_REORDER: 'playlist:reorder',
  PLAYLIST_REMOVE: 'playlist:remove',
  PLAYLIST_SHUFFLE: 'playlist:shuffle',
  PLAYLIST_SUMMARY: 'playlist:summary',
  PLAYLIST_BUILD_AUDIO: 'playlist:build-audio',
  INTRO_LIBRARY: 'intro:library',
  INTRO_IMPORT: 'intro:import',
  INTRO_SET: 'intro:set',
  INTRO_SELECT: 'intro:select',
  INTRO_BUILD_PLAN: 'intro:build-plan',
  PREVIEW_EXTRACT_FRAME: 'preview:extract-frame',
  RENDER_START: 'render:start',
  RENDER_CONTROL: 'render:control',
  RENDER_PROGRESS: 'render:progress',
  RENDER_GET_PROGRESS: 'render:get-progress',
  EFFECT_ANALYZE_BEAT: 'effect:analyze-beat',
  CPU_GET_ALLOCATION: 'cpu:get-allocation',
  CPU_CALCULATE: 'cpu:calculate',
  SEO_CONFIGURE: 'seo:configure',
  SEO_CLEAR_CREDENTIAL: 'seo:clear-credential',
  SEO_STATUS: 'seo:status',
  SEO_GENERATE: 'seo:generate',
  SEO_CHOOSE_VIDEO: 'seo:choose-video',
  SEO_CHOOSE_MEDIA: 'seo:choose-media',
  SEO_RESULT: 'seo:result',
  OUTPUT_CHOOSE_DIRECTORY: 'output:choose-directory',
  OUTPUT_VALIDATE: 'output:validate',
  OUTPUT_UPDATE_SETTINGS: 'output:update-settings',
  OUTPUT_OPEN_VIDEO: 'output:open-video',
  SETTINGS_GET: 'settings:get',
  SETTINGS_DETECT_GPU: 'settings:detect-gpu',
  SETTINGS_CLEAR_CACHE: 'settings:clear-cache',
  SETTINGS_TEST_ENGINE: 'settings:test-engine',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_CHOOSE_UPLOAD_DIRECTORY: 'settings:choose-upload-directory',
  SETTINGS_CHOOSE_ASSET_DIRECTORY: 'settings:choose-asset-directory',
  SETTINGS_CHOOSE_OUTPUT_DIRECTORY: 'settings:choose-output-directory',
  SETTINGS_CONFIGURE_AI: 'settings:configure-ai',
  SETTINGS_CLEAR_AI: 'settings:clear-ai',
  SETTINGS_AI_STATUS: 'settings:ai-status',
  SETTINGS_AI_MODELS: 'settings:ai-models',
  SETTINGS_CHOOSE_FFMPEG: 'settings:choose-ffmpeg',
  SETTINGS_CHOOSE_FFPROBE: 'settings:choose-ffprobe',
} as const);

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

import type { ProjectData, RecentProject } from './domain/projectTypes';
import type { LockedAsset, LockedAssetMenu, LockedAssetValidation } from './domain/lockedAssetTypes';
import type { MediaMetadata } from './domain/mediaTypes';
import type { ProjectOverlay, OverlayMediaType, OverlayConfig } from './domain/overlayTypes';
import type { ProjectTextOverlay, TextOverlayConfig } from './domain/textOverlayTypes';
import type { ProjectSticker, StickerMediaType } from './domain/stickerTypes';
import type { PlaylistTrack, AudioCompositionPlan } from './domain/playlistTypes';
import type { IntroLibraryItem, IntroPipelinePlan } from './domain/introTypes';
import type { RenderControlRequest, RenderProgress, RenderRequest, RenderStartResult } from './domain/renderTypes';
import type { AiCredentialsStatus, AiProvider, YoutubeSeoResult } from './domain/aiTypes';
import type { GlobalSettings, GlobalSettingsUpdate } from './domain/settingsTypes';
import type { GpuInfo } from './domain/settingsTypes';
import type { BeatSync } from './domain/effectTypes';
import type { BulkMediaItem, BulkPreparedItem, BulkRenderRequest, TracklistFolder } from './domain/bulkTypes';


export type ApplicationLogEntry = {
  createdAt: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  detail?: string | null;
};

export type UpdateCheckResult = {
  status: 'not-configured' | 'up-to-date' | 'update-available' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  installerUrl: string | null;
  message: string;
};

export type RuntimeInfo = {
  appName: string;
  appVersion: string;
  environment: 'development' | 'production';
  platform: string;
  electronVersion: string;
  nodeVersion: string;
  contextIsolation: true;
  nodeIntegration: false;
};

export type ProjectResult = {
  project: ProjectData;
  projectFilePath: string;
  recentProjects: RecentProject[];
};

export type MagicRenderApi = {
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  openUpdateUrl: (url: string) => Promise<void>;
  ping: () => Promise<'pong'>;
  createProject: (name: string, projectDir?: string) => Promise<ProjectResult | null>;
  loadProject: (projectFilePath?: string) => Promise<ProjectResult | null>;
  saveProject: (project: ProjectData) => Promise<ProjectResult>;
  getRecentProjects: () => Promise<RecentProject[]>;
  removeRecentProject: (projectId: string) => Promise<RecentProject[]>;
  openProjectFolder: (projectDir: string) => Promise<void>;
  importMainMedia: (project: ProjectData) => Promise<ProjectResult | null>;
  probeMainMedia: (filePath?: string) => Promise<MediaMetadata | null>;
  convertImageToVideo: (inputPath: string, durationSeconds: number, resolution: ProjectData['settings']['resolution'], outputPath?: string) => Promise<MediaMetadata>;
  updateMainMediaControls: (project: ProjectData, controls: { autoMute: boolean; fadeInSec: number; fadeOutSec: number; resize: { width: number; height: number } | null; position: { x: number; y: number }; rotation: number }) => Promise<ProjectResult>;
  addOverlay: (project: ProjectData, type: OverlayMediaType, filePath?: string) => Promise<{ project: ProjectData } | null>;
  chooseVisualizerMedia: () => Promise<string | null>;
  updateOverlay: (project: ProjectData, overlay: ProjectOverlay) => Promise<{ project: ProjectData }>;
  removeOverlay: (project: ProjectData, overlayId: string) => Promise<{ project: ProjectData }>;
  validateOverlay: (overlay: ProjectOverlay) => Promise<{ valid: boolean }>;
  buildOverlayFilterGraph: (project: ProjectData) => Promise<{ filterGraph: string; finalLabel: string }>;
  addTextOverlay: (project: ProjectData, config: TextOverlayConfig) => Promise<{ project: ProjectData }>;
  updateTextOverlay: (project: ProjectData, overlay: ProjectTextOverlay) => Promise<{ project: ProjectData }>;
  removeTextOverlay: (project: ProjectData, overlayId: string) => Promise<{ project: ProjectData }>;
  validateTextOverlay: (config: TextOverlayConfig) => Promise<{ valid: boolean; error?: string }>;
  buildTextFilterGraph: (project: ProjectData) => Promise<{ filterGraph: string; finalLabel: string }>;
  listDeviceFonts: () => Promise<string[]>;
  addSticker: (project: ProjectData, type: StickerMediaType, filePath?: string) => Promise<{ project: ProjectData } | null>;
  updateSticker: (project: ProjectData, sticker: ProjectSticker) => Promise<{ project: ProjectData }>;
  removeSticker: (project: ProjectData, stickerId?: string) => Promise<{ project: ProjectData }>;
  validateSticker: (sticker: ProjectSticker) => Promise<{ valid: boolean; error?: string }>;
  buildStickerFilterGraph: (project: ProjectData, totalDurationSec: number) => Promise<{ filterGraph: string; finalLabel: string }>;
  listLockedAssets: () => Promise<LockedAsset[]>;
  lockAsset: (menu: LockedAssetMenu, filePath?: string, config?: Record<string, unknown>) => Promise<LockedAsset | null>;
  updateLockedAsset: (assetId: string, patch: { pinned?: boolean; config?: Record<string, unknown> }) => Promise<LockedAsset>;
  applyEditedOverlayAsset: (assetId: string, config: OverlayConfig) => Promise<LockedAsset>;
  createSmoothLoopAsset: (assetId: string, config: OverlayConfig) => Promise<{ asset: LockedAsset; durationSec: number }>;
  unlockAsset: (assetId: string) => Promise<void>;
  removeMissingLockedAssets: () => Promise<LockedAsset[]>;
  validateLockedAsset: (assetId: string) => Promise<LockedAssetValidation>;
  listTracklists: () => Promise<TracklistFolder[]>;
  addTracklist: () => Promise<TracklistFolder | null>;
  removeTracklist: (id: string) => Promise<void>;
  chooseBulkMedia: (type: 'image' | 'video') => Promise<BulkMediaItem[]>;
  prepareBulkRender: (request: BulkRenderRequest) => Promise<BulkPreparedItem[]>;
  importPlaylist: (project: ProjectData) => Promise<ProjectData | null>;
  resetPlaylistMetadata: (project: ProjectData) => Promise<ProjectData>;
  setPlaylistTracks: (project: ProjectData, tracks: PlaylistTrack[]) => Promise<ProjectData>;
  reorderPlaylist: (project: ProjectData, fromIndex: number, toIndex: number) => Promise<ProjectData>;
  removePlaylistTrack: (project: ProjectData, index: number) => Promise<ProjectData>;
  setPlaylistShuffle: (project: ProjectData, shuffle: boolean) => Promise<ProjectData>;
  getPlaylistSummary: (project: ProjectData) => Promise<{ tracks: PlaylistTrack[]; totalDurationSeconds: number; shuffle: boolean }>;
  buildPlaylistAudio: (project: ProjectData, outputPath: string) => Promise<{ command: { executable: string; args: string[] }; plan: AudioCompositionPlan }>;
  getIntroLibrary: () => Promise<IntroLibraryItem[]>;
  importIntro: (project: ProjectData) => Promise<ProjectResult | null>;
  setIntro: (project: ProjectData, enabled: boolean, path: string | null, fallbackFadeInSec: number) => Promise<ProjectResult>;
  selectIntro: (project: ProjectData, assetId: string) => Promise<ProjectResult>;
  buildIntroPlan: (project: ProjectData) => Promise<IntroPipelinePlan>;
  extractPreviewFrame: (request: { projectId: string; mediaPath: string; timestampSec: number }) => Promise<{ projectId: string; timestampSec: number; mimeType: 'image/png'; base64: string }>;
  startRender: (project: RenderRequest) => Promise<RenderStartResult>;
  analyzeProjectBeat: (project: ProjectData) => Promise<BeatSync>;
  controlRender: (request: RenderControlRequest) => Promise<{ accepted: boolean; status: RenderProgress['status'] }>;
  onRenderProgress: (listener: (progress: RenderProgress) => void) => () => void;
  getRenderProgress: (projectId: string) => Promise<RenderProgress | null>;
  getCpuAllocation: () => Promise<{ cpuLoadPercent: number; logicalCoreCount: number; ffmpegThreads: number }>;
  configureAi: (provider: AiProvider, model: string, apiKey: string) => Promise<{ saved: boolean }>;
  clearAiCredential: (provider: AiProvider) => Promise<{ cleared: boolean }>;
  getAiStatus: (provider: AiProvider, model: string) => Promise<AiCredentialsStatus>;
  generateYoutubeSeo: (project: ProjectData, outputPath?: string) => Promise<YoutubeSeoResult>;
  chooseSeoMedia: () => Promise<string | null>;
  chooseSeoVideo: () => Promise<string | null>;
  onSeoResult: (listener: (result: YoutubeSeoResult & { projectId: string }) => void) => () => void;
  chooseOutputDirectory: () => Promise<string | null>;
  validateOutput: (project: ProjectData) => Promise<{ valid: boolean; directory: string; extension: string; writable: boolean; availableBytes: number | null; sufficientStorage: boolean | null; exists: boolean; errors: string[]; warnings: string[] }>;
  updateOutputSettings: (project: ProjectData, outputDir: string, resolution: ProjectData['settings']['resolution'], bitrateKbps: number) => Promise<{ project: ProjectData; validation: { valid: boolean; errors: string[]; warnings: string[] } }>;
  openOutputVideo: (videoPath: string) => Promise<void>;
  calculateCpuAllocation: (cpuLoadPercent: number) => Promise<{ cpuLoadPercent: number; logicalCoreCount: number; ffmpegThreads: number }>;
  getSettings: () => Promise<GlobalSettings>;
  detectGpu: (ffmpegPath?: string) => Promise<GpuInfo>;
  clearApplicationCache: () => Promise<{ jobsRemoved: number; filesRemoved: number; failures: string[] }>;
  testRenderEngine: (ffmpegPath: string, ffprobePath: string) => Promise<{ ffmpegReady: boolean; ffprobeReady: boolean; progressReady: boolean; ffmpegVersion: string | null; progressSamples: number; message: string }>;
  updateSettings: (patch: GlobalSettingsUpdate) => Promise<GlobalSettings>;
  chooseSettingsUploadDirectory: () => Promise<string | null>;
  chooseSettingsAssetDirectory: () => Promise<string | null>;
  chooseSettingsOutputDirectory: () => Promise<string | null>;
  configureSettingsAi: (provider: AiProvider, model: string, apiKey: string, validateKey?: boolean) => Promise<{ saved: boolean; settings: GlobalSettings; validationError?: string; modelChangeNote?: string }>;
  clearSettingsAi: (provider: AiProvider) => Promise<{ cleared: boolean }>;
  getSettingsAiStatus: (provider: AiProvider, model: string, candidateKey?: string, authenticateOnly?: boolean) => Promise<AiCredentialsStatus>;
  listSettingsAiModels: (provider: AiProvider, candidateKey?: string, freeOnly?: boolean) => Promise<string[]>;
  chooseSettingsFfmpeg: () => Promise<string | null>;
  chooseSettingsFfprobe: () => Promise<string | null>;
  onApplicationLog: (listener: (entry: ApplicationLogEntry) => void) => () => void;
  getRecentApplicationLogs: () => Promise<ApplicationLogEntry[]>;
  logActivity: (level: ApplicationLogEntry['level'], message: string, detail?: string) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  onPrepareToClose: (listener: () => void) => () => void;
  notifyCloseReady: (saved: boolean, errorMessage?: string) => void;
  isWindowMaximized: () => Promise<boolean>;
  openHelp: (topic: 'guide' | 'shortcuts' | 'troubleshooting' | 'system' | 'about') => Promise<void>;
};
