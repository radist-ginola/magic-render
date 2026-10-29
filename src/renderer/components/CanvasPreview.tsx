import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { PreviewVisualUpdate } from '../../shared/domain/previewTypes';
import { applyPreviewVisualUpdate } from '../../shared/domain/previewTypes';
import type { HistoryOptions } from '../context';
import { KeyedMedia } from './KeyedMedia';
import { OverlayCrop } from './OverlayCrop';
import { DEFAULT_BEAT, type BeatSync } from '../../shared/domain/effectTypes';
import { mainEffectStyle, particlePosition } from '../../shared/domain/effectPreview';
import { particleColor, particleGlyph, particleSize } from '../../shared/domain/particleGeometry';
import { buildScheduleWindows, type StickerWindow } from '../../shared/domain/stickerTimeline';
import { activeIntroBlur, activeIntroMediaPath, effectiveMainFadeIn } from '../../shared/domain/introTypes';
import { orderedPlaylistTracks } from '../../shared/domain/playlistOrder';
import { VisualizerPreview } from './VisualizerPreview';

type Props = { project: ProjectData; onProjectChange: (project: ProjectData, options?: HistoryOptions) => void; onInfo: (message: string) => void; hiddenLayers?: Set<string> };
type Gesture = { kind: PreviewVisualUpdate['kind']; id: string; mode: 'move' | 'resize' | 'rotate'; handle?: string; startX: number; startY: number; startWidth: number; startHeight: number; startScale: number; startRotation: number; startPosition: { x: number; y: number }; centerX: number; centerY: number };

function fileUrl(filePath: string): string { return `mrp-media://local?path=${encodeURIComponent(filePath)}`; }
function formatTime(value: number): string { const s = Math.max(0, Math.floor(value)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

function StickerEditIcon(): JSX.Element {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.25 3.5h8.5L19.5 9v9.25a2.25 2.25 0 0 1-2.25 2.25h-12A2.25 2.25 0 0 1 3 18.25v-12A2.75 2.75 0 0 1 5.25 3.5Z" />
    <path d="M13.5 3.75V9h5.25" />
    <path d="m8.4 15.9 5.95-5.95 2.2 2.2-5.95 5.95-2.95.75.75-2.95Z" />
  </svg>;
}

function readLayer(project: ProjectData, kind: PreviewVisualUpdate['kind'], id: string): { position: { x: number; y: number }; width: number; height: number; scale: number; rotation: number; opacity: number } | null {
  if (kind === 'overlay') { const item = project.overlays.find((x) => x.id === id); if (!item) return null; return { position: item.config.position, width: item.config.resize?.width ?? 320, height: item.config.resize?.height ?? 180, scale: 1, rotation: item.config.rotation, opacity: item.config.opacity }; }
  if (kind === 'text') { const item = (project.textOverlays ?? []).find((x) => x.id === id); if (!item) return null; const scale = item.config.scale ?? 1; return { position: item.config.position, width: Math.max(80, item.config.width ?? item.config.text.length * item.config.fontSize * 0.6 * scale), height: Math.max(32, item.config.fontSize * 1.35 * scale), scale, rotation: item.config.rotation ?? 0, opacity: item.config.opacity }; }
  if (kind === 'visualizer') { const item = (project.visualizers ?? []).find((x) => x.id === id); if (!item) return null; return { position: item.position, width: item.size.width, height: item.size.height, scale: 1, rotation: 0, opacity: item.opacity }; }
  const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
  const item = stickers.find((x) => x.id === id); if (!item) return null; return { position: item.config.position, width: 220 * item.config.scale, height: 124 * item.config.scale, scale: item.config.scale, rotation: item.config.rotation, opacity: item.config.opacity };
}

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

function stickerWindowAtTime(sticker: NonNullable<ProjectData['stickerSubscribes']>[number], currentTime: number, totalDuration: number): StickerWindow | null {
  if (!(totalDuration > 0)) return null;
  try {
    return buildScheduleWindows(sticker.config.schedule, totalDuration, sticker.config.durationSec)
      .find((window) => currentTime >= window.startSec && currentTime < window.endSec) ?? null;
  } catch { return null; }
}

function stickerVisibleAtTime(sticker: NonNullable<ProjectData['stickerSubscribes']>[number], currentTime: number, totalDuration: number): boolean {
  return stickerWindowAtTime(sticker, currentTime, totalDuration) !== null;
}

function stickerFadeAtTime(sticker: NonNullable<ProjectData['stickerSubscribes']>[number], currentTime: number, totalDuration: number): number {
  const window = stickerWindowAtTime(sticker, currentTime, totalDuration);
  if (!window) return 0;
  const { fadeInSec, fadeOutSec } = sticker.config.fade;
  const length = window.endSec - window.startSec;
  const fadeIn = Math.min(fadeInSec, length / 2), fadeOut = Math.min(fadeOutSec, length / 2);
  return Math.max(0, Math.min(1, fadeIn > 0 ? (currentTime - window.startSec) / fadeIn : 1, fadeOut > 0 ? (window.endSec - currentTime) / fadeOut : 1));
}

function StickerVideo({ path, time, windowStart, isPlaying, speed, muted }: { path: string; time: number; windowStart: number; isPlaying: boolean; speed: number; muted: boolean }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const sync = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const target = (((time - windowStart) * speed) % video.duration + video.duration) % video.duration;
      if (Math.abs(video.currentTime - target) > (isPlaying ? 0.35 : 0.05)) video.currentTime = target;
    };
    if (video.readyState >= 1) sync(); else video.addEventListener('loadedmetadata', sync, { once: true });
    video.playbackRate = Math.max(0.1, Math.min(8, speed));
    if (isPlaying) void video.play().catch(() => undefined); else video.pause();
    return () => video.removeEventListener('loadedmetadata', sync);
  }, [time, windowStart, speed, isPlaying]);
  return <video ref={ref} src={fileUrl(path)} muted={muted} loop playsInline className="mrp-layer-media" />;
}

