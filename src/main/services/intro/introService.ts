import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { IntroLibraryItem, IntroPipelinePlan } from '../../../shared/domain/introTypes';
import { activeIntroMediaPath, effectiveMainFadeIn, getIntroMode } from '../../../shared/domain/introTypes';
import { listLockedAssets } from '../persistentStore';

const INTRO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.png', '.jpg', '.jpeg', '.webp', '.gif']);

export class IntroService {
  async getLibrary(): Promise<IntroLibraryItem[]> {
    const assets = await listLockedAssets();
    return assets.filter((asset) => asset.menu === 'intro').map((asset) => ({
      assetId: asset.assetId,
      path: asset.path,
      name: asset.metadata.originalName,
      extension: asset.metadata.extension,
      sizeBytes: asset.metadata.sizeBytes,
      modifiedAt: asset.metadata.modifiedAt,
    }));
  }

  async set(project: ProjectData, enabled: boolean, introPath: string | null, fallbackFadeInSec: number): Promise<ProjectData> {
    if (!Number.isFinite(fallbackFadeInSec) || fallbackFadeInSec < 0 || fallbackFadeInSec > 86400) throw new Error('Durasi Fade-In fallback harus 0 sampai 86400 detik.');
    const normalizedPath = introPath ? path.resolve(introPath) : null;
    // The switch can be enabled without a file to use the configured fade-only
    // opening. A file is validated only when one has actually been selected.
    if (enabled && normalizedPath) await this.validateIntroPath(normalizedPath);
    return {
      ...project,
      updatedAt: new Date().toISOString(),
      intro: { ...project.intro, enabled, mode: enabled ? (normalizedPath ? 'media' : 'fade') : 'none', path: normalizedPath, fallbackFadeInSec },
    };
  }

  async select(project: ProjectData, assetId: string): Promise<ProjectData> {
    const library = await listLockedAssets();
    const asset = library.find((entry) => entry.assetId === assetId && entry.menu === 'intro');
    if (!asset) throw new Error('Intro asset tidak ditemukan di Intro Library.');
    await this.validateIntroPath(asset.path);
    return this.set(project, true, asset.path, project.intro.fallbackFadeInSec);
  }

  buildPlan(project: ProjectData): IntroPipelinePlan {
    const mode = getIntroMode(project.intro);
    const introPath = activeIntroMediaPath(project);
    const enabled = mode !== 'none';
    return {
      enabled,
      introPath,
      fallbackFadeInSec: project.intro.fallbackFadeInSec,
      mainMediaFadeInSec: effectiveMainFadeIn(project),
      prependIntro: Boolean(introPath),
    };
  }

  private async validateIntroPath(filePath: string): Promise<void> {
    const extension = path.extname(filePath).toLowerCase();
    if (!INTRO_EXTENSIONS.has(extension)) throw new Error(`Format intro tidak didukung: ${extension || 'unknown'}.`);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`File intro tidak ditemukan: ${filePath}`);
  }
}
