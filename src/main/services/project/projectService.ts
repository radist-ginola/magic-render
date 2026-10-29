import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDefaultProject } from '../../domain/project/projectFactory';
import type { ProjectData, RecentProject } from '../../../shared/domain/projectTypes';
import { ProjectRepository } from '../../repositories/projectRepository';
import { RecentProjectsService } from './recentProjectsService';
import { validateProjectAssets, getProjectFilePath } from './projectValidator';
import { MainMediaService } from '../media/mediaService';
import type { MainMediaControls } from '../../../shared/domain/mediaTypes';
import { SettingsService } from '../settingsService';

export type ProjectServiceResult = {
  project: ProjectData;
  projectFilePath: string;
  recentProjects: RecentProject[];
};

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly recentProjects: RecentProjectsService,
    private readonly mediaService: MainMediaService,
    private readonly settingsService = new SettingsService(),
  ) {}

  async create(name: string, projectDir: string): Promise<ProjectServiceResult> {
    const safeName = sanitizeProjectName(name);
    if (!safeName) throw new Error('Project name cannot be empty.');
    const exportDir = path.resolve(projectDir);
    const absoluteDir = path.join(exportDir, `${safeName}-${randomUUID().slice(0, 8)}`);
    const defaults = this.settingsService.get();
    const project = createDefaultProject(safeName, absoluteDir, {
      outputDir: exportDir,
      resolution: defaults.resolution,
      bitrateKbps: defaults.bitrateKbps,
      bitrateMode: defaults.bitrateMode,
      fps: defaults.fps,
      cpuLoadPercent: defaults.cpuLoadPercent,
      renderPreset: defaults.renderPreset,
      aiProvider: defaults.aiProvider,
      aiModel: defaults.aiModel,
    });
    const projectFilePath = await this.repository.save(project);
    return this.markRecent(project, projectFilePath);
  }

  async load(projectFilePath: string): Promise<ProjectServiceResult> {
    const project = await this.repository.load(projectFilePath);
    const assetValidation = await validateProjectAssets(project);
    if (!assetValidation.valid) throw new Error(assetValidation.errors.join(' '));
    const normalizedProject: ProjectData = {
      ...project,
      projectDir: path.resolve(project.projectDir),
      settings: { ...project.settings, outputDir: path.resolve(project.settings.outputDir) },
      mainMedia: project.mainMedia ? { ...project.mainMedia, path: path.resolve(project.mainMedia.path), resize: project.mainMedia.resize ?? { width: 1920, height: 1080 } } : null,
    };
    return this.markRecent(normalizedProject, path.resolve(projectFilePath));
  }

  async save(project: ProjectData): Promise<ProjectServiceResult> {
    const safeName = sanitizeProjectName(project.name);
    if (!safeName) throw new Error('Nama project wajib diisi.');
    const normalized: ProjectData = { ...project, name: safeName, projectDir: path.resolve(project.projectDir), updatedAt: new Date().toISOString() };
    const projectFilePath = await this.repository.save(normalized);
    return this.markRecent(normalized, projectFilePath);
  }

  async setMainMedia(project: ProjectData, mediaPath: string): Promise<ProjectServiceResult> {
    const updated = await this.mediaService.applyToProject(project, mediaPath);
    return this.save(updated);
  }

  async updateMainMediaControls(project: ProjectData, controls: MainMediaControls): Promise<ProjectServiceResult> {
    if (!project.mainMedia) throw new Error('Belum ada main media pada project.');
    const updated: ProjectData = {
      ...project,
      updatedAt: new Date().toISOString(),
      mainMedia: { ...project.mainMedia, autoMute: controls.autoMute, fade: { fadeInSec: controls.fadeInSec, fadeOutSec: controls.fadeOutSec }, resize: controls.resize, position: { ...controls.position }, rotation: controls.rotation },
    };
    return this.save(updated);
  }

  private async markRecent(project: ProjectData, projectFilePath: string): Promise<ProjectServiceResult> {
    const recentProjects = await this.recentProjects.upsert({
      projectId: project.projectId,
      name: project.name,
      projectFilePath,
      lastOpenedAt: new Date().toISOString(),
      mainMediaPath: project.mainMedia?.path,
    });
    return { project, projectFilePath, recentProjects };
  }
}

function sanitizeProjectName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120);
}
