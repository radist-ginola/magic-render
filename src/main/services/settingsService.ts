import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import Store from 'electron-store';
import type { AiProvider } from '../../shared/domain/aiTypes';
import type { GlobalSettings, GlobalSettingsUpdate } from '../../shared/domain/settingsTypes';
import type { ProjectResolution } from '../../shared/domain/projectTypes';
import { normalizeBitrate } from './render/encodingBuilder';
import { validateCpuLoadPercent } from './cpuController';
import { AiCredentialStore } from './aiService/aiCredentialStore';
import { AiProviderHttpError, authenticateProvider, listProviderModels, validateProvider } from './aiService/aiProviderClient';

const GLOBAL_STORE_NAME = 'magic-render-pro-settings';
const DEFAULT_BITRATE_KBPS = 8000;
const DEFAULT_CPU_LOAD_PERCENT = 75;
const DEFAULT_RENDER_PRESET: GlobalSettings['renderPreset'] = 'standard';
const DEFAULT_PROVIDER: AiProvider = 'gemini';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_REPLACEMENTS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

export async function validateAvailableModel(provider: AiProvider, model: string, key: string): Promise<string> {
  try { await validateProvider(provider, model, key); return model; }
  catch (error) {
    // Older projects retain a Gemini 2.5 ID. Google may return 404 for
    // generation even when the legacy ID still appears in its model catalog.
    if (provider !== 'gemini' || !model.startsWith('gemini-2.5-') || !(error instanceof AiProviderHttpError) || error.status !== 404) throw error;
    const available = await listProviderModels('gemini', key);
    for (const candidate of GEMINI_REPLACEMENTS.filter((id) => available.includes(id))) {
      try { await validateProvider('gemini', candidate, key); return candidate; }
      catch (fallbackError) {
        if (!(fallbackError instanceof AiProviderHttpError) || fallbackError.status !== 404) throw fallbackError;
      }
    }
    throw new Error(`Model lama ${model} tidak tersedia dan model pengganti belum dapat divalidasi. Klik Muat Model lalu pilih Gemini Flash-Lite yang tersedia.`);
  }
}
const DEFAULT_FFMPEG_PATH = process.platform === 'win32' ? 'C:\\ffmpeg\\bin\\ffmpeg.exe' : 'ffmpeg';
const DEFAULT_FFPROBE_PATH = process.platform === 'win32' ? 'C:\\ffmpeg\\bin\\ffprobe.exe' : 'ffprobe';
const bundledFfmpeg = path.join(process.resourcesPath || process.cwd(), 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const bundledFfprobe = path.join(process.resourcesPath || process.cwd(), 'ffmpeg', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

function executablePath(value: string): string {
  return path.isAbsolute(value) || /[/\\]/.test(value) ? path.resolve(value) : value;
}

function preferBundledExecutable(saved: string, bundled: string): string {
  const executable = executablePath(saved);
  // Existing installations may retain C:\\ffmpeg paths from an earlier release.
  // Prefer an installed custom executable, but recover to the bundled runtime
  // when the saved path no longer exists on a new computer.
  return (path.isAbsolute(executable) && !fs.existsSync(executable) && fs.existsSync(bundled)) ? bundled : executable;
}

type StoredSettings = {
  outputDir: string;
  uploadDir: string;
  assetDir: string;
  renderDevice: 'cpu' | 'gpu';
  resolution: ProjectResolution;
  bitrateKbps: number;
  bitrateMode: 'cbr' | 'vbr';
  fps: 24 | 25 | 30 | 50 | 60;
  cpuLoadPercent: number;
  renderPreset: 'fast' | 'standard' | 'slow';
  aiProvider: AiProvider;
  aiModel: string;
  ffmpegPath: string;
  ffprobePath: string;
};

export class SettingsService {
  private readonly store: Store<StoredSettings>;
  private readonly credentials: AiCredentialStore;

  constructor(credentials = new AiCredentialStore()) {
    this.credentials = credentials;
    this.store = new Store<StoredSettings>({
      name: GLOBAL_STORE_NAME,
      defaults: this.getDefaults(),
      schema: {
        outputDir: { type: 'string' },
        uploadDir: { type: 'string' },
        assetDir: { type: 'string' },
        renderDevice: { type: 'string', enum: ['cpu', 'gpu'] },
        resolution: { type: 'string', enum: ['720p', '1080p', '2K', '4K'] },
        bitrateKbps: { type: 'number', minimum: 1, maximum: 1000000 },
        bitrateMode: { type: 'string', enum: ['cbr', 'vbr'] },
        fps: { type: 'number', enum: [24, 25, 30, 50, 60] },
        cpuLoadPercent: { type: 'number', minimum: 1, maximum: 100 },
        renderPreset: { type: 'string', enum: ['fast', 'standard', 'slow'] },
        aiProvider: { type: 'string', enum: ['openai', 'gemini', 'openrouter', 'groq', 'mistral', 'ollama'] },
        aiModel: { type: 'string', minLength: 1, maxLength: 200 },
        ffmpegPath: { type: 'string', minLength: 1, maxLength: 32767 },
        ffprobePath: { type: 'string', minLength: 1, maxLength: 32767 },
      },
    });
  }

  get(): GlobalSettings {
    const settings = this.store.store;
    return {
      outputDir: path.resolve(settings.outputDir),
      uploadDir: path.resolve(settings.uploadDir),
      assetDir: path.resolve(settings.assetDir || this.getDefaults().assetDir),
      renderDevice: settings.renderDevice ?? 'cpu',
      resolution: settings.resolution,
      bitrateKbps: normalizeBitrate(settings.bitrateKbps),
      bitrateMode: settings.bitrateMode ?? 'vbr',
      fps: settings.fps ?? 30,
      cpuLoadPercent: validateCpuLoadPercent(settings.cpuLoadPercent),
      renderPreset: settings.renderPreset ?? DEFAULT_RENDER_PRESET,
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel.trim(),
      ffmpegPath: preferBundledExecutable(settings.ffmpegPath, bundledFfmpeg),
      ffprobePath: preferBundledExecutable(settings.ffprobePath, bundledFfprobe),
    };
  }

  update(patch: GlobalSettingsUpdate): GlobalSettings {
    const current = this.get();
    const next: GlobalSettings = {
      outputDir: patch.outputDir !== undefined ? path.resolve(patch.outputDir) : current.outputDir,
      uploadDir: patch.uploadDir !== undefined ? path.resolve(patch.uploadDir) : current.uploadDir,
      assetDir: patch.assetDir !== undefined ? path.resolve(patch.assetDir) : current.assetDir,
      renderDevice: patch.renderDevice ?? current.renderDevice,
      resolution: patch.resolution ?? current.resolution,
      bitrateKbps: patch.bitrateKbps !== undefined ? normalizeBitrate(patch.bitrateKbps) : current.bitrateKbps,
      bitrateMode: patch.bitrateMode ?? current.bitrateMode,
      fps: patch.fps ?? current.fps,
      cpuLoadPercent: patch.cpuLoadPercent !== undefined ? validateCpuLoadPercent(patch.cpuLoadPercent) : current.cpuLoadPercent,
      renderPreset: patch.renderPreset ?? current.renderPreset,
      aiProvider: patch.aiProvider ?? current.aiProvider,
      aiModel: patch.aiModel !== undefined ? patch.aiModel.trim() : current.aiModel,
      ffmpegPath: patch.ffmpegPath !== undefined ? executablePath(patch.ffmpegPath) : current.ffmpegPath,
      ffprobePath: patch.ffprobePath !== undefined ? executablePath(patch.ffprobePath) : current.ffprobePath,
    };
    this.validate(next);
    this.store.set('outputDir', next.outputDir);
    this.store.set('uploadDir', next.uploadDir);
    this.store.set('assetDir', next.assetDir);
    this.store.set('renderDevice', next.renderDevice);
    this.store.set('resolution', next.resolution);
    this.store.set('bitrateKbps', next.bitrateKbps);
    this.store.set('bitrateMode', next.bitrateMode);
    this.store.set('fps', next.fps);
    this.store.set('cpuLoadPercent', next.cpuLoadPercent);
    this.store.set('renderPreset', next.renderPreset);
    this.store.set('aiProvider', next.aiProvider);
    this.store.set('aiModel', next.aiModel);
    this.store.set('ffmpegPath', next.ffmpegPath);
    this.store.set('ffprobePath', next.ffprobePath);
    return next;
  }

  async configureAi(provider: AiProvider, model: string, apiKey: string, validateKey = true): Promise<{ saved: boolean; settings: GlobalSettings; validationError?: string; modelChangeNote?: string }> {
    let normalizedModel = model.trim();
    if (!normalizedModel) throw new Error('AI model tidak boleh kosong.');
    let validationError: string | undefined;
    if (validateKey) {
      await authenticateProvider(provider, normalizedModel, apiKey.trim());
      try { normalizedModel = await validateAvailableModel(provider, normalizedModel, apiKey.trim()); }
      catch (error) {
        // OpenAI accepted this project key and model, but generation may be blocked
        // by billing/rate limits. Preserve the key without claiming it is usable.
        if (provider !== 'openai' || !(error instanceof AiProviderHttpError) || error.status !== 429) throw error;
        validationError = error.message;
      }
    }
    if (provider !== 'ollama') this.credentials.set(provider, normalizedModel, apiKey);
    const settings = this.update({ aiProvider: provider, aiModel: normalizedModel });
    return { saved: true, settings, ...(validationError ? { validationError } : {}), ...(normalizedModel !== model.trim() ? { modelChangeNote: `Model ${model.trim()} tidak tersedia; diganti ke ${normalizedModel} setelah diuji.` } : {}) };
  }

  clearAi(provider: AiProvider): { cleared: boolean } {
    this.credentials.clear(provider);
    return { cleared: true };
  }

  async checkAiStatus(provider: AiProvider, model: string, candidateKey?: string, authenticateOnly = false): Promise<{ provider: AiProvider; model: string; configured: boolean; valid: boolean; authenticated?: boolean; checkedAt: string | null; message: string }> {
    const credentials = this.credentials.get(provider);
    const selectedModel = model.trim() || credentials?.model || this.get().aiModel;
    const key = provider === 'ollama' ? '' : candidateKey?.trim() || credentials?.apiKey;
    if (provider !== 'ollama' && !key) return { provider, model: selectedModel, configured: false, valid: false, checkedAt: null, message: 'API key belum dikonfigurasi.' };
    const checkedAt = new Date().toISOString();
    try {
      if (authenticateOnly) {
        if (provider === 'openai' || provider === 'ollama') await authenticateProvider(provider, selectedModel, key ?? '');
        else {
          const models = await listProviderModels(provider, key ?? '');
          if (!models.includes(selectedModel)) throw new Error(`Model ${selectedModel} belum tersedia pada daftar ${provider}. Pilih model vision yang tersedia.`);
        }
        return { provider, model: selectedModel, configured: provider === 'ollama' || !!credentials, valid: false, authenticated: true, checkedAt, message: `${provider === 'ollama' ? 'Ollama dan model lokal tersedia' : 'API key dan model dikenali'}. Generasi belum diuji; batas akun dapat tetap membatasi penggunaan.` };
      }
      const validatedModel = await validateAvailableModel(provider, selectedModel, key ?? '');
      return { provider, model: validatedModel, configured: provider === 'ollama' || !!credentials, valid: true, checkedAt, message: `${validatedModel !== selectedModel ? `Model lama ${selectedModel} tidak tersedia; ${validatedModel} berhasil diuji. ` : ''}${provider === 'ollama' ? 'Ollama lokal siap digunakan.' : candidateKey?.trim() ? 'API key siap digunakan. Klik Simpan & Validasi untuk menyimpannya.' : 'Provider siap digunakan untuk YouTube SEO.'}` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { provider, model: selectedModel, configured: provider === 'ollama' || !!credentials, valid: false, checkedAt, message: candidateKey?.trim() ? `Kunci yang sedang diketik gagal: ${detail}` : detail };
    }
  }


  getAiCredentials(provider: AiProvider): { model: string; apiKey: string } | null {
    if (provider === 'ollama') return { model: this.get().aiModel, apiKey: '' };
    const credentials = this.credentials.get(provider);
    return credentials && this.get().aiProvider === provider ? { ...credentials, model: this.get().aiModel } : credentials;
  }

  listAiModels(provider: AiProvider, candidateKey?: string, freeOnly = false): Promise<string[]> {
    const key = candidateKey?.trim() || this.credentials.get(provider)?.apiKey || '';
    // Opening Settings must not invoke an IPC handler that throws while no
    // credential has been configured for this provider yet.
    if (provider !== 'ollama' && !key) return Promise.resolve([]);
    return listProviderModels(provider, key, freeOnly);
  }

  getStoredAiModel(provider: AiProvider): string | null {
    return this.credentials.get(provider)?.model ?? null;
  }

  private validate(settings: GlobalSettings): void {
    if (!['720p', '1080p', '2K', '4K'].includes(settings.resolution)) throw new Error('Invalid output resolution.');
    if (!settings.outputDir.trim()) throw new Error('Default Output Directory tidak boleh kosong.');
    if (!settings.uploadDir.trim()) throw new Error('Folder project default tidak boleh kosong.');
    if (!settings.assetDir.trim()) throw new Error('Folder asset tidak boleh kosong.');
    if (!settings.aiModel.trim()) throw new Error('AI model tidak boleh kosong.');
    if (!settings.ffmpegPath.trim() || !settings.ffprobePath.trim()) throw new Error('Path FFmpeg dan FFprobe wajib diisi.');
    if (process.platform === 'win32' && !settings.ffmpegPath.toLowerCase().endsWith('.exe')) throw new Error('Path FFmpeg harus menunjuk ke file ffmpeg.exe.');
    if (process.platform === 'win32' && !settings.ffprobePath.toLowerCase().endsWith('.exe')) throw new Error('Path FFprobe harus menunjuk ke file ffprobe.exe.');
    // Availability is checked by Test FFmpeg; a missing executable must not
    // prevent saving unrelated fields such as the output directory or AI key.
    if (![24, 25, 30, 50, 60].includes(settings.fps)) throw new Error('FPS output tidak valid.');
    if (settings.bitrateKbps < 1 || settings.bitrateKbps > 1000000) throw new Error('Video bitrate berada di luar batas aman.');
  }

  private getDefaults(): StoredSettings {
    const fallbackOutputDir = path.join(app.getPath('videos'), 'Magic Render Pro');
    return {
      outputDir: fallbackOutputDir,
      uploadDir: path.join(app.getPath('documents'), 'Magic Render Pro Projects'),
      assetDir: path.join(app.getPath('userData'), 'Asset Library'),
      renderDevice: 'cpu',
      resolution: '1080p',
      bitrateKbps: DEFAULT_BITRATE_KBPS,
      bitrateMode: 'vbr',
      fps: 30,
      cpuLoadPercent: DEFAULT_CPU_LOAD_PERCENT,
      renderPreset: DEFAULT_RENDER_PRESET,
      aiProvider: DEFAULT_PROVIDER,
      aiModel: DEFAULT_MODEL,
      ffmpegPath: fs.existsSync(bundledFfmpeg) ? bundledFfmpeg : DEFAULT_FFMPEG_PATH,
      ffprobePath: fs.existsSync(bundledFfprobe) ? bundledFfprobe : DEFAULT_FFPROBE_PATH,
    };
  }
}
