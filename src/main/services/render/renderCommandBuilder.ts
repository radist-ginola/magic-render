import path from 'node:path';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import { activeIntroBlur, effectiveMainFadeIn } from '../../../shared/domain/introTypes';
import type { ProjectOverlay } from '../../../shared/domain/overlayTypes';
import type { ProjectTextOverlay } from '../../../shared/domain/textOverlayTypes';
import { buildMainMediaFilterGraph } from '../ffmpegEngine/commandBuilder';
import { FilterGraphBuilder } from '../ffmpegEngine/filterGraphBuilder/filterGraphBuilder';
import { TextOverlayBuilder } from '../ffmpegEngine/textOverlayBuilder';
import { buildStickerFilterGraph } from '../ffmpegEngine/stickerFilterBuilder';
import { getResolution } from '../ffmpegEngine/resolutionMap';
import { buildAudioConcatCommand } from '../audio/audioConcatBuilder';
import { buildAudioEncodingArgs, buildVideoBitrateArgs, buildVideoEncodingArgs, buildProjectVideoEncodingArgs, renderEncodingProfile } from './encodingBuilder';
import type { AudioCompositionPlan } from '../../../shared/domain/playlistTypes';
import type { SpawnCommand } from '../ffmpegEngine/commandBuilder';
import { buildMainEffectFilters, buildParticleFilters } from '../effects/effectFilterBuilder';
import { DEFAULT_BEAT, type BeatSync } from '../../../shared/domain/effectTypes';
import { buildVisualizerFilters } from '../effects/visualizerBuilder';
import { activeIntroMediaPath } from '../../../shared/domain/introTypes';

export type VisualCompositionCommandOptions = {
  ffmpegExecutable: string;
  project: ProjectData;
  inputVideoPath: string;
  outputVideoPath: string;
  mainDurationSeconds: number;
};

