import type { StickerSchedule } from './stickerTypes';

export type StickerWindow = { startSec: number; endSec: number };

export function timestampToSeconds(value: string): number {
  const raw = String(value ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(':');
  if (parts.length !== 2 && parts.length !== 3) throw new Error(`Timestamp sticker tidak valid: ${value}`);
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0) || nums.slice(1).some((n) => n >= 60)) throw new Error(`Timestamp sticker tidak valid: ${value}`);
  return parts.length === 2 ? nums[0]! * 60 + nums[1]! : nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
}

export function validateStickerSchedule(schedule: StickerSchedule): void {
  const intervalUnit = schedule.iterativeUnit ?? 'minutes';
  const maxInterval = intervalUnit === 'seconds' ? 86400 : 100;
  if (schedule.mode === 'iterative' && (!['seconds', 'minutes'].includes(intervalUnit) || schedule.iterativeCount === null || !Number.isInteger(schedule.iterativeCount) || schedule.iterativeCount < 1 || schedule.iterativeCount > maxInterval)) throw new Error(intervalUnit === 'seconds' ? 'Interval sticker berulang harus 1–86400 detik.' : 'Interval sticker berulang harus 1–100 menit.');
  if (schedule.mode === 'timestamp') {
    if (schedule.timestamps.length === 0 || schedule.timestamps.length > 100) throw new Error('Timestamp sticker harus 1–100 item.');
    schedule.timestamps.forEach(timestampToSeconds);
  }
}

export function buildScheduleWindows(schedule: StickerSchedule, totalDurationSec: number, stickerDurationSec: number): StickerWindow[] {
  if (!(totalDurationSec > 0)) throw new Error('Durasi video target tidak valid.');
  if (!(stickerDurationSec > 0)) throw new Error('Durasi sticker harus lebih besar dari 0.');
  validateStickerSchedule(schedule);
  const duration = Math.min(stickerDurationSec, totalDurationSec);
  if (schedule.mode === 'full-duration') return [{ startSec: 0, endSec: totalDurationSec }];
  if (schedule.mode === 'timestamp') return schedule.timestamps.map(timestampToSeconds).filter((start) => start < totalDurationSec).map((start) => ({ startSec: start, endSec: Math.min(totalDurationSec, start + duration) }));
  // Repeated mode means the first appearance happens after one full interval,
  // never at 00:00. Legacy schedules without a unit continue to mean minutes.
  const intervalCount = schedule.iterativeCount ?? 1;
  const intervalSec = intervalCount * ((schedule.iterativeUnit ?? 'minutes') === 'seconds' ? 1 : 60);
  const windows: StickerWindow[] = [];
  for (let start = intervalSec; start < totalDurationSec; start += intervalSec) {
    if (windows.length >= 1000) throw new Error('Interval sticker menghasilkan terlalu banyak kemunculan; pilih interval yang lebih panjang.');
    windows.push({ startSec: start, endSec: Math.min(totalDurationSec, start + Math.min(duration, intervalSec)) });
  }
  return windows;
}
