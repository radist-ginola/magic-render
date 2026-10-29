import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import path from 'node:path';
import { createApplicationConfig } from './config/appConfig';
import { createRuntimeConfig } from './config/environment';
import { registerIpcHandlers } from './ipc/registerIpc';
import { settingsService } from './ipc/settingsHandlers';
import { initializeLogger, logger, subscribeLogger } from './utils/logger';
import { DEFAULT_WINDOW_SIZE } from '../shared/app';
import { initializeLockedAssetPersistence, listLockedAssets } from './services/persistentStore';
import type { RenderOrchestrator } from './services/render/renderOrchestrator';
import { CacheManager } from './services/cache/cacheManager';
import { IPC_CHANNELS } from '../shared/ipc';
import { translateFfmpegError } from './services/ffmpegEngine/errorTranslator';
import fs from 'node:fs';
import { serveLocalMediaRequest } from './services/media/mediaProtocolService';

protocol.registerSchemesAsPrivileged([{ scheme: 'mrp-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

const runtimeConfig = createRuntimeConfig();
const applicationConfig = createApplicationConfig(runtimeConfig);

function translateForUser(message: string): string {
  if (/prompt\(\) is not supported/i.test(message)) return 'Fitur dialog input lama tidak didukung oleh Electron. Aplikasi menggunakan dialog project bawaan.';
  if (/failed to load|network|econnrefused|fetch failed/i.test(message)) return 'Aplikasi gagal terhubung ke layanan yang dibutuhkan. Periksa koneksi internet atau konfigurasi.';
  if (/enoent|not found|cannot find/i.test(message)) return 'File atau program yang dibutuhkan tidak ditemukan. Periksa path file yang dipilih.';
  if (/permission|access denied/i.test(message)) return 'Aplikasi tidak memiliki izin untuk mengakses file atau folder tersebut.';
  if (/ffmpeg/i.test(message) && /not available|spawn|enoent|cannot find/i.test(message)) return 'FFmpeg tidak ditemukan atau tidak bisa dijalankan. Periksa Path FFmpeg di Menu Setting.';
  if (/ffprobe/i.test(message) && /not available|spawn|enoent|cannot find/i.test(message)) return 'FFprobe tidak ditemukan atau tidak bisa dijalankan. Periksa Path FFprobe di Menu Setting.';
  if (/renderer process exited unexpectedly/i.test(message)) return 'Jendela editor berhenti secara tidak terduga. Coba buka kembali aplikasi.';
  if (/renderer failed to load/i.test(message)) return 'Tampilan aplikasi gagal dimuat. Silakan tutup dan buka kembali aplikasi.';
  if (/bootstrap failed/i.test(message)) return 'Aplikasi gagal melakukan persiapan awal. Periksa Console Log atau coba buka kembali aplikasi.';
  return message;
}

function translateLogDetail(detail: string | null | undefined, level: string = 'ERROR', sourceMessage = ''): string | null {
  if (!detail) return null;
  const stageLabel = (stage: unknown): string => {
    const labels: Record<string, string> = {
      'main-media-preparation': 'persiapan media utama', 'visual-layer-composition': 'komposisi lapisan visual',
      'content-flow': 'penyusunan urutan video', 'audio-management': 'pengolahan audio/playlist',
      'output': 'encoding dan penyimpanan MP4', 'metadata-output': 'pembuatan file metadata',
      'intro': 'pemrosesan intro', 'visualizer': 'pemrosesan visualizer', 'overlay': 'pemrosesan overlay',
    };
    if (typeof stage !== 'string' || !stage.trim()) return '';
    const description = labels[stage] ?? stage.replaceAll('-', ' ');
    if (/selesai|completed|berhasil|lulus|validasi.*lulus/i.test(sourceMessage)) return `Tahap selesai: ${description}.`;
    if (level === 'ERROR' || level === 'WARN') return `Tahap bermasalah: ${description}.`;
    return `Tahap terkait: ${description}.`;
  };
  const codeLabel = (code: unknown): string => {
    if (typeof code !== 'string' && typeof code !== 'number') return '';
    const key = String(code);
    const labels: Record<string, string> = {
      INPUT_FILE_MISSING: 'File sumber tidak ditemukan', PERMISSION_DENIED: 'Akses file ditolak', DISK_FULL: 'Ruang disk tidak cukup',
      UNKNOWN_ENCODER: 'Encoder FFmpeg tidak tersedia', INVALID_FILTER: 'Parameter filter visual tidak valid',
      OUTPUT_WRITE_FAILED: 'Gagal menulis MP4', FFMPEG_UNKNOWN_ERROR: 'Kesalahan FFmpeg belum terklasifikasi',
      MOOV_ATOM_NOT_FOUND: 'Struktur file video tidak lengkap',
    };
    return `Kode: ${labels[key] ?? key}.`;
  };
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    const pieces: string[] = [];
    const hasMp4Validation = ['durationSeconds', 'videoCodec', 'pixelFormat', 'audioCodec', 'formatName'].some((key) => parsed[key] !== undefined);
    if (hasMp4Validation) {
      const duration = typeof parsed.durationSeconds === 'number' && Number.isFinite(parsed.durationSeconds) ? `${parsed.durationSeconds.toFixed(2)} detik` : null;
      const video = typeof parsed.videoCodec === 'string' ? parsed.videoCodec : null;
      const pixel = typeof parsed.pixelFormat === 'string' ? parsed.pixelFormat : null;
      const audio = typeof parsed.audioCodec === 'string' && parsed.audioCodec ? parsed.audioCodec : 'tidak ada';
      const format = typeof parsed.formatName === 'string' ? parsed.formatName : null;
      const values = [duration ? `durasi ${duration}` : null, video ? `video ${video}` : null, pixel ? `piksel ${pixel}` : null, `audio ${audio}`, format ? `container ${format}` : null].filter(Boolean);
      if (values.length) pieces.push(`${/lulus|validasi.*mp4/i.test(sourceMessage) ? 'Validasi MP4 final lulus' : 'Informasi hasil MP4'}: ${values.join('; ')}.`);
    }
    const stage = stageLabel(parsed.stage);
    if (stage) pieces.push(stage);
    const explicitCode = codeLabel(parsed.code);
    if (explicitCode) pieces.push(explicitCode);
    for (const key of ['message', 'errorDescription', 'reason', 'error', 'description']) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) { pieces.push(translateForUser(value.trim())); break; }
    }
    const raw = [parsed.stderr, parsed.raw, parsed.diagnostic].find((value) => typeof value === 'string' && value.trim());
    if (typeof raw === 'string') {
      const translated = translateFfmpegError(raw, { stage: typeof parsed.stage === 'string' ? parsed.stage as never : undefined, exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined });
      if (!pieces.some((piece) => piece.includes(translated.message))) pieces.push(`${translated.title}: ${translated.message} Solusi: ${translated.solution}`);
    }
    if (typeof parsed.exitCode === 'number') pieces.push(`Kode keluar FFmpeg: ${parsed.exitCode}.`);
    if (pieces.length) return [...new Set(pieces)].join(' ');
    const usefulKeys = Object.keys(parsed).filter((key) => !['command', 'args', 'env', 'input'].includes(key));
    return usefulKeys.length
      ? `Detail teknis tersedia tetapi belum memiliki pesan yang dikenali. Field: ${usefulKeys.join(', ')}. Buka entri FFmpeg di Console Log untuk melihat perintah dan error aslinya.`
      : 'Log tidak memuat detail kesalahan. Buka entri FFmpeg tepat sebelum pesan gagal dan periksa path media, FFmpeg, serta folder output.';
  } catch {
    return translateForUser(detail);
  }
}

