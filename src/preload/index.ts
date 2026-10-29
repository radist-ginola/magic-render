import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type MagicRenderApi } from '../shared/ipc';
import type { ProjectData } from '../shared/domain/projectTypes';
import type { LockedAssetMenu } from '../shared/domain/lockedAssetTypes';
import type { ProjectSticker, StickerMediaType } from '../shared/domain/stickerTypes';
import type { PlaylistTrack } from '../shared/domain/playlistTypes';

const api: MagicRenderApi = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_RUNTIME_INFO),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.APP_CHECK_FOR_UPDATES),
  openUpdateUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_UPDATE_URL, url),
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.APP_PING),
  createProject: (name: string, projectDir?: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, name, projectDir),
  loadProject: (projectFilePath?: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LOAD, projectFilePath),
  saveProject: (project: ProjectData) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SAVE, project),
  getRecentProjects: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET_RECENT),
  removeRecentProject: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REMOVE_RECENT, projectId),
  openProjectFolder: (projectDir: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_FOLDER, projectDir),
  importMainMedia: (project: ProjectData) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_IMPORT_MAIN_MEDIA, project),
  probeMainMedia: (filePath?: string) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PROBE, filePath),
  convertImageToVideo: (inputPath, durationSeconds, resolution, outputPath) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_CONVERT_IMAGE, inputPath, durationSeconds, resolution, outputPath),
  updateMainMediaControls: (project, controls) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_UPDATE_CONTROLS, project, controls),
  addOverlay: (project, type, filePath) => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_ADD, project, type, filePath),
  chooseVisualizerMedia: () => ipcRenderer.invoke(IPC_CHANNELS.VISUALIZER_CHOOSE_MEDIA),
  updateOverlay: (project, overlay) => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_UPDATE, project, overlay),
  removeOverlay: (project, overlayId) => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_REMOVE, project, overlayId),
  validateOverlay: (overlay) => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_VALIDATE, overlay),
  buildOverlayFilterGraph: (project) => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_BUILD_FILTER_GRAPH, project),
  addTextOverlay: (project, config) => ipcRenderer.invoke(IPC_CHANNELS.TEXT_ADD, project, config),
  updateTextOverlay: (project, overlay) => ipcRenderer.invoke(IPC_CHANNELS.TEXT_UPDATE, project, overlay),
  removeTextOverlay: (project, overlayId) => ipcRenderer.invoke(IPC_CHANNELS.TEXT_REMOVE, project, overlayId),
  validateTextOverlay: (config) => ipcRenderer.invoke(IPC_CHANNELS.TEXT_VALIDATE, config),
  buildTextFilterGraph: (project) => ipcRenderer.invoke(IPC_CHANNELS.TEXT_BUILD_FILTER_GRAPH, project),
  listDeviceFonts: () => ipcRenderer.invoke(IPC_CHANNELS.TEXT_LIST_FONTS),
  addSticker: (project: ProjectData, type: StickerMediaType, filePath?: string) => ipcRenderer.invoke(IPC_CHANNELS.STICKER_ADD, project, type, filePath),
  updateSticker: (project: ProjectData, sticker: ProjectSticker) => ipcRenderer.invoke(IPC_CHANNELS.STICKER_UPDATE, project, sticker),
  removeSticker: (project: ProjectData, stickerId?: string) => ipcRenderer.invoke(IPC_CHANNELS.STICKER_REMOVE, project, stickerId),
  validateSticker: (sticker: ProjectSticker) => ipcRenderer.invoke(IPC_CHANNELS.STICKER_VALIDATE, sticker),
  buildStickerFilterGraph: (project: ProjectData, totalDurationSec: number) => ipcRenderer.invoke(IPC_CHANNELS.STICKER_BUILD_FILTER_GRAPH, project, totalDurationSec),
  listLockedAssets: () => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_LIST),
  lockAsset: (menu: LockedAssetMenu, filePath?: string, config?: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_LOCK, menu, filePath, config),
  updateLockedAsset: (assetId, patch) => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_UPDATE, assetId, patch),
  applyEditedOverlayAsset: (assetId, config) => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_APPLY_EDIT, assetId, config),
  createSmoothLoopAsset: (assetId, config) => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_SMOOTH_LOOP, assetId, config),
  unlockAsset: (assetId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_UNLOCK, assetId),
  removeMissingLockedAssets: () => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_REMOVE_MISSING),
  validateLockedAsset: (assetId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOCKED_ASSETS_VALIDATE, assetId),
  listTracklists: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKLIST_LIST),
  addTracklist: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKLIST_ADD),
  removeTracklist: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TRACKLIST_REMOVE,id),
  chooseBulkMedia: (type: 'image' | 'video') => ipcRenderer.invoke(IPC_CHANNELS.BULK_CHOOSE_MEDIA,type),
  prepareBulkRender: (request) => ipcRenderer.invoke(IPC_CHANNELS.BULK_PREPARE,request),
  importPlaylist: (project) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_IMPORT, project),
  resetPlaylistMetadata: (project) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_RESET_METADATA, project),
  setPlaylistTracks: (project, tracks: PlaylistTrack[]) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_SET_TRACKS, project, tracks),
  reorderPlaylist: (project, fromIndex, toIndex) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_REORDER, project, fromIndex, toIndex),
  removePlaylistTrack: (project, index) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_REMOVE, project, index),
  setPlaylistShuffle: (project, shuffle) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_SHUFFLE, project, shuffle),
  getPlaylistSummary: (project) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_SUMMARY, project),
  buildPlaylistAudio: (project, outputPath) => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_BUILD_AUDIO, project, outputPath),
  getIntroLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.INTRO_LIBRARY),
  importIntro: (project: ProjectData) => ipcRenderer.invoke(IPC_CHANNELS.INTRO_IMPORT, project),
  setIntro: (project, enabled, introPath, fallbackFadeInSec) => ipcRenderer.invoke(IPC_CHANNELS.INTRO_SET, project, enabled, introPath, fallbackFadeInSec),
  selectIntro: (project, assetId) => ipcRenderer.invoke(IPC_CHANNELS.INTRO_SELECT, project, assetId),
  buildIntroPlan: (project) => ipcRenderer.invoke(IPC_CHANNELS.INTRO_BUILD_PLAN, project),
  extractPreviewFrame: (request) => ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_EXTRACT_FRAME, request),
  startRender: (project) => ipcRenderer.invoke(IPC_CHANNELS.RENDER_START, project),
  analyzeProjectBeat: (project) => ipcRenderer.invoke(IPC_CHANNELS.EFFECT_ANALYZE_BEAT, project),
  controlRender: (request) => ipcRenderer.invoke(IPC_CHANNELS.RENDER_CONTROL, request),
  getCpuAllocation: () => ipcRenderer.invoke(IPC_CHANNELS.CPU_GET_ALLOCATION),
  calculateCpuAllocation: (cpuLoadPercent) => ipcRenderer.invoke(IPC_CHANNELS.CPU_CALCULATE, cpuLoadPercent),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  detectGpu: (ffmpegPath?: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_DETECT_GPU, ffmpegPath),
  clearApplicationCache: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_CACHE),
  testRenderEngine: (ffmpegPath, ffprobePath) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_ENGINE, ffmpegPath, ffprobePath),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
  chooseSettingsUploadDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHOOSE_UPLOAD_DIRECTORY),
  chooseSettingsAssetDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHOOSE_ASSET_DIRECTORY),
  chooseSettingsOutputDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHOOSE_OUTPUT_DIRECTORY),
  configureSettingsAi: (provider, model, apiKey, validateKey) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CONFIGURE_AI, provider, model, apiKey, validateKey),
  clearSettingsAi: (provider) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_AI, provider),
  getSettingsAiStatus: (provider, model, candidateKey, authenticateOnly) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_AI_STATUS, provider, model, candidateKey, authenticateOnly),
  listSettingsAiModels: (provider, candidateKey, freeOnly) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_AI_MODELS, provider, candidateKey, freeOnly),
  chooseSettingsFfmpeg: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHOOSE_FFMPEG),
  chooseSettingsFfprobe: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHOOSE_FFPROBE),
  logActivity: (level, message, detail) => ipcRenderer.invoke(IPC_CHANNELS.APP_LOG, level, message, detail),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  onPrepareToClose: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on(IPC_CHANNELS.APP_PREPARE_CLOSE, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_PREPARE_CLOSE, wrapped);
  },
  notifyCloseReady: (saved, errorMessage) => ipcRenderer.send(IPC_CHANNELS.APP_CLOSE_READY, { saved, errorMessage }),
  isWindowMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  openHelp: (topic) => ipcRenderer.invoke(IPC_CHANNELS.HELP_OPEN, topic),
  onApplicationLog: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, entry: Parameters<typeof listener>[0]) => listener(entry);
    ipcRenderer.on(IPC_CHANNELS.APP_LOG, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_LOG, wrapped);
  },
  getRecentApplicationLogs: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_RECENT_LOGS),
  configureAi: (provider, model, apiKey) => ipcRenderer.invoke(IPC_CHANNELS.SEO_CONFIGURE, provider, model, apiKey),
  clearAiCredential: (provider) => ipcRenderer.invoke(IPC_CHANNELS.SEO_CLEAR_CREDENTIAL, provider),
  getAiStatus: (provider, model) => ipcRenderer.invoke(IPC_CHANNELS.SEO_STATUS, provider, model),
  generateYoutubeSeo: (project, outputPath) => ipcRenderer.invoke(IPC_CHANNELS.SEO_GENERATE, project, outputPath),
  chooseSeoMedia: () => ipcRenderer.invoke(IPC_CHANNELS.SEO_CHOOSE_MEDIA),
  chooseSeoVideo: () => ipcRenderer.invoke(IPC_CHANNELS.SEO_CHOOSE_VIDEO),
  onSeoResult: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, result: Parameters<typeof listener>[0]) => listener(result);
    ipcRenderer.on(IPC_CHANNELS.SEO_RESULT, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SEO_RESULT, wrapped);
  },
  chooseOutputDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_CHOOSE_DIRECTORY),
  validateOutput: (project) => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_VALIDATE, project),
  updateOutputSettings: (project, outputDir, resolution, bitrateKbps) => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_UPDATE_SETTINGS, project, outputDir, resolution, bitrateKbps),
  openOutputVideo: (videoPath) => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_OPEN_VIDEO, videoPath),
  onRenderProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => listener(progress);
    ipcRenderer.on(IPC_CHANNELS.RENDER_PROGRESS, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RENDER_PROGRESS, wrapped);
  },
  getRenderProgress: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.RENDER_GET_PROGRESS, projectId),
});

contextBridge.exposeInMainWorld('magicRender', api);
// Compatibility alias for renderer builds that still use the conventional Electron API name.
// Keep this bridge identical to magicRender; all calls still cross the same isolated IPC boundary.
contextBridge.exposeInMainWorld('electronAPI', Object.freeze({ ...api }));
