import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ProjectData, ProjectSettings } from '../../../shared/domain/projectTypes';
import type { AiProvider } from '../../../shared/domain/aiTypes';

const DEFAULT_SETTINGS: ProjectSettings = {
  outputDir: '',
  resolution: '1080p',
  bitrateKbps: 8000,
  fps: 30,
  cpuLoadPercent: 75,
  renderPreset: 'standard',
  bitrateMode: 'vbr',
};

export type ProjectDefaults = ProjectSettings & { aiProvider: AiProvider; aiModel: string };

export function createDefaultProject(name: string, projectDir: string, defaults?: Partial<ProjectDefaults>): ProjectData {
  const now = new Date().toISOString();
  return {
    projectId: randomUUID(),
    schemaVersion: 1,
    name,
    projectDir,
    createdAt: now,
    updatedAt: now,
    mainMedia: null,
    overlays: [],
    stickerSubscribe: null,
    playlist: { files: [], shuffle: false, playbackOrder: [] },
    playlistTracks: [],
    intro: { enabled: false, mode: 'none', path: null, fallbackFadeInSec: 2, fallbackStyle: 'dark', fallbackBlur: 12, fallbackBrightness: -0.25 },
    settings: {
      ...DEFAULT_SETTINGS,
      ...defaults,
      outputDir: defaults?.outputDir || projectDir,
    },
    youtubeSEO: {
      enabled: true,
      mainKeyword: '',
      provider: defaults?.aiProvider ?? 'gemini',
      model: defaults?.aiModel ?? 'gemini-3.5-flash-lite',
      mode: 'timestamp',
    },
  };
}
