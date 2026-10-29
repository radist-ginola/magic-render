import crypto from 'node:crypto';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { ProjectTextOverlay } from '../../../shared/domain/textOverlayTypes';
import { TextOverlayBuilder, validateTextConfig } from './textOverlayBuilder';
export { validateTextConfig } from './textOverlayBuilder';

const builder = new TextOverlayBuilder();

export function getTextOverlays(project: ProjectData): ProjectTextOverlay[] {
  return ((project as ProjectData & { textOverlays?: ProjectTextOverlay[] }).textOverlays ?? []).map((x) => ({ ...x }));
}

export function addTextOverlay(project: ProjectData, config: ProjectTextOverlay['config']): ProjectData {
  validateTextConfig(config);
  const next = structuredClone(project) as ProjectData & { textOverlays?: ProjectTextOverlay[] };
  next.textOverlays = [...(next.textOverlays ?? []), { id: crypto.randomUUID(), config }];
  return next;
}

export function updateTextOverlay(project: ProjectData, overlay: ProjectTextOverlay): ProjectData {
  validateTextConfig(overlay.config);
  const next = structuredClone(project) as ProjectData & { textOverlays?: ProjectTextOverlay[] };
  const overlays = next.textOverlays ?? [];
  if (!overlays.some((item) => item.id === overlay.id)) throw new Error('Text overlay tidak ditemukan.');
  next.textOverlays = overlays.map((item) => item.id === overlay.id ? overlay : item);
  return next;
}

export function removeTextOverlay(project: ProjectData, overlayId: string): ProjectData {
  const next = structuredClone(project) as ProjectData & { textOverlays?: ProjectTextOverlay[] };
  next.textOverlays = (next.textOverlays ?? []).filter((item) => item.id !== overlayId);
  return next;
}

export function buildTextFilterGraph(project: ProjectData): { filterGraph: string; finalLabel: string } {
  let current = 'base';
  const chains: string[] = [];
  const duration = project.mainMedia?.durationSeconds ?? undefined;
  getTextOverlays(project).forEach((overlay, index) => {
    const next = `text_${index}`;
    chains.push(builder.build(overlay, current, next, duration));
    current = next;
  });
  return { filterGraph: chains.join(';'), finalLabel: current };
}
