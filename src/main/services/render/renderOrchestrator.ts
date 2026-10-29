import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { ProjectSticker } from '../../../shared/domain/stickerTypes';
import type { RenderProgress, RenderStartResult, RenderStage, RenderStatus } from '../../../shared/domain/renderTypes';
import { MediaProbe } from '../media/mediaProbe';
import { validateMediaPath } from '../media/mediaValidator';
import { formatSpawnCommand } from '../ffmpegEngine/commandBuilder';
import type { SpawnCommand } from '../ffmpegEngine/commandBuilder';
import { FfmpegProcess } from '../ffmpegEngine/ffmpegRunner';
import { RenderArtifactRegistry } from './tempArtifactRegistry';
import { buildAudioCommand, buildComposedOutputCommand } from './renderCommandBuilder';
import { PlaylistService } from '../audio/playlistService';
import { logger } from '../../utils/logger';
import { translateFfmpegError, type TranslatedFfmpegError } from '../ffmpegEngine/errorTranslator';
import { validateCpuLoadPercent, describeCpuAllocation, getCpuAllocation } from '../cpuController';
import { CacheManager } from '../cache/cacheManager';
import { OutputService } from './outputService';
import { analyzeProjectBeat } from '../effects/beatAnalyzer';
import { DEFAULT_BEAT } from '../../../shared/domain/effectTypes';
import { bulkFastUnitSeconds, buildBulkCopyOutputCommand } from './bulkFastPath';
import { buildWindowsCompatibleOutputCommand, inspectFinalMp4 } from './outputService';
import { activeIntroMediaPath } from '../../../shared/domain/introTypes';

export type RenderEvent = RenderProgress;

class RenderPreparationError extends Error {}
class RenderStageError extends Error {
  constructor(readonly detail: TranslatedFfmpegError, readonly stage: RenderStage) {
    super(`${detail.title}: ${detail.message} ${detail.solution}`);
  }
}

