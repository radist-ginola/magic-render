import { BrowserWindow } from 'electron';
import { stat } from 'node:fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApplicationConfig } from '../config/appConfig';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { RenderControlRequest, RenderProgress, RenderStatus } from '../../shared/domain/renderTypes';
import { assertProjectData } from './validation';
import { RenderOrchestrator } from '../services/render/renderOrchestrator';
import { YoutubeSeoService } from '../services/aiService/youtubeSeoService';
import { registerIpcHandler } from './loggedHandler';
import { settingsService } from './settingsHandlers';
import { logger } from '../utils/logger';
import { analyzeProjectBeat } from '../services/effects/beatAnalyzer';
import { detectGpu } from '../services/render/gpuDetection';

export function registerRenderIpcHandlers(config: ApplicationConfig, orchestrator = new RenderOrchestrator(config.runtime.ffmpegPath, config.runtime.ffprobePath)): void {
  registerIpcHandler(IPC_CHANNELS.EFFECT_ANALYZE_BEAT, (_event, project: unknown) => analyzeProjectBeat(assertProjectData(project), settingsService.get().ffmpegPath));
  const latestProgress = new Map<string, RenderProgress>();
  const generations = new Map<string, number>();
  const pendingStarts = new Map<string, number>();
  const broadcast = (progress: RenderProgress) => {
    latestProgress.set(progress.projectId, progress);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed?.() && !window.webContents.isDestroyed?.()) window.webContents.send(IPC_CHANNELS.RENDER_PROGRESS, progress);
    }
  };
  registerIpcHandler(IPC_CHANNELS.RENDER_GET_PROGRESS, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project ID tidak valid.');
    return latestProgress.get(projectId) ?? null;
  });
  registerIpcHandler(IPC_CHANNELS.RENDER_START, async (_event, project: unknown) => {
    const validProject = assertProjectData(project) as ProjectData;
    if (pendingStarts.has(validProject.projectId)) throw new Error('Permintaan render project ini masih diproses.');
    const configured = settingsService.get();
    let gpu: Awaited<ReturnType<typeof detectGpu>> = { name: 'GPU tidak terdeteksi', vramMb: null, encoder: null, available: false, message: '' };
    // CPU and speed are application render controls. A loaded project may
    // contain older snapshots of these settings.
    const renderProject: ProjectData = {
      ...validProject,
      settings: { ...validProject.settings, cpuLoadPercent: configured.cpuLoadPercent ?? validProject.settings.cpuLoadPercent, renderPreset: configured.renderPreset ?? validProject.settings.renderPreset, bitrateMode: configured.bitrateMode, gpuEncoder: undefined },
      youtubeSEO: { ...validProject.youtubeSEO, provider: configured.aiProvider ?? validProject.youtubeSEO.provider, model: configured.aiModel ?? validProject.youtubeSEO.model },
    };
    const seoService = new YoutubeSeoService(configured.ffmpegPath, configured.ffprobePath, { getAiCredentials: (provider) => settingsService.getAiCredentials(provider) });
    orchestrator.configureExecutables(configured.ffmpegPath, configured.ffprobePath);
    if (orchestrator.isBusy()) throw new Error('Proses render sebelumnya masih berjalan. Tekan Cancel untuk menghentikannya.');
    const generation = (generations.get(validProject.projectId) ?? 0) + 1;
    generations.set(validProject.projectId, generation);
    latestProgress.delete(validProject.projectId);
    pendingStarts.set(validProject.projectId, generation);
    broadcast({ projectId: validProject.projectId, status: 'idle', percent: 0, currentTimeSec: 0, totalDurationSec: 0, speedMultiplier: 0, elapsedRenderSec: 0, logLine: '[PERSIAPAN] Permintaan diterima oleh proses utama.', errorMessage: null });
    try {
    // CPU users need only the card name/VRAM for the completion dialog;
    // probing hardware encoders can launch FFmpeg and slow every render start.
    gpu = await detectGpu(configured.ffmpegPath, configured.renderDevice === 'gpu');
    if (generations.get(validProject.projectId) !== generation) throw new Error('Render direset.');
    if (configured.renderDevice === 'gpu' && !gpu.encoder) throw new Error(`GPU Mode belum siap: ${gpu.message} Pilih CPU atau gunakan FFmpeg dan driver yang mendukung.`);
    renderProject.settings.gpuEncoder = configured.renderDevice === 'gpu' ? gpu.encoder ?? undefined : undefined;
    const seoMode = validProject.youtubeSEO.mode ?? 'timestamp';
    if (seoMode === 'timestamp-seo') {
      if (!settingsService.getAiCredentials(renderProject.youtubeSEO.provider)) throw new Error('API key YouTube SEO belum dikonfigurasi di Settings.');
      if (!validProject.youtubeSEO.mainKeyword.split(',').some((keyword) => keyword.trim())) throw new Error('Topik atau keyword utama wajib diisi untuk mode Timestamp + YouTube SEO.');
    }
    let latestOutputPath = '';
    const result = await orchestrator.start(renderProject, (progress) => {
      if (progress.status === 'done' && progress.logLine.startsWith('Output tersedia: ')) {
        latestOutputPath = progress.logLine.slice('Output tersedia: '.length);
      }
      if (generations.get(validProject.projectId) === generation) broadcast(progress);
    });
    const outputPath = latestOutputPath || result.outputPath;
    // Create only the sidecar selected in the YouTube SEO workspace. The SEO
    // mode writes youtubeseo.txt in its own task; 'none' creates no .txt file.
    let timestampPath: string | undefined;
    if (seoMode === 'timestamp') {
      try {
        timestampPath = await seoService.generateTimestampOnly(renderProject, outputPath);
        logger.info('[PROSES] Berhasil membuat timestamp.txt dari durasi MP4 final.', { file: timestampPath });
      } catch (error) {
        logger.error('[PROSES] Pembuatan timestamp.txt gagal.', { message: error instanceof Error ? error.message : String(error), stage: 'metadata-output', action: 'Periksa akses folder output dan data playlist.' });
      }
    } else if (seoMode === 'none') {
      logger.info('[PROSES] Output metadata tambahan dinonaktifkan oleh pengguna.');
    }
    return { ...result, outputPath, timestampPath, fileSizeBytes: (await stat(outputPath)).size, renderDevice: configured.renderDevice, gpu };
    } catch (error) {
      if (generations.get(validProject.projectId) !== generation) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      const previous = latestProgress.get(validProject.projectId);
      if (previous?.status === 'cancelled') {
        logger.info('[RENDER] Render dibatalkan.', { projectId: validProject.projectId });
        throw error;
      }
      logger.error('[RENDER] Gagal memulai atau menjalankan render.', { projectId: validProject.projectId, message: detail });
      broadcast({ projectId: validProject.projectId, status: 'error', percent: previous?.percent ?? 0, currentTimeSec: previous?.currentTimeSec ?? 0, totalDurationSec: previous?.totalDurationSec ?? 0, speedMultiplier: 0, elapsedRenderSec: previous?.elapsedRenderSec ?? 0, logLine: detail, errorMessage: detail });
      throw error;
    } finally {
      if (pendingStarts.get(validProject.projectId) === generation) pendingStarts.delete(validProject.projectId);
    }
  });
  registerIpcHandler(IPC_CHANNELS.RENDER_CONTROL, async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') throw new Error('Render control request tidak valid.');
    const control = request as Partial<RenderControlRequest>;
    if (typeof control.projectId !== 'string' || !['pause','resume','cancel','reset'].includes(control.action ?? '')) throw new Error('Render control request tidak valid.');
    if (control.action === 'cancel' || control.action === 'reset') {
      generations.set(control.projectId, (generations.get(control.projectId) ?? 0) + 1);
      pendingStarts.delete(control.projectId);
      await orchestrator.reset(control.projectId);
      broadcast({ projectId: control.projectId, status: 'cancelled', percent: 0, currentTimeSec: 0, totalDurationSec: 0, speedMultiplier: 0, elapsedRenderSec: 0, logLine: 'Proses dibatalkan dan monitor dikosongkan. Siap untuk render baru.', errorMessage: null });
      return { accepted: true, status: 'cancelled' as RenderStatus };
    }
    let accepted = false;
    if (control.action === 'pause') accepted = orchestrator.pause(control.projectId, broadcast);
    else if (control.action === 'resume') accepted = orchestrator.resume(control.projectId);
    else accepted = orchestrator.cancel(control.projectId);
    const status: RenderStatus = accepted ? (control.action === 'pause' ? 'paused' : control.action === 'resume' ? 'compressing_video' : 'cancelled') : 'idle';
    return { accepted, status };
  });
}