const logSubscribers = new Set<BrowserWindow>();
subscribeLogger((entry) => {
  const translated = translateForUser(entry.message);
  for (const window of logSubscribers) {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.APP_LOG, { ...entry, message: translated, detail: translateLogDetail(entry.detail, entry.level, entry.message) });
  }
});


let mainWindow: BrowserWindow | null = null;
let renderOrchestrator: RenderOrchestrator | null = null;
let cleanupInFlight: Promise<void> | null = null;

function cleanupOnClose(): Promise<void> {
  if (!cleanupInFlight) cleanupInFlight = (async () => {
    renderOrchestrator?.cancelAll();
    // FFmpeg and filesystem cleanup can stall on removable/network drives.
    // Bound shutdown while retaining active job directories for next startup.
    let cancellationTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        renderOrchestrator?.waitForAvailability() ?? Promise.resolve(),
        new Promise<void>((resolve) => { cancellationTimeout = setTimeout(resolve, 5000); }),
      ]);
    } finally { if (cancellationTimeout) clearTimeout(cancellationTimeout); }
    const assets = await listLockedAssets();
    const results = await new CacheManager().cleanupStaleJobs(0, assets.map((item) => item.path), renderOrchestrator?.activeJobDirectories() ?? []);
    logger.info('[SISTEM] File sementara aplikasi dibersihkan saat jendela ditutup.', { jobs: results.length, failures: results.flatMap((item) => item.failed).length });
  })().catch((error) => { logger.warn('Pembersihan file sementara saat tutup gagal.', { message: String(error) }); });
  return cleanupInFlight;
}

