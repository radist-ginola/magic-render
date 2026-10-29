import { useEffect, useRef, type JSX } from 'react';

type Key = { color: string; similarity: number; blend: number };

// Preview-only pixel keying. The export pipeline uses FFmpeg's RGB colorkey filter.
export function KeyedMedia({ path, video, animated = false, keyConfig, mode, speed = 1, previewTime, windowStart = 0, isPlaying = true, trim, onTimeChange }: { path: string; video: boolean; animated?: boolean; keyConfig: Key; mode: 'chroma' | 'color'; speed?: number; previewTime?: number; windowStart?: number; isPlaying?: boolean; trim?: { startSec: number; endSec: number }; onTimeChange?: (time:number)=>void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!video || previewTime === undefined) return;
    const clip = videoRef.current;
    if (!clip) return;
    const sync = () => { if (Number.isFinite(clip.duration) && clip.duration > 0) { const target = (((previewTime - windowStart) * speed) % clip.duration + clip.duration) % clip.duration; if (Math.abs(clip.currentTime - target) > (isPlaying ? 0.35 : 0.05)) clip.currentTime = target; } };
    if (clip.readyState >= 1) sync(); else clip.addEventListener('loadedmetadata', sync, { once: true });
    if (isPlaying) void clip.play().catch(() => undefined); else clip.pause();
    return () => clip.removeEventListener('loadedmetadata', sync);
  }, [video, previewTime, windowStart, speed, isPlaying]);
  useEffect(() => {
    const source = video ? document.createElement('video') : new Image();
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context) return;
    let frame = 0;
    let stopped = false;
    let lastFrame = 0;
    const hex = keyConfig.color.replace(/^(#|0x)/i, '').padStart(6, '0');
    const rgb = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) || 0);
    const draw = () => {
      if (stopped) return;
      if ((video || animated) && performance.now() - lastFrame < 50) { frame = requestAnimationFrame(draw); return; }
      lastFrame = performance.now();
      const width = video ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth;
      const height = video ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight;
      if (width && height) {
        const scale = Math.min(1, 640 / width, 360 / height);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        try {
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const data = image.data;
          const threshold = Math.max(0.00001, Math.min(1, keyConfig.similarity));
          const softness = Math.max(0.001, Math.min(1, keyConfig.blend));
          for (let index = 0; index < data.length; index += 4) {
            // The render graph uses RGB colorkey for both UI modes. Preserve the
            // source alpha so PNG edges match the exported frame.
            const r = data[index] ?? 0, g = data[index + 1] ?? 0, b = data[index + 2] ?? 0;
            const distance = Math.hypot(r - (rgb[0] ?? 0), g - (rgb[1] ?? 0), b - (rgb[2] ?? 0)) / Math.sqrt(3 * 255 * 255);
            const alpha = Math.max(0, Math.min(1, (distance - threshold) / softness));
            data[index + 3] = Math.round((data[index + 3] ?? 0) * alpha);
          }
          context.putImageData(image, 0, 0);
        } catch { /* Preserve the source frame if its pixels are unavailable. */ }
      }
      if (video || animated) frame = requestAnimationFrame(draw);
    };
    source.crossOrigin = 'anonymous';
    if (video) {
      const clip = source as HTMLVideoElement;
      videoRef.current = clip;
      clip.muted = true; clip.loop = true; clip.playsInline = true; clip.playbackRate = Math.max(0.1, Math.min(8, speed));
      clip.addEventListener('timeupdate', () => onTimeChange?.(clip.currentTime));
      if (trim) {
        clip.addEventListener('loadedmetadata', () => { clip.currentTime = trim.startSec; }, { once: true });
        clip.addEventListener('timeupdate', () => { if (clip.currentTime >= trim.endSec - 0.03) clip.currentTime = trim.startSec; });
      }
      clip.addEventListener('loadeddata', draw);
      clip.src = `mrp-media://local?path=${encodeURIComponent(path)}`;
      if (previewTime === undefined || isPlaying) void clip.play().catch(() => undefined);
    } else {
      (source as HTMLImageElement).onload = draw;
      source.src = `mrp-media://local?path=${encodeURIComponent(path)}`;
    }
    return () => { stopped = true; cancelAnimationFrame(frame); if (video) { const clip = source as HTMLVideoElement; videoRef.current = null; clip.pause(); clip.removeAttribute('src'); clip.load(); } else (source as HTMLImageElement).onload = null; };
  }, [path, video, animated, keyConfig.color, keyConfig.similarity, keyConfig.blend, mode, speed, isPlaying, trim?.startSec, trim?.endSec]);
  return <canvas ref={canvasRef} className="mrp-layer-media mrp-layer-media--keyed" />;
}
