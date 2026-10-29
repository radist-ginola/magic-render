import { app, shell } from 'electron';
import { showOpenDialog } from './dialogHelper';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { ApplicationConfig } from '../config/appConfig';
import { ProjectRepository } from '../repositories/projectRepository';
import { ProjectService } from '../services/project/projectService';
import { MainMediaService } from '../services/media/mediaService';
import { RecentProjectsService } from '../services/project/recentProjectsService';
import { assertAllowedString, assertProjectData, assertMainMediaControls } from './validation';
import { registerIpcHandler } from './loggedHandler';
import { settingsService } from './settingsHandlers';
import { listLockedAssets } from '../services/persistentStore';

let service: ProjectService | null = null;
let _runtimeConfig: ApplicationConfig | null = null;
export function refreshProjectMediaService(): void { service = null; }

function getProjectService(): ProjectService {
  if (!service) {
    service = new ProjectService(new ProjectRepository(), new RecentProjectsService(path.join(app.getPath('userData'), 'project-state')), new MainMediaService(_runtimeConfig?.runtime.ffmpegPath ?? '', _runtimeConfig?.runtime.ffprobePath ?? ''));
  }
  return service;
}


export function registerProjectIpcHandlers(config: ApplicationConfig): void {
  _runtimeConfig = config;
  registerIpcHandler(IPC_CHANNELS.PROJECT_CREATE, async (_event, name: unknown, projectDir?: unknown) => {
    assertAllowedString(name, 'project name', 120);
    if (projectDir !== undefined) assertAllowedString(projectDir, 'project directory', 32767);
    const targetDir = typeof projectDir === 'string' ? projectDir : await chooseDirectory('Pilih folder hasil export dan penyimpanan project', settingsService.get().uploadDir);
    if (!targetDir) return null;
    const result = await getProjectService().create(name, targetDir);
    settingsService.update({ outputDir: targetDir });
    return result;
  });

  registerIpcHandler(IPC_CHANNELS.PROJECT_LOAD, async (_event, projectFilePath?: unknown) => {
    if (projectFilePath !== undefined) assertAllowedString(projectFilePath, 'project file path', 32767);
    const selected = typeof projectFilePath === 'string' ? projectFilePath : await chooseProjectFile();
    if (!selected) return null;
    return getProjectService().load(selected);
  });

  registerIpcHandler(IPC_CHANNELS.PROJECT_SAVE, async (_event, project: unknown) => {
    const validProject = assertProjectData(project);
    return getProjectService().save(validProject);
  });

  registerIpcHandler(IPC_CHANNELS.PROJECT_GET_RECENT, async () => {
    return new RecentProjectsService(path.join(app.getPath('userData'), 'project-state')).list();
  });

  registerIpcHandler(IPC_CHANNELS.PROJECT_REMOVE_RECENT, async (_event, projectId: unknown) => {
    assertAllowedString(projectId, 'project id', 128);
    const assets = await listLockedAssets();
    return new RecentProjectsService(path.join(app.getPath('userData'), 'project-state')).remove(projectId, [settingsService.get().assetDir, ...assets.map((asset) => asset.path)]);
  });

  registerIpcHandler(IPC_CHANNELS.PROJECT_OPEN_FOLDER, async (_event, projectDir: unknown) => {
    assertAllowedString(projectDir, 'project directory', 32767);
    const result = await shell.openPath(path.resolve(projectDir));
    if (result) throw new Error(`Could not open project folder: ${result}`);
  });

  registerIpcHandler(IPC_CHANNELS.PROJECT_IMPORT_MAIN_MEDIA, async (_event, project: unknown) => {
    const validProject = assertProjectData(project);
    const result = await showOpenDialog( {
      title: 'Import Main Media',
      properties: ['openFile'],
      filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'mp4', 'mov', 'mkv', 'webm'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    if (!filePath) return null;
    return getProjectService().setMainMedia(validProject, filePath);
  });

  registerIpcHandler(IPC_CHANNELS.MEDIA_PROBE, async (_event, filePath?: unknown) => {
    if (filePath === undefined) return null;
    assertAllowedString(filePath, 'media file path', 32767);
    return new MainMediaService(_runtimeConfig?.runtime.ffmpegPath ?? '', _runtimeConfig?.runtime.ffprobePath ?? '').probeMedia(filePath);
  });

  registerIpcHandler(IPC_CHANNELS.MEDIA_CONVERT_IMAGE, async (_event, inputPath: unknown, durationSeconds: unknown, resolution: unknown, outputPath?: unknown) => {
    assertAllowedString(inputPath, 'image path', 32767);
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Invalid image target duration.');
    if (resolution !== '720p' && resolution !== '1080p' && resolution !== '2K' && resolution !== '4K') throw new Error('Invalid output resolution.');
    if (outputPath !== undefined) assertAllowedString(outputPath, 'output path', 32767);
    return new MainMediaService(_runtimeConfig?.runtime.ffmpegPath ?? '', _runtimeConfig?.runtime.ffprobePath ?? '').convertImageToVideo(inputPath, durationSeconds, resolution, outputPath);
  });

  registerIpcHandler(IPC_CHANNELS.MEDIA_UPDATE_CONTROLS, async (_event, project: unknown, controls: unknown) => {
    const validProject = assertProjectData(project);
    const validControls = assertMainMediaControls(controls);
    return getProjectService().updateMainMediaControls(validProject, validControls);
  });
}

async function chooseDirectory(title: string, defaultPath?: string): Promise<string | undefined> {
  const result = await showOpenDialog( { title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? undefined : result.filePaths[0];
}

async function chooseProjectFile(): Promise<string | undefined> {
  const result = await showOpenDialog( {
    title: 'Open Magic Render Pro Project',
    properties: ['openFile'],
    filters: [{ name: 'Magic Render Pro Project', extensions: ['json'] }],
  });
  return result.canceled ? undefined : result.filePaths[0];
}
