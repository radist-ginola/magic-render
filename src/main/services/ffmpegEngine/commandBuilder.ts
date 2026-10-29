import type { MainMediaControls } from '../../../shared/domain/mediaTypes';
export type SpawnCommand = { executable: string; args: string[] };
export function buildImageToVideoCommand(ffmpegExecutable: string, inputPath: string, outputPath: string, durationSeconds: number, width: number, height: number, controls?: MainMediaControls): SpawnCommand {
  if (!(durationSeconds > 0) || !Number.isFinite(durationSeconds)) throw new Error('Durasi image-to-video harus lebih besar dari 0 detik.');
  if (!(width > 0 && height > 0)) throw new Error('Resolusi output harus lebih besar dari 0.');
  const filter = controls ? buildMainMediaFilterGraph(controls, width, height, durationSeconds) : `scale=${width}:${height}`;
  const args = ['-y','-loop','1','-i',inputPath,'-c:v','libx264','-t',String(durationSeconds),'-pix_fmt','yuv420p','-vf',filter];
  if (controls?.autoMute !== false) args.push('-an');
  else args.push('-map','0:a:0?','-c:a','aac');
  args.push(outputPath);
  return { executable: ffmpegExecutable, args };
}
export function buildMainMediaFilterGraph(controls: MainMediaControls, outputWidth: number, outputHeight: number, durationSeconds: number | null): string {
  const filters: string[] = [];
  const resize = controls.resize ?? { width: outputWidth, height: outputHeight };
  filters.push(`scale=${resize.width}:${resize.height}:flags=lanczos`);
  const r = ((controls.rotation % 360) + 360) % 360;
  if (r === 90) filters.push('transpose=1'); else if (r === 180) filters.push('hflip,vflip'); else if (r === 270) filters.push('transpose=2'); else if (controls.rotation !== 0) filters.push(`format=rgba,rotate=${controls.rotation}*PI/180:fillcolor=black@0`);
  const position = controls.position;
  if (resize.width !== outputWidth || resize.height !== outputHeight || position.x !== 0 || position.y !== 0) {
    const x = Math.round(position.x), y = Math.round(position.y);
    // Oversized padding plus a fixed crop supports signed offsets and zoom beyond the frame.
    filters.push(`format=rgba,pad=iw+${outputWidth}+${Math.abs(x)}:ih+${outputHeight}+${Math.abs(y)}:${Math.max(0, x)}:${Math.max(0, y)}:color=black@1,crop=${outputWidth}:${outputHeight}:${Math.max(0, -x)}:${Math.max(0, -y)}`);
  }
  if (controls.fadeInSec > 0) filters.push(`fade=t=in:st=0:d=${controls.fadeInSec}`);
  if (controls.fadeOutSec > 0 && durationSeconds !== null) filters.push(`fade=t=out:st=${Math.max(0, durationSeconds-controls.fadeOutSec)}:d=${durationSeconds > 0 ? controls.fadeOutSec : 0}`);
  return filters.join(',');
}
export type MainMediaRenderPlan = {
  videoFilterGraph: string;
  position: { x: number; y: number };
  audioArgs: string[];
};

export function buildMainMediaRenderPlan(controls: MainMediaControls, outputWidth: number, outputHeight: number, durationSeconds: number | null): MainMediaRenderPlan {
  return {
    videoFilterGraph: buildMainMediaFilterGraph(controls, outputWidth, outputHeight, durationSeconds),
    position: { ...controls.position },
    audioArgs: buildMainMediaAudioArgs(controls),
  };
}

export function buildMainMediaAudioArgs(controls: MainMediaControls): string[] { return controls.autoMute ? ['-an'] : []; }

export function formatSpawnCommand(command: SpawnCommand): string {
  const quote = (value: string): string => /[\s\"']/.test(value) ? `\"${value.replaceAll('\"', '\\"')}\"` : value;
  const args = [...command.args];
  const graphIndex = args.indexOf('-filter_complex');
  const graph = graphIndex >= 0 ? args[graphIndex + 1] : undefined;
  if (typeof graph === 'string' && graph.length > 1200) {
    args.splice(graphIndex, 2, '-filter_complex', `<graph ${graph.length} characters; runner will use compatible option-file syntax>`);
  }
  return [quote(command.executable), ...args.map(quote)].join(' ');
}
