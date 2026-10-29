import path from 'node:path';
import { analyzeRandomPlaylistTrack } from './audioTrackAnalyzer';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { AiCredentialsStatus, AiProvider, Keyframe, YoutubeSeoGenerateRequest, YoutubeSeoResult } from '../../../shared/domain/aiTypes';
import { AiCredentialStore } from './aiCredentialStore';
import { KeyframeExtractor } from './keyframeExtractor';
import { normalizeSeoContext } from './seoContext';
import { buildAnalysisPrompt, parseAnalysisResponse, buildProductionPrompt, parseProductionResponse, buildTitleRepairPrompt, parseTitleRepairCandidates, fitTitleLengths, validateSeoTitles, seoTitleCase } from './seoPipeline';
import { analysisSignature, loadAnalysis, saveAnalysis } from './seoAnalysisCache';
import { AiProviderHttpError, AiProviderOutputError, generateMultimodal, validateProvider } from './aiProviderClient';
import { buildReadyDescription, writeYoutubeSeoText } from './seoFileWriter';
import { buildRelevantTags } from './seoTags';
import { buildYoutubeTimestampText, writeYoutubeTimestampText, youtubeTimestampPath } from './timestampGenerator';
import { PlaylistService } from '../audio/playlistService';
import { MediaProbe } from '../media/mediaProbe';
import { logger } from '../../utils/logger';
import { loadSeoPromptFramework } from './seoPromptFramework';
import { activeIntroMediaPath } from '../../../shared/domain/introTypes';

type AiCredentialProvider = { getAiCredentials: (provider: AiProvider) => { model: string; apiKey: string } | null };

export class YoutubeSeoService {
  private readonly credentials = new AiCredentialStore();
  private readonly keyframeExtractor: KeyframeExtractor;
  private readonly playlistService: PlaylistService;
  private readonly mediaProbe: MediaProbe;

  constructor(private readonly ffmpegExecutable: string, private readonly ffprobeExecutable: string, private readonly globalCredentials?: AiCredentialProvider) {
    this.keyframeExtractor = new KeyframeExtractor(ffmpegExecutable);
    this.playlistService = new PlaylistService(ffprobeExecutable);
    this.mediaProbe = new MediaProbe(ffprobeExecutable);
  }

  configure(provider: AiProvider, model: string, apiKey: string): void { this.credentials.set(provider, model, apiKey); }
  clear(provider: AiProvider): void { this.credentials.clear(provider); }
  getStored(provider: AiProvider): { model: string; apiKey: string } | null { return this.credentials.get(provider); }

  async checkStatus(provider: AiProvider, model: string): Promise<AiCredentialsStatus> {
    const credentials = this.globalCredentials?.getAiCredentials(provider) ?? this.credentials.get(provider);
    if (!credentials) return { provider, model, configured: false, valid: false, checkedAt: null, message: 'API key belum dikonfigurasi.' };
    const checkedAt = new Date().toISOString();
    try {
      await validateProvider(provider, model || credentials.model, credentials.apiKey);
      return { provider, model: model || credentials.model, configured: true, valid: true, checkedAt, message: 'Provider siap digunakan.' };
    } catch (error) {
      return { provider, model: model || credentials.model, configured: true, valid: false, checkedAt, message: error instanceof Error ? error.message : String(error) };
    }
  }


  async generateTimestampOnly(project: ProjectData, outputPath: string): Promise<string> {
    const finalDuration = await this.getFinalDuration(path.resolve(outputPath), project);
    const introDurationSeconds = await this.getIntroDuration(project);
    const audioPlan = this.playlistService.getTracks(project).length > 0
      ? this.playlistService.buildComposition(project)
      : null;
    return writeYoutubeTimestampText({ project, finalDurationSeconds: finalDuration, outputVideoPath: path.resolve(outputPath), introDurationSeconds, audioPlan });
  }

