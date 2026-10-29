import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import { validateOverlayShape } from '../overlay/overlayValidator';
import { validateStickerShape } from '../stickerValidator';
import { normalizeSeoContext } from '../aiService/seoContext';
import { validateMainEffect, validateParticleEffect } from '../effects/effectValidator';
import { validateVisualizer } from '../effects/visualizerValidator';

const PROJECT_FILE_NAME = 'project.json';
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.mp4', '.mov', '.mkv', '.webm']);

export const PROJECT_SCHEMA_VERSION = 1 as const;

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function getProjectFilePath(projectDir: string): string {
  return path.join(projectDir, PROJECT_FILE_NAME);
}

export function validateProjectData(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { valid: false, errors: ['Project document must be an object.'] };
  const project = value as Record<string, unknown>;
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) errors.push('Unsupported project schema version.');
  for (const field of ['projectId', 'name', 'projectDir', 'createdAt', 'updatedAt']) {
    if (typeof project[field] !== 'string' || (project[field] as string).trim() === '') errors.push(`Invalid ${field}.`);
  }
  if (project.exportFileName !== undefined && (typeof project.exportFileName !== 'string' || project.exportFileName.length > 120)) errors.push('Nama file export tidak valid.');
  if (project.bulkItemId !== undefined && (typeof project.bulkItemId !== 'string' || !/^[\w-]{1,128}$/.test(project.bulkItemId))) errors.push('ID media Bulk Render tidak valid.');
  if (project.finalFadeOutSec !== undefined && (typeof project.finalFadeOutSec !== 'number' || !Number.isFinite(project.finalFadeOutSec) || project.finalFadeOutSec < 0 || project.finalFadeOutSec > 30)) errors.push('Fade out final tidak valid.');
  for (const [field, validate] of [['mainMediaEffects',validateMainEffect],['particleEffects',validateParticleEffect]] as const) {
    const items = project[field];
    if (items === undefined) continue;
    if (!Array.isArray(items) || items.length > 8) { errors.push(`${field} maksimal 8 efek.`); continue; }
    try { for (const item of items) validate(item); }
    catch (error) { errors.push(error instanceof Error ? error.message : `${field} tidak valid.`); }
  }
  if (project.visualizers !== undefined) {
    if (!Array.isArray(project.visualizers) || project.visualizers.length > 4) errors.push('Maksimal 4 visualizer.');
    else { try { project.visualizers.forEach(validateVisualizer); } catch (error) { errors.push(error instanceof Error ? error.message : 'Visualizer tidak valid.'); } }
  }
  const playlist = project.playlist as Record<string, unknown> | undefined;
  if (!playlist || typeof playlist !== 'object' || !Array.isArray(playlist.files) || typeof playlist.shuffle !== 'boolean') errors.push('Invalid playlist.');
  if (playlist && playlist.playbackOrder !== undefined && !Array.isArray(playlist.playbackOrder)) errors.push('Invalid playlist.playbackOrder.');
  if (project.playlistTracks !== undefined && !Array.isArray(project.playlistTracks)) errors.push('Invalid playlistTracks.');
  else if (Array.isArray(project.playlistTracks)) {
    for (const track of project.playlistTracks) {
      if (!track || typeof track !== 'object' || typeof (track as Record<string, unknown>).path !== 'string') errors.push('Invalid playlist track.');
    }
  }
  if (!Array.isArray(project.overlays)) errors.push('Invalid overlays.');
  else {
    for (const overlay of project.overlays) {
      try { validateOverlayShape(overlay); } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid overlay.'); break; }
    }
  }
  if (project.textOverlays !== undefined && (!Array.isArray(project.textOverlays) || project.textOverlays.some((item) => item && ((item.locked !== undefined && typeof item.locked !== 'boolean') || (item.hiddenInPreview !== undefined && typeof item.hiddenInPreview !== 'boolean'))))) errors.push('Status text overlay tidak valid.');
  for (const field of ['textOverlaysEnabled', 'particleEffectsEnabled', 'visualizersEnabled'] as const) {
    if (project[field] !== undefined && typeof project[field] !== 'boolean') errors.push(`Status ${field} harus boolean.`);
  }
  const settings = project.settings as Record<string, unknown> | undefined;
  if (!settings || typeof settings !== 'object' || !['720p','1080p','2K','4K'].includes(String(settings.resolution)) || typeof settings.outputDir !== 'string' || typeof settings.bitrateKbps !== 'number' || !Number.isFinite(settings.bitrateKbps) || settings.bitrateKbps <= 0 || typeof settings.cpuLoadPercent !== 'number' || !Number.isFinite(settings.cpuLoadPercent) || settings.cpuLoadPercent < 1 || settings.cpuLoadPercent > 100 || (settings.bitrateMode !== undefined && !['cbr','vbr'].includes(String(settings.bitrateMode)))) errors.push('Invalid project settings.');

  const intro = project.intro as Record<string, unknown> | undefined;
  if (!intro || typeof intro !== 'object' || typeof intro.enabled !== 'boolean' || (intro.mode !== undefined && !['media','fade','none'].includes(String(intro.mode))) || (intro.path !== null && typeof intro.path !== 'string') || typeof intro.fallbackFadeInSec !== 'number' || !Number.isFinite(intro.fallbackFadeInSec) || intro.fallbackFadeInSec < 0 || (intro.fadeInSec !== undefined && (typeof intro.fadeInSec !== 'number' || !Number.isFinite(intro.fadeInSec) || intro.fadeInSec < 0 || intro.fadeInSec > 30)) || (intro.fallbackStyle !== undefined && !['dark', 'blur'].includes(String(intro.fallbackStyle))) || (intro.fallbackBlur !== undefined && (typeof intro.fallbackBlur !== 'number' || !Number.isFinite(intro.fallbackBlur) || intro.fallbackBlur < 0 || intro.fallbackBlur > 30)) || (intro.fallbackBrightness !== undefined && (typeof intro.fallbackBrightness !== 'number' || !Number.isFinite(intro.fallbackBrightness) || intro.fallbackBrightness < -0.7 || intro.fallbackBrightness > 0.7))) errors.push('Invalid intro configuration.');
  if (project.stickerSubscribe !== null && project.stickerSubscribe !== undefined) {
    try { validateStickerShape(project.stickerSubscribe); } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid stickerSubscribe.'); }
  }
  if (project.stickerSubscribes !== undefined) {
    if (!Array.isArray(project.stickerSubscribes)) errors.push('Invalid stickerSubscribes.');
    else { for (const sticker of project.stickerSubscribes) { try { validateStickerShape(sticker); } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid stickerSubscribes item.'); break; } } }
  }
  if (project.mainMedia !== null && project.mainMedia !== undefined) {
    const media = project.mainMedia as Record<string, unknown>;
    if (media.type !== 'image' && media.type !== 'video') errors.push('Invalid mainMedia.type.');
    if (typeof media.path !== 'string' || media.path.trim() === '') errors.push('Invalid mainMedia.path.');
    if (media.metadata !== null && media.metadata !== undefined && typeof media.metadata !== 'object') errors.push('Invalid mainMedia.metadata.')
  }
  const youtubeSEO = project.youtubeSEO as Record<string, unknown> | undefined;
  if (youtubeSEO && youtubeSEO.mode !== undefined && !['timestamp', 'timestamp-seo', 'none'].includes(String(youtubeSEO.mode))) errors.push('Pilihan output metadata YouTube SEO tidak valid.');
  if (youtubeSEO && (youtubeSEO.analysisSource !== undefined && !['main', 'manual'].includes(String(youtubeSEO.analysisSource)))) errors.push('Sumber analisis SEO tidak valid.');
  if (youtubeSEO && youtubeSEO.analysisMediaPath !== undefined && youtubeSEO.analysisMediaPath !== null && (typeof youtubeSEO.analysisMediaPath !== 'string' || youtubeSEO.analysisMediaPath.length > 32767)) errors.push('Path media analisis SEO tidak valid.');
  if (youtubeSEO && youtubeSEO.customPromptEnabled !== undefined && typeof youtubeSEO.customPromptEnabled !== 'boolean') errors.push('Status prompt khusus SEO tidak valid.');
  if (youtubeSEO && youtubeSEO.customPrompt !== undefined && (typeof youtubeSEO.customPrompt !== 'string' || youtubeSEO.customPrompt.length > 6000)) errors.push('Prompt khusus SEO melebihi batas 6000 karakter.');
  if (youtubeSEO?.context !== undefined) {
    try { normalizeSeoContext(youtubeSEO.context); }
    catch (error) { errors.push(error instanceof Error ? error.message : 'Konteks SEO tidak valid.'); }
  }
  return { valid: errors.length === 0, errors };
}

export async function validateProjectAssets(project: ProjectData): Promise<ValidationResult> {
  const errors: string[] = [];
  if (project.mainMedia?.path) {
    const extension = path.extname(project.mainMedia.path).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(extension)) errors.push('Unsupported main media extension.');
    try {
      await fs.access(project.mainMedia.path);
    } catch {
      errors.push(`Main media file does not exist: ${project.mainMedia.path}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
