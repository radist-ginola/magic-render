import crypto from 'node:crypto';
import path from 'node:path';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { defaultStickerConfig, type ProjectSticker, type StickerMediaType } from '../../shared/domain/stickerTypes';
import { buildStickerAudioPlan, type StickerAudioPlan } from './ffmpegEngine/stickerAudioBuilder';
import { validateStickerFile, validateStickerShape } from './stickerValidator';
import { buildScheduleWindows } from './stickerScheduler';
import { buildStickerFilterGraph } from './ffmpegEngine/stickerFilterBuilder';
import { MediaProbe } from './media/mediaProbe';
import { logger } from '../utils/logger';
import { getResolution } from './ffmpegEngine/resolutionMap';

export { defaultStickerConfig } from '../../shared/domain/stickerTypes';

export class StickerService {
  constructor(private readonly ffprobeExecutable = 'ffprobe') {}

  async addSticker(project: ProjectData, filePath: string, type: StickerMediaType): Promise<ProjectData> {
    const validPath = await validateStickerFile(filePath, type);
    const config = defaultStickerConfig();
    if (type !== 'image') {
      try { const metadata = await new MediaProbe(this.ffprobeExecutable).probe(validPath); if (metadata.durationSeconds && metadata.durationSeconds > 0) config.durationSec = metadata.durationSeconds; } catch { /* UI keeps a safe fallback duration when probe is unavailable. */ }
    }
    const sticker: ProjectSticker = { id: crypto.randomUUID(), path: validPath, type, config };
    logger.info(`[INPUT] Sticker Subscribe dimasukkan: ${path.basename(validPath)}`);
    const existing = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
    const stickers = [...existing, sticker];
    return { ...project, updatedAt: new Date().toISOString(), stickerSubscribe: stickers[0] ?? null, stickerSubscribes: stickers };
  }
  updateSticker(project: ProjectData, sticker: ProjectSticker): ProjectData { const valid = validateStickerShape(sticker); const existing = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []); const stickers = existing.some((item) => item.id === valid.id) ? existing.map((item) => item.id === valid.id ? valid : item) : [...existing, valid]; return { ...project, updatedAt: new Date().toISOString(), stickerSubscribe: stickers[0] ?? null, stickerSubscribes: stickers }; }
  removeSticker(project: ProjectData, stickerId?: string): ProjectData { const existing = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []); const stickers = stickerId ? existing.filter((item) => item.id !== stickerId) : []; return { ...project, updatedAt: new Date().toISOString(), stickerSubscribe: stickers[0] ?? null, stickerSubscribes: stickers }; }
  async validateSticker(sticker: ProjectSticker): Promise<void> { validateStickerShape(sticker); await validateStickerFile(sticker.path, sticker.type); }
  buildFilterGraph(project: ProjectData, totalDurationSec: number): { filterGraph: string; finalLabel: string } {
    const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
    const canvas = getResolution(project.settings.resolution);
    if (stickers.length === 0) return { filterGraph: '', finalLabel: '0:v' };
    let current = '0:v';
    const parts: string[] = [];
    stickers.forEach((sticker, index) => { const graph = buildStickerFilterGraph(validateStickerShape(sticker), current, `${index + 1}:v`, canvas.width, canvas.height, totalDurationSec, sticker.config.durationSec, canvas.width / 1920); parts.push(graph.filterGraph); current = graph.finalLabel; });
    return { filterGraph: parts.join(';'), finalLabel: current };
  }
  buildAudioPlan(project: ProjectData): StickerAudioPlan[] { const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []); return stickers.map((sticker) => buildStickerAudioPlan(sticker)); }
  createScheduleWindows(project: ProjectData, totalDurationSec: number, stickerDurationSec: number) { const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []); return stickers.flatMap((sticker) => buildScheduleWindows(sticker.config.schedule, totalDurationSec, stickerDurationSec)); }
}
