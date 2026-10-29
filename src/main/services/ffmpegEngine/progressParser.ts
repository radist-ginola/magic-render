export type ParsedFfmpegProgress = {
  outTimeSec: number | null;
  speedMultiplier: number | null;
  progress: 'continue' | 'end' | null;
};

export class FfmpegProgressParser {
  private outTimeMs: number | null = null;
  private speedMultiplier: number | null = null;

  parseLine(line: string): ParsedFfmpegProgress {
    const trimmed = line.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return { outTimeSec: this.outTimeMs === null ? null : this.outTimeMs / 1_000_000, speedMultiplier: this.speedMultiplier, progress: null };
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (key === 'out_time_ms') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) this.outTimeMs = parsed;
    } else if (key === 'out_time_us') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) this.outTimeMs = parsed;
    } else if (key === 'out_time') {
      const seconds = parseTimestamp(value);
      if (seconds !== null) this.outTimeMs = seconds * 1_000_000;
    } else if (key === 'speed') {
      const match = /^([0-9]+(?:\.[0-9]+)?)x$/i.exec(value.trim());
      if (match) this.speedMultiplier = Number(match[1]);
    } else if (key === 'progress' && (value === 'continue' || value === 'end')) {
      return { outTimeSec: this.outTimeMs === null ? null : this.outTimeMs / 1_000_000, speedMultiplier: this.speedMultiplier, progress: value };
    }
    return { outTimeSec: this.outTimeMs === null ? null : this.outTimeMs / 1_000_000, speedMultiplier: this.speedMultiplier, progress: null };
  }

  parseStats(line: string): ParsedFfmpegProgress | null {
    const time = /\btime=\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(line);
    if (!time) return null;
    const seconds = parseTimestamp(time[1] ?? '');
    if (seconds === null) return null;
    this.outTimeMs = seconds * 1_000_000;
    const speed = /\bspeed=\s*([\d.]+)x/.exec(line);
    if (speed) this.speedMultiplier = Number(speed[1]);
    return { outTimeSec: seconds, speedMultiplier: this.speedMultiplier, progress: 'continue' };
  }
}

export function parseTimestamp(value: string): number | null {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}
