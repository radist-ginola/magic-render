import { useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';
import type { LockedAsset } from '../../shared/domain/lockedAssetTypes';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { overlayAssetPreset, stickerAssetPreset } from '../../shared/domain/assetPreset';
import type { OverlayConfig, OverlayMask } from '../../shared/domain/overlayTypes';
import type { StickerConfig } from '../../shared/domain/stickerTypes';
import { KeyedMedia } from './KeyedMedia';
import { OverlayCrop } from './OverlayCrop';

type Props = { asset: LockedAsset; mainMedia: ProjectData['mainMedia']; onSaved: () => Promise<void>; onClose: () => void; onMessage: (message: string) => void };
const url = (file: string) => `mrp-media://local?path=${encodeURIComponent(file)}`;
const isVideo = (file: string) => /\.(mp4|mov|mkv|webm|avi)$/i.test(file);
const toColor = (color: string) => `#${color.replace(/^(0x|#)/i, '')}`;
const range = (label: string, value: number, min: number, max: number, step: number, change: (value: number) => void) => <label>{label} <b>{Number(value.toFixed(2))}</b><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => change(Number(e.target.value))} /></label>;

export function AssetVisualEditor({ asset, mainMedia, onSaved, onClose, onMessage }: Props): JSX.Element {
  useEffect(() => { window.addEventListener('mrp:close-modal', onClose); return () => window.removeEventListener('mrp:close-modal', onClose); }, [onClose]);
  const overlay = asset.menu === 'overlay';
  const [config, setConfig] = useState<OverlayConfig | StickerConfig>(() => overlay
    ? { ...overlayAssetPreset(asset), resize: overlayAssetPreset(asset).resize ?? { width: 1920, height: 1080 } }
    : stickerAssetPreset(asset));
  const configRef = useRef<OverlayConfig | StickerConfig>(config);
  const undoStack = useRef<Array<OverlayConfig | StickerConfig>>([]);
  const redoStack = useRef<Array<OverlayConfig | StickerConfig>>([]);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loopLoading, setLoopLoading] = useState(false);
  const [loopDuplicate, setLoopDuplicate] = useState<{asset: LockedAsset; durationSec: number}|null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const checkingTwoLoops = useRef(false);
  const loopsSeen = useRef(0);
  const lastLoopTime = useRef(0);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [trimDraft, setTrimDraft] = useState<{startSec:number;endSec:number}|null>(null);
  const background = useRef<HTMLVideoElement>(null);
  const layerVideo = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; width:number; height:number; rotation:number; mode:'move'|'resize'|'rotate'|'draw' } | null>(null);
  useEffect(() => { configRef.current = config; }, [config]);
  const cloneConfig = (value: OverlayConfig | StickerConfig): OverlayConfig | StickerConfig => JSON.parse(JSON.stringify(value)) as OverlayConfig | StickerConfig;
  const patch = (change: Partial<OverlayConfig & StickerConfig>) => {
    const current = configRef.current;
    undoStack.current.push(cloneConfig(current));
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    const next = { ...current, ...change } as OverlayConfig | StickerConfig;
    configRef.current = next;
    setConfig(next);
  };
  function undoEditor(): void { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(cloneConfig(configRef.current)); configRef.current = previous; setConfig(previous); }
  function redoEditor(): void { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(cloneConfig(configRef.current)); configRef.current = next; setConfig(next); }
  const keyMode = overlay ? (config as OverlayConfig).chromaKey.enabled ? 'chroma' : (config as OverlayConfig).colorKey.enabled ? 'color' : 'none' : (config as StickerConfig).backgroundRemoval;
  const keyed = keyMode !== 'none';
  const key = keyMode === 'chroma' ? config.chromaKey : config.colorKey;
  const size = overlay ? (config as OverlayConfig).resize ?? { width: 1920, height: 1080 } : { width: 220 * (config as StickerConfig).scale, height: 124 * (config as StickerConfig).scale };
  const typeVideo = isVideo(asset.path);
  const sourceTrim = overlay ? (config as OverlayConfig).trim : undefined;
  const previewPath = loopDuplicate?.asset.path ?? asset.path;
  const previewTrim = loopDuplicate ? undefined : sourceTrim;
  function onPreviewTime(time: number): void {
    setPlayheadSec(time);
    if (checkingTwoLoops.current && loopDuplicate) {
      const duration = loopDuplicate.durationSec;
      if (lastLoopTime.current > duration * .6 && time < duration * .35) {
        loopsSeen.current += 1;
        if (loopsSeen.current >= 2) {
          checkingTwoLoops.current = false;
          setPlaying(false);
          background.current?.pause();
          layerVideo.current?.pause();
        }
      }
      lastLoopTime.current = time;
    }
  }
  const mask = overlay ? (config as OverlayConfig).mask : undefined;
  const [maskMode, setMaskMode] = useState(false);
  const [maskCursor, setMaskCursor] = useState<{x:number;y:number}|null>(null);
  const maskPoints=mask?.shape==='freehand'?mask.points??[]:[];
  const draftTrim=trimDraft??{startSec:sourceTrim?.startSec??0,endSec:sourceTrim?.endSec??sourceDuration};
  const clock=(time:number)=>{const seconds=Number.isFinite(time)?Math.max(0,time):0;return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;};
  useEffect(() => {
    const video = layerVideo.current;
    if (!video) return;
    video.playbackRate = config.speed;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing, config.speed, keyed]);

  function togglePlay(): void { if (playing) { background.current?.pause(); layerVideo.current?.pause(); } else { if (background.current) void background.current.play().catch(() => undefined); if (layerVideo.current) void layerVideo.current.play().catch(() => undefined); } setPlaying((value) => !value); }
  function resetPreview(): void {
    const start = sourceTrim?.startSec ?? 0;
    checkingTwoLoops.current = false; loopsSeen.current = 0; lastLoopTime.current = 0;
    setPlaying(false); background.current?.pause(); layerVideo.current?.pause();
    if (background.current) background.current.currentTime = 0;
    if (layerVideo.current) { try { layerVideo.current.currentTime = start; } catch { /* metadata loads later */ } }
    setPlayheadSec(start);
    setPreviewRevision((revision) => revision + 1);
  }
  function editorKey(event: React.KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? 10 : 1;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const moves: Record<string, { x: number; y: number }> = { ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step} };
    const move = moves[event.key];
    if (move) patch({ position:{ x:config.position.x+move.x,y:config.position.y+move.y } });
    else if (event.key.toLowerCase() === 'r') patch({ rotation: Math.max(-360,Math.min(360,config.rotation+step)) });
    else if (event.key === '+' || event.key === '=') patch(overlay ? { resize:{ width:Math.min(3840,size.width+step*10),height:Math.min(2160,size.height+step*6) } } : {scale:Math.min(8,(config as StickerConfig).scale+step*.05)});
    else if (event.key === '-') patch(overlay ? { resize:{ width:Math.max(32,size.width-step*10),height:Math.max(32,size.height-step*6) } } : {scale:Math.max(.1,(config as StickerConfig).scale-step*.05)});
    else if (event.key === ' ') togglePlay();
    else if (event.key === 'Home') { layerVideo.current && (layerVideo.current.currentTime = sourceTrim?.startSec ?? 0); background.current && (background.current.currentTime = 0); }
    else return;
    event.preventDefault(); event.stopPropagation();
  }
  function moveStart(event: PointerEvent<HTMLElement>, mode:'move'|'resize'|'rotate'='move'): void {
    event.stopPropagation();
    drag.current = { x:event.clientX, y:event.clientY, left:config.position.x, top:config.position.y, width:size.width, height:size.height, rotation:config.rotation, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointInLayer(event:PointerEvent<HTMLElement>): {x:number;y:number} {
    const rect=event.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)), y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  }
  function move(event: PointerEvent<HTMLElement>): void {
    if (!drag.current || !stage.current) return;
    const rect=stage.current.getBoundingClientRect(), gesture=drag.current;
    const dx=(event.clientX-gesture.x)*1920/rect.width,dy=(event.clientY-gesture.y)*1080/rect.height;
    if (gesture.mode==='move') patch({position:{x:Math.round(gesture.left+dx),y:Math.round(gesture.top+dy)}});
    if (gesture.mode==='resize') patch(overlay ? {resize:{width:Math.max(32,Math.min(3840,Math.round(gesture.width+dx))),height:Math.max(32,Math.min(2160,Math.round(gesture.height+dy)))}} : {scale:Math.max(.1,Math.min(8,(gesture.width+dx)/220))});
    if (gesture.mode==='rotate') patch({rotation:Math.max(-360,Math.min(360,Math.round(gesture.rotation+dx/3)))});
  }
  function finishGesture():void {
    drag.current=null;
  }
  function addMaskVertex(event:PointerEvent<HTMLElement>):void {
    event.stopPropagation();
    const point=pointInLayer(event);
    const first=maskPoints[0];
    if(first && maskPoints.length>=3 && Math.hypot(point.x-first.x,point.y-first.y)<.04){setMaskMode(false);setMaskCursor(null);return;}
    if(maskPoints.length>=32)return;
    patchMask({shape:'freehand',x:0,y:0,width:1,height:1,points:[...maskPoints,point]});
  }
  function patchMask(change:Partial<OverlayMask>):void {
    patch({mask:{shape:'rectangle',x:.1,y:.1,width:.8,height:.8,...mask,...change}});
  }
  async function makeSmoothLoop(): Promise<void> {
    if (!overlay || !typeVideo || !sourceDuration || loopLoading) return;
    setLoopLoading(true);
    checkingTwoLoops.current = false;
    setPlaying(false);
    try {
      const created = await window.magicRender.createSmoothLoopAsset(asset.assetId, { ...(config as OverlayConfig), trim: { ...draftTrim, sourceDurationSec: sourceDuration } });
      setLoopDuplicate(created);
      setPlayheadSec(0);
      setPreviewRevision((revision) => revision + 1);
      await onSaved();
      onMessage(`Duplikat smooth loop siap (${created.durationSec.toFixed(2)} dtk). Putar dua kali untuk memeriksa sambungan.`);
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Smooth loop gagal dibuat.'); }
    finally { setLoopLoading(false); }
  }
  function inspectSmoothLoop(): void {
    if (!loopDuplicate) return;
    checkingTwoLoops.current = true;
    loopsSeen.current = 0;
    lastLoopTime.current = 0;
    setPlayheadSec(0);
    setPreviewRevision((revision) => revision + 1);
    if (layerVideo.current) layerVideo.current.currentTime = 0;
    if (background.current) { background.current.currentTime = 0; void background.current.play().catch(() => undefined); }
    setPlaying(true);
  }
  async function removeSmoothLoop(): Promise<void> {
    if (!loopDuplicate || loopLoading) return;
    setLoopLoading(true);
    try {
      await window.magicRender.unlockAsset(loopDuplicate.asset.assetId);
      setLoopDuplicate(null);
      checkingTwoLoops.current = false;
      setPlaying(false);
      setPlayheadSec(sourceTrim?.startSec ?? 0);
      await onSaved();
      onMessage('Duplikat smooth loop dihapus dari Asset Library.');
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Duplikat tidak dapat dihapus.'); }
    finally { setLoopLoading(false); }
  }
  async function save(): Promise<void> {
    setSaving(true);
    try {
      if (overlay && (config as OverlayConfig).mask?.shape === 'freehand' && (maskMode || ((config as OverlayConfig).mask?.points?.length ?? 0) < 3)) throw new Error('Klik sedikitnya tiga titik lalu klik titik pertama untuk menutup pola mask.');
      if (overlay) {
        await window.magicRender.applyEditedOverlayAsset(asset.assetId, config as OverlayConfig);
        await onSaved();
        onMessage(`Hasil edit ${asset.metadata.originalName} sudah disimpan sebagai media final di Asset Library. File sumber di luar library tetap aman.`);
      } else {
        const visual = (({ schedule: _schedule, fade: _fade, durationSec: _durationSec, ...rest }) => rest)(config as StickerConfig);
        await window.magicRender.updateLockedAsset(asset.assetId, { config: visual as Record<string, unknown> });
        await onSaved();
        onMessage(`Preset visual ${asset.metadata.originalName} tersimpan untuk impor berikutnya.`);
      }
      onClose();
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Preset visual gagal disimpan.'); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    const onEditorShortcut = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.mrp-asset-editor')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return; }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); redoEditor(); }
      else if (key === 'z') { event.preventDefault(); event.stopImmediatePropagation(); undoEditor(); }
      else if (key === 'y') { event.preventDefault(); event.stopImmediatePropagation(); redoEditor(); }
      else if (key === 's') { event.preventDefault(); event.stopImmediatePropagation(); void save(); }
    };
    window.addEventListener('keydown', onEditorShortcut, true);
    return () => window.removeEventListener('keydown', onEditorShortcut, true);
  }, [onClose, config, maskMode, saving, asset, onSaved, onMessage]);
  return <div className="mrp-dialog-backdrop mrp-asset-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="mrp-asset-editor" role="dialog" aria-modal="true" aria-labelledby="asset-editor-title"><header><div><span className="mrp-kicker">{overlay ? 'Edit media Overlay' : 'Preset Sticker Subscribe'}</span><h2 id="asset-editor-title">{asset.metadata.originalName}</h2></div><button type="button" className="mrp-btn" aria-label="Tutup editor asset" onClick={onClose}>×</button></header><p className="mrp-bulk-hint">Tarik media, pegangan sudut untuk resize, pegangan atas untuk rotate, atau aktifkan mode gambar mask. Fokuskan canvas dengan Tab: panah menggeser, Shift+panah 10 px, +/- mengubah ukuran, R merotasi, Spasi play/jeda, Home ke awal, Ctrl+S menyimpan.</p><div className="mrp-asset-editor__layout"><div><div ref={stage} tabIndex={0} aria-label="Canvas editor aset. Gunakan panah, plus, minus, R, dan Spasi." onKeyDown={editorKey} className="mrp-asset-editor__stage">{mainMedia ? mainMedia.type === 'video' ? <video ref={background} src={url(mainMedia.path)} muted loop playsInline preload="metadata" onTimeUpdate={(event)=>{if(!typeVideo)setPlayheadSec(event.currentTarget.currentTime);}} /> : <img src={url(mainMedia.path)} alt="Contoh media utama" /> : <div className="mrp-asset-editor__empty">Import media utama untuk melihat komposisi pada latar video.</div>}<div className="mrp-asset-editor__layer" data-blend-mode={config.blendMode} style={{ left: `${config.position.x / 1920 * 100}%`, top: `${config.position.y / 1080 * 100}%`, width: `${size.width / 1920 * 100}%`, height: `${size.height / 1080 * 100}%`, opacity: config.opacity, transform: `rotate(${config.rotation}deg)` }} onPointerDown={(event) => { stage.current?.focus(); if (!maskMode) moveStart(event,'move'); }} onPointerMove={move} onPointerUp={finishGesture} onPointerCancel={finishGesture}><OverlayCrop crop={overlay ? (config as OverlayConfig).crop : undefined} mask={maskMode?undefined:mask} width={size.width} height={size.height}>{keyed ? <KeyedMedia key={`${previewPath}:${previewRevision}`} path={previewPath} video={typeVideo} animated={/\.gif$/i.test(asset.path)} mode={keyMode === 'chroma' ? 'chroma' : 'color'} keyConfig={key} speed={config.speed} isPlaying={playing} trim={previewTrim} onTimeChange={onPreviewTime} /> : typeVideo ? <video key={`${previewPath}:${previewRevision}`} ref={layerVideo} src={url(previewPath)} muted loop playsInline className="mrp-layer-media" onLoadedMetadata={(event) => { setSourceDuration(event.currentTarget.duration); if (previewTrim) event.currentTarget.currentTime = previewTrim.startSec; }} onTimeUpdate={(event) => { onPreviewTime(event.currentTarget.currentTime); if (previewTrim && event.currentTarget.currentTime >= previewTrim.endSec - .03) event.currentTarget.currentTime = previewTrim.startSec; }} /> : <img src={url(asset.path)} alt="Asset terpilih" className="mrp-layer-media" />}</OverlayCrop>{!maskMode && <><span className="mrp-asset-editor__resize" title="Tarik untuk mengubah ukuran" onPointerDown={(event)=>moveStart(event,'resize')} onPointerMove={move} onPointerUp={finishGesture}/><span className="mrp-asset-editor__rotate" title="Tarik untuk memutar" onPointerDown={(event)=>moveStart(event,'rotate')} onPointerMove={move} onPointerUp={finishGesture}/></>}{maskMode && <span className="mrp-asset-editor__draw" aria-label="Gambar pola mask pada overlay" onPointerDown={addMaskVertex} onPointerMove={(event)=>setMaskCursor(pointInLayer(event))}><svg className="mrp-asset-editor__mask-guide" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={[...maskPoints,...(maskCursor && maskPoints.length ? [maskCursor]:[])].map((p)=>`${p.x*100},${p.y*100}`).join(' ')} fill="none" stroke="#00ecff" strokeWidth=".5" vectorEffect="non-scaling-stroke" />{maskPoints.map((p,i)=><circle key={i} cx={p.x*100} cy={p.y*100} r={i===0?2:1.2} fill={i===0?'#ffde5c':'#00ecff'} stroke="#001b25" strokeWidth=".5" vectorEffect="non-scaling-stroke" />)}</svg><span className="mrp-asset-editor__mask-hint">{maskPoints.length<3?'Klik minimal 3 titik':'Klik titik kuning untuk menutup mask'}</span></span>}</div></div>{overlay && typeVideo && <video hidden muted preload="metadata" src={url(asset.path)} onLoadedMetadata={(event) => setSourceDuration(event.currentTarget.duration)} />}<div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" className="mrp-btn" title="Reset preview ke detik 00" aria-label="Reset preview ke 00:00" onClick={resetPreview}>||&lt;</button><button type="button" className="mrp-btn" onClick={togglePlay}>{playing ? 'Ⅱ Jeda preview' : '▶ Play preview'}</button></div><output className="mrp-asset-editor__clock" aria-live="off">{clock(Math.max(0, playheadSec-(sourceTrim?.startSec??0)))} / {clock(typeVideo ? (loopDuplicate?.durationSec ?? ((sourceTrim?.endSec ?? sourceDuration)-(sourceTrim?.startSec ?? 0))) : (background.current?.duration ?? 0))}</output></div><div className="mrp-asset-editor__controls">{overlay ? <>{range('Lebar', size.width, 32, 3840, 2, (width) => patch({ resize: { width, height: size.height } }))}{range('Tinggi', size.height, 32, 2160, 2, (height) => patch({ resize: { width: size.width, height } }))}{range('Zoom', Math.round(size.width / 1920 * 100), 10, 200, 1, (zoom) => patch({ resize: { width: Math.round(1920 * zoom / 100), height: Math.round(1080 * zoom / 100) } }))}<fieldset className="mrp-asset-editor__subpanel"><legend>Crop sumber (%)</legend>{(['left','right','top','bottom'] as const).map((edge) => range(({left:'Kiri',right:'Kanan',top:'Atas',bottom:'Bawah'} as const)[edge], (config as OverlayConfig).crop?.[edge] ?? 0, 0, Math.min(95, 98 - ((config as OverlayConfig).crop?.[edge === 'left' ? 'right' : edge === 'right' ? 'left' : edge === 'top' ? 'bottom' : 'top'] ?? 0)), 1, (value) => patch({ crop:{ left:0,right:0,top:0,bottom:0,...(config as OverlayConfig).crop,[edge]:value } })))}</fieldset><fieldset className="mrp-asset-editor__subpanel"><legend>Mask overlay / crop bentuk</legend><label>Bentuk<select value={mask?.shape ?? 'off'} onChange={(event)=>{const shape=event.target.value;if(shape==='off'){patch({mask:undefined});setMaskMode(false);}else{patchMask({shape:shape as OverlayMask['shape'],points:shape==='freehand'?[]:mask?.points,...(shape==='freehand'?{x:0,y:0,width:1,height:1}:{})});setMaskMode(shape==='freehand');}}}><option value="off">Tanpa mask</option><option value="rectangle">Persegi panjang</option><option value="square">Persegi</option><option value="circle">Lingkaran</option><option value="oval">Oval</option><option value="freehand">Gambar pola bebas</option></select></label>{mask && mask.shape !== 'freehand' && <>{range('Mask X (%)',Math.round(mask.x*100),0,Math.floor((1-mask.width)*100),1,(v)=>patchMask({x:v/100}))}{range('Mask Y (%)',Math.round(mask.y*100),0,Math.floor((1-mask.height)*100),1,(v)=>patchMask({y:v/100}))}{range('Lebar mask (%)',Math.round(mask.width*100),1,Math.floor((1-mask.x)*100),1,(v)=>patchMask({width:v/100}))}{range('Tinggi mask (%)',Math.round(mask.height*100),1,Math.floor((1-mask.y)*100),1,(v)=>patchMask({height:v/100}))}</>}{mask?.shape==='freehand' && <><p className="mrp-asset-editor__duration">Klik titik berurutan pada overlay, lalu klik titik pertama untuk menutup pola. Bagian luar pola akan hilang. Minimal 3 titik, maksimal 32 titik.</p><button type="button" className="mrp-btn" onClick={()=>{patchMask({shape:'freehand',x:0,y:0,width:1,height:1,points:[]});setMaskMode(true);}}>Gambar ulang</button></>}</fieldset>{typeVideo && sourceDuration > .1 && <fieldset className="mrp-asset-editor__subpanel"><legend>Trim klip overlay (detik)</legend><p className="mrp-asset-editor__duration">Durasi sumber: <b>{sourceDuration.toFixed(2)} dtk</b> • Pilihan: <b>{(draftTrim.endSec-draftTrim.startSec).toFixed(2)} dtk</b> • Diterapkan: <b>{((sourceTrim?.endSec??sourceDuration)-(sourceTrim?.startSec??0)).toFixed(2)} dtk</b></p>{range('Mulai',draftTrim.startSec,0,Math.max(0,draftTrim.endSec-.1),.1,(startSec)=>setTrimDraft({...draftTrim,startSec}))}{range('Selesai',draftTrim.endSec,Math.min(sourceDuration,draftTrim.startSec+.1),sourceDuration,.1,(endSec)=>setTrimDraft({...draftTrim,endSec}))}<button type="button" className="mrp-btn mrp-btn--primary" onClick={()=>{patch({trim:{...draftTrim,sourceDurationSec:sourceDuration}});setPlayheadSec(draftTrim.startSec);}}>Trim</button> <button type="button" className="mrp-btn" onClick={()=>{patch({trim:undefined});setTrimDraft({startSec:0,endSec:sourceDuration});setPlayheadSec(0);}}>Hapus trim</button></fieldset>}{typeVideo && sourceDuration > .5 && <fieldset className="mrp-asset-editor__subpanel"><legend>Smooth Loop · dua timeline</legend><p className="mrp-asset-editor__duration">Menyambung 70% bagian akhir overlay ke 30% bagian awal dengan keyframe opacity silang. Duplikat disimpan sebagai asset video tersendiri; preset asli tetap ada. Setelah dibuat, periksa sambungannya selama dua putaran.</p><button type="button" className="mrp-btn mrp-btn--primary" disabled={loopLoading || !!loopDuplicate} onClick={() => void makeSmoothLoop()}>{loopLoading ? '◌ Membuat smooth loop...' : 'Buat Smooth Loop'}</button>{loopDuplicate && <><button type="button" className="mrp-btn" onClick={inspectSmoothLoop}>▶ Duplikat Smooth Loop · Periksa 2 putaran</button><button type="button" className="mrp-btn" disabled={loopLoading} onClick={() => void removeSmoothLoop()}>× Hapus duplikat</button><p className="mrp-asset-editor__duration">Duplikat: {loopDuplicate.asset.metadata.originalName} • {loopDuplicate.durationSec.toFixed(2)} dtk • pakai dari Asset Library saat menambahkan overlay.</p></>}</fieldset>}</> : <>{range('Ukuran / Zoom', Math.round((config as StickerConfig).scale * 100), 10, 800, 1, (zoom) => patch({ scale: zoom / 100 }))}</>}{range('Posisi X', config.position.x, -1920, 1920, 1, (x) => patch({ position: { ...config.position, x } }))}{range('Posisi Y', config.position.y, -1080, 1080, 1, (y) => patch({ position: { ...config.position, y } }))}{range('Rotasi', config.rotation, -360, 360, 1, (rotation) => patch({ rotation }))}{range('Speed', config.speed, 0.1, 8, 0.1, (speed) => patch({ speed }))}{range('Opacity', config.opacity, 0, 1, 0.01, (opacity) => patch({ opacity }))}<label>Blend<select value={config.blendMode} onChange={(e) => patch({ blendMode: e.target.value as OverlayConfig['blendMode'] })}><option value="normal">Normal</option><option value="screen">Screen</option><option value="multiply">Multiply</option><option value="overlay">Overlay</option></select></label><label>Background Keying<select value={keyMode} onChange={(e) => patch(overlay ? { chromaKey: { ...config.chromaKey, enabled: e.target.value === 'chroma' }, colorKey: { ...config.colorKey, enabled: e.target.value === 'color' } } : { backgroundRemoval: e.target.value as StickerConfig['backgroundRemoval'], chromaKey: { ...config.chromaKey, enabled: e.target.value === 'chroma' }, colorKey: { ...config.colorKey, enabled: e.target.value === 'color' } })}><option value="none">Off</option><option value="chroma">Chroma Key</option><option value="color">Color Key</option></select></label>{keyed && <><label>Warna key<input type="color" value={toColor(key.color)} onChange={(e) => patch({ [keyMode === 'chroma' ? 'chromaKey' : 'colorKey']: { ...key, color: `0x${e.target.value.slice(1).toUpperCase()}` } } as Partial<OverlayConfig & StickerConfig>)} /></label>{range('Chrome / Color Level', key.similarity, 0, 1, 0.01, (similarity) => patch({ [keyMode === 'chroma' ? 'chromaKey' : 'colorKey']: { ...key, similarity } } as Partial<OverlayConfig & StickerConfig>))}{range('Key Blend', key.blend, 0, 1, 0.01, (blend) => patch({ [keyMode === 'chroma' ? 'chromaKey' : 'colorKey']: { ...key, blend } } as Partial<OverlayConfig & StickerConfig>))}</>}</div></div><footer><button type="button" className="mrp-btn" onClick={onClose}>Batal</button><button type="button" className="mrp-btn mrp-btn--primary" data-shortcut-save disabled={saving} onClick={() => void save()}>{saving ? 'Menyimpan...' : overlay ? 'Simpan hasil edit' : 'Simpan Preset'}</button></footer></div></div>;
}
