import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { logger } from '../../utils/logger';

export type TempArtifactKind = 'render' | 'keyframe' | 'audio' | 'log' | 'checkpoint';

export type CleanupFailure = {
  path: string;
  attempts: number;
  error: string;
};

export type CleanupResult = {
  jobDir: string;
  removed: string[];
  failed: CleanupFailure[];
};

const RETRIES = 6;

function isWithinRoot(candidate: string, root: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeFileReliable(filePath: string): Promise<{ attempts: number; error: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await fs.unlink(filePath);
      return { attempts: attempt, error: null };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'ENOENT') return { attempts: attempt, error: null };
      lastError = error instanceof Error ? error.message : String(error);
      if (code === 'EACCES' || code === 'EPERM') {
        try {
          await fs.chmod(filePath, 0o666);
        } catch {
          // Best effort; the next unlink attempt is the authoritative check.
        }
      }
      if (attempt < RETRIES) await sleep(100 * attempt);
    }
  }
  return { attempts: RETRIES, error: lastError ?? 'Unknown cleanup error' };
}

async function removeDirectoryReliable(directory: string): Promise<{ attempts: number; error: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      return { attempts: attempt, error: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < RETRIES) await sleep(100 * attempt);
    }
  }
  return { attempts: RETRIES, error: lastError ?? 'Unknown directory cleanup error' };
}

export class CacheManager {
  readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? path.join(app.getPath('temp'), 'MagicRenderPro'));
  }

  async ensureRoot(): Promise<string> {
    await fs.mkdir(this.root, { recursive: true });
    return this.root;
  }

  async createRenderJob(projectId: string): Promise<string> {
    await this.ensureRoot();
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'project';
    const jobDir = path.join(this.root, `${safeProjectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(jobDir, { recursive: false });
    return jobDir;
  }

  createArtifactPath(jobDir: string, kind: TempArtifactKind, fileName: string): string {
    this.assertJobPath(jobDir);
    const safeName = path.basename(fileName);
    const directory = path.join(jobDir, kind);
    return path.join(directory, safeName);
  }

  async prepareArtifactDirectory(jobDir: string, kind: TempArtifactKind): Promise<string> {
    const directory = path.join(jobDir, kind);
    this.assertJobPath(jobDir);
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }

  assertTempArtifact(filePath: string, jobDir?: string): string {
    const absolute = path.resolve(filePath);
    if (!isWithinRoot(absolute, this.root)) {
      throw new Error('Temporary artifact berada di luar application temp root.');
    }
    if (jobDir && !isWithinRoot(absolute, jobDir)) {
      throw new Error('Temporary artifact berada di luar render job directory.');
    }
    return absolute;
  }

  assertProtectedFromCleanup(filePath: string, outputPath?: string, sourcePaths: string[] = []): void {
    const absolute = path.resolve(filePath);
    if (outputPath && absolute === path.resolve(outputPath)) {
      throw new Error('File output final tidak boleh diregistrasikan sebagai temporary artifact.');
    }
    if (sourcePaths.some((source) => absolute === path.resolve(source))) {
      throw new Error('Project source asset tidak boleh diregistrasikan sebagai temporary artifact.');
    }
  }

  async appendRenderLog(jobDir: string, line: string): Promise<string> {
    const logDirectory = await this.prepareArtifactDirectory(jobDir, 'log');
    const logPath = path.join(logDirectory, 'render.log');
    this.assertTempArtifact(logPath, jobDir);
    const timestamped = `[${new Date().toISOString()}] ${line}\n`;
    await fs.appendFile(logPath, timestamped, 'utf8');
    return logPath;
  }

  async cleanupJob(jobDir: string): Promise<CleanupResult> {
    this.assertJobPath(jobDir);
    const result: CleanupResult = { jobDir: path.resolve(jobDir), removed: [], failed: [] };

    let entries: string[] = [];
    try {
      entries = await this.collectFiles(result.jobDir);
    } catch (error) {
      result.failed.push({ path: result.jobDir, attempts: 1, error: error instanceof Error ? error.message : String(error) });
      logger.warn('Gagal membaca isi render job untuk cleanup.', { jobDir: result.jobDir });
      return result;
    }

    for (const filePath of entries.reverse()) {
      const outcome = await removeFileReliable(filePath);
      if (outcome.error) result.failed.push({ path: filePath, attempts: outcome.attempts, error: outcome.error });
      else result.removed.push(filePath);
    }

    const directoryOutcome = await removeDirectoryReliable(result.jobDir);
    if (directoryOutcome.error) result.failed.push({ path: result.jobDir, attempts: directoryOutcome.attempts, error: directoryOutcome.error });
    else result.removed.push(result.jobDir);

    if (result.failed.length > 0) logger.warn('Cleanup render job selesai dengan artifact yang masih tersisa.', { jobDir: result.jobDir, failed: result.failed });
    return result;
  }

  async findLatestCheckpoint(projectId: string): Promise<{ jobDir: string; checkpointPath: string; data: { projectId: string; completedStage: string; nextStage: string | null; jobDir: string; outputPath: string; createdAt: string } } | null> {
    await this.ensureRoot();
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'project';
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const candidates: { jobDir: string; checkpointPath: string; mtimeMs: number; data: { projectId: string; completedStage: string; nextStage: string | null; jobDir: string; outputPath: string; createdAt: string } }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(`${safeProjectId}-`)) continue;
      const jobDir = path.join(this.root, entry.name);
      const checkpointPath = path.join(jobDir, 'render', 'checkpoint.json');
      const stat = await fs.stat(checkpointPath).catch(() => null);
      if (!stat) continue;
      try {
        const raw = JSON.parse(await fs.readFile(checkpointPath, 'utf8')) as typeof candidates[number]['data'];
        if (raw.projectId !== projectId || raw.jobDir !== jobDir || !raw.outputPath || !raw.nextStage) continue;
        candidates.push({ jobDir, checkpointPath, mtimeMs: stat.mtimeMs, data: raw });
      } catch {
        continue;
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = candidates[0];
    return latest ? { jobDir: latest.jobDir, checkpointPath: latest.checkpointPath, data: latest.data } : null;
  }

  async cleanupStaleJobs(maxAgeMs = 24 * 60 * 60 * 1000, protectedPaths: string[] = [], activeJobDirs: string[] = []): Promise<CleanupResult[]> {
    await this.ensureRoot();
    const now = Date.now();
    const results: CleanupResult[] = [];
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(this.root, entry.name);
      if (activeJobDirs.some((active) => path.resolve(active) === path.resolve(fullPath))) continue;
      if (protectedPaths.some((asset) => isWithinRoot(asset, fullPath))) continue;
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || (maxAgeMs > 0 && now - stat.mtimeMs < maxAgeMs)) continue;
      results.push(await this.cleanupJob(fullPath));
    }
    return results;
  }

  private assertJobPath(jobDir: string): void {
    if (!isWithinRoot(jobDir, this.root) || path.resolve(jobDir) === this.root) {
      throw new Error('Render job directory harus berada di dalam application temp root.');
    }
  }

  private async collectFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await this.collectFiles(fullPath));
      else files.push(fullPath);
    }
    return files;
  }
}
