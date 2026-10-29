import crypto from 'node:crypto';
import path from 'node:path';
import type { ProjectOverlay, OverlayMediaType } from '../../../shared/domain/overlayTypes';
import { defaultOverlayConfig } from '../../../shared/domain/overlayTypes';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import { validateOverlayFile, validateOverlayShape } from './overlayValidator';
import { FilterGraphBuilder } from '../ffmpegEngine/filterGraphBuilder/filterGraphBuilder';
import { logger } from '../../utils/logger';
import { getResolution } from '../ffmpegEngine/resolutionMap';

export { defaultOverlayConfig } from '../../../shared/domain/overlayTypes';

export class OverlayService {
  constructor(private readonly filterGraphBuilder = new FilterGraphBuilder()) {}

  async addOverlay(project: ProjectData, filePath: string, type: OverlayMediaType): Promise<ProjectData> {
    const validPath = await validateOverlayFile(filePath, type);
    const overlay: ProjectOverlay = { id: crypto.randomUUID(), path: validPath, type, config: defaultOverlayConfig() };
    logger.info(`[INPUT] Animasi ${type === 'video' ? 'Video' : 'Gambar'} Overlay dimasukkan: ${path.basename(validPath)}`);
    return { ...project, updatedAt: new Date().toISOString(), overlays: [...project.overlays, overlay] };
  }

  updateOverlay(project: ProjectData, overlay: ProjectOverlay): ProjectData {
    const validated = validateOverlayShape(overlay);
    const overlays = project.overlays.map((item) => item.id === validated.id ? validated : item);
    if (!overlays.some((item) => item.id === validated.id)) throw new Error('Overlay tidak ditemukan di project.');
    return { ...project, updatedAt: new Date().toISOString(), overlays };
  }

  removeOverlay(project: ProjectData, overlayId: string): ProjectData {
    if (!project.overlays.some((item) => item.id === overlayId)) throw new Error('Overlay tidak ditemukan di project.');
    return { ...project, updatedAt: new Date().toISOString(), overlays: project.overlays.filter((item) => item.id !== overlayId) };
  }

  validateOverlay(overlay: unknown): ProjectOverlay { return validateOverlayShape(overlay); }

  buildFilterGraph(project: ProjectData): { filterGraph: string; finalLabel: string } {
    const overlays = project.overlays.map((overlay, index) => ({ sourceIndex: index + 1, sourceLabel: `${index + 1}:v`, overlay }));
    const resolution = getResolution(project.settings.resolution);
    return this.filterGraphBuilder.build('0:v', overlays, resolution.width, resolution.height);
  }
}