export function CanvasPreview({ project, onProjectChange, onInfo, hiddenLayers = new Set() }: Props): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [editorWidth, setEditorWidth] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const videoRef = useRef<HTMLVideoElement>(null);
  const bokehVideoRef = useRef<HTMLVideoElement>(null);
  const introRef = useRef<HTMLVideoElement>(null);
  const introCompletedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [visualizerAudio, setVisualizerAudio] = useState<HTMLAudioElement | null>(null);
  const attachAudio = useCallback((element: HTMLAudioElement | null) => { audioRef.current = element; setVisualizerAudio(element); }, []);
  const pendingAudioSeek = useRef(0);
  const [audioTrackIndex, setAudioTrackIndex] = useState(0);
  const [playlistRefreshKey, setPlaylistRefreshKey] = useState(0);
  const previousVideoTime = useRef(0);
  const loopOffset = useRef(0);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const [draftProject, setDraftProject] = useState<ProjectData>(project);
  const dragProjectRef = useRef<ProjectData>(project);
  const [currentTime, setCurrentTime] = useState(0);
  const [effectClockTime, setEffectClockTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(project.mainMedia?.durationSeconds ?? 0);
  const [introDuration, setIntroDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showStickerSchedule, setShowStickerSchedule] = useState(true);
  useEffect(() => {
    const editor = canvasRef.current;
    if (!editor || typeof ResizeObserver === 'undefined') return;
    const syncEditorWidth = () => {
      const width = editor.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 0) setEditorWidth(Math.round(width * 100) / 100);
    };
    syncEditorWidth();
    const observer = new ResizeObserver(syncEditorWidth);
    observer.observe(editor);
    return () => observer.disconnect();
  }, [previewExpanded, draftProject.settings.resolution]);
  useEffect(() => {
    const followSchedule = () => setShowStickerSchedule(true);
    window.addEventListener('mrp:sticker-schedule-changed', followSchedule);
    return () => window.removeEventListener('mrp:sticker-schedule-changed', followSchedule);
  }, []);
  const [volume, setVolume] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [beat, setBeat] = useState<BeatSync>(DEFAULT_BEAT);
  useEffect(() => { setDraftProject(project); dragProjectRef.current = project; }, [project]);
  const activeProject = dragProjectRef.current;
  const mediaUrl = draftProject.mainMedia ? fileUrl(draftProject.mainMedia.path) : '';
  const stickers = draftProject.stickerSubscribes?.length ? draftProject.stickerSubscribes : (draftProject.stickerSubscribe ? [draftProject.stickerSubscribe] : []);
  const playlistDuration = draftProject.playlistTracks?.reduce((sum, track) => sum + Math.max(0, track.durationSeconds ?? 0), 0) ?? 0;
  const playlistTracks = useMemo(() => orderedPlaylistTracks(draftProject.playlistTracks?.length ? draftProject.playlistTracks : draftProject.playlist.files.map((filePath, order) => ({ path: filePath, durationSeconds: null, order })), draftProject.playlist.playbackOrder), [draftProject.playlistTracks, draftProject.playlist.files, draftProject.playlist.playbackOrder]);
  const playlistRevision = playlistTracks.map((track) => `${track.path}:${track.durationSeconds}`).join('|');
  const timelineDuration = (playlistDuration > 0 ? playlistDuration : duration) + introDuration;
  const outputWidth = draftProject.settings.resolution === '720p' ? 1280 : 1920;
  const outputHeight = outputWidth * 9 / 16;
  const introPath = activeIntroMediaPath(draftProject);
  const introIsImage = !!introPath && /\.(png|jpe?g|webp|gif)$/i.test(introPath);
  const showingIntro = !!introPath && introDuration > 0 && currentTime < introDuration;
  const introFadeDuration = Math.min(draftProject.intro.fadeInSec ?? 0.6,introDuration);
  const blurFade = activeIntroBlur(draftProject);
  const effectTimelineTime = isPlaying ? effectClockTime : currentTime;
  const contentTime = Math.max(0, currentTime - introDuration);
  const effectContentTime = Math.max(0, effectTimelineTime - introDuration);
  const blurProgress = blurFade ? Math.max(0, 1 - contentTime / blurFade.duration) : 0;
  const effectStyle = mainEffectStyle(draftProject.mainMediaEffects, effectContentTime, beat, canvasScale);
  const sceneLightStyle = draftProject.mainMedia ? {
    left: `${(draftProject.mainMedia.position.x / 1920) * 100}%`,
    top: `${(draftProject.mainMedia.position.y / 1080) * 100}%`,
    width: `${((draftProject.mainMedia.resize?.width ?? 1920) / 1920) * 100}%`,
    height: `${((draftProject.mainMedia.resize?.height ?? 1080) / 1080) * 100}%`,
    transform: `${effectStyle.transform} rotate(${draftProject.mainMedia.rotation}deg)`,
    filter: `grayscale(1) brightness(.74) contrast(8) blur(${Math.max(3, (blurFade?.blur ?? 12) * 1.7)}px)`,
    opacity: 0.55 * blurProgress,
  } : undefined;
  const fadeSeconds = effectiveMainFadeIn(draftProject);
  const darkFade = blurFade || showingIntro || fadeSeconds <= 0 ? 1 : Math.min(1, contentTime / fadeSeconds);
  const beatNeeded = [...(project.mainMediaEffects ?? []), ...(project.particleEffectsEnabled !== false ? project.particleEffects ?? [] : [])].some((effect) => effect.beatSync);
  const selectedLayer = useMemo(() => selected ? (['overlay', 'text', 'sticker', 'visualizer'] as const).map((kind) => readLayer(draftProject, kind, selected) ? { kind, data: readLayer(draftProject, kind, selected)! } : null).find(Boolean) : null, [draftProject, selected]);

  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    const source = videoRef.current, lights = bokehVideoRef.current;
    if (!source || !lights || !blurFade || showingIntro) return;
    if (Math.abs(lights.currentTime - source.currentTime) > 0.12 && lights.readyState >= 1) lights.currentTime = source.currentTime;
    if (!source.paused && lights.paused) void lights.play().catch(() => undefined);
    if (source.paused && !lights.paused) lights.pause();
  }, [currentTime, isPlaying, blurFade?.duration, showingIntro]);
  useEffect(() => { const audio = audioRef.current; if (!audio || !playlistTracks.length) return; const seek = () => { audio.currentTime = Math.min(Math.max(0, pendingAudioSeek.current), Math.max(0, (audio.duration || Infinity) - 0.01)); if (isPlaying) void audio.play().catch(() => onInfo('Audio playlist tidak dapat diputar. Periksa file MP3.')); }; if (audio.readyState >= 1) seek(); else audio.addEventListener('loadedmetadata', seek, { once: true }); return () => audio.removeEventListener('loadedmetadata', seek); }, [audioTrackIndex, playlistTracks[audioTrackIndex]?.path]);
  useEffect(() => { if (!beatNeeded) { setBeat(DEFAULT_BEAT); return; } let active = true; void window.magicRender.analyzeProjectBeat(project).then((value) => { if (active) setBeat(value); }).catch(() => { if (active) setBeat(DEFAULT_BEAT); }); return () => { active = false; }; }, [project.projectId, project.playlistTracks?.map((track) => `${track.path}:${track.durationSeconds}`).join('|'), project.playlist.files.join('|'), project.playlist.playbackOrder?.join('|'), project.mainMedia?.path, beatNeeded]);
  useEffect(() => { const introMediaPath = activeIntroMediaPath(project); if (!introMediaPath) { setIntroDuration(0); return; } let active=true; void window.magicRender.probeMainMedia(introMediaPath).then((metadata)=>{ if (active) setIntroDuration(metadata?.durationSeconds && metadata.durationSeconds>0 ? metadata.durationSeconds : 3); }).catch(()=>{ if (active) setIntroDuration(3); }); return ()=>{active=false;}; },[project.intro.enabled,project.intro.mode,project.intro.path]);
  useEffect(() => { audioRef.current?.pause(); setIsPlaying(false); setAudioTrackIndex(0); pendingAudioSeek.current=0; currentTimeRef.current=0; setCurrentTime(0); setEffectClockTime(0); previousVideoTime.current=0; loopOffset.current=0; if (videoRef.current) videoRef.current.currentTime=0; }, [playlistRevision]);
  useEffect(() => { const element = canvasRef.current; if (!element) return; const update = () => { const next = Math.max(0.01, Math.min((element.clientWidth - 3) / outputWidth, (element.clientHeight - 3) / outputHeight)); setCanvasScale((previous) => Math.abs(previous - next) > 0.0001 ? next : previous); }; const observer = new ResizeObserver(update); observer.observe(element); update(); return () => observer.disconnect(); }, [outputWidth, outputHeight]);
  // Keep the 16:9 stage centred in the viewport after resizing, changing zoom, or opening the enlarged preview. At zoom > 100%, initialise the scroll position around the frame centre instead of its top-left corner.
  useEffect(() => { const element = canvasRef.current; if (!element) return; const frame = window.requestAnimationFrame(() => { element.scrollLeft = Math.max(0, Math.round((element.scrollWidth - element.clientWidth) / 2)); element.scrollTop = Math.max(0, Math.round((element.scrollHeight - element.clientHeight) / 2)); }); return () => window.cancelAnimationFrame(frame); }, [previewExpanded, previewZoom, canvasScale, outputWidth, outputHeight]);
  useEffect(() => { setDuration(project.mainMedia?.durationSeconds ?? 0); setCurrentTime(0); currentTimeRef.current=0; setAudioTrackIndex(0); setIsPlaying(false); setShowStickerSchedule(true); setMediaError(''); previousVideoTime.current = 0; loopOffset.current = 0; }, [project.mainMedia?.path, project.mainMedia?.durationSeconds]);
  // Animate preview transforms on a 30 FPS clock instead of relying on the browser's
  // coarse video timeupdate event (often only a few times per second). Source video
  // time remains authoritative; images use a monotonic clock between timer updates.
  useEffect(() => {
    if (!isPlaying) { setEffectClockTime(currentTimeRef.current); return; }
    let frame = 0;
    let lastFrame = performance.now();
    let lastPublish = 0;
    let clock = currentTimeRef.current;
    const tick = (now: number) => {
      const delta = Math.min(0.06, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      const intro = introRef.current;
      const main = videoRef.current;
      if (intro && !intro.paused && !introIsImage && currentTimeRef.current < introDuration) {
        clock = intro.currentTime;
      } else if (main && !main.paused && draftProject.mainMedia?.type === 'video') {
        clock = introDuration + loopOffset.current + main.currentTime;
      } else {
        const reported = currentTimeRef.current;
        if (Math.abs(reported - clock) > 0.35) clock = reported; // seek, pause, or loop discontinuity
        else clock = Math.max(reported, clock + delta);
      }
      const targetFps = Math.max(24, Math.min(60, draftProject.settings.fps ?? 30));
      if (now - lastPublish >= 1000 / targetFps) { setEffectClockTime(clock); lastPublish = now; }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, introDuration, introIsImage, draftProject.mainMedia?.type, draftProject.settings.fps]);
  useEffect(() => { if (!isPlaying || (showingIntro && !introIsImage) || (draftProject.mainMedia?.type !== 'image' && !(introIsImage && showingIntro))) return; let last = performance.now(); const timer = window.setInterval(() => { const now = performance.now(); const wasIntro=currentTimeRef.current<introDuration; const next = Math.min(timelineDuration,currentTimeRef.current+(now-last)/1000); currentTimeRef.current=next; setCurrentTime(next); if (next >= introDuration) syncPlaylistAudio(next-introDuration); if (wasIntro && next >= introDuration) void audioRef.current?.play().catch(()=>onInfo('Audio playlist tidak dapat diputar.')); if (next >= introDuration && draftProject.mainMedia?.type === 'video') { window.clearInterval(timer); void videoRef.current?.play().catch(()=>onInfo('Media utama tidak dapat diputar.')); } if (next >= timelineDuration) { setIsPlaying(false); audioRef.current?.pause(); } last=now; }, 80); return () => window.clearInterval(timer); }, [isPlaying, draftProject.mainMedia?.type, timelineDuration, playlistTracks, introDuration, introIsImage, showingIntro]);

  function syncPlaylistAudio(value: number): void { if (!playlistTracks.length) return; let offset = Math.max(0, value); let index = 0; while (index < playlistTracks.length - 1 && offset >= (playlistTracks[index]?.durationSeconds ?? 0)) { offset -= playlistTracks[index]?.durationSeconds ?? 0; index++; } pendingAudioSeek.current = offset; if (index !== audioTrackIndex) { setAudioTrackIndex(index); return; } const audio = audioRef.current; if (audio && audio.readyState >= 1 && Math.abs(audio.currentTime - offset) > 0.7) audio.currentTime = Math.min(offset, Math.max(0, (audio.duration || Infinity) - 0.01)); }
  async function togglePlay(): Promise<void> { if (isPlaying) { introRef.current?.pause(); videoRef.current?.pause(); audioRef.current?.pause(); setIsPlaying(false); return; } const video = videoRef.current; if (!video && draftProject.mainMedia?.type !== 'image') return; setShowStickerSchedule(true); try { if (showingIntro) { setIsPlaying(true); if (!introIsImage) await introRef.current?.play(); return; } syncPlaylistAudio(Math.max(0,currentTime-introDuration)); if (playlistTracks.length) void audioRef.current?.play().catch(() => onInfo('Audio playlist tidak dapat diputar. Periksa file MP3.')); if (video) await video.play(); else setIsPlaying(true); } catch (error) { const message = error instanceof Error ? error.message : 'Media tidak dapat diputar.'; audioRef.current?.pause(); setMediaError(message); onInfo(`Preview video gagal diputar: ${message}`); void window.magicRender.logActivity('ERROR', 'Preview video playback failed.', message); } }
  function stop(): void { const video = videoRef.current; if (video) { video.pause(); video.currentTime = 0; } if (introRef.current) { introRef.current.pause(); introRef.current.currentTime=0; } introCompletedRef.current=false; if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } setDraftProject(project); setPlaylistRefreshKey((value)=>value+1); setAudioTrackIndex(0); pendingAudioSeek.current=0; previousVideoTime.current = 0; loopOffset.current = 0; currentTimeRef.current=0; setCurrentTime(0); setEffectClockTime(0); setIsPlaying(false); setShowStickerSchedule(true); }
  function onSeek(value: number): void { currentTimeRef.current=value; const contentTime=Math.max(0,value-introDuration); if (videoRef.current && duration > 0) { loopOffset.current = Math.floor(contentTime / duration) * duration; previousVideoTime.current = contentTime % duration; videoRef.current.currentTime = Math.min(duration - 0.001, contentTime % duration); if (value<introDuration) videoRef.current.pause(); else if (isPlaying) void videoRef.current.play(); } if (introRef.current) { introRef.current.currentTime=Math.min(value,Math.max(0,introDuration-0.001)); if (value<introDuration && isPlaying) { introCompletedRef.current=false; void introRef.current.play(); } else introRef.current.pause(); } if (value<introDuration) audioRef.current?.pause(); else { syncPlaylistAudio(contentTime); if (isPlaying) void audioRef.current?.play().catch(()=>undefined); } currentTimeRef.current=value; setCurrentTime(value); setEffectClockTime(value); setShowStickerSchedule(true); }
  function finishIntro():void { if (introCompletedRef.current || !isPlaying) return; introCompletedRef.current=true; introRef.current?.pause(); currentTimeRef.current=introDuration; setCurrentTime(introDuration); setEffectClockTime(introDuration); syncPlaylistAudio(0); if (draftProject.mainMedia?.type==='video') void videoRef.current?.play().catch(()=>onInfo('Media utama tidak dapat diputar.')); void audioRef.current?.play().catch(()=>onInfo('Audio playlist tidak dapat diputar.')); }

  useEffect(() => {
    const onPlaylistPreviewTrack = (event: Event): void => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      if (!Number.isInteger(index) || index === undefined || index < 0 || index >= playlistTracks.length) return;
      const track = playlistTracks[index];
      if (!track) return;
      if (playlistTracks.slice(0, index + 1).some((item) => item.durationSeconds === null || !Number.isFinite(item.durationSeconds))) {
        onInfo('Preview track membutuhkan durasi track yang sudah diketahui. Import ulang playlist agar FFprobe membaca durasi.');
        return;
      }
      const offset = playlistTracks.slice(0, index).reduce((sum, item) => sum + Math.max(0, item.durationSeconds ?? 0), 0);
      const targetTime = introDuration + offset;
      const sameTrack = index === audioTrackIndex;
      onSeek(targetTime);
      setIsPlaying(true);
      if (sameTrack && audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play().catch(() => onInfo('Audio playlist tidak dapat diputar. Periksa file MP3.'));
      }
      if (draftProject.mainMedia?.type === 'video') void videoRef.current?.play().catch(() => onInfo('Media utama tidak dapat diputar.'));
    };
    window.addEventListener('mrp:playlist-preview-track', onPlaylistPreviewTrack);
    return () => window.removeEventListener('mrp:playlist-preview-track', onPlaylistPreviewTrack);
  }, [playlistTracks, introDuration, audioTrackIndex, draftProject.mainMedia?.type, onInfo, isPlaying, duration]);

  useEffect(() => {
    const onShortcut = (event: Event): void => {
      const { action, step } = (event as CustomEvent<{ action: string; step: number }>).detail;
      if (action === 'play') { void togglePlay(); return; }
      if (action === 'reset-preview') { stop(); return; }
      if (action === 'zoom-in' || action === 'zoom-out') { const values = [100,150,200,300,400,500]; setPreviewZoom((old) => values[Math.max(0, Math.min(values.length - 1, values.indexOf(old) + (action === 'zoom-in' ? 1 : -1)))]!); return; }
      if (!selected) return;
      const kind = (['overlay','text','sticker','visualizer'] as const).find((entry) => readLayer(draftProject, entry, selected));
      if (!kind) return;
      if (action === 'delete-layer') {
        const overlays = draftProject.overlays.filter((item) => item.id !== selected);
        const texts = draftProject.textOverlays?.filter((item) => item.id !== selected);
        const stickers = (draftProject.stickerSubscribes?.length ? draftProject.stickerSubscribes : draftProject.stickerSubscribe ? [draftProject.stickerSubscribe] : []).filter((item) => item.id !== selected);
        const visualizers = (draftProject.visualizers ?? []).filter((item) => item.id !== selected);
        const next = { ...draftProject, overlays, textOverlays: texts, stickerSubscribes: stickers, stickerSubscribe: stickers[0] ?? null, visualizers };
        setSelected(null); setDraftProject(next); onProjectChange(next); return;
      }
      if (!action.startsWith('nudge-')) return;
      const locked = kind === 'overlay' ? draftProject.overlays.find((item) => item.id === selected)?.locked : kind === 'text' ? draftProject.textOverlays?.find((item) => item.id === selected)?.locked : kind === 'sticker' ? draftProject.stickerSubscribes?.find((item) => item.id === selected)?.locked : false;
      if (locked) return;
      const layer = readLayer(draftProject, kind, selected)!;
      const next = applyPreviewVisualUpdate(draftProject, { kind, id: selected, position: { x: layer.position.x + (action === 'nudge-right' ? step : action === 'nudge-left' ? -step : 0), y: layer.position.y + (action === 'nudge-down' ? step : action === 'nudge-up' ? -step : 0) } });
      setDraftProject(next); onProjectChange(next);
    };
    window.addEventListener('mrp:preview-action', onShortcut);
    return () => window.removeEventListener('mrp:preview-action', onShortcut);
  });

  function zoomVisualizer(id: string, direction: 1 | -1): void {
    const item = (draftProject.visualizers ?? []).find((visual) => visual.id === id);
    if (!item) return;
    const factor = direction > 0 ? 1.1 : 1 / 1.1;
    const width = clamp(Math.round(item.size.width * factor), 32, 3840);
    const height = clamp(Math.round(item.size.height * factor), 16, 2160);
    const centerX = item.position.x + item.size.width / 2;
    const centerY = item.position.y + item.size.height / 2;
    const next = applyPreviewVisualUpdate(draftProject, { kind: 'visualizer', id, position: { x: Math.round(centerX - width / 2), y: Math.round(centerY - height / 2) }, width, height });
    dragProjectRef.current = next; setDraftProject(next); onProjectChange(next, { mode: 'coalesce', label: 'Zoom visualizer canvas' });
  }

  function canvasCoordinates(event: PointerEvent): { x: number; y: number } { const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return { x: event.clientX, y: event.clientY }; return { x: (event.clientX - rect.left) * 1920 / rect.width, y: (event.clientY - rect.top) * 1080 / rect.height }; }
  function beginGesture(kind: PreviewVisualUpdate['kind'], id: string, mode: Gesture['mode'], event: PointerEvent, handle?: string): void {
    event.stopPropagation(); setSelected(id); if (kind === 'overlay' && draftProject.overlays.some((item) => item.id === id && item.locked)) return; if (kind === 'sticker' && stickers.some((item) => item.id === id && item.locked)) return; if (kind === 'text' && draftProject.textOverlays?.some((item) => item.id === id && item.locked)) return; dragProjectRef.current = draftProject; const layer = readLayer(draftProject, kind, id); if (!layer) return; const point = canvasCoordinates(event);
    gestureRef.current = { kind, id, mode, handle, startX: point.x, startY: point.y, startWidth: layer.width, startHeight: layer.height, startScale: layer.scale, startRotation: layer.rotation, startPosition: { ...layer.position }, centerX: layer.position.x + layer.width / 2, centerY: layer.position.y + layer.height / 2 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function gestureMove(event: PointerEvent): void {
    const g = gestureRef.current; if (!g) return; const point = canvasCoordinates(event); const dx = point.x - g.startX; const dy = point.y - g.startY;
    let update: PreviewVisualUpdate = { kind: g.kind, id: g.id };
    if (g.mode === 'move') {
      const proposedX = g.startPosition.x + dx, proposedY = g.startPosition.y + dy;
      const snapX = [0, 640, 960, 1280, 1920].find((mark) => Math.abs(proposedX + g.startWidth / 2 - mark) <= 14);
      const snapY = [0, 360, 540, 720, 1080].find((mark) => Math.abs(proposedY + g.startHeight / 2 - mark) <= 14);
      update.position = { x: Math.round(snapX === undefined ? proposedX : snapX - g.startWidth / 2), y: Math.round(snapY === undefined ? proposedY : snapY - g.startHeight / 2) };
      setSnapGuides({ x: snapX ?? null, y: snapY ?? null });
    }
    if (g.mode === 'resize') {
      const signX = g.handle?.includes('w') ? -1 : 1; const signY = g.handle?.includes('n') ? -1 : 1;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx * signX : dy * signY;
      const ratio = g.startHeight / Math.max(1, g.startWidth); const width = clamp(g.startWidth + delta, 20, 8192); const height = clamp(width * ratio, 20, 8192);
      update.width = width; update.height = height;
      if (g.kind !== 'overlay') update.scale = clamp(width / Math.max(1, g.startWidth) * g.startScale, 0.1, 20);
      if (g.handle?.includes('w')) update.position = { x: Math.round(g.startPosition.x - (width - g.startWidth)), y: g.startPosition.y };
      if (g.handle?.includes('n')) update.position = { x: update.position?.x ?? g.startPosition.x, y: Math.round(g.startPosition.y - (height - g.startHeight)) };
    }
    if (g.mode === 'rotate') { const angle = Math.atan2(point.y - g.centerY, point.x - g.centerX) * 180 / Math.PI; const startAngle = Math.atan2(g.startY - g.centerY, g.startX - g.centerX) * 180 / Math.PI; update.rotation = Math.round(g.startRotation + angle - startAngle); }
    const next = applyPreviewVisualUpdate(dragProjectRef.current, update);
    dragProjectRef.current = next;
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setDraftProject(dragProjectRef.current);
      });
    }
  }
  function endGesture(): void {
    setSnapGuides({ x: null, y: null });
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    setDraftProject(dragProjectRef.current);
    if (gestureRef.current) { onProjectChange(dragProjectRef.current, { mode: 'coalesce', label: `Canvas ${gestureRef.current.mode}` }); gestureRef.current = null; }
  }

  const LayerFrame = useMemo(() => function LayerFrame({ kind, id, children, width, height, position, rotation, opacityMultiplier = 1 }: { kind: PreviewVisualUpdate['kind']; id: string; children: ReactNode; width: number; height: number; position: { x: number; y: number }; rotation: number; opacityMultiplier?: number }): JSX.Element {
    const isSelected = selected === id;
    const locked = kind === 'overlay' ? !!draftProject.overlays.find((item) => item.id === id)?.locked : kind === 'sticker' ? !!stickers.find((item) => item.id === id)?.locked : !!draftProject.textOverlays?.find((item) => item.id === id)?.locked;
    const visual = kind === 'overlay' ? draftProject.overlays.find((item) => item.id === id)?.config : kind === 'sticker' ? stickers.find((item) => item.id === id)?.config : undefined;
    return <div data-blend-mode={visual?.blendMode ?? 'normal'} className={`mrp-canvas-layer mrp-canvas-layer--${kind}${isSelected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`} style={{ left: position.x, top: position.y, width, height, transform: `rotate(${rotation}deg)`, opacity: (visual?.opacity ?? 1) * opacityMultiplier }} onPointerDown={(e) => beginGesture(kind, id, 'move', e)}>
      {children}
      {isSelected && !locked && <><span className="mrp-transform-box" aria-hidden="true" /><span className="mrp-rotate-handle" title="Putar" onPointerDown={(e) => beginGesture(kind, id, 'rotate', e)} /><span className="mrp-resize-handle nw" onPointerDown={(e) => beginGesture(kind, id, 'resize', e, 'nw')} /><span className="mrp-resize-handle ne" onPointerDown={(e) => beginGesture(kind, id, 'resize', e, 'ne')} /><span className="mrp-resize-handle sw" onPointerDown={(e) => beginGesture(kind, id, 'resize', e, 'sw')} /><span className="mrp-resize-handle se" onPointerDown={(e) => beginGesture(kind, id, 'resize', e, 'se')} /></>}
    </div>;
  }, [selected, draftProject]);

  useEffect(() => { if (!previewExpanded) return; const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewExpanded(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [previewExpanded]);

  return <div className={`mrp-canvas-preview-root${previewExpanded ? ' mrp-canvas-preview--expanded' : ''}`}>
    <div ref={canvasRef} className="mrp-canvas-editor"><div className="mrp-canvas-extent" style={{ width: outputWidth * canvasScale * previewZoom / 100, height: outputHeight * canvasScale * previewZoom / 100 }}><div ref={stageRef} className="mrp-canvas-stage" style={{ left: '50%', top: '50%', transform: `translate(-50%, -50%) scale(${canvasScale * previewZoom / 100 * outputWidth / 1920})`, transformOrigin: 'center center' }} onPointerMove={gestureMove} onPointerUp={endGesture} onPointerCancel={endGesture} onPointerDown={() => setSelected(null)}>
      {draftProject.mainMedia?.type === 'image' ? <img src={mediaUrl} alt="Main media preview" className="mrp-main-media-preview" style={{ display:showingIntro ? 'none' : 'block', left: `${(draftProject.mainMedia.position.x / 1920) * 100}%`, top: `${(draftProject.mainMedia.position.y / 1080) * 100}%`, width: `${((draftProject.mainMedia.resize?.width ?? 1920) / 1920) * 100}%`, height: `${((draftProject.mainMedia.resize?.height ?? 1080) / 1080) * 100}%`, transform: `${effectStyle.transform} rotate(${draftProject.mainMedia.rotation}deg)`, filter: effectStyle.filter, objectPosition: 'center center' }} onError={(e) => { const detail = `Main image gagal dimuat (${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}).`; setMediaError(detail); void window.magicRender.logActivity('ERROR', 'Main image preview failed.', detail); onInfo(detail); }} /> : draftProject.mainMedia ? <video ref={videoRef} src={mediaUrl} muted={playlistTracks.length > 0 || draftProject.mainMedia.autoMute} className="mrp-main-media-preview" style={{ display:showingIntro ? 'none' : 'block', left: `${(draftProject.mainMedia.position.x / 1920) * 100}%`, top: `${(draftProject.mainMedia.position.y / 1080) * 100}%`, width: `${((draftProject.mainMedia.resize?.width ?? 1920) / 1920) * 100}%`, height: `${((draftProject.mainMedia.resize?.height ?? 1080) / 1080) * 100}%`, transform: `${effectStyle.transform} rotate(${draftProject.mainMedia.rotation}deg)`, filter: effectStyle.filter, objectPosition: 'center center' }} playsInline loop preload="metadata" onLoadedMetadata={(e) => { setMediaError(''); setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : duration); }} onCanPlay={() => setMediaError('')} onError={(e) => { const code = e.currentTarget.error?.code ?? 0; const detail = e.currentTarget.error?.message || `Media source error (code ${code}).`; setMediaError(detail); void window.magicRender.logActivity('ERROR', 'Main media element failed to load.', detail); onInfo(`Media tidak dapat dimuat: ${detail}`); }} onTimeUpdate={(e) => { if (introDuration > 0 && currentTimeRef.current < introDuration) return; const time = e.currentTarget.currentTime; if (time + 0.25 < previousVideoTime.current && previousVideoTime.current > duration - 0.5) loopOffset.current += duration; previousVideoTime.current = time; const elapsed = loopOffset.current + time; currentTimeRef.current=Math.min(timelineDuration, introDuration+elapsed); setCurrentTime(currentTimeRef.current); syncPlaylistAudio(elapsed); if (timelineDuration > 0 && introDuration+elapsed >= timelineDuration) { e.currentTarget.pause(); audioRef.current?.pause(); } }} onPlay={() => setIsPlaying(true)} onPause={() => { if (currentTimeRef.current>=introDuration) { setIsPlaying(false); audioRef.current?.pause(); } }} /> : <div className="absolute inset-0 grid place-items-center text-xs uppercase tracking-[0.35em] text-white/35">No Main Media</div>}
      {introPath && introDuration > 0 && (introIsImage ? <img src={fileUrl(introPath)} alt="Intro preview" className="mrp-intro-preview" style={{display:showingIntro?'block':'none',opacity:showingIntro && introFadeDuration > 0 ? Math.min(1,currentTime/introFadeDuration) : 1}}/> : <video ref={introRef} src={fileUrl(introPath)} muted playsInline preload="metadata" className="mrp-intro-preview" style={{display:showingIntro?'block':'none',opacity:showingIntro && introFadeDuration > 0 ? Math.min(1,currentTime/introFadeDuration) : 1}} onTimeUpdate={(event)=>{if (!showingIntro) return; const time=event.currentTarget.currentTime; currentTimeRef.current=Math.min(introDuration,time); setCurrentTime(currentTimeRef.current); if (time>=introDuration-0.08) finishIntro();}} onEnded={finishIntro}/>)}
      {!showingIntro && blurFade && blurProgress > 0 && <><div aria-hidden="true" className="mrp-preview-intro-blur" style={{ backdropFilter: `blur(${blurFade.blur}px) brightness(${1 + blurFade.brightness})`, opacity: blurProgress }} />{draftProject.mainMedia?.type === 'image' ? <img aria-hidden="true" src={mediaUrl} className="mrp-preview-scene-lights" style={sceneLightStyle} /> : <video aria-hidden="true" ref={bokehVideoRef} src={mediaUrl} muted playsInline loop preload="auto" className="mrp-preview-scene-lights" style={sceneLightStyle} />}</>}
      {!showingIntro && darkFade < 1 && <div aria-hidden="true" className="mrp-preview-intro-blur" style={{ background: '#000', opacity: 1 - darkFade }} />}
      {snapGuides.x !== null && <div className="mrp-snap-guide mrp-snap-guide--x" style={{ left: snapGuides.x }} />}{snapGuides.y !== null && <div className="mrp-snap-guide mrp-snap-guide--y" style={{ top: snapGuides.y }} />}
      {mediaError && <div className="absolute left-2 right-2 top-2 z-[70] rounded-lg border border-cyber-fuchsia/30 bg-black/85 px-3 py-2 text-[10px] text-cyber-fuchsia">{mediaError}</div>}
      {(draftProject.overlays ?? []).filter((item) => !hiddenLayers.has(`overlay:${item.id}`)).map((overlay) => <LayerFrame key={overlay.id} kind="overlay" id={overlay.id} width={overlay.config.resize?.width ?? 320} height={overlay.config.resize?.height ?? 180} position={overlay.config.position} rotation={overlay.config.rotation} opacityMultiplier={(overlay.config.fadeInSec ?? 0) > 0 ? Math.min(1, contentTime / (overlay.config.fadeInSec ?? 1)) : 1}><OverlayCrop crop={overlay.config.crop} mask={overlay.config.mask} width={overlay.config.resize?.width ?? 320} height={overlay.config.resize?.height ?? 180}>{overlay.config.chromaKey.enabled || overlay.config.colorKey.enabled ? <KeyedMedia path={overlay.path} video={overlay.type === 'video'} mode={overlay.config.chromaKey.enabled ? 'chroma' : 'color'} keyConfig={overlay.config.chromaKey.enabled ? overlay.config.chromaKey : overlay.config.colorKey} speed={overlay.config.speed} trim={overlay.config.trim} /> : overlay.type === 'video' ? <video src={fileUrl(overlay.path)} muted loop autoPlay playsInline className="mrp-layer-media" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = overlay.config.speed; if (overlay.config.trim) event.currentTarget.currentTime = overlay.config.trim.startSec; }} onTimeUpdate={(event) => { if (overlay.config.trim && event.currentTarget.currentTime >= overlay.config.trim.endSec - 0.03) event.currentTarget.currentTime = overlay.config.trim.startSec; }} /> : <img src={fileUrl(overlay.path)} alt="Overlay" className="mrp-layer-media" />}</OverlayCrop></LayerFrame>)}
      {(draftProject.textOverlaysEnabled === false ? [] : draftProject.textOverlays ?? []).filter((item) => !item.hiddenInPreview).map((item) => <LayerFrame key={item.id} kind="text" id={item.id} width={Math.max(80, item.config.width ?? item.config.text.length * item.config.fontSize * 0.6 * (item.config.scale ?? 1))} height={Math.max(32, item.config.fontSize * 1.35 * (item.config.scale ?? 1))} position={item.config.position} rotation={item.config.rotation ?? 0} opacityMultiplier={(item.config.fadeInSec ?? 0) > 0 ? Math.min(1, contentTime / (item.config.fadeInSec ?? 1)) : 1}><div className="mrp-layer-text" style={{ opacity: item.config.opacity, color: item.config.fontColor, WebkitTextFillColor: item.config.fontColor, fontFamily: item.config.fontFamily, fontSize: item.config.fontSize, fontStyle: item.config.italic ? 'italic' : 'normal', fontWeight: item.config.bold ? 800 : 400, textDecoration: item.config.underline ? 'underline' : 'none', WebkitTextStroke: `${item.config.strokeWidth}px ${item.config.strokeColor}`, textShadow: item.config.neonGlow ? `0 0 ${item.config.glowBlur}px ${item.config.glowColor}` : 'none', transform: `scale(${item.config.scale ?? 1})`, transformOrigin: 'left top' }}>{item.config.text}</div></LayerFrame>)}
      {!showingIntro && (draftProject.particleEffectsEnabled === false ? [] : draftProject.particleEffects ?? []).flatMap((effect) => Array.from({ length: effect.maxCount }, (_, index) => {
        const particle = particlePosition(effect, index, Math.max(0,currentTime-introDuration), beat);
        return <span key={`${effect.id}-${index}`} className={`mrp-preview-particle mrp-preview-particle--${effect.kind}`} style={{ left: particle.x, top: particle.y, opacity: particle.opacity * (effect.kind === 'smoke' ? 0.38 : 1), color:particleColor(effect,index), fontSize:particleSize(effect) }}>{particleGlyph[effect.kind]}</span>;
      }))}
      {playlistTracks.length > 0 && draftProject.visualizersEnabled !== false && <VisualizerPreview key={`${playlistRevision}:${playlistRefreshKey}`} items={draftProject.visualizers ?? []} audio={visualizerAudio} playing={isPlaying} time={effectContentTime} fps={draftProject.settings.fps ?? 30} onError={onInfo} selectedId={selected} onLayerPointerDown={(id, mode, event, handle) => beginGesture('visualizer', id, mode, event, handle)} onLayerWheelZoom={zoomVisualizer} />}
      {stickers.map((sticker, index) => !hiddenLayers.has(`sticker:${sticker.id}`) && (!showStickerSchedule || stickerVisibleAtTime(sticker, currentTime, timelineDuration)) ? <LayerFrame key={sticker.id} kind="sticker" id={sticker.id} width={220 * sticker.config.scale} height={124 * sticker.config.scale} position={sticker.config.position} rotation={sticker.config.rotation} opacityMultiplier={showStickerSchedule ? stickerFadeAtTime(sticker, currentTime, timelineDuration) : 1}><>{sticker.config.backgroundRemoval !== 'none' ? <KeyedMedia path={sticker.path} video={sticker.type === 'video'} animated={sticker.type === 'gif'} mode={sticker.config.backgroundRemoval === 'chroma' ? 'chroma' : 'color'} keyConfig={sticker.config.backgroundRemoval === 'chroma' ? sticker.config.chromaKey : sticker.config.colorKey} speed={sticker.config.speed} previewTime={currentTime} windowStart={stickerWindowAtTime(sticker,currentTime,timelineDuration)?.startSec ?? 0} isPlaying={isPlaying} /> : sticker.type === 'video' ? <StickerVideo path={sticker.path} time={currentTime} windowStart={stickerWindowAtTime(sticker, currentTime, timelineDuration)?.startSec ?? 0} isPlaying={isPlaying} speed={sticker.config.speed} muted={sticker.config.audioMuted} /> : <img src={fileUrl(sticker.path)} alt={`Sticker ${index + 1}`} draggable={false} className="mrp-layer-media" />}</></LayerFrame> : null)}
    </div></div></div>
    {playlistTracks.length > 0 && <audio key={`${playlistRevision}:${playlistRefreshKey}`} ref={attachAudio} crossOrigin="anonymous" src={fileUrl(playlistTracks[audioTrackIndex]?.path ?? '')} preload="auto" onEnded={() => syncPlaylistAudio(Math.max(0,currentTime-introDuration)+0.1)} onError={() => onInfo('MP3 preview tidak dapat dimuat. Periksa file pada Playlist.')} />}
    <div className="mrp-preview-transport-panel" style={editorWidth > 0 ? { width: `${editorWidth}px`, maxWidth: '100%' } : undefined}><div className="mrp-preview-transport-row"><button type="button" className="mrp-btn mrp-preview-transport mrp-preview-transport--play" aria-label={isPlaying ? 'Jeda preview' : 'Play preview'} title={isPlaying ? 'Jeda' : 'Play'} onClick={() => void togglePlay()}>{isPlaying ? 'Ⅱ' : '▶'}</button><button type="button" className="mrp-btn mrp-preview-transport mrp-preview-transport--reset" aria-label="Reset preview ke 00:00" title="Reset ke 00:00" onClick={stop}>↺</button><input className="mrp-preview-timeline" type="range" min="0" max={Math.max(timelineDuration, 0.1)} step="0.01" value={Math.min(currentTime, Math.max(timelineDuration, 0.1))} onChange={(e) => onSeek(Number(e.target.value))}/><span className="mrp-preview-timecode">{formatTime(currentTime)} / {formatTime(timelineDuration)}</span><label className="mrp-preview-setting mrp-preview-setting--zoom">Zoom <select aria-label="Zoom canvas preview" value={previewZoom} onChange={(e) => setPreviewZoom(Number(e.target.value))}>{[100,150,200,300,400,500].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label><button type="button" className="mrp-btn mrp-preview-zoom-toggle" aria-label={previewExpanded?'Kembalikan ukuran preview':'Besarkan preview video'} title={previewExpanded?'Keluar dari tampilan besar':'Besarkan preview video'} onClick={() => setPreviewExpanded((value)=>!value)}>{previewExpanded?'×':'⛶'}</button><label className="mrp-preview-setting mrp-preview-setting--volume">Vol <input aria-label="Volume preview" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))}/></label><button type="button" className={`mrp-btn mrp-preview-mode-toggle${showStickerSchedule ? '' : ' is-active'}`} aria-label={showStickerSchedule ? 'Tampilkan sticker untuk edit' : 'Lihat jadwal sticker'} title={showStickerSchedule ? 'Tampilkan sticker untuk edit' : 'Lihat jadwal sticker'} aria-pressed={!showStickerSchedule} onClick={() => setShowStickerSchedule((value) => !value)}><StickerEditIcon /></button></div></div>
    {selectedLayer && <div className="mrp-preview-selected-layer">Selected: <span className="text-cyber-cyan">{selectedLayer.kind}</span> • resize/rotate langsung di Canvas</div>}
  </div>;
}
