import { validateProjectData } from '../services/project/projectValidator';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { PlaylistTrack } from '../../shared/domain/playlistTypes';

export function assertNoArguments(channel: string, args: unknown[]): void {
  if (args.length > 0) throw new Error(`IPC channel ${channel} does not accept arguments.`);
}

export function assertAllowedString(value: unknown, fieldName: string, maxLength = 256): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) throw new Error(`Invalid ${fieldName}.`);
}

export function assertProjectData(value: unknown): ProjectData {
  const validation = validateProjectData(value);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return value as ProjectData;
}


import type { MainMediaControls } from '../../shared/domain/mediaTypes';

export function assertMainMediaControls(value: unknown): MainMediaControls {
  if (!value || typeof value !== 'object') throw new Error('Invalid main media controls.');
  const controls = value as Record<string, unknown>;
  const resize = controls.resize as Record<string, unknown> | null | undefined;
  const position = controls.position as Record<string, unknown> | undefined;
  const numberInRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (typeof controls.autoMute !== 'boolean') throw new Error('Invalid autoMute.');
  if (!numberInRange(controls.fadeInSec, 0, 86400) || !numberInRange(controls.fadeOutSec, 0, 86400)) throw new Error('Invalid fade controls.');
  if (resize !== null && resize !== undefined && (!numberInRange(resize.width, 1, 16384) || !numberInRange(resize.height, 1, 16384))) throw new Error('Invalid resize controls.');
  if (!position || !numberInRange(position.x, -16384, 16384) || !numberInRange(position.y, -16384, 16384)) throw new Error('Invalid position controls.');
  if (!numberInRange(controls.rotation, -360, 360)) throw new Error('Invalid rotation.');
  return { autoMute: controls.autoMute, fadeInSec: controls.fadeInSec as number, fadeOutSec: controls.fadeOutSec as number, resize: resize ? { width: resize.width as number, height: resize.height as number } : null, position: { x: position.x as number, y: position.y as number }, rotation: controls.rotation as number };
}

import type { ProjectOverlay } from '../../shared/domain/overlayTypes';
import { validateOverlayShape } from '../services/overlay/overlayValidator';

export function assertProjectOverlay(value: unknown): ProjectOverlay {
  return validateOverlayShape(value);
}

export function assertPlaylistTracks(value: unknown): PlaylistTrack[] {
  if (!Array.isArray(value)) throw new Error('Playlist tracks harus berupa array.');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Playlist track #${index + 1} tidak valid.`);
    const track = item as Record<string, unknown>;
    if (typeof track.path !== 'string' || track.path.trim() === '') throw new Error(`Path playlist track #${index + 1} tidak valid.`);
    if (track.durationSeconds !== null && (typeof track.durationSeconds !== 'number' || !Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0)) throw new Error(`Durasi playlist track #${index + 1} tidak valid.`);
    return { path: track.path as string, durationSeconds: (track.durationSeconds as number | null), order: index };
  });
}

export function assertCpuLoadPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('CPU Load harus berupa angka yang valid.');
  const normalized = Math.round(value);
  if (normalized < 1 || normalized > 100) throw new Error('CPU Load harus berada di antara 1% dan 100%.');
  return normalized;
}