function assertElectronSecurity(window: BrowserWindow): void {
  const webPreferences = window.webContents.getURL();
  if (window.webContents && webPreferences === 'about:blank') {
    logger.debug('Electron window initialized before renderer navigation.');
  }
}

function registerMediaProtocol(): void {
  protocol.handle('mrp-media', async (request) => {
    try {
      // Electron's protocol request exposes Fetch Headers, not a plain Record.
      // Normalize keys to lowercase so the media service reliably finds Range.
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return await serveLocalMediaRequest({ url: request.url, method: request.method, headers });
    } catch (error) {
      logger.error('Media protocol request failed.', { message: error instanceof Error ? error.message : String(error) });
      return new Response('Unable to load local media.', { status: 500 });
    }
  });
}

function getRendererEntry(): { url?: string; file?: string } {
  if (runtimeConfig.isDevelopment) {
    return { url: runtimeConfig.devServerUrl };
  }
  return { file: path.join(__dirname, '..', 'renderer', 'index.html') };
}

/** Resolve the compiled preload bridge robustly for source, dev, and packaged runs. */
function resolvePreloadScriptPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'preload', 'index.js'),
    path.resolve(app.getAppPath(), 'dist', 'preload', 'index.js'),
    path.resolve(process.cwd(), 'dist', 'preload', 'index.js'),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error([
      'Electron preload bridge was not found.',
      'Run "npm run build:main" and verify dist/preload/index.js exists.',
      ...candidates.map((candidate) => `Checked: ${candidate}`),
    ].join('\n'));
  }
  return resolved;
}

