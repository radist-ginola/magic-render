import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { getProjectFilePath, validateProjectData } from '../services/project/projectValidator';

export class ProjectRepository {
  /** Serialize writes per project file so autosave, manual save and editor IPC
   * cannot race on the same temporary filename or let an older snapshot win. */
  private readonly saveTails = new Map<string, Promise<void>>();

  async save(project: ProjectData): Promise<string> {
    const filePath = path.resolve(getProjectFilePath(project.projectDir));
    const payload = JSON.stringify(project, null, 2);
    const previous = this.saveTails.get(filePath) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      await fs.mkdir(project.projectDir, { recursive: true });
      const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(tempPath, payload, { encoding: 'utf8', flag: 'wx' });
        await fs.rename(tempPath, filePath);
      } catch (error) {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    this.saveTails.set(filePath, write);
    try {
      await write;
      return filePath;
    } finally {
      if (this.saveTails.get(filePath) === write) this.saveTails.delete(filePath);
    }
  }

  async load(projectFilePath: string): Promise<ProjectData> {
    const resolved = path.resolve(projectFilePath);
    if (path.basename(resolved).toLowerCase() !== 'project.json') {
      throw new Error('Project file must be named project.json.');
    }
    const content = await fs.readFile(resolved, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Project file contains invalid JSON.');
    }
    const validation = validateProjectData(parsed);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    return parsed as ProjectData;
  }
}
