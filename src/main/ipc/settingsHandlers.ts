import { registerIpcHandler } from './loggedHandler';

import { showOpenDialog } from './dialogHelper';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { AiProvider } from '../../shared/domain/aiTypes';
import type { GlobalSettingsUpdate } from '../../shared/domain/settingsTypes';
import { SettingsService } from '../services/settingsService';
import { assertAllowedString } from './validation';
import { validateCpuLoadPercent } from '../services/cpuController';
import path from 'node:path';
import { CacheManager } from '../services/cache/cacheManager';
import { listLockedAssets } from '../services/persistentStore';
import type { RenderOrchestrator } from '../services/render/renderOrchestrator';
import { testEngine } from '../services/ffmpegEngine/engineDiagnostics';
import { detectGpu } from '../services/render/gpuDetection';
import type { ApplicationConfig } from '../config/appConfig';
import { refreshProjectMediaService } from './projectHandlers';
import { refreshPlaylistService } from './playlistHandlers';
import { refreshIntroProjectService } from './introHandlers';

export const settingsService = new SettingsService();

const AI_PROVIDERS: readonly AiProvider[] = ['openai', 'gemini', 'openrouter', 'groq', 'mistral', 'ollama'];

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && AI_PROVIDERS.includes(value as AiProvider);
}