  async generate(request: YoutubeSeoGenerateRequest): Promise<YoutubeSeoResult> {
    const generationStartedAt = Date.now();
    const credentials = request.apiKey?.trim() ? { model: request.model, apiKey: request.apiKey.trim() } : (this.globalCredentials?.getAiCredentials(request.provider) ?? this.credentials.get(request.provider));
    if (!credentials) throw new Error(`API key ${request.provider} belum dikonfigurasi.`);
    const model = request.model.trim() || credentials.model;
    const apiKey = credentials.apiKey;
    const outputDir = path.resolve(request.project.settings.outputDir || request.project.projectDir);
    const outputPath = request.outputPath ? path.resolve(request.outputPath) : path.join(outputDir, 'seo-output-reference.mp4');
    const context = normalizeSeoContext(request.project.youtubeSEO.context);
    if (!request.mainKeyword.split(',').some((keyword) => keyword.trim())) throw new Error('Isi satu atau lebih topik/keyword utama pada menu YouTube SEO.');
    if (request.project.youtubeSEO.customPromptEnabled && !(request.project.youtubeSEO.customPrompt ?? '').trim()) throw new Error('Prompt khusus SEO aktif tetapi belum diisi. Isi prompt atau matikan opsi prompt khusus.');
    const contentType = context.contentType ?? 'Musik';
    const sourcePath = request.project.youtubeSEO.analysisSource === 'manual' ? request.project.youtubeSEO.analysisMediaPath : request.project.mainMedia?.path;
    if (!sourcePath) throw new Error(request.project.youtubeSEO.analysisSource === 'manual' ? 'Pilih gambar atau video untuk analisis manual.' : 'Import media utama untuk analisis YouTube SEO.');
    const selectedMedia = path.resolve(sourcePath);
    if (!/\.(png|jpe?g|mp4|mov|mkv|webm)$/i.test(selectedMedia)) throw new Error('Analisis SEO hanya mendukung PNG, JPG, MP4, MOV, MKV, atau WEBM.');
    const framework = await loadSeoPromptFramework();
    const playlistTracks = this.playlistService.getPlaybackOrder(request.project);
    // Analyze one randomized song excerpt for every SEO generation when the
    // project has playlist tracks. The spectrogram is attached to the same AI
    // multimodal analysis request as the visual keyframes so metadata can be
    // cross-checked against both sources instead of relying on filename alone.
    const sampledAudio = playlistTracks.length
      ? await analyzeRandomPlaylistTrack(this.ffmpegExecutable, this.ffprobeExecutable, playlistTracks)
      : null;
    const audioEvidence = sampledAudio ? JSON.stringify({
      selectedPlaylistFile: sampledAudio.trackName,
      note: 'Filename is source metadata, not confirmation of official song title or artist.',
      audioFormat: sampledAudio.formatName,
      durationSeconds: Number(sampledAudio.durationSeconds.toFixed(2)),
      analyzedSegmentStartSeconds: Number(sampledAudio.sampleStartSec.toFixed(2)),
      analyzedSegmentDurationSeconds: Number(sampledAudio.sampleDurationSec.toFixed(2)),
      method: 'FFmpeg logarithmic frequency spectrogram of a random excerpt',
    }) : '';
    const signature = await analysisSignature(selectedMedia, request.mainKeyword, JSON.stringify({ contentType, country: context.targetCountry ?? 'US', language: context.targetLanguage ?? 'English (US)', nicheGenre: context.nicheGenre ?? '', promptHash: createHash('sha256').update(framework).digest('hex'), audioTrack: sampledAudio ? { name: sampledAudio.trackName, start: sampledAudio.sampleStartSec, duration: sampledAudio.sampleDurationSec } : null }), request.provider, model);
    const audioPlan = playlistTracks.length > 0 ? this.playlistService.buildComposition(request.project) : null;
    const introDurationSeconds = await this.getIntroDuration(request.project);
    const outputDuration = request.outputPath ? await this.getFinalDuration(outputPath, request.project)
      : (audioPlan?.totalDurationSeconds ?? request.project.mainMedia?.durationSeconds ?? 0) + introDurationSeconds;
    async function runStage<T>(label: string, prompt: string, frames: Keyframe[], parse: (text: string) => T): Promise<T> {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const answer = await generateMultimodal(request.provider, model, apiKey, prompt, frames, attempt === 1 ? 6500 : 9000);
          return parse(answer.text);
        } catch (error) {
          const transient = error instanceof AiProviderHttpError && error.status >= 500 && error.status < 600;
          const malformed = error instanceof AiProviderOutputError ? error.retryable : error instanceof Error && !(error instanceof AiProviderHttpError);
          if (attempt === 2 || (!transient && !malformed)) throw error;
          logger.info(`[AI SEO] ${label} belum lengkap. Mengulangi tahap ini satu kali.`);
          if (transient) await new Promise((resolve) => setTimeout(resolve, 700));
          else if (!(error instanceof AiProviderOutputError)) prompt += `\nPrevious output did not meet the requested schema: ${error instanceof Error ? error.message : String(error)}. Return complete JSON and the exact counts.`;
        }
      }
      throw new Error(`${label} gagal divalidasi.`);
    }
    let analysis = sampledAudio ? null : await loadAnalysis(request.project.projectDir, signature);
    if (analysis) logger.info('[AI SEO] Analisis media yang sama dipakai ulang; satu permintaan AI dan unggahan frame dihemat.');
    else {
      logger.info(`[AI SEO] Mengambil cuplikan dari ${request.project.youtubeSEO.analysisSource === 'manual' ? 'media unggahan manual' : 'media utama'}.`);
      const selectedVideo = /\.(mp4|mov|mkv|webm)$/i.test(selectedMedia);
      // Use FFprobe's current file duration rather than stale project metadata so
      // sampled timestamps never seek past the end of a replaced/trimmed source.
      const duration = selectedVideo ? (await this.mediaProbe.probe(selectedMedia)).durationSeconds ?? 0 : undefined;
      const keyframes = await this.keyframeExtractor.extract(request.project, selectedMedia, duration);
      logger.info(sampledAudio ? `[AI SEO] Menganalisis cuplikan acak ${sampledAudio.trackName} (${sampledAudio.sampleStartSec.toFixed(1)}–${(sampledAudio.sampleStartSec + sampledAudio.sampleDurationSec).toFixed(1)} dtk) bersama frame visual.` : '[AI SEO] Tidak ada playlist audio; analisis hanya menggunakan bukti visual yang tersedia.');
      logger.info('[AI SEO] Tahap 1/2: menganalisis bukti visual dan, jika tersedia, spektrogram satu lagu playlist acak.');
      const analysisFrames = sampledAudio ? [...keyframes, sampledAudio.spectrogram] : keyframes;
      analysis = await runStage('Analisis visual/audio', buildAnalysisPrompt(request.mainKeyword, context, keyframes, request.project.youtubeSEO.analysisSource === 'manual' ? 'manual' : 'main', framework, audioEvidence), analysisFrames, parseAnalysisResponse);
      if (sampledAudio) analysis = { ...analysis, audioEvidence };
      await saveAnalysis(request.project.projectDir, signature, analysis).catch(() => logger.info('[AI SEO] Cache analisis tidak dapat ditulis; hasil SEO tetap dilanjutkan.'));
    }
    logger.info('[AI SEO] Tahap 2/2: menulis 10 judul, deskripsi terlokalisasi, dan tags.');
    let production = await runStage('Penulisan SEO', buildProductionPrompt(request.mainKeyword, context, analysis, framework, request.project.youtubeSEO.customPromptEnabled ? (request.project.youtubeSEO.customPrompt ?? '') : ''), [], (answer) => parseProductionResponse(answer, request.mainKeyword, false));
    production = { ...production, titles: production.titles.map((title) => seoTitleCase(title, context.targetLanguage)) };
    let titleIssue: Error | null = null;
    try { validateSeoTitles(production.titles, request.mainKeyword); }
    catch (error) { titleIssue = error instanceof Error ? error : new Error(String(error)); }
    if (titleIssue) {
      logger.info(`[AI SEO] ${titleIssue.message} Memperbaiki judul tanpa mengulang analisis, deskripsi, dan tag.`);
      let candidates = production.titles;
      try {
        const prompt = buildTitleRepairPrompt(production.titles, request.mainKeyword, context, analysis, production.descriptionParts.audiences, request.project.youtubeSEO.customPromptEnabled ? (request.project.youtubeSEO.customPrompt ?? '') : '');
        const response = await generateMultimodal(request.provider, model, apiKey, prompt, [], 3200);
        candidates = parseTitleRepairCandidates(response.text).map((title) => seoTitleCase(title, context.targetLanguage));
        validateSeoTitles(candidates, request.mainKeyword, false);
      } catch (error) {
        logger.info(`[AI SEO] Revisi judul provider belum lengkap (${error instanceof Error ? error.message : String(error)}); menyusun judul dari fakta visual dan audiens yang sudah tersedia.`);
        candidates = production.titles;
      }
      try {
        const repaired = fitTitleLengths(candidates, request.mainKeyword, production.descriptionParts.audiences, analysis.visualEvidence?.observed ?? [], context.targetLanguage);
        production = { ...production, titles: repaired };
      } catch (error) {
        // A provider may ignore length instructions entirely. The original
        // suggestions remain usable for local, grounded fitting.
        if (candidates === production.titles) throw error;
        production = { ...production, titles: fitTitleLengths(production.titles, request.mainKeyword, production.descriptionParts.audiences, analysis.visualEvidence?.observed ?? [], context.targetLanguage) };
      }
    }
    const { audioEvidence: _audioEvidence, ...publicAnalysis } = analysis;
    const validated = { ...publicAnalysis, ...production, tags: buildRelevantTags(request.mainKeyword, contentType, analysis, production.tags) };
    logger.info(`[AI SEO] ${validated.tags.length} tag relevan dipilih (<500 karakter). Data volume pencarian langsung tidak tersedia.`);
    const timestampInput = { project: request.project, finalDurationSeconds: outputDuration, outputVideoPath: outputPath, introDurationSeconds, audioPlan };
    const timestampText = buildYoutubeTimestampText(timestampInput);
    const readyDescription = buildReadyDescription(validated, timestampText, Boolean(audioPlan), contentType);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    let timestampTxt = '';
    if (request.writeTimestampSidecar !== false) {
      const timestampTarget = youtubeTimestampPath(request.project, outputPath);
      // Render may have already written chapters from the actual final MP4 while
      // the AI was working. Keep those measured timestamps if they are newer.
      const finalTimestamp = !request.outputPath && (await fs.stat(timestampTarget).catch(() => null));
      timestampTxt = finalTimestamp && finalTimestamp.mtimeMs >= generationStartedAt
        ? timestampTarget : await writeYoutubeTimestampText(timestampInput);
    }
    const seoTxt = await writeYoutubeSeoText(request.project, validated, outputPath, timestampText, Boolean(audioPlan));
    return { ...validated, readyDescription, outputFiles: { seoTxt, timestampTxt } };
  }

  private async getFinalDuration(outputPath: string, project: ProjectData): Promise<number> {
    try { return (await this.mediaProbe.probe(outputPath)).durationSeconds ?? project.mainMedia?.durationSeconds ?? 0; } catch { return project.mainMedia?.durationSeconds ?? 0; }
  }

  private async getIntroDuration(project: ProjectData): Promise<number> {
    const introPath = activeIntroMediaPath(project);
    if (!introPath) return 0;
    try { const metadata = await this.mediaProbe.probe(introPath); return metadata.durationSeconds ?? (metadata.type === 'image' ? 3 : 0); } catch { return 0; }
  }
}
