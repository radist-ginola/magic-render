import { app, BrowserWindow, dialog, shell } from 'electron';
import { IPC_CHANNELS, type RuntimeInfo } from '../../shared/ipc';
import type { ApplicationConfig } from '../config/appConfig';
import { assertNoArguments } from './validation';
import { getRecentLogEntries, logger } from '../utils/logger';
import { registerIpcHandler } from './loggedHandler';
import { checkForLatestGithubRelease, validateUpdateUrl } from '../services/updateService';

export function registerAppIpcHandlers(config: ApplicationConfig): void {
  registerIpcHandler(IPC_CHANNELS.APP_GET_RECENT_LOGS, (_event, ...args: unknown[]) => {
    assertNoArguments(IPC_CHANNELS.APP_GET_RECENT_LOGS, args);
    return getRecentLogEntries();
  });
  registerIpcHandler(IPC_CHANNELS.APP_LOG, async (_event, level: unknown, message: unknown, detail?: unknown) => {
    if (!['DEBUG','INFO','WARN','ERROR'].includes(String(level))) throw new Error('Log level tidak valid.');
    if (typeof message !== 'string' || !message.trim()) throw new Error('Log message tidak valid.');
    const payload = typeof detail === 'string' && detail.length > 0 ? { detail } : undefined;
    logger[String(level).toLowerCase() as 'debug' | 'info' | 'warn' | 'error'](message, payload);
  });

  registerIpcHandler(IPC_CHANNELS.APP_GET_RUNTIME_INFO, (_event, ...args: unknown[]): RuntimeInfo => {
    assertNoArguments(IPC_CHANNELS.APP_GET_RUNTIME_INFO, args);
    return Object.freeze({
      appName: config.appName,
      appVersion: app.getVersion(),
      environment: config.runtime.environment,
      platform: process.platform,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  registerIpcHandler(IPC_CHANNELS.APP_CHECK_FOR_UPDATES, (_event, ...args: unknown[]) => {
    assertNoArguments(IPC_CHANNELS.APP_CHECK_FOR_UPDATES, args);
    return checkForLatestGithubRelease(app.getVersion());
  });

  registerIpcHandler(IPC_CHANNELS.APP_OPEN_UPDATE_URL, async (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== 'string' || !validateUpdateUrl(rawUrl)) throw new Error('URL update tidak valid atau bukan aset GitHub Releases aplikasi.');
    await shell.openExternal(rawUrl);
  });

  registerIpcHandler(IPC_CHANNELS.APP_PING, (_event, ...args: unknown[]): 'pong' => {
    assertNoArguments(IPC_CHANNELS.APP_PING, args);
    return 'pong';
  });

  registerIpcHandler(IPC_CHANNELS.WINDOW_MINIMIZE, (_event, ...args: unknown[]) => {
    assertNoArguments(IPC_CHANNELS.WINDOW_MINIMIZE, args);
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  registerIpcHandler(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, (_event, ...args: unknown[]): boolean => {
    assertNoArguments(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, args);
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return false;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return window.isMaximized();
  });

  registerIpcHandler(IPC_CHANNELS.WINDOW_CLOSE, (_event, ...args: unknown[]) => {
    assertNoArguments(IPC_CHANNELS.WINDOW_CLOSE, args);
    BrowserWindow.getFocusedWindow()?.close();
  });

  registerIpcHandler(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (_event, ...args: unknown[]): boolean => {
    assertNoArguments(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, args);
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
  });

  registerIpcHandler(IPC_CHANNELS.HELP_OPEN, async (_event, topic: unknown) => {
    if (!['guide', 'shortcuts', 'troubleshooting', 'system', 'about'].includes(String(topic))) throw new Error('Help topic tidak valid.');
    const titleMap = { guide: `${config.appName} — User Guide`, shortcuts: `${config.appName} — Keyboard Shortcuts`, troubleshooting: `${config.appName} — Troubleshooting`, system: `${config.appName} — System Information`, about: `About ${config.appName}` } as const;
    const messageMap = {
      guide: 'Panduan lengkap dengan bagian yang rapi tersedia pada menu Help → User Guide.\n\n1. Buat project, pilih folder export dan media utama.\n2. Import MP3, hapus atau geser lagu sesuai urutan yang diinginkan. Tekan ↺ Reset preview untuk memuat playlist terbaru.\n3. Sticker Berulang menggunakan interval menit: 3 berarti 00:00, 03:00, 06:00.\n4. Opsi 2 menjalankan AI SEO bersamaan dengan Render. Pantau status di menu YouTube SEO.\n5. Periksa file video, urutan lagu dan SEO sebelum publikasi.',
      shortcuts: 'F1 — Buka Help\nCtrl+1–6 — Home, Render, Bulk Render, Asset, Setting, Help\nAlt+1–6 — Media, Intro, Overlay, Playlist, Sticker, YouTube SEO\nCtrl+N / O / S / I — Project baru / buka / simpan / import media\nCtrl+Enter — Mulai render di menu Render atau Bulk\nCtrl+Shift+P / X — Pause atau lanjutkan / batalkan render\nSpasi — Play atau jeda preview\nHome — Reset preview ke 00:00\n+ / - — Zoom canvas\nDelete — Hapus layer terpilih\nPanah — Geser layer terpilih 1 px (Shift: 10 px)\nCtrl+Z / Ctrl+Y — Undo / Redo\nEscape — Tutup dialog\nAlt+F4 — Tutup aplikasi\n\nDi form input, gunakan Tab lalu Enter atau Spasi untuk menjalankan tombol. Shortcut preview tidak mengambil alih saat mengetik.',
      troubleshooting: 'Buka Help → Troubleshooting untuk langkah terperinci.\n\nPLAYLIST: periksa urutan yang tampak lalu reset preview dan render ulang.\nSTICKER: periksa interval menit, durasi, fade, opacity, waktu intro dan ikon mata.\nSEO: gunakan model vision, periksa API key/kuota serta status SEO. Angka volume pencarian memerlukan data Analytics yang tidak tersedia melalui konfigurasi AI biasa.\nRENDER: periksa FFmpeg/FFprobe, folder output dan Console Log.',
      system: `Spesifikasi minimum yang disarankan: Windows 10/11 64-bit, CPU x64 4 inti, RAM 8 GB, ruang kosong sekitar 10 GB untuk video pendek. RAM 16 GB dan SSD disarankan untuk 1080p berlapis. GPU opsional; kebutuhan sebenarnya meningkat bersama durasi/resolusi.\n\nDibangun dengan Electron, React, TypeScript, Vite, FFmpeg/FFprobe. Installer membawa runtime aplikasi; Node.js/npm hanya diperlukan saat membangun dari sumber.\n\nElectron: ${process.versions.electron}\nNode runtime: ${process.versions.node}\nChrome: ${process.versions.chrome}\nPlatform: ${process.platform} ${process.arch}`,
      about: `${config.appName} v${app.getVersion()}\n\nEditor konten video yang menyatukan playlist, overlay, teks, efek, visualizer, intro, sticker, dan metadata YouTube. Bulk Render memproses beberapa media dalam satu antrean.\n\nKendala? Hubungi 082220893828 dan sertakan versi serta detail Console Log.\n\n© 2026 Radist Ginola. All rights reserved.`,
    } as const;
    const key = String(topic) as keyof typeof titleMap;
    const parent = BrowserWindow.getFocusedWindow();
    const options = { type: 'info' as const, title: titleMap[key], message: messageMap[key], buttons: ['OK'] };
    if (parent) await dialog.showMessageBox(parent, options);
    else await dialog.showMessageBox(options);
  });

}
