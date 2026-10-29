import type { ProjectResolution } from '../../../shared/domain/projectTypes';
export const RESOLUTION_MAP: Record<ProjectResolution, { width: number; height: number }> = Object.freeze({ '720p': { width: 1280, height: 720 }, '1080p': { width: 1920, height: 1080 }, '2K': { width: 2560, height: 1440 }, '4K': { width: 3840, height: 2160 } });
export function getResolution(resolution: ProjectResolution) { return RESOLUTION_MAP[resolution]; }
