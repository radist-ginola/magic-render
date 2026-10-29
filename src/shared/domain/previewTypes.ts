import type { ProjectData } from './projectTypes';

export type PreviewFrameRequest = { projectId: string; mediaPath: string; timestampSec: number };
export type PreviewFrameResult = { projectId: string; timestampSec: number; mimeType: 'image/png'; base64: string };
export type PreviewVisualUpdate = {
  kind: 'overlay' | 'text' | 'sticker' | 'visualizer';
  id: string;
  position?: { x: number; y: number };
  scale?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
};
export type PreviewCapabilities = { cssComposition: true; frameExtraction: true; wasm: 'available' | 'unavailable' };

export function applyPreviewVisualUpdate(project: ProjectData, update: PreviewVisualUpdate): ProjectData {
  if (update.kind === 'overlay') {
    return { ...project, overlays: project.overlays.map((item) => item.id === update.id && !item.locked ? {
      ...item,
      config: {
        ...item.config,
        position: update.position ?? item.config.position,
        resize: update.width && update.height ? { width: Math.max(1, Math.round(update.width)), height: Math.max(1, Math.round(update.height)) } : item.config.resize,
        rotation: update.rotation ?? item.config.rotation,
        opacity: update.opacity ?? item.config.opacity,
      },
    } : item) };
  }
  if (update.kind === 'text') {
    return { ...project, textOverlays: (project.textOverlays ?? []).map((item) => item.id === update.id && !item.locked ? {
      ...item,
      config: { ...item.config, position: update.position ?? item.config.position, scale: update.scale ?? item.config.scale ?? 1, rotation: update.rotation ?? item.config.rotation ?? 0, opacity: update.opacity ?? item.config.opacity },
    } : item) };
  }
  if (update.kind === 'visualizer') {
    return { ...project, visualizers: (project.visualizers ?? []).map((item) => item.id === update.id ? {
      ...item,
      position: update.position ?? item.position,
      size: update.width && update.height ? { width: Math.max(32, Math.min(3840, Math.round(update.width))), height: Math.max(16, Math.min(2160, Math.round(update.height))) } : item.size,
      opacity: update.opacity ?? item.opacity,
    } : item) };
  }
  const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
  const next = stickers.map((item) => item.id === update.id && !item.locked ? { ...item, config: { ...item.config, position: update.position ?? item.config.position, scale: update.scale ?? item.config.scale, rotation: update.rotation ?? item.config.rotation, opacity: update.opacity ?? item.config.opacity } } : item);
  return { ...project, stickerSubscribe: next[0] ?? null, stickerSubscribes: next };
}