export function buildVisualCompositionCommand(options: VisualCompositionCommandOptions): SpawnCommand {
  const { width, height } = getResolution(options.project.settings.resolution);
  const args: string[] = ['-y', '-i', options.inputVideoPath];
  const filterParts: string[] = [];
  const baseLabel = 'main_scaled';
  filterParts.push(`[0:v]scale=${width}:${height}:flags=lanczos,setpts=PTS-STARTPTS[${baseLabel}]`);
  let currentLabel = baseLabel;

  const overlays = options.project.overlays;
  const filterGraphBuilder = new FilterGraphBuilder();
  const overlayInputs: { sourceIndex: number; sourceLabel: string; overlay: ProjectOverlay }[] = [];
  overlays.forEach((overlay, index) => {
    args.push(overlay.type === 'image' ? '-loop' : '-stream_loop', overlay.type === 'image' ? '1' : '-1', '-i', overlay.path);
    overlayInputs.push({ sourceIndex: index + 1, sourceLabel: `${index + 1}:v`, overlay });
  });
  if (overlayInputs.length > 0) {
    const graph = filterGraphBuilder.build(currentLabel, overlayInputs, width, height);
    filterParts.push(graph.filterGraph);
    currentLabel = graph.finalLabel;
  }

  let nextInputIndex = overlays.length + 1;
  const textBuilder = new TextOverlayBuilder();
  for (const text of options.project.textOverlaysEnabled === false ? [] : options.project.textOverlays ?? []) {
    const output = `text_${text.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    filterParts.push(textBuilder.build(text, currentLabel, output, options.mainDurationSeconds));
    currentLabel = output;
  }

  const stickers = options.project.stickerSubscribes?.length ? options.project.stickerSubscribes : (options.project.stickerSubscribe ? [options.project.stickerSubscribe] : []);
  for (const sticker of stickers) {
    args.push(sticker.type === 'image' ? '-loop' : '-stream_loop', sticker.type === 'image' ? '1' : '-1', '-i', sticker.path);
    const stickerGraph = buildStickerFilterGraph(sticker, currentLabel, `${nextInputIndex}:v`, width, height, options.mainDurationSeconds, sticker.config.durationSec);
    filterParts.push(stickerGraph.filterGraph);
    currentLabel = stickerGraph.finalLabel;
    nextInputIndex += 1;
  }

  args.push('-filter_complex', filterParts.join(';'), '-map', `[${currentLabel}]`);
  if (options.project.mainMedia?.autoMute === false) args.push('-map', '0:a:0?', '-c:a', 'aac', '-b:a', '320k'); else args.push('-an');
  args.push(...buildVideoEncodingArgs({ preset: renderEncodingProfile(options.project.settings.renderPreset).preset }), '-t', options.mainDurationSeconds.toFixed(6), options.outputVideoPath);
  return { executable: options.ffmpegExecutable, args };
}

export function buildIntroConcatCommand(
  ffmpegExecutable: string,
  introPath: string,
  contentPath: string,
  outputPath: string,
  introDurationSeconds: number,
  contentDurationSeconds: number,
  width = 1920,
  height = 1080,
  introIsImage = false,
): SpawnCommand {
  if (introDurationSeconds <= 0 || contentDurationSeconds <= 0) throw new Error('Durasi intro/content tidak valid untuk concatenation.');
  const fadeIn = Math.min(1, introDurationSeconds / 2);
  const fadeOut = Math.min(1, introDurationSeconds / 2);
  const fadeStart = Math.max(0, introDurationSeconds - fadeOut);
  const filter = [
    `[0:v]scale=${width}:${height}:flags=lanczos,fade=t=in:st=0:d=${fadeIn},fade=t=out:st=${fadeStart}:d=${fadeOut},setpts=PTS-STARTPTS[intro]`,
    `[1:v]setpts=PTS-STARTPTS[content]`,
    `[intro][content]concat=n=2:v=1:a=0[vout]`,
  ].join(';');
  return {
    executable: ffmpegExecutable,
    args: ['-y', ...(introIsImage ? ['-loop', '1', '-t', introDurationSeconds.toFixed(6)] : []), '-i', introPath, '-i', contentPath, '-filter_complex', filter, '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-t', (introDurationSeconds + contentDurationSeconds).toFixed(6), outputPath],
  };
}

export function buildFinalOutputCommand(
  ffmpegExecutable: string,
  videoPath: string,
  audioPath: string | null,
  outputPath: string,
  project: ProjectData,
  durationSeconds: number,
): SpawnCommand {
  const { bitrateKbps } = project.settings;
  const args: string[] = ['-y', '-i', videoPath];
  if (audioPath) args.push('-i', audioPath);
  args.push('-map', '0:v:0');
  if (audioPath) args.push('-map', '1:a:0');
  args.push(
    ...buildVideoEncodingArgs({ preset: renderEncodingProfile(project.settings.renderPreset).preset }),
    ...buildVideoBitrateArgs({ bitrateKbps, mode: project.settings.bitrateMode, crf: renderEncodingProfile(project.settings.renderPreset).crf }),
  );
  if (audioPath) args.push(...buildAudioEncodingArgs()); else args.push('-map', '0:a:0?', ...buildAudioEncodingArgs());
  args.push('-t', durationSeconds.toFixed(6), '-movflags', '+faststart', outputPath);
  return { executable: ffmpegExecutable, args };
}

export function buildSinglePassCommand(
  ffmpegExecutable: string,
  project: ProjectData,
  outputPath: string,
  durationSeconds: number,
): SpawnCommand {
  if (!project.mainMedia) throw new Error('Main media belum dipilih.');
  const { width, height } = getResolution(project.settings.resolution);
  const filter = buildMainMediaFilterGraph({
    autoMute: project.mainMedia.autoMute,
    fadeInSec: effectiveMainFadeIn(project),
    fadeOutSec: project.mainMedia.fade.fadeOutSec,
    resize: project.mainMedia.resize,
    position: project.mainMedia.position,
    rotation: project.mainMedia.rotation,
  }, width, height, durationSeconds);
  const args = ['-y', '-i', path.resolve(project.mainMedia.path), '-vf', filter, ...buildVideoEncodingArgs({ preset: renderEncodingProfile(project.settings.renderPreset).preset }), ...buildVideoBitrateArgs({ bitrateKbps: project.settings.bitrateKbps, mode: project.settings.bitrateMode, crf: renderEncodingProfile(project.settings.renderPreset).crf })];
  if (project.mainMedia.autoMute) args.push('-an'); else args.push(...buildAudioEncodingArgs());
  args.push('-t', durationSeconds.toFixed(6), outputPath);
  return { executable: ffmpegExecutable, args };
}

export function buildAudioCommand(ffmpegExecutable: string, plan: AudioCompositionPlan, outputPath: string, introDurationSeconds = 0): SpawnCommand {
  return buildAudioConcatCommand(ffmpegExecutable, plan, outputPath, introDurationSeconds);
}

/** Compose and encode the picture once; playlist audio was prepared in the preceding stage. */
export function buildComposedOutputCommand(
  ffmpegExecutable: string,
  project: ProjectData,
  outputPath: string,
  contentDuration: number,
  introDuration: number,
  audioPath: string | null,
  mainHasAudio: boolean,
  beat: BeatSync = DEFAULT_BEAT,
): SpawnCommand {
  if (!project.mainMedia) throw new Error('Main media belum dipilih.');
  const { width, height } = getResolution(project.settings.resolution);
  const canvasScale = width / 1920;
  const fps = project.settings.fps ?? 30;
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error('FPS output tidak valid.');
  const args: string[] = ['-y'];
  const addVisual = (file: string, image: boolean, looping = true): void => {
    if (image) args.push('-loop', '1', '-framerate', String(fps));
    else if (looping) args.push('-stream_loop', '-1');
    args.push('-i', path.resolve(file));
  };
  addVisual(project.mainMedia.path, project.mainMedia.type === 'image');
  let nextIndex = 1;
  const overlays = project.overlays;
  const overlayInputs: { sourceIndex: number; sourceLabel: string; overlay: ProjectOverlay }[] = [];
  const parts: string[] = [];
  const controls = project.mainMedia;
  const introBlur = activeIntroBlur(project);
  parts.push(`[0:v]${buildMainMediaFilterGraph({ autoMute: controls.autoMute, fadeInSec: introBlur ? 0 : effectiveMainFadeIn(project), fadeOutSec: controls.fade.fadeOutSec, resize: controls.resize ? { width: Math.max(1, Math.round(controls.resize.width * canvasScale)), height: Math.max(1, Math.round(controls.resize.height * canvasScale)) } : null, position: { x: Math.round(controls.position.x * canvasScale), y: Math.round(controls.position.y * canvasScale) }, rotation: controls.rotation }, width, height, contentDuration)},trim=duration=${contentDuration.toFixed(6)},fps=${fps},setpts=PTS-STARTPTS,setsar=1[${introBlur ? 'main_source' : 'main'}]`);
  if (introBlur) {
    // Filter only the opening frames: the remaining minutes need no blur work.
    const d = Math.min(contentDuration, introBlur.duration);
    const seconds = d.toFixed(6);
    const sigma = Math.max(0.1, introBlur.blur * canvasScale).toFixed(3);
    const brightnessFactor = (1 + introBlur.brightness).toFixed(3);
    parts.push('[main_source]split=4[blur_input][sharp_input][remaining_input][highlight_input]');
    parts.push(`[blur_input]trim=duration=${seconds},setpts=PTS-STARTPTS,gblur=sigma=${sigma}:steps=1,format=rgb24,lutrgb=r='val*${brightnessFactor}':g='val*${brightnessFactor}':b='val*${brightnessFactor}',format=yuv420p[blurred_base]`);
    // Detect luminance in each actual main-media frame. A blurred highlight
    // mask follows changing lights instead of repeating a fixed PNG texture.
    const glowSigma = Math.max(3, introBlur.blur * canvasScale * 1.7).toFixed(3);
    parts.push(`[highlight_input]trim=duration=${seconds},setpts=PTS-STARTPTS,format=yuv444p,lutyuv=y='if(gte(val,175),val,0)':u=128:v=128,gblur=sigma=${glowSigma}:steps=1,format=gbrp[scene_lights]`);
    // Screen blending the U/V planes makes neutral gray turn magenta. Blend
    // light in RGB space, then return to the encoder's YUV pixel format.
    parts.push('[blurred_base]format=gbrp[blurred_rgb]');
    parts.push('[blurred_rgb][scene_lights]blend=all_mode=screen:all_opacity=0.55,format=yuv420p[blurred_opening]');
    parts.push(`[sharp_input]trim=duration=${seconds},setpts=PTS-STARTPTS[sharp_opening]`);
    parts.push(`[sharp_opening][blurred_opening]blend=all_expr='A*min(T/${seconds},1)+B*(1-min(T/${seconds},1))'[opening]`);
    if (contentDuration > d) {
      parts.push(`[remaining_input]trim=start=${seconds},setpts=PTS-STARTPTS[remaining]`);
      parts.push('[opening][remaining]concat=n=2:v=1:a=0[main]');
    } else {
      parts.push('[opening]null[main]');
      parts.push('[remaining_input]nullsink');
    }
  }
  let current = 'main';
  const mainFx = buildMainEffectFilters(project.mainMediaEffects, current, width, height, fps, beat);
  parts.push(...mainFx.filters);
  current = mainFx.output;
  overlays.forEach((overlay, index) => {
    addVisual(overlay.path, overlay.type === 'image');
    const label = `overlay_source_${index}`;
    parts.push(`[${nextIndex}:v]setpts=PTS-STARTPTS[${label}]`);
    const resize = overlay.config.resize ?? { width: 320, height: 180 };
    overlayInputs.push({ sourceIndex: nextIndex++, sourceLabel: label, overlay: { ...overlay, config: { ...overlay.config, resize: { width: Math.max(1, Math.round(resize.width * canvasScale)), height: Math.max(1, Math.round(resize.height * canvasScale)) }, position: { x: Math.round(overlay.config.position.x * canvasScale), y: Math.round(overlay.config.position.y * canvasScale) } } } });
  });
  if (overlayInputs.length) {
    const graph = new FilterGraphBuilder().build(current, overlayInputs, width, height, fps);
    parts.push(graph.filterGraph);
    current = graph.finalLabel;
  }
  const textBuilder = new TextOverlayBuilder();
  for (const [index, overlay] of (project.textOverlaysEnabled === false ? [] : project.textOverlays ?? []).entries()) {
    const label = `text_layer_${index}`;
    parts.push(textBuilder.build(overlay, current, label, contentDuration, canvasScale));
    current = label;
  }
  const particleFx = buildParticleFilters(project.particleEffectsEnabled === false ? [] : project.particleEffects, current, width, height, beat, fps);
  parts.push(...particleFx.filters);
  current = particleFx.output;
  const introMediaPath = activeIntroMediaPath(project);
  if (introDuration > 0 && introMediaPath) {
    addVisual(introMediaPath, /\.(png|jpe?g|webp|bmp)$/i.test(introMediaPath), false);
    const fade = Math.min(project.intro.fadeInSec ?? 0.6, introDuration);
    const bulkBlur=!!project.bulkItemId && project.intro.fallbackStyle==='blur' && fade>0;
    parts.push(`[${nextIndex++}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,trim=duration=${introDuration.toFixed(6)},fps=${fps},setsar=1,format=yuv420p${!bulkBlur && fade > 0 ? `,fade=t=in:st=0:d=${fade.toFixed(3)}` : ''},setpts=PTS-STARTPTS[${bulkBlur?'bulk_intro_source':'intro'}]`);
    if(bulkBlur){
      const d=fade.toFixed(6),sigma=Math.max(.1,(project.intro.fallbackBlur??12)*canvasScale).toFixed(3),brightness=(1+(project.intro.fallbackBrightness??-.25)).toFixed(3);
      parts.push('[bulk_intro_source]split=3[bulk_intro_blur_in][bulk_intro_sharp_in][bulk_intro_tail_in]');
      parts.push(`[bulk_intro_blur_in]trim=duration=${d},setpts=PTS-STARTPTS,gblur=sigma=${sigma}:steps=1,format=rgb24,lutrgb=r='val*${brightness}':g='val*${brightness}':b='val*${brightness}',format=yuv420p[bulk_intro_blurred]`);
      parts.push(`[bulk_intro_sharp_in]trim=duration=${d},setpts=PTS-STARTPTS[bulk_intro_sharp]`);
      parts.push(`[bulk_intro_sharp][bulk_intro_blurred]blend=all_expr='A*min(T/${d},1)+B*(1-min(T/${d},1))'[bulk_intro_opening]`);
      if(introDuration>fade+.001){parts.push(`[bulk_intro_tail_in]trim=start=${d},setpts=PTS-STARTPTS[bulk_intro_tail]`);parts.push('[bulk_intro_opening][bulk_intro_tail]concat=n=2:v=1:a=0[intro]');}
      else {parts.push('[bulk_intro_opening]null[intro]');parts.push('[bulk_intro_tail_in]nullsink');}
    }
    parts.push(`[${current}]format=yuv420p,trim=duration=${contentDuration.toFixed(6)},setpts=PTS-STARTPTS[content]`);
    parts.push('[intro][content]concat=n=2:v=1:a=0[video]');
    current = 'video';
  }
  // Sticker schedule is measured against the final video timeline. Add these
  // layers after prepending the intro so 00:30 always means 30 seconds into
  // the exported file, regardless of intro length.
  const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
  stickers.forEach((sticker, index) => {
    addVisual(sticker.path, sticker.type === 'image');
    const source = `sticker_source_${index}`;
    parts.push(`[${nextIndex++}:v]setpts=PTS-STARTPTS[${source}]`);
    const graph = buildStickerFilterGraph(sticker, current, source, width, height, contentDuration + introDuration, sticker.config.durationSec, canvasScale);
    parts.push(graph.filterGraph);
    current = graph.finalLabel;
  });
  // Add logo/image sources before the joined soundtrack so its input index can
  // be mapped explicitly after every optional visualizer asset.
  const visualizerSourceInputIndices: Record<string, number> = {};
  if (audioPath && project.visualizersEnabled !== false && project.visualizers?.length) {
    for (const visualizer of project.visualizers) {
      if (visualizer.kind !== 'mediaLogo' || !visualizer.sourcePath) continue;
      addVisual(visualizer.sourcePath, true);
      visualizerSourceInputIndices[visualizer.id] = nextIndex++;
    }
  }
  const audioInputIndex = nextIndex;
  if (audioPath) args.push('-i', audioPath);
  // The visualizer reads the already joined soundtrack, including intro
  // silence, so its timeline and the encoded audio share the same clock.
  if (audioPath && project.visualizersEnabled !== false && project.visualizers?.length) {
    // The visualizer is composited after the Intro concat, while its preview fade uses contentTime.
    // Offset the rendered alpha fade by Intro duration to keep preview and export in sync.
    const visual = buildVisualizerFilters(project.visualizers, current, audioInputIndex, canvasScale, fps, introDuration, visualizerSourceInputIndices);
    parts.push(...visual.filters);
    current = visual.output;
  }
  if ((project.finalFadeOutSec ?? 0) > 0) {
    const totalDuration = contentDuration + introDuration;
    const fadeDuration = Math.min(project.finalFadeOutSec!, totalDuration);
    parts.push(`[${current}]fade=t=out:st=${Math.max(0,totalDuration-fadeDuration).toFixed(6)}:d=${fadeDuration.toFixed(6)}[final_fade_out]`);
    current = 'final_fade_out';
  }
  if (!audioPath && mainHasAudio && !controls.autoMute && introDuration > 0) parts.push(`[0:a]adelay=${Math.round(introDuration * 1000)}:all=1[audio]`);
  args.push('-filter_complex', parts.join(';'), '-map', `[${current}]`);
  if (audioPath) args.push('-map', `${audioInputIndex}:a:0`, '-c:a', 'copy');
  else if (mainHasAudio && !controls.autoMute) {
    args.push('-map', introDuration > 0 ? '[audio]' : '0:a:0', ...buildAudioEncodingArgs({ audioBitrateKbps: 192 }));
  } else args.push('-an');
  args.push(...buildProjectVideoEncodingArgs(project), '-r', String(fps), '-t', (contentDuration + introDuration).toFixed(6), '-movflags', '+faststart', outputPath);
  return { executable: ffmpegExecutable, args };
}
