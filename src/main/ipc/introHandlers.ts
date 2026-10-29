import { registerIpcHandler } from './loggedHandler';

import { IPC_CHANNELS } from '../../shared/ipc';
import type { ApplicationConfig } from '../config/appConfig';
import { ProjectRepository } from '../repositories/projectRepository';
import { RecentProjectsService } from '../services/project/recentProjectsService';
import { ProjectService } from '../services/project/projectService';
import { MainMediaService } from '../services/media/mediaService';
import { IntroService } from '../services/intro';
import { app } from 'electron';
import path from 'node:path';
import { assertAllowedString, assertProjectData } from './validation';
import { showOpenDialog } from './dialogHelper';

let config: ApplicationConfig | null = null;
let projectService: ProjectService | null = null;
export function refreshIntroProjectService(): void { projectService = null; }
const introService = new IntroService();

function getProjectService(): ProjectService {
  if (!projectService) {
    projectService = new ProjectService(
      new ProjectRepository(),
      new RecentProjectsService(path.join(app.getPath('userData'), 'project-state')),
      new MainMediaService(config?.runtime.ffmpegPath ?? '', config?.runtime.ffprobePath ?? ''),
    );
  }
  return projectService;
}

export function registerIntroIpcHandlers(applicationConfig: ApplicationConfig): void {
  config = applicationConfig;
  registerIpcHandler(IPC_CHANNELS.INTRO_IMPORT, async (_event, project: unknown) => {
    const validProject = assertProjectData(project);
    const result = await showOpenDialog({ title: 'Import Intro Media', properties: ['openFile'], filters: [{ name: 'Intro Media', extensions: ['mp4','mov','mkv','webm','avi','png','jpg','jpeg','webp','gif'] }] });
    if (result.canceled || result.filePaths.length === 0) return null;
    const selected = result.filePaths[0];
    assertAllowedString(selected, 'intro path', 32767);
    const updated = await introService.set(validProject, true, selected, validProject.intro.fallbackFadeInSec);
    return getProjectService().save(updated);
  });

  registerIpcHandler(IPC_CHANNELS.INTRO_LIBRARY, async (_event, ...args: unknown[]) => {
    if (args.length) throw new Error('intro:library tidak menerima argument.');
    return introService.getLibrary();
  });

  registerIpcHandler(IPC_CHANNELS.INTRO_SET, async (_event, project: unknown, enabled: unknown, introPath: unknown, fallbackFadeInSec: unknown) => {
    const validProject = assertProjectData(project);
    if (typeof enabled !== 'boolean') throw new Error('Intro enabled harus boolean.');
    if (introPath !== null && introPath !== undefined) assertAllowedString(introPath, 'intro path', 32767);
    if (typeof fallbackFadeInSec !== 'number' || !Number.isFinite(fallbackFadeInSec)) throw new Error('Fallback Fade-In tidak valid.');
    const updated = await introService.set(validProject, enabled, typeof introPath === 'string' ? introPath : null, fallbackFadeInSec);
    return getProjectService().save(updated);
  });

  registerIpcHandler(IPC_CHANNELS.INTRO_SELECT, async (_event, project: unknown, assetId: unknown) => {
    const validProject = assertProjectData(project);
    assertAllowedString(assetId, 'intro asset id', 128);
    const updated = await introService.select(validProject, assetId);
    return getProjectService().save(updated);
  });

  registerIpcHandler(IPC_CHANNELS.INTRO_BUILD_PLAN, async (_event, project: unknown) => {
    return introService.buildPlan(assertProjectData(project));
  });
}