export function registerSettingsIpcHandlers(orchestrator: RenderOrchestrator, config: ApplicationConfig): void {
  registerIpcHandler(IPC_CHANNELS.SETTINGS_TEST_ENGINE, async (_event, ffmpegPath: unknown, ffprobePath: unknown) => {
    assertAllowedString(ffmpegPath, 'FFmpeg path', 32767);
    assertAllowedString(ffprobePath, 'FFprobe path', 32767);
    return testEngine(ffmpegPath as string, ffprobePath as string);
  });
  registerIpcHandler(IPC_CHANNELS.SETTINGS_CLEAR_CACHE, async () => {
    const assets = await listLockedAssets();
    const result = await new CacheManager().cleanupStaleJobs(0, assets.map((asset) => asset.path), orchestrator.activeJobDirectories());
    return { jobsRemoved: result.filter((item) => item.failed.length === 0).length, filesRemoved: result.reduce((count, item) => count + item.removed.filter((entry) => entry !== item.jobDir).length, 0), failures: result.flatMap((item) => item.failed.map((failure) => failure.error)) };
  });
  registerIpcHandler(IPC_CHANNELS.SETTINGS_GET, () => settingsService.get());
  registerIpcHandler(IPC_CHANNELS.SETTINGS_DETECT_GPU, (_event, ffmpegPath?: unknown) => {
    if (ffmpegPath !== undefined) assertAllowedString(ffmpegPath, 'FFmpeg path', 32767);
    return detectGpu(typeof ffmpegPath === 'string' ? ffmpegPath : settingsService.get().ffmpegPath);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_UPDATE, (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid settings update.');
    const raw = patch as Record<string, unknown>;
    const normalized: GlobalSettingsUpdate = {};
    if (raw.outputDir !== undefined) { assertAllowedString(raw.outputDir, 'output directory', 32767); normalized.outputDir = raw.outputDir; }
    if (raw.uploadDir !== undefined) { assertAllowedString(raw.uploadDir, 'upload directory', 32767); normalized.uploadDir = raw.uploadDir; }
    if (raw.assetDir !== undefined) { assertAllowedString(raw.assetDir, 'asset directory', 32767); normalized.assetDir = raw.assetDir; }
    if (raw.renderDevice !== undefined) { if (raw.renderDevice !== 'cpu' && raw.renderDevice !== 'gpu') throw new Error('Mode render harus CPU atau GPU.'); normalized.renderDevice = raw.renderDevice; }
    if (raw.resolution !== undefined) {
      if (raw.resolution !== '720p' && raw.resolution !== '1080p' && raw.resolution !== '2K' && raw.resolution !== '4K') throw new Error('Invalid output resolution.');
      normalized.resolution = raw.resolution;
    }
    if (raw.fps !== undefined) { if (![24, 25, 30, 50, 60].includes(Number(raw.fps)) || typeof raw.fps !== 'number') throw new Error('FPS output tidak valid.'); normalized.fps = raw.fps as GlobalSettingsUpdate['fps']; }
    if (raw.bitrateKbps !== undefined) {
      if (typeof raw.bitrateKbps !== 'number' || !Number.isFinite(raw.bitrateKbps)) throw new Error('Invalid output bitrate.');
      normalized.bitrateKbps = raw.bitrateKbps;
    }
    if (raw.bitrateMode !== undefined) { if (raw.bitrateMode !== 'cbr' && raw.bitrateMode !== 'vbr') throw new Error('Mode bitrate harus CBR atau VBR.'); normalized.bitrateMode = raw.bitrateMode; }
    if (raw.cpuLoadPercent !== undefined) normalized.cpuLoadPercent = validateCpuLoadPercent(raw.cpuLoadPercent);
    if (raw.renderPreset !== undefined) { if (!['fast', 'standard', 'slow'].includes(String(raw.renderPreset))) throw new Error('Preset render FFmpeg tidak valid.'); normalized.renderPreset = raw.renderPreset as GlobalSettingsUpdate['renderPreset']; }
    if (raw.aiProvider !== undefined) {
      if (!isAiProvider(raw.aiProvider)) throw new Error('Provider AI tidak valid.');
      normalized.aiProvider = raw.aiProvider;
    }
    if (raw.aiModel !== undefined) { assertAllowedString(raw.aiModel, 'AI model', 200); normalized.aiModel = raw.aiModel; }
    if (raw.ffmpegPath !== undefined) { assertAllowedString(raw.ffmpegPath, 'FFmpeg path', 32767); normalized.ffmpegPath = path.normalize(raw.ffmpegPath); }
    if (raw.ffprobePath !== undefined) { assertAllowedString(raw.ffprobePath, 'FFprobe path', 32767); normalized.ffprobePath = path.normalize(raw.ffprobePath); }
    const updated = settingsService.update(normalized);
    config.runtime.ffmpegPath = updated.ffmpegPath;
    config.runtime.ffprobePath = updated.ffprobePath;
    orchestrator.configureExecutables(updated.ffmpegPath, updated.ffprobePath);
    refreshProjectMediaService();
    refreshPlaylistService();
    refreshIntroProjectService();
    return updated;
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CHOOSE_UPLOAD_DIRECTORY, async () => {
    const result = await showOpenDialog({ title: 'Pilih Folder Penyimpanan Project Default', defaultPath: settingsService.get().uploadDir, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CHOOSE_ASSET_DIRECTORY, async () => {
    const result = await showOpenDialog({ title: 'Pilih Folder Asset Library', defaultPath: settingsService.get().assetDir, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CHOOSE_OUTPUT_DIRECTORY, async () => {
    const result = await showOpenDialog( {
      title: 'Choose Default Output Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CHOOSE_FFMPEG, async () => {
    const result = await showOpenDialog({ title: 'Pilih ffmpeg.exe', properties: ['openFile'], filters: [{ name: 'FFmpeg executable', extensions: ['exe'] }] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CHOOSE_FFPROBE, async () => {
    const result = await showOpenDialog({ title: 'Pilih ffprobe.exe', properties: ['openFile'], filters: [{ name: 'FFprobe executable', extensions: ['exe'] }] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CONFIGURE_AI, async (_event, provider: unknown, model: unknown, apiKey: unknown, validateKey?: unknown) => {
    if (!isAiProvider(provider)) throw new Error('Provider AI tidak valid.');
    assertAllowedString(model, 'AI model', 200);
    if (provider === 'ollama' && apiKey === '') { /* Local Ollama has no credential. */ }
    else assertAllowedString(apiKey, 'API key', 10000);
    if (validateKey !== undefined && typeof validateKey !== 'boolean') throw new Error('Opsi validasi AI tidak valid.');
    return settingsService.configureAi(provider, model as string, apiKey as string, validateKey !== false);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_CLEAR_AI, (_event, provider: unknown) => {
    if (!isAiProvider(provider)) throw new Error('Provider AI tidak valid.');
    return settingsService.clearAi(provider);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_AI_STATUS, async (_event, provider: unknown, model: unknown, candidateKey?: unknown, authenticateOnly?: unknown) => {
    if (!isAiProvider(provider)) throw new Error('Provider AI tidak valid.');
    if (model !== undefined) assertAllowedString(model, 'AI model', 200);
    if (candidateKey !== undefined) assertAllowedString(candidateKey, 'API key', 10000);
    if (authenticateOnly !== undefined && typeof authenticateOnly !== 'boolean') throw new Error('Opsi autentikasi AI tidak valid.');
    return settingsService.checkAiStatus(provider, typeof model === 'string' ? model : '', typeof candidateKey === 'string' ? candidateKey : undefined, authenticateOnly === true);
  });

  registerIpcHandler(IPC_CHANNELS.SETTINGS_AI_MODELS, async (_event, provider: unknown, candidateKey?: unknown, freeOnly?: unknown) => {
    if (!isAiProvider(provider)) throw new Error('Provider AI tidak valid.');
    if (candidateKey !== undefined) assertAllowedString(candidateKey, 'API key', 10000);
    if (freeOnly !== undefined && typeof freeOnly !== 'boolean') throw new Error('Filter model gratis tidak valid.');
    return settingsService.listAiModels(provider, typeof candidateKey === 'string' ? candidateKey : undefined, freeOnly === true);
  });

}
