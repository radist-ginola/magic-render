import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApplicationConfig } from '../config/appConfig';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { AiProvider, YoutubeSeoGenerateRequest } from '../../shared/domain/aiTypes';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { YoutubeSeoService } from '../services/aiService/youtubeSeoService';
import { assertAllowedString, assertProjectData } from './validation';
import { settingsService } from './settingsHandlers';
import { normalizeSeoContext } from '../services/aiService/seoContext';
import { registerIpcHandler } from './loggedHandler';
import { showOpenDialog } from './dialogHelper';

export function registerSeoIpcHandlers(config: ApplicationConfig): void {
  const getService = () => new YoutubeSeoService(config.runtime.ffmpegPath, config.runtime.ffprobePath, settingsService);
  registerIpcHandler(IPC_CHANNELS.SEO_CHOOSE_VIDEO, async () => {
    const result = await showOpenDialog({ title: 'Pilih video hasil render untuk YouTube SEO', properties: ['openFile'], filters: [{ name: 'Video final', extensions: ['mp4', 'mov', 'mkv', 'webm'] }] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  registerIpcHandler(IPC_CHANNELS.SEO_CHOOSE_MEDIA, async () => {
    const result = await showOpenDialog({ title: 'Pilih gambar atau video untuk analisis AI', properties: ['openFile'], filters: [{ name: 'Gambar dan Video', extensions: ['png','jpg','jpeg','mp4','mov','mkv','webm'] }] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  registerIpcHandler(IPC_CHANNELS.SEO_CONFIGURE, async (_event, provider: unknown, model: unknown, apiKey: unknown) => {
    if (!['openai', 'gemini', 'openrouter', 'groq', 'mistral', 'ollama'].includes(String(provider))) throw new Error('Provider AI tidak valid.');
    assertAllowedString(model, 'AI model', 200);
    assertAllowedString(apiKey, 'API key', 10000);
    const result = await settingsService.configureAi(provider as AiProvider, model as string, apiKey as string);
    return { saved: result.saved };
  });
  registerIpcHandler(IPC_CHANNELS.SEO_CLEAR_CREDENTIAL, (_event, provider: unknown) => {
    if (!['openai', 'gemini', 'openrouter', 'groq', 'mistral', 'ollama'].includes(String(provider))) throw new Error('Provider AI tidak valid.');
    getService().clear(provider as AiProvider);
    return { cleared: true };
  });
  registerIpcHandler(IPC_CHANNELS.SEO_STATUS, async (_event, provider: unknown, model: unknown) => {
    if (!['openai', 'gemini', 'openrouter', 'groq', 'mistral', 'ollama'].includes(String(provider))) throw new Error('Provider AI tidak valid.');
    assertAllowedString(model, 'AI model', 200);
    return getService().checkStatus(provider as AiProvider, model as string);
  });
  registerIpcHandler(IPC_CHANNELS.SEO_GENERATE, async (_event, project: unknown, outputPath: unknown) => {
    const validProject = assertProjectData(project) as ProjectData;
    if (outputPath !== undefined && outputPath !== null) assertAllowedString(outputPath, 'Output path', 32767);
    assertAllowedString(validProject.youtubeSEO.mainKeyword, 'Main Keyword', 500);
    normalizeSeoContext(validProject.youtubeSEO.context);
    if (!validProject.youtubeSEO.mainKeyword.split(',').some((value) => value.trim())) throw new Error('Isi topik atau keyword utama untuk YouTube SEO.');
    if ((validProject.youtubeSEO.mode ?? 'timestamp') !== 'timestamp-seo') throw new Error('Pilih Opsi 2 untuk menghasilkan YouTube SEO.');
    const selectedOutput = typeof outputPath === 'string' ? path.resolve(outputPath) : undefined;
    if (selectedOutput && !(await fs.stat(selectedOutput).catch(() => null))?.isFile()) throw new Error('Video hasil render belum ditemukan.');
    const settings = settingsService.get();
    const credential = settingsService.getAiCredentials(settings.aiProvider);
    if (!credential) throw new Error('API key belum tersimpan di Settings AI.');
    const request: YoutubeSeoGenerateRequest = { projectId: validProject.projectId, project: { ...validProject, youtubeSEO: { ...validProject.youtubeSEO, provider: settings.aiProvider, model: settings.aiModel } }, outputPath: selectedOutput, mainKeyword: validProject.youtubeSEO.mainKeyword, provider: settings.aiProvider, model: settings.aiModel, writeTimestampSidecar: false };
    const result = await getService().generate(request);
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.SEO_RESULT, { projectId: validProject.projectId, ...result });
    return result;
  });
}
