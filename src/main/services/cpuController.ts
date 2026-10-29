import os from 'node:os';

export type CpuAllocation = Readonly<{
  cpuLoadPercent: number;
  logicalCoreCount: number;
  ffmpegThreads: number;
}>;

export const MIN_CPU_LOAD_PERCENT = 1;
export const MAX_CPU_LOAD_PERCENT = 100;

export function validateCpuLoadPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('CPU Load harus berupa angka yang valid.');
  }
  const normalized = Math.round(value);
  if (normalized < MIN_CPU_LOAD_PERCENT || normalized > MAX_CPU_LOAD_PERCENT) {
    throw new Error(`CPU Load harus berada di antara ${MIN_CPU_LOAD_PERCENT}% dan ${MAX_CPU_LOAD_PERCENT}%.`);
  }
  return normalized;
}

export function detectLogicalCoreCount(): number {
  const count = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  return Math.max(1, Number.isFinite(count) ? Math.floor(count) : 1);
}

export function calculateSafeFfmpegThreads(cpuLoadPercent: unknown, logicalCoreCount = detectLogicalCoreCount()): number {
  const percent = validateCpuLoadPercent(cpuLoadPercent);
  const cores = Math.max(1, Math.floor(logicalCoreCount));
  // Round down so the number of occupied cores never exceeds the requested share.
  const calculated = Math.floor((cores * percent) / 100);
  return Math.min(cores, Math.max(1, calculated));
}

export function getCpuAllocation(cpuLoadPercent: unknown, logicalCoreCount = detectLogicalCoreCount()): CpuAllocation {
  const percent = validateCpuLoadPercent(cpuLoadPercent);
  const cores = Math.max(1, Math.floor(logicalCoreCount));
  return Object.freeze({
    cpuLoadPercent: percent,
    logicalCoreCount: cores,
    ffmpegThreads: calculateSafeFfmpegThreads(percent, cores),
  });
}

export function applyFfmpegThreadMapping(args: string[], cpuLoadPercent: unknown, logicalCoreCount = detectLogicalCoreCount()): string[] {
  const threads = calculateSafeFfmpegThreads(cpuLoadPercent, logicalCoreCount);
  const result = [...args];
  // These are global filter options. A -threads option before -i only limits
  // decoding of that input and leaves the encoder/complex filter unbounded.
  const insertAt = result[0] === '-y' ? 1 : 0;
  result.splice(insertAt, 0, '-filter_threads', String(threads), '-filter_complex_threads', String(threads));
  const encoder = result.indexOf('-c:v');
  if (encoder >= 0) result.splice(encoder + 2, 0, '-threads:v', String(threads));
  return result;
}

export function describeCpuAllocation(allocation: CpuAllocation): string {
  return `Target ${allocation.cpuLoadPercent}% CPU → maksimum ${allocation.ffmpegThreads} dari ${allocation.logicalCoreCount} inti logis untuk FFmpeg.`;
}
