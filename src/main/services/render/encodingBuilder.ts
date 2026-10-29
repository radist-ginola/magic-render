import type { ProjectData } from '../../../shared/domain/projectTypes';

export type VideoEncodingOptions = {
  videoCodec?: 'libx264';
  audioCodec?: 'aac';
  preset?: 'veryfast' | 'fast' | 'slow';
  audioBitrateKbps?: number;
};

export type CbrVideoEncodingOptions = {
  bitrateKbps: number;
  bufferMultiplier?: number;
};

export function buildVideoEncodingArgs(options: VideoEncodingOptions = {}): string[] {
  return [
    '-c:v', options.videoCodec ?? 'libx264',
    '-preset', options.preset ?? 'veryfast',
    '-pix_fmt', 'yuv420p',
  ];
}

export function renderEncodingProfile(preset: ProjectData['settings']['renderPreset']): { preset: NonNullable<VideoEncodingOptions['preset']>; crf: string } {
  if (preset === 'fast') return { preset: 'veryfast', crf: '21' };
  if (preset === 'slow') return { preset: 'slow', crf: '19' };
  // At the same CRF, veryfast substantially reduces CPU work on sticker-only
  // timelines. Keep the quality target and bitrate ceiling unchanged.
  return { preset: 'veryfast', crf: '20' };
}

export function buildAudioEncodingArgs(options: VideoEncodingOptions = {}): string[] {
  return [
    '-c:a', options.audioCodec ?? 'aac',
    '-b:a', `${options.audioBitrateKbps ?? 320}k`,
  ];
}

export function buildCbrVideoBitrateArgs(options: CbrVideoEncodingOptions): string[] {
  const bitrateKbps = normalizeBitrate(options.bitrateKbps);
  const bufferMultiplier = options.bufferMultiplier ?? 2;
  if (!Number.isFinite(bufferMultiplier) || bufferMultiplier < 1) throw new Error('Buffer multiplier CBR tidak valid.');
  return [
    '-b:v', `${bitrateKbps}k`,
    '-minrate', `${bitrateKbps}k`,
    '-maxrate', `${bitrateKbps}k`,
    '-bufsize', `${Math.round(bitrateKbps * bufferMultiplier)}k`,
  ];
}

export function buildVideoBitrateArgs(options: CbrVideoEncodingOptions & { mode?: 'cbr' | 'vbr'; crf?: string }): string[] {
  const bitrateKbps = normalizeBitrate(options.bitrateKbps);
  if (options.mode !== 'cbr') return ['-crf', options.crf ?? '20', '-maxrate', `${bitrateKbps}k`, '-bufsize', `${bitrateKbps * 2}k`];
  return [...buildCbrVideoBitrateArgs(options), '-x264-params', 'nal-hrd=cbr:force-cfr=1'];
}

export function buildFinalEncodingArgs(project: ProjectData): string[] {
  return [
    ...buildVideoEncodingArgs({ preset: renderEncodingProfile(project.settings.renderPreset).preset }),
    ...buildVideoBitrateArgs({ bitrateKbps: project.settings.bitrateKbps, mode: project.settings.bitrateMode, crf: renderEncodingProfile(project.settings.renderPreset).crf }),
    ...buildAudioEncodingArgs(),
  ];
}

export function buildProjectVideoEncodingArgs(project: ProjectData): string[] {
  const { gpuEncoder, renderPreset, bitrateKbps, bitrateMode } = project.settings;
  const { preset, crf } = renderEncodingProfile(renderPreset);
  if (!gpuEncoder) return [...buildVideoEncodingArgs({ preset }), ...buildVideoBitrateArgs({ bitrateKbps, mode: bitrateMode, crf })];
  const quality = renderPreset === 'fast' ? 23 : renderPreset === 'slow' ? 19 : 21;
  const speed = gpuEncoder === 'h264_nvenc' ? renderPreset === 'fast' ? 'p1' : renderPreset === 'slow' ? 'p7' : 'p4'
    : gpuEncoder === 'h264_amf' ? renderPreset === 'fast' ? 'speed' : renderPreset === 'slow' ? 'quality' : 'balanced'
    : renderPreset === 'fast' ? 'veryfast' : renderPreset === 'slow' ? 'slow' : 'medium';
  const rate = bitrateMode === 'cbr' ? buildCbrVideoBitrateArgs({ bitrateKbps })
    : ['-b:v', `${bitrateKbps}k`, '-maxrate', `${bitrateKbps}k`, '-bufsize', `${bitrateKbps * 2}k`];
  return ['-c:v', gpuEncoder, gpuEncoder === 'h264_amf' ? '-quality' : '-preset', speed, '-pix_fmt', 'nv12',
    ...(gpuEncoder === 'h264_nvenc' ? ['-rc', bitrateMode === 'cbr' ? 'cbr' : 'vbr', ...(bitrateMode === 'vbr' ? ['-cq', String(quality)] : [])] : []), ...rate];
}

export function normalizeBitrate(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) throw new Error('Video bitrate harus berada di antara 1 dan 1.000.000 kbps.');
  return Math.round(value);
}
