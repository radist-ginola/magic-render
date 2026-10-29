import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { app } from 'electron';
import { DEFAULT_DEV_SERVER_URL, DEFAULT_FFMPEG_RELATIVE_PATH, DEFAULT_WINDOWS_FFMPEG_PATH, DEFAULT_WINDOWS_FFPROBE_PATH } from '../../shared/app';

dotenv.config({ override: false });

type AppEnvironment = 'development' | 'production';

function readEnvironment(value: string | undefined, defaultEnvironment: AppEnvironment): AppEnvironment {
  if (!value) return defaultEnvironment;
  return value.toLowerCase() === 'production' ? 'production' : 'development';
}

export type RuntimeConfig = {
  environment: AppEnvironment;
  isDevelopment: boolean;
  devServerUrl: string;
  ffmpegPath: string;
  ffprobePath: string;
};

export function createRuntimeConfig(): RuntimeConfig {
  // A packaged installer must never try to load the Vite development server.
  const environment = app.isPackaged ? 'production' : readEnvironment(process.env.MAGIC_RENDER_ENV, 'development');
  const devServerUrl = process.env.MAGIC_RENDER_DEV_SERVER_URL?.trim() || DEFAULT_DEV_SERVER_URL;
  const customFfmpegPath = process.env.MAGIC_RENDER_FFMPEG_PATH?.trim();
  const developmentFfmpegRoot = path.resolve(process.cwd(), 'resources', DEFAULT_FFMPEG_RELATIVE_PATH);
  const packagedFfmpegRoot = path.join(process.resourcesPath, DEFAULT_FFMPEG_RELATIVE_PATH);
  const developmentFfmpegPath = fs.existsSync(developmentFfmpegRoot) ? developmentFfmpegRoot
    : process.platform === 'win32' && fs.existsSync(DEFAULT_WINDOWS_FFMPEG_PATH) ? DEFAULT_WINDOWS_FFMPEG_PATH : 'ffmpeg';
  const ffmpegPath = customFfmpegPath || (app.isPackaged ? packagedFfmpegRoot : developmentFfmpegPath);
  const customFfprobePath = process.env.MAGIC_RENDER_FFPROBE_PATH?.trim();
  const siblingFfprobe = path.join(path.dirname(ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  const ffprobePath = customFfprobePath || (app.isPackaged ? path.join(path.dirname(packagedFfmpegRoot), 'ffprobe.exe')
    : fs.existsSync(siblingFfprobe) ? siblingFfprobe
      : process.platform === 'win32' && fs.existsSync(DEFAULT_WINDOWS_FFPROBE_PATH) ? DEFAULT_WINDOWS_FFPROBE_PATH : 'ffprobe');

  return {
    environment,
    isDevelopment: environment === 'development',
    devServerUrl,
    ffmpegPath,
    ffprobePath,
  };
}