function createMainWindow(): BrowserWindow {
  const preloadPath = resolvePreloadScriptPath();
  logger.info('Resolved Electron preload bridge.', { preloadPath });
  const window = new BrowserWindow({
    width: applicationConfig.window.width || DEFAULT_WINDOW_SIZE.width,
    height: applicationConfig.window.height || DEFAULT_WINDOW_SIZE.height,
    minWidth: applicationConfig.window.minWidth,
    minHeight: applicationConfig.window.minHeight,
    backgroundColor: '#070711',
    icon: (() => {
      const candidates = [path.join(process.resourcesPath, 'app-icon.ico'), path.join(__dirname, '..', '..', 'resources', 'app-icon.ico'), path.join(__dirname, '..', 'renderer', 'assets', 'magic-render-pro.ico')];
      return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[2];
    })(),
    show: false,
    // The title bar and File/Help menus are intentionally rendered by React.
    // Window actions are still executed by Electron through the preload bridge.
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Preload is compiled as CommonJS and imports local typed bridge modules.
      // Keep context isolation and disable renderer Node integration; do not sandbox
      // this preload until it is bundled into a single sandbox-compatible artifact.
      sandbox: false,
      devTools: runtimeConfig.isDevelopment,
    },
  });

  assertElectronSecurity(window);
  let closeReady = false;
  let closeInProgress = false;
  window.on('close', (event) => {
    if (closeReady) return;
    event.preventDefault();
    if (closeInProgress) return;
    closeInProgress = true;

    // Save the latest renderer snapshot before deleting render temp files or
    // closing the window. On failure, ask the user rather than silently losing edits.
    const rendererSave = new Promise<{ saved: boolean; errorMessage?: string }>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: { saved: boolean; errorMessage?: string }) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        ipcMain.removeListener(IPC_CHANNELS.APP_CLOSE_READY, onReady);
        resolve(result);
      };
      const onReady = (ipcEvent: Electron.IpcMainEvent, payload?: { saved?: unknown; errorMessage?: unknown }) => {
        if (ipcEvent.sender !== window.webContents) return;
        const saved = payload?.saved === true;
        finish({ saved, errorMessage: saved ? undefined : (typeof payload?.errorMessage === 'string' ? payload.errorMessage : 'Autosave renderer tidak mengonfirmasi keberhasilan.') });
      };
      ipcMain.on(IPC_CHANNELS.APP_CLOSE_READY, onReady);
      timeout = setTimeout(() => {
        logger.warn('Timed out waiting for renderer project autosave before close.');
        finish({ saved: false, errorMessage: 'Waktu tunggu autosave habis. Project mungkin belum tersimpan.' });
      }, 10000);
      if (window.webContents.isDestroyed()) finish({ saved: false, errorMessage: 'Renderer sudah ditutup sebelum autosave selesai.' });
      else window.webContents.send(IPC_CHANNELS.APP_PREPARE_CLOSE);
    });

    void rendererSave.then(async (outcome) => {
      if (!outcome.saved) {
        closeInProgress = false;
        if (window.isDestroyed()) return;
        const choice = await dialog.showMessageBox(window, {
          type: 'warning',
          title: 'Project belum tersimpan',
          message: 'Perubahan project belum berhasil disimpan.',
          detail: `${outcome.errorMessage ?? 'Autosave gagal.'}\n\nPilih “Kembali ke aplikasi” untuk mencoba lagi, atau “Tutup tanpa menyimpan” untuk keluar tanpa menyimpan perubahan terbaru.`,
          buttons: ['Kembali ke aplikasi', 'Tutup tanpa menyimpan'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (choice.response !== 1) return;
      }

      try {
        await cleanupOnClose();
      } catch (error) {
        logger.error('Cleanup before application close failed.', error instanceof Error ? error.message : String(error));
      }
      closeReady = true;
      if (!window.isDestroyed()) window.close();
    }).catch((error) => {
      closeInProgress = false;
      logger.error('Close confirmation failed.', error instanceof Error ? error.message : String(error));
    });
  });
  logSubscribers.add(window);
  window.on('closed', () => logSubscribers.delete(window));
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logger.error('Renderer failed to load.', { errorCode, errorDescription, validatedURL, isMainFrame });
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('Electron preload bridge failed to execute.', {
      preloadPath,
      message: error.message,
      stack: error.stack,
    });
  });
  window.webContents.on('dom-ready', () => {
    void window.webContents.executeJavaScript(
      'Boolean(window.magicRender && typeof window.magicRender.onPrepareToClose === "function")',
    ).then((bridgeAvailable: boolean) => {
      if (!bridgeAvailable) {
        logger.error('Renderer loaded without the magicRender preload bridge.', { preloadPath });
      }
    }).catch((error: unknown) => {
      logger.warn('Could not verify renderer preload bridge.', { message: error instanceof Error ? error.message : String(error) });
    });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process exited unexpectedly.', {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  window.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    const numericLevel = typeof level === 'number' ? level : Number(level);
    if (numericLevel >= 2) {
      logger.warn('Renderer console error.', {
        level: numericLevel,
        message,
        line: lineNumber,
        sourceId,
      });
    }
  });

  const entry = getRendererEntry();
  if (entry.url) {
    void window.loadURL(entry.url);
  } else if (entry.file) {
    void window.loadFile(entry.file);
  }

  return window;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  if (process.platform === 'win32') app.setAppUserModelId(applicationConfig.appId);
  await initializeLogger();
  const persistedSettings = settingsService.get();
  runtimeConfig.ffmpegPath = persistedSettings.ffmpegPath;
  runtimeConfig.ffprobePath = persistedSettings.ffprobePath;
  logger.info('Bootstrapping Magic Render Pro.', {
    environment: runtimeConfig.environment,
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
  });

  registerMediaProtocol();
  renderOrchestrator = registerIpcHandlers(applicationConfig);
  const lockedAssets = await initializeLockedAssetPersistence();
  logger.info('Locked asset persistence initialized.', { count: lockedAssets.length });
  mainWindow = createMainWindow();
  const cacheManager = new CacheManager();
  void cacheManager.cleanupStaleJobs(24 * 60 * 60 * 1000, lockedAssets.map((asset) => asset.path))
    .then((staleCleanup) => logger.info('Stale render cache cleanup completed.', { jobs: staleCleanup.length, failures: staleCleanup.reduce((sum, item) => sum + item.failed.length, 0) }))
    .catch((error) => logger.warn('Stale render cache cleanup failed.', { message: String(error) }));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in Main Process.', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection in Main Process.', { reason });
});

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Application bootstrap failed.', { message });
  app.exit(1);
});