async function withDeadline<T>(operation: Promise<T>, milliseconds: number, label: string, cancelSignal: Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new RenderPreparationError(`${label} tidak merespons dalam ${Math.max(1, Math.ceil(milliseconds / 1000))} detik. Periksa file sumber, Path FFprobe, atau pilih folder output lokal yang tersedia.`)), milliseconds);
      }),
      cancelSignal.then(() => { throw new Error('Render dibatalkan oleh pengguna.'); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

type ActiveRender = {
  projectId: string;
  process: FfmpegProcess;
  cancelled: boolean;
  abortController: AbortController;
  cancelSignal: Promise<void>;
  cancelSignalResolve: () => void;
  reset: boolean;
  paused: boolean;
  currentStatus: RenderStatus;
  resumePromise: Promise<void> | null;
  resumeResolve: (() => void) | null;
  lastProgress: { percent: number; currentTimeSec: number; totalDurationSec: number; speedMultiplier: number };
  lastMilestoneSec?: number;
  jobDir: string;
  startedAt: number;
  pauseStartedAt: number | null;
  pausedDurationMs: number;
  stoppedAt: number | null;
  onProgress: (event: RenderEvent) => void;
  stageOrder: RenderStage[];
  logBuffer: string[];
  logQueue: Promise<void>;
  logLastFlushAt: number;
};

export class RenderOrchestrator {
  private mediaProbe: MediaProbe;
  private playlistService: PlaylistService;
  private readonly active = new Map<string, ActiveRender>();
  private readonly availabilityWaiters = new Set<() => void>();
  private readonly cacheManager: CacheManager;
  private readonly outputService = new OutputService();

  constructor(
    private ffmpegExecutable: string,
    private ffprobeExecutable: string,
    private readonly tempRoot: string = path.join(app.getPath('temp'), 'MagicRenderPro'),
    private readonly preparationTimeoutMs = 20_000,
  ) {
    this.mediaProbe = new MediaProbe(ffprobeExecutable, this.preparationTimeoutMs);
    this.playlistService = new PlaylistService(ffprobeExecutable);
    this.cacheManager = new CacheManager(this.tempRoot);
  }

  configureExecutables(ffmpegExecutable: string, ffprobeExecutable: string): void {
    if (this.isBusy()) return; // Perubahan Setting digunakan pada render berikutnya.
    if (this.ffmpegExecutable === ffmpegExecutable && this.ffprobeExecutable === ffprobeExecutable) return;
    this.ffmpegExecutable = ffmpegExecutable;
    this.ffprobeExecutable = ffprobeExecutable;
    this.mediaProbe = new MediaProbe(ffprobeExecutable, this.preparationTimeoutMs);
    this.playlistService = new PlaylistService(ffprobeExecutable);
  }

  async start(project: ProjectData, onProgress: (event: RenderEvent) => void): Promise<RenderStartResult> {
    if (this.active.has(project.projectId)) throw new Error('Project ini sedang dalam proses render.');
    if (this.active.size > 0) throw new Error('Render lain sedang berjalan. Tunggu hingga selesai sebelum memulai render tunggal.');
    if (!project.mainMedia) throw new Error('Main media belum dipilih.');
    const cpuLoadPercent = validateCpuLoadPercent(project.settings.cpuLoadPercent);
    const allocation = getCpuAllocation(cpuLoadPercent);
    const stageOrder: RenderStage[] = [
      ...(project.playlistTracks?.length || project.playlist.files.length ? ['audio-management' as const] : []),
      'output',
    ];
    let cancelSignalResolve: () => void = () => {};
    const cancelSignal = new Promise<void>((resolve) => { cancelSignalResolve = resolve; });
    const active: ActiveRender = { projectId: project.projectId, process: new FfmpegProcess(cpuLoadPercent), cancelled: false, abortController: new AbortController(), cancelSignal, cancelSignalResolve, reset: false, paused: false, currentStatus: 'idle', resumePromise: null, resumeResolve: null, lastProgress: { percent: 0, currentTimeSec: 0, totalDurationSec: 0, speedMultiplier: 0 }, jobDir: '', startedAt: Date.now(), pauseStartedAt: null, pausedDurationMs: 0, stoppedAt: null, onProgress, stageOrder, logBuffer: [], logQueue: Promise.resolve(), logLastFlushAt: Date.now() };
    this.active.set(project.projectId, active);
    const startedAt = active.startedAt;
    let jobDir = '';
    let outputPath = '';
    let registry: RenderArtifactRegistry | null = null;
    let outputReady = false;
    try {
      this.preparationEvent(active, '[PERSIAPAN] Permintaan diterima. Membuat ruang kerja render.');
      jobDir = await this.prepareStep(active, 'Membuat folder sementara', this.cacheManager.createRenderJob(project.projectId));
      active.jobDir = jobDir;
      registry = new RenderArtifactRegistry(jobDir);
      await this.prepareStep(active, 'Membuka folder sementara', registry.ensureRoot());
      await this.prepareStep(active, 'Mempersiapkan file sementara', this.cacheManager.prepareArtifactDirectory(jobDir, 'render'));
      const outputDir = project.settings.outputDir || path.join(process.cwd(), 'output');
      const outputPlan = await this.prepareStep(active, `Memeriksa folder output ${outputDir}`, this.outputService.prepareOutputPath(outputDir, project.exportFileName?.trim() || project.name || 'Magic-Render-Pro', { extension: '.mp4', estimatedBytes: estimateOutputBytes(project) }));
      outputPath = outputPlan.outputPath;
      const renderLogPath = this.cacheManager.createArtifactPath(jobDir, 'log', 'render.log');
      registry.registerRenderArtifact(renderLogPath);
      this.cacheManager.assertProtectedFromCleanup(renderLogPath, outputPath, [project.mainMedia.path]);
      await this.prepareStep(active, 'Menulis log render', this.cacheManager.appendRenderLog(jobDir, 'Render dimulai: playlist audio, lalu satu encoding komposisi video final.'));
      logger.info(`[OUTPUT] Video hasil akan disimpan di: ${outputPath}`);
      logger.info(`[SISTEM] Target CPU FFmpeg ${allocation.cpuLoadPercent}%; ${allocation.ffmpegThreads} dari ${allocation.logicalCoreCount} inti logis.`);
      const mainPath = path.resolve(project.mainMedia.path);
      validateMediaPath(mainPath, project.mainMedia.type);
      const mainMetadata = await this.prepareStep(active, `Membaca durasi media utama ${path.basename(mainPath)}`, this.mediaProbe.probe(mainPath, active.abortController.signal));
      const sourceMainDuration = project.mainMedia.durationSeconds ?? mainMetadata.durationSeconds ?? (project.mainMedia.type === 'image' ? 3 : null);
      if (!sourceMainDuration || sourceMainDuration <= 0) throw new Error('Durasi main media tidak valid.');
      const playlistTrackCount = project.playlistTracks?.length ?? project.playlist.files.length;
      const playlistDuration = playlistTrackCount > 0 ? this.playlistService.getTotalDuration(project) : sourceMainDuration;
      if (playlistTrackCount > 0 && !(playlistDuration > 0)) throw new Error('Durasi total playlist tidak valid.');
      const introMediaPath = activeIntroMediaPath(project);
      const introDuration = introMediaPath ? (await this.prepareStep(active, `Membaca durasi intro ${path.basename(introMediaPath)}`, this.mediaProbe.probe(path.resolve(introMediaPath), active.abortController.signal))).durationSeconds ?? 3 : 0;
      // Playlist duration defines content-video duration. An enabled intro is
      // prepended to that content, so it increases the final video duration.
      const contentDuration = playlistTrackCount > 0 ? playlistDuration : sourceMainDuration;
      const targetDuration = contentDuration + introDuration;
      const mainDuration = Math.max(0.001, contentDuration);
      if (playlistTrackCount > 0) logger.info(`[PROSES] Total durasi gabungan lagu: ${formatDuration(playlistDuration)}.`);
      logger.info(`[PROSES] Durasi content video: ${formatDuration(contentDuration)}; intro: ${formatDuration(introDuration)}; total output: ${formatDuration(targetDuration)}.`);
      active.lastProgress.totalDurationSec = targetDuration;
      if (!active.paused && !active.cancelled) this.emit(onProgress, project.projectId, 'idle', 0, 0, targetDuration, 0, startedAt, `[PROSES] Total durasi video target: ${formatDuration(targetDuration)}.`, null);

      let audioPath: string | null = null;
      if (playlistTrackCount > 0) {
        audioPath = registry.registerRenderArtifact(path.join(jobDir, 'render', '01-playlist.aac'));
        const plan = this.playlistService.buildComposition(project);
        await this.executeStage({ stage: 'audio-management', status: 'processing_audio', label: '[PROSES] Menggabungkan MP3 dan memberi ruang untuk intro', command: buildAudioCommand(this.ffmpegExecutable, plan, audioPath, introDuration), durationSeconds: targetDuration, startedAt, onProgress, active });
        await this.waitIfPaused(active);
        if (active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
        logger.info(`[AUDIO] Playlist siap untuk durasi output ${formatDuration(targetDuration)}.`);
      }
      active.lastProgress.currentTimeSec = 0;
      active.lastProgress.speedMultiplier = 0;
      const hasBeatEffects = [...(project.mainMediaEffects ?? []), ...(project.particleEffectsEnabled !== false ? project.particleEffects ?? [] : [])].some((effect) => effect.beatSync);
      const beat = hasBeatEffects ? await this.prepareStep(active, 'Menganalisis ketukan audio', analyzeProjectBeat(project, this.ffmpegExecutable)) : DEFAULT_BEAT;
      if (hasBeatEffects) logger.info(`[EFEK] Tempo ${beat.bpm} BPM (${beat.source === 'audio' ? 'dianalisis dari audio' : 'cadangan, ketukan tidak terdeteksi'}).`);
      // A still sticker with a green screen does not need to be keyed on every
      // one of thousands of output frames. Cache one keyed RGBA PNG per job;
      // this copies its appearance but leaves the user's source untouched.
      const originalStickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
      const preparedStickers: ProjectSticker[] = [];
      for (const [index, sticker] of originalStickers.entries()) {
        const key = sticker.config.backgroundRemoval === 'chroma' ? sticker.config.chromaKey : sticker.config.colorKey;
        if (sticker.type !== 'image' || sticker.config.backgroundRemoval === 'none' || !key.enabled) { preparedStickers.push(sticker); continue; }
        const preparedPath = registry.registerRenderArtifact(path.join(jobDir, 'render', `sticker-key-${index}.png`));
        const hex = key.color.replace(/^0x/, '');
        const filters = `format=rgba,colorkey=${hex}:${Math.max(.00001,key.similarity)}:${key.blend},format=rgba`;
        this.preparationEvent(active, `[PERSIAPAN] Menyiapkan chroma sticker ${index + 1} satu kali`);
        for (;;) {
          await this.waitIfPaused(active);
          if (active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
          const result = await active.process.run({ executable: this.ffmpegExecutable, args: ['-y', '-i', sticker.path, '-vf', filters, '-frames:v', '1', '-pix_fmt', 'rgba', preparedPath] });
          if (result.interrupted && active.paused) continue;
          if (active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
          if (result.exitCode !== 0) throw new Error(`Chroma sticker gagal disiapkan: ${result.stderr.slice(-1200)}`);
          break;
        }
        preparedStickers.push({ ...sticker, path: preparedPath, config: { ...sticker.config, backgroundRemoval: 'none', chromaKey: { ...sticker.config.chromaKey, enabled: false }, colorKey: { ...sticker.config.colorKey, enabled: false } } });
      }
      const renderProject = preparedStickers.some((sticker, index) => sticker !== originalStickers[index])
        ? { ...project, stickerSubscribes: preparedStickers, stickerSubscribe: preparedStickers[0] ?? null } : project;
      const normalOutput = () => this.executeStage({
        stage: 'output' as const, status: 'compressing_video' as const, label: '[PROSES] Menyusun media, overlay, sticker dan intro; mengode video final',
        command: buildComposedOutputCommand(this.ffmpegExecutable, renderProject, outputPath, mainDuration, introDuration, audioPath, mainMetadata.hasAudioTrack, beat),
        durationSeconds: targetDuration, startedAt, onProgress, active,
      });
      const unit = audioPath ? bulkFastUnitSeconds(renderProject, sourceMainDuration, mainDuration) : null;
      if (unit !== null && audioPath) {
        const tilePath = registry.registerRenderArtifact(path.join(jobDir, 'render', '02-bulk-visual-unit.mp4'));
        try {
          logger.info(`[OPTIMASI] Bulk Render: unit visual ${unit.toFixed(2)} detik di-encode satu kali; sisa durasi memakai stream copy.`);
          this.preparationEvent(active, `[OPTIMASI] Jalur cepat dipilih: unit visual ${unit.toFixed(2)} detik, lalu stream copy hingga durasi playlist.`);
          await this.executeStage({ stage: 'output', status: 'compressing_video', label: '[PROSES] Mengode satu unit visual Bulk Render',
            command: buildComposedOutputCommand(this.ffmpegExecutable, renderProject, tilePath, unit, 0, null, false, beat),
            durationSeconds: unit, startedAt, onProgress, active, progressRange: { start: stageOrder.length === 1 ? 0 : 8, end: 55, complete: 55 }, monitorDurationSeconds: targetDuration });
          await this.executeStage({ stage: 'output', status: 'compressing_video', label: '[PROSES] Menggandakan unit visual dan menyatukan playlist tanpa encode ulang',
            command: buildBulkCopyOutputCommand(this.ffmpegExecutable, tilePath, audioPath, outputPath, mainDuration),
            durationSeconds: mainDuration, startedAt, onProgress, active, progressRange: { start: 55, end: 95, complete: 97 }, monitorDurationSeconds: targetDuration });
        } catch (fastError) {
          if (active.cancelled || active.paused) throw fastError;
          logger.warn('[OPTIMASI] Jalur cepat gagal; mencoba render normal sekali.', { message: String(fastError) });
          await fs.rm(outputPath, { force: true }).catch(() => undefined);
          await fs.rm(tilePath, { force: true }).catch(() => undefined);
          active.lastProgress = { percent: stageOrder.length === 1 ? 0 : 8, currentTimeSec: 0, totalDurationSec: targetDuration, speedMultiplier: 0 };
          this.preparationEvent(active, '[OPTIMASI] Jalur cepat tidak sesuai media ini. Mencoba jalur render normal.');
          await normalOutput();
        }
      } else {
        if (project.bulkItemId) this.preparationEvent(active, '[OPTIMASI] Jadwal/efek/intro membutuhkan komposisi sepanjang durasi; memakai satu encoding final.');
        await normalOutput();
      }

      // A successful FFmpeg exit is not sufficient by itself: verify that the
      // file can be parsed and is encoded in a Windows-friendly MP4 profile.
      // Only trigger the extra encode when validation finds a real problem.
      const expectedAudio = Boolean(audioPath) || (renderProject.mainMedia != null && mainMetadata.hasAudioTrack && !renderProject.mainMedia.autoMute);
      const outputAssessment = await inspectFinalMp4(
        this.ffprobeExecutable, outputPath, targetDuration, expectedAudio, active.abortController.signal,
      );
      if (!outputAssessment.compatible) {
        logger.warn('[OUTPUT] MP4 final belum lolos validasi kompatibilitas; menjalankan normalisasi H.264/AAC.', {
          projectId: project.projectId, reason: outputAssessment.reason,
        });
        this.preparationEvent(active, `[OUTPUT] Memeriksa kompatibilitas pemutar Windows: ${outputAssessment.reason}. Menormalkan MP4 final...`);
        const compatibilityPath = path.join(
          path.dirname(outputPath),
          `.${path.basename(outputPath, path.extname(outputPath))}.compat-${randomUUID()}.mp4`,
        );
        const backupPath = `${outputPath}.before-compat-${randomUUID()}.bak`;
        let outputMovedToBackup = false;
        try {
          await this.executeStage({
            stage: 'output', status: 'compressing_video',
            label: '[PROSES] Menormalkan MP4 untuk kompatibilitas pemutar Windows',
            command: buildWindowsCompatibleOutputCommand(this.ffmpegExecutable, outputPath, compatibilityPath),
            durationSeconds: targetDuration, startedAt, onProgress, active,
            progressRange: { start: 97, end: 99, complete: 99 }, monitorDurationSeconds: targetDuration,
          });
          const normalizedAssessment = await inspectFinalMp4(
            this.ffprobeExecutable, compatibilityPath, targetDuration, expectedAudio, active.abortController.signal,
          );
          if (!normalizedAssessment.compatible) {
            throw new Error(`Validasi MP4 tetap gagal setelah normalisasi: ${normalizedAssessment.reason}`);
          }
          await fs.rename(outputPath, backupPath);
          outputMovedToBackup = true;
          await fs.rename(compatibilityPath, outputPath);
          outputMovedToBackup = false;
          await fs.rm(backupPath, { force: true });
          logger.info('[OUTPUT] Normalisasi MP4 berhasil; H.264 yuv420p, AAC bila diperlukan, dan faststart telah diverifikasi.', {
            projectId: project.projectId, durationSeconds: normalizedAssessment.durationSeconds, sizeBytes: normalizedAssessment.sizeBytes,
          });
        } catch (error) {
          if (outputMovedToBackup) {
            try {
              await fs.rename(backupPath, outputPath);
              outputMovedToBackup = false;
            } catch (restoreError) {
              logger.error('[OUTPUT] Pemulihan MP4 sebelum normalisasi gagal; file cadangan dipertahankan.', {
                projectId: project.projectId, backupPath, message: String(restoreError),
              });
            }
          }
          throw error;
        } finally {
          await fs.rm(compatibilityPath, { force: true }).catch(() => undefined);
          if (!outputMovedToBackup) await fs.rm(backupPath, { force: true }).catch(() => undefined);
        }
      } else {
        logger.info('[OUTPUT] Validasi MP4 final lulus.', {
          projectId: project.projectId, durationSeconds: outputAssessment.durationSeconds,
          videoCodec: outputAssessment.videoCodec, pixelFormat: outputAssessment.pixelFormat,
          audioCodec: outputAssessment.audioCodec, formatName: outputAssessment.formatName,
        });
      }

      outputReady = true;
      return { projectId: project.projectId, outputPath, status: 'done' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A forced reset can detach a blocked job before it finishes. If a new
      // job has claimed the same destination, the old job must not delete it.
      if (outputPath && (!active.reset || !this.active.has(project.projectId) || this.active.get(project.projectId) === active)) {
        await fs.rm(outputPath, { force: true }).catch(() => undefined);
      }
      if (active.cancelled) {
        if (!active.reset) this.emit(onProgress, project.projectId, 'cancelled', active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, 0, startedAt, 'Render dibatalkan.', null);
        throw new Error('Render dibatalkan oleh pengguna.');
      }
      if (error instanceof RenderPreparationError || /FFprobe/i.test(message)) {
        logger.error('[PERSIAPAN] Render gagal sebelum FFmpeg dimulai.', { projectId: project.projectId, message });
        this.emit(onProgress, project.projectId, 'error', active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, 0, startedAt, message, message);
        throw error;
      }
      const translated = error instanceof RenderStageError ? error.detail : translateFfmpegError(message, { stderr: message });
      logger.error('Render job failed.', { projectId: project.projectId, message, stage: error instanceof RenderStageError ? error.stage : undefined, code: translated.code });
      this.emit(onProgress, project.projectId, 'error', active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, active.lastProgress.speedMultiplier, startedAt, `[KESALAHAN] ${translated.title}: ${translated.message}`, `${translated.message} ${translated.solution}`);
      throw error instanceof RenderStageError ? error : new Error(`${translated.title}: ${translated.message} ${translated.solution}`);
    } finally {
      this.flushLog(active);
      await active.logQueue;
      if (registry) await registry.cleanup().catch((error) => logger.warn('Pembersihan artifact render gagal.', { message: String(error) }));
      if (jobDir) { const cleanup = await this.cacheManager.cleanupJob(jobDir).catch((error) => { logger.warn('Pembersihan cache render gagal.', { message: String(error) }); return null; }); if (cleanup && cleanup.failed.length === 0 && cleanup.removed.length > 0) logger.info(`[SISTEM] File temporary render berhasil dibersihkan (${cleanup.removed.length} item).`); }
      if (outputReady && !active.cancelled && !active.reset) this.emit(onProgress, project.projectId, 'done', 100, active.lastProgress.totalDurationSec, active.lastProgress.totalDurationSec, 0, startedAt, `Output tersedia: ${outputPath}`, null);
      if (this.active.get(project.projectId) === active) this.active.delete(project.projectId);
      if (this.active.size === 0) {
        const waiters = [...this.availabilityWaiters];
        this.availabilityWaiters.clear();
        waiters.forEach((resolve) => resolve());
      }
    }
  }

  pause(projectId: string, onProgress: (event: RenderEvent) => void): boolean {
    const active = this.active.get(projectId);
    if (!active || active.paused || active.cancelled) return false;
    active.paused = true;
    active.pauseStartedAt = Date.now();
    active.resumePromise = new Promise<void>((resolve) => { active.resumeResolve = resolve; });
    active.process.interrupt();
    this.emit(onProgress, projectId, 'paused', active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, 0, active.startedAt, 'Render dijeda. Tahap yang sedang berjalan akan dimulai ulang saat dilanjutkan.', null);
    return true;
  }

  resume(projectId: string): boolean {
    const active = this.active.get(projectId);
    if (!active || !active.paused || !active.resumeResolve) return false;
    if (active.pauseStartedAt !== null) active.pausedDurationMs += Date.now() - active.pauseStartedAt;
    active.pauseStartedAt = null;
    active.paused = false;
    const resolve = active.resumeResolve;
    active.resumeResolve = null;
    active.resumePromise = null;
    this.emit(active.onProgress, projectId, active.currentStatus, active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, 0, active.startedAt, 'Render dilanjutkan. Menyiapkan ulang tahap yang dijeda...', null);
    resolve();
    return true;
  }

  cancel(projectId: string): boolean {
    const active = this.active.get(projectId);
    if (!active || active.cancelled) return false;
    active.cancelled = true;
    active.abortController.abort();
    active.cancelSignalResolve();
    active.stoppedAt = active.pauseStartedAt ?? Date.now();
    if (active.resumeResolve) { active.resumeResolve(); active.resumeResolve = null; active.resumePromise = null; }
    active.process.forceStop();
    this.emit(active.onProgress, projectId, 'cancelled', active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, 0, active.startedAt, 'Render dibatalkan.', null);
    return true;
  }

  async reset(projectId: string): Promise<void> {
    const active = this.active.get(projectId);
    if (!active) return;
    active.reset = true;
    this.cancel(projectId);
    active.process.forceStop();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.waitForAvailability(),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, 3000); }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (this.active.get(projectId) === active) {
      this.active.delete(projectId);
      if (this.active.size === 0) {
        const waiters = [...this.availabilityWaiters];
        this.availabilityWaiters.clear();
        waiters.forEach((resolve) => resolve());
      }
    }
  }

  cancelAll(): void {
    for (const projectId of this.active.keys()) this.cancel(projectId);
  }

  activeJobDirectories(): string[] {
    return [...this.active.values()].map((job) => job.jobDir).filter(Boolean);
  }

  isRunning(projectId: string): boolean {
    return this.active.has(projectId);
  }

  isBusy(): boolean {
    return this.active.size > 0;
  }

  waitForAvailability(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise<void>((resolve) => this.availabilityWaiters.add(resolve));
  }

  private async executeStage(input: {
    stage: RenderStage;
    status: RenderStatus;
    label: string;
    command: SpawnCommand;
    durationSeconds: number;
    startedAt: number;
    onProgress: (event: RenderEvent) => void;
    active: ActiveRender;
    progressRange?: { start: number; end: number; complete: number };
    monitorDurationSeconds?: number;
  }): Promise<void> {
    if (input.active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
    input.active.currentStatus = input.status;
    const formattedCommand = formatSpawnCommand(input.command);
    logger.info('FFmpeg stage started.', { projectId: input.active.projectId, stage: input.stage, command: formattedCommand });
    this.trackLog(input.active, `Stage ${input.stage} started: ${formattedCommand}`);
    if (!input.active.paused) this.emit(input.onProgress, input.active.projectId, input.status, input.active.lastProgress.percent, input.active.lastProgress.currentTimeSec, input.durationSeconds, input.active.lastProgress.speedMultiplier, input.startedAt, `Perintah FFmpeg: ${input.label.replace(/^\[[^\]]+\]\s*/, '')} dengan konfigurasi video proyek.`, null);
    for (;;) {
    await this.waitIfPaused(input.active);
    if (input.active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
    const stageStartedAt = Date.now();
    const result = await input.active.process.run(input.command, {
      onOutput: (line) => {
        this.trackLog(input.active, line);
        // FFmpeg's machine-readable progress pairs are consumed by onProgress below.
        // Forwarding every pair to React flooded the Console Log and replaced its status text.
        // Detail teknis tetap disimpan pada log pekerjaan; monitor menampilkan
        // perintah dan perkembangan yang sudah dijelaskan dalam bahasa pengguna.
      },
      onProgress: (parsed) => {
        if (parsed.progress === null || parsed.outTimeSec === null || input.active.paused || input.active.cancelled) return;
        const local = Math.min(1, Math.max(0, parsed.outTimeSec / input.durationSeconds));
        const weight = input.active.stageOrder.length === 1 ? 1 : input.stage === 'audio-management' ? 0.08 : 0.92;
        const offset = input.active.stageOrder.length === 1 || input.stage === 'audio-management' ? 0 : 0.08;
        const percent = Math.min(95, Math.max(input.active.lastProgress.percent, input.progressRange ? input.progressRange.start + local * (input.progressRange.end - input.progressRange.start) : (offset + local * weight) * 95));
        const current = Math.min(input.durationSeconds,parsed.outTimeSec);
        input.active.lastProgress = { percent, currentTimeSec: current, totalDurationSec: input.monitorDurationSeconds ?? input.durationSeconds, speedMultiplier: parsed.speedMultiplier ?? current / Math.max(0.01, (Date.now() - stageStartedAt) / 1000) };
        const milestone = Math.floor(current / 5) * 5;
        if (milestone > 0 && milestone !== (input.active as ActiveRender & { lastMilestoneSec?: number }).lastMilestoneSec) {
          (input.active as ActiveRender & { lastMilestoneSec?: number }).lastMilestoneSec = milestone;
          logger.info(`[RENDER] Sedang memproses bagian video pada ${formatDuration(current)} / ${formatDuration(input.durationSeconds)}.`);
        }
        const finalizing = input.stage === 'output' && local >= .995;
        this.emit(input.onProgress, input.active.projectId, input.status, percent, current, input.monitorDurationSeconds ?? input.durationSeconds, input.active.lastProgress.speedMultiplier, input.startedAt, finalizing ? '[PROSES] Durasi video tercapai. Menunggu FFmpeg menyelesaikan tahap dan menutup berkas MP4...' : `${input.label} • ${formatDuration(current)} / ${formatDuration(input.durationSeconds)} • ${percent.toFixed(1)}% • ${input.active.lastProgress.speedMultiplier.toFixed(2)}×`, null);
      },
    });
    if (result.cancelled || input.active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
    if (result.interrupted) {
      await this.waitIfPaused(input.active);
      if (input.active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
      const basePercent = input.progressRange?.start ?? (input.active.stageOrder.length === 1 || input.stage === 'audio-management' ? 0 : 8);
      input.active.lastProgress = { percent: basePercent, currentTimeSec: 0, totalDurationSec: input.monitorDurationSeconds ?? input.durationSeconds, speedMultiplier: 0 };
      this.emit(input.onProgress, input.active.projectId, input.status, basePercent, 0, input.monitorDurationSeconds ?? input.durationSeconds, 0, input.startedAt, 'FFmpeg memulai ulang tahap yang dijeda. Progres tahap dihitung dari awal.', null);
      continue;
    }
    if (result.exitCode !== 0) {
      const translated = translateFfmpegError(result.stderr || `FFmpeg gagal pada stage ${input.stage}. Exit code ${result.exitCode}`, { stage: input.stage, stderr: result.stderr, exitCode: result.exitCode });
      logger.error('FFmpeg stage failed.', { projectId: input.active.projectId, stage: input.stage, code: translated.code, raw: result.stderr });
      throw new RenderStageError(translated, input.stage);
    }
    const stageEndPercent = input.progressRange?.complete ?? (input.stage === 'audio-management' ? 7.6 : 97);
    input.active.lastProgress.percent = stageEndPercent;
    if (!input.active.paused && !input.active.cancelled) this.emit(input.onProgress, input.active.projectId, input.status, stageEndPercent, input.durationSeconds, input.monitorDurationSeconds ?? input.durationSeconds, 0, input.startedAt, input.progressRange && stageEndPercent < 95 ? '[PROSES] Unit visual siap. Menyatukan video dengan playlist...' : input.stage === 'output' ? '[PROSES] Encoding selesai. Merapikan berkas sementara dan memeriksa hasil...' : `${input.label} selesai.`, null);
    logger.info('FFmpeg stage completed.', { projectId: input.active.projectId, stage: input.stage });
    break;
    }
  }

  private trackLog(active: ActiveRender, line: string): void {
    active.logBuffer.push(line);
    if (active.logBuffer.length >= 40 || Date.now() - active.logLastFlushAt >= 1000) this.flushLog(active);
  }

  private flushLog(active: ActiveRender): void {
    if (!active.logBuffer.length || !active.jobDir) return;
    const lines = active.logBuffer.splice(0).join('\n');
    active.logLastFlushAt = Date.now();
    active.logQueue = active.logQueue.then(() => this.cacheManager.appendRenderLog(active.jobDir, lines)).then(() => undefined).catch(() => undefined);
  }

  private preparationEvent(active: ActiveRender, message: string): void {
    logger.info(message);
    if (!active.paused && !active.cancelled) this.emit(active.onProgress, active.projectId, 'idle', active.lastProgress.percent, active.lastProgress.currentTimeSec, active.lastProgress.totalDurationSec, 0, active.startedAt, message, null);
  }

  private async prepareStep<T>(active: ActiveRender, label: string, operation: Promise<T>): Promise<T> {
    if (active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
    this.preparationEvent(active, `[PERSIAPAN] ${label}...`);
    try {
      const result = await withDeadline(operation, this.preparationTimeoutMs, label, active.cancelSignal);
      if (active.cancelled) throw new Error('Render dibatalkan oleh pengguna.');
      return result;
    } catch (error) {
      if (active.cancelled) throw error;
      if (error instanceof RenderPreparationError) throw error;
      throw new RenderPreparationError(`${label} gagal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async waitIfPaused(active: ActiveRender): Promise<void> {
    while (active.paused && !active.cancelled) await active.resumePromise;
  }

  private emit(
    callback: (event: RenderEvent) => void,
    projectId: string,
    status: RenderStatus,
    percent: number,
    currentTimeSec: number,
    totalDurationSec: number,
    speedMultiplier: number,
    startedAt: number,
    logLine: string,
    errorMessage: string | null,
  ): void {
    const active = this.active.get(projectId);
    callback({ projectId, status, percent: Math.max(0, Math.min(100, percent)), currentTimeSec, totalDurationSec, speedMultiplier, elapsedRenderSec: active ? this.elapsedSeconds(active) : (Date.now() - startedAt) / 1000, logLine, errorMessage });
  }

  private elapsedSeconds(active: ActiveRender): number {
    const now = active.stoppedAt ?? active.pauseStartedAt ?? Date.now();
    return Math.max(0, (now - active.startedAt - active.pausedDurationMs) / 1000);
  }

}

function estimateOutputBytes(project: ProjectData): number {
  const playlistDuration = project.playlistTracks?.reduce((sum, track) => sum + Math.max(0, track.durationSeconds ?? 0), 0) ?? 0;
  const duration = playlistDuration > 0 ? playlistDuration : (project.mainMedia?.durationSeconds ?? 60);
  return Math.ceil(duration * project.settings.bitrateKbps * 1000 / 8 * 1.15);
}

function formatDuration(seconds: number): string { const total = Math.max(0, Math.floor(seconds)); const h=Math.floor(total/3600); const m=Math.floor((total%3600)/60); const s=total%60; return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
