import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { JSX } from 'react';
import type { ProjectData, RecentProject } from '../shared/domain/projectTypes';
import type { LockedAsset, LockedAssetMenu } from '../shared/domain/lockedAssetTypes';
import type { BulkItemResult, BulkMediaItem, BulkRenderOptions } from '../shared/domain/bulkTypes';
import type { RenderProgress } from '../shared/domain/renderTypes';
import type { YoutubeSeoResult } from '../shared/domain/aiTypes';
import type { GlobalSettings } from '../shared/domain/settingsTypes';
import type { MediaMetadata } from '../shared/domain/mediaTypes';
import { ConsoleLogPanel, appendConsoleEntry, appendApplicationLog, type ConsoleLogEntry } from './components/ConsoleLogPanel';
import { MainNav } from './components/MainNav';
import { WindowChrome } from './components/WindowChrome';
import { StickerPanel } from './components/StickerPanel';
import { PlaylistPanel } from './components/PlaylistPanel';
import { IntroPanel } from './components/IntroPanel';
import { CanvasPreview } from './components/CanvasPreview';
import { PreviewEyeIcon } from './components/PreviewEyeIcon';
import { PreviewLockIcon } from './components/PreviewLockIcon';
import { DeleteLayerIcon, ChevronIcon, ResetLayerIcon } from './components/LayerActionIcons';
import { YoutubeSeoPanel } from './components/YoutubeSeoPanel';
import { HelpPage } from './components/HelpPage';
import { SettingsPanel } from './components/SettingsPanel';
import { MainMediaEffectsPanel, ParticleEffectsPanel, VisualizerPanel } from './components/EffectsPanels';
import { BulkRenderPage } from './components/BulkRenderPage';
import { TracklistManager } from './components/TracklistManager';
import { AssetVisualEditor } from './components/AssetVisualEditor';
import { overlayAssetPreset } from '../shared/domain/assetPreset';
import { HistoryProvider, useProjectHistory, type HistoryOptions } from './context';
import { countdownEta, type EtaSnapshot } from './utils/renderEta';
import { editorShortcut, isEditingField } from './utils/editorShortcuts';

type MainPage = 'Home' | 'Render' | 'Bulk Render' | 'Asset' | 'Setting' | 'Help';
type RenderTab = 'Media' | 'Intro' | 'Overlay' | 'Playlist' | 'Sticker Subscribe' | 'Youtube SEO';
const renderTabs: RenderTab[] = ['Media', 'Intro', 'Overlay', 'Playlist', 'Sticker Subscribe', 'Youtube SEO'];
type RenderCompletion = { outputPath: string; durationSec: number; elapsedSec: number; resolution: string; fps: number; bitrateKbps: number; fileSizeBytes: number | null; overlays: number; intro: boolean; stickers: number; renderDevice: 'cpu' | 'gpu'; gpu: { name: string; vramMb: number | null; encoder: string | null } };

function estimatedVideoDuration(project: ProjectData | null): number {
  if (!project) return 0;
  const tracks = project.playlistTracks ?? [];
  const playlist = tracks.length && tracks.every((track) => (track.durationSeconds ?? 0) > 0) ? tracks.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0) : 0;
  return playlist || project.mainMedia?.durationSeconds || 0;
}

function mergeRenderProgress(previous: RenderProgress | null, next: RenderProgress): RenderProgress {
  if (!previous || previous.projectId !== next.projectId) return next;
  if (['done', 'error', 'cancelled'].includes(previous.status) && !['done', 'error', 'cancelled'].includes(next.status)) return previous;
  return { ...next, elapsedRenderSec: Math.max(previous.elapsedRenderSec, next.elapsedRenderSec) };
}

function MainMediaControlsPanel({ project, onProjectChange, onReplaceMedia }: { project: ProjectData; onProjectChange: (project: ProjectData, options?: HistoryOptions) => void; onReplaceMedia: () => Promise<void> }): JSX.Element {
  const media = project.mainMedia;
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const latest = useRef(project);
  latest.current = project;
  if (!media) return <></>;
  const fadeIn = media.fade.fadeInSec, fadeOut = media.fade.fadeOutSec;
  const zoom = Math.round((media.resize?.width ?? 1920) / 1920 * 100);
  function patch(change: Partial<NonNullable<ProjectData['mainMedia']>>): void {
    const current = latest.current;
    if (!current.mainMedia) return;
    const next = { ...current, mainMedia: { ...current.mainMedia, ...change } };
    latest.current = next;
    onProjectChange(next, { mode: 'coalesce', label: 'Main media controls' });
  }
  function commit(): void { onProjectChange(latest.current, { mode: 'commit-coalesced', label: 'Main media controls' }); }
  function resetControls(): void {
    const current = latest.current;
    if (!current.mainMedia) return;
    const next = { ...current, mainMedia: { ...current.mainMedia, fade: { fadeInSec: 0, fadeOutSec: 0 }, resize: { width: 1920, height: 1080 }, position: { x: 0, y: 0 }, rotation: 0, autoMute: !!current.mainMedia.metadata?.hasAudioTrack } };
    latest.current = next; onProjectChange(next);
  }
  const slider = (label: string, value: number, change: (n: number) => void, min: number, max: number, unit: string) => <label className="mrp-main-media-controls__field">{label}<input className="mrp-main-media-controls__range" type="range" min={min} max={max} step="1" value={value} onChange={(event) => change(Number(event.target.value))}/><span className="text-white/45">{value > 0 ? '+' : ''}{value}{unit}</span></label>;
  const changed = fadeIn !== 0 || fadeOut !== 0 || media.rotation !== 0 || media.position.x !== 0 || media.position.y !== 0 || zoom !== 100 || media.autoMute !== !!media.metadata?.hasAudioTrack;
  return <div className="mrp-main-media-controls"><div className="mrp-main-media-controls__header"><div className="mrp-main-media-controls__title">Main Media Controls</div><div className="mrp-main-media-controls__actions">{changed && <button type="button" aria-label="Reset Main Media Controls" title="Reset Main Media Controls" onClick={resetControls}><ResetLayerIcon /></button>}<button type="button" aria-label={controlsCollapsed ? "Buka Main Media Controls" : "Tutup Main Media Controls"} onClick={() => setControlsCollapsed((value) => !value)}><ChevronIcon expanded={!controlsCollapsed} /></button></div></div>{!controlsCollapsed && <><div className="mrp-main-media-controls__grid" onPointerUp={commit} onKeyUp={(event) => { if (event.target instanceof HTMLInputElement && event.target.type === 'range') commit(); }}>
    <label className="mrp-main-media-controls__field">Fade In<input className="mrp-main-media-controls__range" type="range" min="0" max="30" step="0.1" value={fadeIn} onChange={(event) => patch({ fade: { ...media.fade, fadeInSec: Number(event.target.value) } })}/><span className="text-white/45">{fadeIn.toFixed(1)} detik</span></label>
    <label className="mrp-main-media-controls__field">Fade Out<input className="mrp-main-media-controls__range" type="range" min="0" max="30" step="0.1" value={fadeOut} onChange={(event) => patch({ fade: { ...media.fade, fadeOutSec: Number(event.target.value) } })}/><span className="text-white/45">{fadeOut.toFixed(1)} detik</span></label>
    {slider('Position X', media.position.x, (x) => patch({ position: { ...latest.current.mainMedia!.position, x } }), -1920, 1920, ' px')}{slider('Position Y', media.position.y, (y) => patch({ position: { ...latest.current.mainMedia!.position, y } }), -1080, 1080, ' px')}
    {slider('Rotation', media.rotation, (rotation) => patch({ rotation }), -180, 180, '°')}{slider('Zoom Out / In', zoom, (value) => { const current = latest.current.mainMedia; if (!current) return; const oldWidth = current.resize?.width ?? 1920; const oldHeight = current.resize?.height ?? 1080; const width = Math.round(1920 * value / 100 / 2) * 2; const height = Math.round(1080 * value / 100 / 2) * 2; const centerX = current.position.x === 0 && oldWidth <= 1920 ? 960 : current.position.x + oldWidth / 2; const centerY = current.position.y === 0 && oldHeight <= 1080 ? 540 : current.position.y + oldHeight / 2; patch({ resize: { width, height }, position: { x: Math.round(centerX - width / 2), y: Math.round(centerY - height / 2) } }); }, 25, 300, '%')}
    <label className="mrp-main-media-controls__mute"><input type="checkbox" checked={media.autoMute} onChange={(event) => { const next = { ...latest.current, mainMedia: { ...latest.current.mainMedia!, autoMute: event.target.checked } }; latest.current = next; onProjectChange(next); }}/> Auto Mute</label>
  </div><button className="mrp-btn mrp-main-media-controls__replace" type="button" onClick={() => void onReplaceMedia()}>Ubah Media</button></>}</div>;
}

function TextOverlayPanel({ project, onProjectChange, requestedLayerId, onLayerRequestHandled }: { project: ProjectData; onProjectChange: (project: ProjectData) => void; requestedLayerId?: string | null; onLayerRequestHandled?: () => void }): JSX.Element {
  const [text, setText] = useState('MAGIC RENDER PRO');
  const [font, setFont] = useState('Arial');
  const [installedFonts, setInstalledFonts] = useState<string[]>(['Arial']);
  const [color, setColor] = useState('#2cf9ff');
  const [glowColor, setGlowColor] = useState('#2cf9ff');
  const [strokeColor, setStrokeColor] = useState('#05050d');
  const [textError, setTextError] = useState('');
  const [size, setSize] = useState(64);
  const [opacity, setOpacity] = useState(1);
  const [fadeInSec, setFadeInSec] = useState(0);
  const [positionX, setPositionX] = useState(40);
  const [positionY, setPositionY] = useState(40);
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [stroke, setStroke] = useState(2);
  const [glow, setGlow] = useState(true);
  const [animation, setAnimation] = useState<'none'|'fade-in'|'fade-out'|'pulse'|'running-left'|'running-right'>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedTextId, setCollapsedTextId] = useState<string | null>(null);
  const [textSystemCollapsed, setTextSystemCollapsed] = useState(true);
  const overlays = project.textOverlays ?? [];
  const latestProject = useRef(project);
  latestProject.current = project;
  const selectedOverlay = overlays.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    let mounted = true;
    void window.magicRender.listDeviceFonts().then((fonts) => { if (mounted) setInstalledFonts(fonts); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  // Canvas drag/resize updates the same project state. Reflect its position in the inspector,
  // without introducing a second persistence path or replacing the existing canvas handlers.
  useEffect(() => {
    if (!selectedOverlay) return;
    setPositionX(selectedOverlay.config.position.x);
    setPositionY(selectedOverlay.config.position.y);
  }, [selectedId, selectedOverlay?.config.position.x, selectedOverlay?.config.position.y]);

  const style = { text, fadeInSec, fontFamily: font, fontStyle: italic ? 'italic' as const : 'normal' as const, fontColor: color, fontSize: size, bold, italic, underline, strokeColor, strokeWidth: stroke, opacity, neonGlow: glow, glowColor, glowBlur: 18, effect: glow ? 'glow' as const : 'none' as const, animation };
  // Preserve the original add behavior; position controls edit an existing layer after it is created.
  const config = { ...style, position: { x: 40, y: 40 }, scale: 1, rotation: 0, speed: 1 };
  const desiredStyleSignature = JSON.stringify({ text, fadeInSec, fontFamily: font, fontStyle: italic ? 'italic' : 'normal', fontColor: color, fontSize: size, bold, italic, underline, strokeColor, strokeWidth: stroke, opacity, neonGlow: glow, glowColor, animation, position: { x: positionX, y: positionY } });
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      const currentProject = latestProject.current;
      const current = (currentProject.textOverlays ?? []).find((item) => item.id === selectedId);
      if (!current) return;
      const nextConfig = { ...current.config, ...style, position: { x: positionX, y: positionY } };
      const currentSignature = JSON.stringify({ text: current.config.text, fadeInSec: current.config.fadeInSec ?? 0, fontFamily: current.config.fontFamily, fontStyle: current.config.fontStyle ?? 'normal', fontColor: current.config.fontColor, fontSize: current.config.fontSize, bold: current.config.bold, italic: current.config.italic, underline: current.config.underline, strokeColor: current.config.strokeColor, strokeWidth: current.config.strokeWidth, opacity: current.config.opacity, neonGlow: current.config.neonGlow, glowColor: current.config.glowColor, animation: current.config.animation, position: current.config.position });
      if (currentSignature === desiredStyleSignature) return;
      onProjectChange({ ...currentProject, textOverlays: (currentProject.textOverlays ?? []).map((item) => item.id === selectedId ? { ...item, config: nextConfig } : item) });
      setTextError('');
    }, 40);
    return () => window.clearTimeout(timer);
  // desiredStyleSignature captures every live control; latestProject keeps the
  // timeout from applying edits to a stale project snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, desiredStyleSignature, project.projectId]);
  const defaultStyle = { text:'MAGIC RENDER PRO',fadeInSec:0,fontFamily:'Arial',fontStyle:'normal',fontColor:'#2cf9ff',fontSize:64,bold:true,italic:false,underline:false,strokeColor:'#05050d',strokeWidth:2,opacity:1,neonGlow:true,glowColor:'#2cf9ff',glowBlur:18,effect:'glow',animation:'none' };
  const textChanged = JSON.stringify(style) !== JSON.stringify(defaultStyle) || positionX !== 40 || positionY !== 40 || !!selectedOverlay && (selectedOverlay.config.rotation !== 0 || selectedOverlay.config.scale !== 1);

  function loadOverlay(id: string): void {
    const found = overlays.find((item) => item.id === id);
    if (!found) return;
    setSelectedId(id); setCollapsedTextId(null); setTextSystemCollapsed(false); setTextError('');
    const c = found.config;
    setText(c.text); setFont(c.fontFamily); setColor(c.fontColor.startsWith('#') ? c.fontColor : `#${c.fontColor}`);
    setGlowColor(c.glowColor.startsWith('#') ? c.glowColor : `#${c.glowColor}`); setSize(c.fontSize); setOpacity(c.opacity);
    setFadeInSec(c.fadeInSec ?? 0); setPositionX(c.position.x); setPositionY(c.position.y); setBold(c.bold); setItalic(c.italic);
    setUnderline(c.underline); setStroke(c.strokeWidth); setStrokeColor(c.strokeColor.startsWith('#') ? c.strokeColor : `#${c.strokeColor}`);
    setGlow(c.neonGlow); setAnimation(c.animation);
  }
  useEffect(() => {
    if (!requestedLayerId) return;
    loadOverlay(requestedLayerId);
    onLayerRequestHandled?.();
    // This is an explicit parent request to select a layer; subsequent edits
    // are reflected through project state and do not retrigger selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedLayerId]);

  async function add(): Promise<void> {
    try {
      const r = await window.magicRender.addTextOverlay(project, config);
      onProjectChange(r.project); setSelectedId(r.project.textOverlays?.at(-1)?.id ?? null); setTextError('');
    } catch (error) { setTextError(error instanceof Error ? error.message : 'Gagal menambah teks.'); }
  }


  function resetText(): void {
    setText('MAGIC RENDER PRO'); setFont('Arial'); setColor('#2cf9ff'); setGlowColor('#2cf9ff'); setStrokeColor('#05050d');
    setSize(64); setOpacity(1); setFadeInSec(0); setPositionX(40); setPositionY(40); setBold(true); setItalic(false);
    setUnderline(false); setStroke(2); setGlow(true); setAnimation('none'); setTextError('');
    if (selectedId) onProjectChange({ ...project, textOverlays: overlays.map((item) => item.id === selectedId ? { ...item, config: { ...item.config, fontFamily:'Arial', fontColor:'#2cf9ff', glowColor:'#2cf9ff', strokeColor:'#05050d', fontSize:64, opacity:1, bold:true, italic:false, underline:false, strokeWidth:2, neonGlow:true, effect:'glow', animation:'none', fadeInSec:0, position:{x:40,y:40}, rotation:0, scale:1, speed:1 } } : item) });
  }

  async function remove(id: string): Promise<void> {
    const r = await window.magicRender.removeTextOverlay(project, id);
    onProjectChange(r.project);
    if (id === selectedId) { setSelectedId(null); setPositionX(40); setPositionY(40); }
  }

  const toggleVisibility = (id: string) => onProjectChange({ ...project, textOverlays: overlays.map((item) => item.id === id ? { ...item, hiddenInPreview: !item.hiddenInPreview } : item) });
  const toggleLock = (id: string) => onProjectChange({ ...project, textOverlays: overlays.map((item) => item.id === id ? { ...item, locked: !item.locked } : item) });

  return <section className="mrp-text-overlay-panel" aria-label="Text Overlay editor">
    <header className="mrp-text-overlay-panel__header">
      <div className="mrp-text-overlay-panel__heading">
        
        <div className="mrp-text-overlay-panel__title-row"><h3>Text Overlay</h3><span className={`mrp-text-overlay-panel__state ${selectedOverlay ? 'is-selected' : ''}`}>{selectedOverlay ? 'LAYER SELECTED' : 'NEW TEXT LAYER'}</span></div>
        
      </div>
      <div className="mrp-text-overlay-panel__actions">
        {textChanged && <button type="button" aria-label="Reset Text Overlay System" title="Reset Text Overlay System" onClick={resetText}><ResetLayerIcon /></button>}
        <button type="button" disabled={!selectedId} aria-label="Tampilkan atau sembunyikan text overlay terpilih" title="Tampilkan/sembunyikan teks terpilih" onClick={() => selectedId && toggleVisibility(selectedId)}><PreviewEyeIcon hidden={!!selectedOverlay?.hiddenInPreview} /></button>
        <button type="button" disabled={!selectedId} aria-label="Kunci atau buka text overlay terpilih" title="Kunci/buka teks terpilih" onClick={() => selectedId && toggleLock(selectedId)}><PreviewLockIcon locked={!!selectedOverlay?.locked} /></button>
        <button type="button" disabled={!selectedId} aria-label="Hapus text overlay terpilih" title="Hapus teks terpilih" className="is-danger" onClick={() => { if (selectedId) void remove(selectedId); }}><DeleteLayerIcon /></button>
        <button type="button" aria-label={textSystemCollapsed ? 'Tampilkan setting Text Overlay System' : 'Sembunyikan setting Text Overlay System'} aria-expanded={!textSystemCollapsed} title="Tampilkan/sembunyikan kontrol teks" onClick={() => setTextSystemCollapsed((value) => !value)}><ChevronIcon expanded={!textSystemCollapsed} /></button>
      </div>
    </header>

    {!textSystemCollapsed && (!selectedId || collapsedTextId !== selectedId) && <div className="mrp-text-overlay-panel__editor">
      <div className="mrp-text-overlay-panel__section-heading"><div><strong>Konten &amp; tipografi</strong><small>Pengaturan tersinkron langsung ke Canvas Preview.</small></div><span>LIVE STYLE</span></div>
      <label className="mrp-text-overlay-panel__field mrp-text-overlay-panel__field--wide">Konten teks
        <input className="mrp-text-overlay-panel__input" aria-label="Konten teks overlay" value={text} onChange={(event) => setText(event.target.value)} placeholder="Ketik teks overlay..." />
      </label>

      <div className="mrp-text-overlay-panel__fields">
        <label className="mrp-text-overlay-panel__field">Font perangkat
          <select className="mrp-text-overlay-panel__input" value={font} onChange={(event) => setFont(event.target.value)}>{![...installedFonts].includes(font) && <option value={font}>{font}</option>}{installedFonts.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        </label>
        <label className="mrp-text-overlay-panel__field">Ukuran teks <span className="mrp-text-overlay-panel__value">{size} px</span>
          <input className="mrp-text-overlay-panel__input" type="number" min="8" max="512" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))} />
        </label>
        <label className="mrp-text-overlay-panel__field">Opacity <span className="mrp-text-overlay-panel__value">{Math.round(opacity * 100)}%</span>
          <input className="mrp-text-overlay-panel__range" type="range" min="0" max="1" step="0.01" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
        </label>
        <label className="mrp-text-overlay-panel__field">Fade In <span className="mrp-text-overlay-panel__value">{fadeInSec.toFixed(1)} detik</span>
          <input className="mrp-text-overlay-panel__range" type="range" min="0" max="30" step="0.1" value={fadeInSec} onChange={(event) => setFadeInSec(Number(event.target.value))} />
        </label>
        <label className="mrp-text-overlay-panel__field mrp-text-overlay-panel__field--wide">Animasi
          <select className="mrp-text-overlay-panel__input" value={animation} onChange={(event) => setAnimation(event.target.value as typeof animation)}><option value="none">None</option><option value="fade-in">Fade In</option><option value="fade-out">Fade Out</option><option value="pulse">Pulse</option><option value="running-left">Running Left</option><option value="running-right">Running Right</option></select>
        </label>
        <label className="mrp-text-overlay-panel__field">Posisi X <span className="mrp-text-overlay-panel__value">{positionX} px</span>
          <input className="mrp-text-overlay-panel__input" type="number" min="0" max="3840" step="1" value={positionX} disabled={!selectedId} onChange={(event) => setPositionX(Math.max(0, Math.min(3840, Number(event.target.value) || 0)))} />
        </label>
        <label className="mrp-text-overlay-panel__field">Posisi Y <span className="mrp-text-overlay-panel__value">{positionY} px</span>
          <input className="mrp-text-overlay-panel__input" type="number" min="0" max="2160" step="1" value={positionY} disabled={!selectedId} onChange={(event) => setPositionY(Math.max(0, Math.min(2160, Number(event.target.value) || 0)))} />
        </label>
      </div>

      <div className="mrp-text-overlay-panel__style-row" aria-label="Gaya teks">
        <span>Gaya</span>
        <div className="mrp-text-overlay-panel__style-buttons">
          <button type="button" className={bold ? 'is-active' : ''} aria-pressed={bold} onClick={() => setBold((value) => !value)}><strong>B</strong><span>Bold</span></button>
          <button type="button" className={italic ? 'is-active' : ''} aria-pressed={italic} onClick={() => setItalic((value) => !value)}><em>I</em><span>Italic</span></button>
          <button type="button" className={underline ? 'is-active' : ''} aria-pressed={underline} onClick={() => setUnderline((value) => !value)}><u>U</u><span>Underline</span></button>
          <button type="button" className={glow ? 'is-active' : ''} aria-pressed={glow} onClick={() => setGlow((value) => !value)}><span className="mrp-text-overlay-panel__glow-dot"/>Glow</button>
        </div>
      </div>

      <div className="mrp-text-overlay-panel__colors">
        <label className="mrp-text-overlay-panel__color-field"><span>Teks</span><input aria-label="Warna Teks" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><code>{color.toUpperCase()}</code></label>
        <label className="mrp-text-overlay-panel__color-field"><span>Stroke</span><input aria-label="Warna Stroke" type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} /><code>{strokeColor.toUpperCase()}</code></label>
        <label className="mrp-text-overlay-panel__color-field"><span>Neon Glow</span><input aria-label="Warna Neon Glow" type="color" value={glowColor} onChange={(event) => setGlowColor(event.target.value)} /><code>{glowColor.toUpperCase()}</code></label>
      </div>
      <label className="mrp-text-overlay-panel__field mrp-text-overlay-panel__stroke-field">Lebar stroke <span className="mrp-text-overlay-panel__value">{stroke} px</span>
        <input className="mrp-text-overlay-panel__range" type="range" min="0" max="64" step="1" value={stroke} onChange={(event) => setStroke(Number(event.target.value))} />
      </label>

      <div className="mrp-text-overlay-panel__live-preview" aria-label="Pratinjau gaya teks">
        <span>LIVE PREVIEW</span>
        <div style={{ color, WebkitTextFillColor: color, WebkitTextStroke: `${stroke}px ${strokeColor}`, textShadow: glow ? `0 0 12px ${glowColor}` : 'none', fontFamily: font, fontSize: `min(${Math.max(8, size)}px, 10vw)`, fontWeight: bold ? 800 : 400, fontStyle: italic ? 'italic' : 'normal', textDecoration: underline ? 'underline' : 'none', opacity }}>{text || 'Pratinjau teks'}</div>
        <small>Perubahan ditampilkan langsung pada Canvas Preview.</small>
      </div>

      {textError && <div className="mrp-text-overlay-panel__error" role="alert">{textError}</div>}
      <div className="mrp-text-overlay-panel__editor-actions">
        <button type="button" className="mrp-text-overlay-panel__button mrp-text-overlay-panel__button--secondary" onClick={() => void add()}><span aria-hidden="true">＋</span> Tambah Teks</button>
        
      </div>
    </div>}


  </section>;
}

function OverlayPanel({ project, onProjectChange, hiddenLayers, onToggleLayer }: { project: ProjectData; onProjectChange: (project: ProjectData, options?: HistoryOptions) => void; hiddenLayers: Set<string>; onToggleLayer: (key: string) => void }): JSX.Element {
  const latest = useRef(project);
  latest.current = project;
  const [library, setLibrary] = useState<LockedAsset[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(true);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(project.overlays[0]?.id ?? null);
  async function refreshLibrary(): Promise<void> {
    setLibraryBusy(true);
    try { setLibrary((await window.magicRender.listLockedAssets()).filter((item) => item.menu === 'overlay')); }
    catch (error) { void window.magicRender.logActivity('ERROR', 'Gagal memuat overlay dari Asset Library.', error instanceof Error ? error.message : String(error)); }
    finally { setLibraryBusy(false); }
  }
  useEffect(() => { void refreshLibrary(); }, []);
  useEffect(() => {
    const firstOverlay = project.overlays[0];
    if (selectedOverlayId && !project.overlays.some((item) => item.id === selectedOverlayId)) setSelectedOverlayId(firstOverlay?.id ?? null);
    else if (!selectedOverlayId && firstOverlay) setSelectedOverlayId(firstOverlay.id);
  }, [project.overlays, selectedOverlayId]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleCollapsed(id: string): void { setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function getConfig(overlay: ProjectData['overlays'][number]): ProjectData['overlays'][number]['config'] { return overlay.config; }
  function patchDraft(id: string, patch: Partial<ProjectData['overlays'][number]['config']>): void {
    const base = latest.current;
    const next = { ...base, overlays: base.overlays.map((item) => item.id === id ? { ...item, config: { ...item.config, ...patch } } : item) };
    latest.current = next;
    onProjectChange(next, { mode: 'coalesce', label: 'Overlay controls' });
  }
  function commit(): void { onProjectChange(latest.current, { mode: 'commit-coalesced', label: 'Overlay controls' }); }
  function patchNested(id: string, key: 'position' | 'resize' | 'chromaKey' | 'colorKey', value: unknown): void { patchDraft(id, { [key]: value } as Partial<ProjectData['overlays'][number]['config']>); }
  const centeredSlider = (label: string, value: number, min: number, max: number, onChange: (value: number) => void, display: string) => <label className="mrp-overlay-slider">{label}<input type="range" min={min} max={max} step="1" value={Math.max(min, Math.min(max, value))} onChange={(event) => onChange(Number(event.target.value))}/><span>{value > 0 ? '+' : ''}{value} {display}</span></label>;
  const scaleOffset = (value: number, base: number): number => Math.round(33.333 * Math.log2(Math.max(1, value) / base));
  const scaledValue = (offset: number, base: number): number => Math.max(1, Math.round(base * (2 ** (offset / 33.333))));
  function resetOverlay(overlay: ProjectData['overlays'][number]): void {
    const next = { opacity:1, position:{x:0,y:0}, resize:null, rotation:0, speed:1, fadeInSec:0, blendMode:'normal' as const, chromaKey:{enabled:false,color:'0x00FF00',similarity:0.3,blend:0.1}, colorKey:{enabled:false,color:'0x000000',similarity:0.3,blend:0.1} };
    onProjectChange({ ...project, overlays: project.overlays.map((item) => item.id === overlay.id ? { ...item, config:next } : item) });
  }
  function toggleLock(id: string): void { onProjectChange({ ...project, overlays: project.overlays.map((item) => item.id === id ? { ...item, locked: !item.locked } : item) }); }
  async function add(type: 'image' | 'video', asset?: LockedAsset): Promise<void> {
    try {
      const result = await window.magicRender.addOverlay(project, type, asset?.path);
      if (result) {
        const lastIndex = result.project.overlays.length - 1;
        const overlays = result.project.overlays.map((item, index) => index === lastIndex && asset ? { ...item, config: overlayAssetPreset(asset) } : item);
        onProjectChange({ ...result.project, overlays });
        const addedOverlay = lastIndex >= 0 ? result.project.overlays[lastIndex] : undefined;
        if (addedOverlay) setSelectedOverlayId(addedOverlay.id);
      }
    } catch (error) { void window.magicRender.logActivity('ERROR', 'Overlay import gagal.', error instanceof Error ? error.message : String(error)); }
  }
  async function remove(id: string): Promise<void> {
    try {
      const next = (await window.magicRender.removeOverlay(project, id)).project;
      onProjectChange(next);
      if (selectedOverlayId === id) setSelectedOverlayId(next.overlays[0]?.id ?? null);
    } catch (error) { void window.magicRender.logActivity('ERROR', 'Overlay remove gagal.', error instanceof Error ? error.message : String(error)); }
  }
  const selectedOverlay = project.overlays.find((item) => item.id === selectedOverlayId) ?? null;
  const selectedIndex = selectedOverlay ? project.overlays.findIndex((item) => item.id === selectedOverlay.id) : -1;
  const selectedConfig = selectedOverlay ? getConfig(selectedOverlay) : null;
  const keyMode = selectedConfig ? selectedConfig.chromaKey.enabled ? 'chroma' : selectedConfig.colorKey.enabled ? 'color' : 'none' : 'none';
  const mediaUrl = (filePath: string) => `mrp-media://local?path=${encodeURIComponent(filePath)}`;
  const isVideoPath = (filePath: string) => /\.(mp4|mov|mkv|webm|gif|avi|m4v)$/i.test(filePath);
  const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const previewThumb = (filePath: string, video: boolean, label: string) => <div className="mrp-overlay-thumb">{video ? <video src={mediaUrl(filePath)} muted loop autoPlay playsInline preload="metadata" aria-label={label}/> : <img src={mediaUrl(filePath)} alt={label} loading="lazy"/>}</div>;
  return <div className="mrp-overlay-panel" onPointerUp={commit} onKeyUp={commit} onBlur={commit}>
    <div className="mrp-overlay-panel__left-column">
      <section className="mrp-overlay-section mrp-overlay-panel__library" aria-label="Asset Overlay">
        <div className="mrp-overlay-section__header">
          <div><span className="mrp-kicker">LIBRARY</span><h3>Asset Overlay</h3><p>Pilih asset untuk menambahkannya sebagai layer.</p></div>
          <button type="button" className="mrp-btn" disabled={libraryBusy} aria-label="Refresh Asset Overlay" title="Refresh Asset Overlay" onClick={() => void refreshLibrary()}>{libraryBusy ? '…' : '↻'}</button>
        </div>
        <div className="mrp-overlay-library-actions"><button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void add('image')}>＋ Image</button><button type="button" className="mrp-btn" onClick={() => void add('video')}>＋ Video</button><button type="button" className="mrp-btn mrp-overlay-collapse" aria-label={libraryCollapsed ? 'Expand daftar media overlay' : 'Collapse daftar media overlay'} title={libraryCollapsed ? 'Tampilkan daftar media' : 'Sembunyikan daftar media'} aria-expanded={!libraryCollapsed} onClick={() => setLibraryCollapsed((value) => !value)}>{libraryCollapsed ? '▾' : '▴'}</button></div>
        {!libraryCollapsed && <div className="mrp-overlay-asset-grid">{library.length ? library.map((asset) => {
          const video = isVideoPath(asset.path);
          return <button key={asset.assetId} type="button" className="mrp-overlay-asset-card" title={`Tambahkan ${asset.metadata.originalName}`} onClick={() => void add(video ? 'video' : 'image', asset)}>
            {previewThumb(asset.path, video, asset.metadata.originalName)}<span className="mrp-overlay-asset-card__name">{asset.metadata.originalName}</span><small>{asset.metadata.extension.replace(/^\./, '').toUpperCase()} · {fileSize(asset.metadata.sizeBytes)}</small><span className="mrp-overlay-asset-card__add">＋ Tambahkan</span>
          </button>;
        }) : <div className="mrp-overlay-empty">{libraryBusy ? 'Memuat Asset Library…' : 'Belum ada overlay di Asset Library. Tambahkan asset melalui menu Asset, lalu Refresh.'}</div>}</div>}
      </section>
      <section className="mrp-overlay-section mrp-overlay-panel__layers" aria-label="Layer Overlay">
        <div className="mrp-overlay-section__header"><div><span className="mrp-kicker">PROJECT LAYERS</span><h3>Layer Overlay <span className="mrp-overlay-count">{project.overlays.length}</span></h3></div><span className="mrp-overlay-section__hint">Urutan project</span></div>
        <div className="mrp-overlay-layer-list">{project.overlays.length === 0 ? <div className="mrp-overlay-empty">Belum ada layer. Pilih Image, Video, atau asset dari library.</div> : project.overlays.map((overlay, index) => <div key={overlay.id} className={`mrp-overlay-layer${selectedOverlayId === overlay.id ? ' is-selected' : ''}`}>
          <button type="button" className="mrp-overlay-layer__select" aria-pressed={selectedOverlayId === overlay.id} onClick={() => setSelectedOverlayId(overlay.id)}>{previewThumb(overlay.path, overlay.type === 'video', `Preview ${overlay.type} layer ${index + 1}`)}<span><strong>{overlay.path.split(/[\\/]/).at(-1) || `Overlay ${index + 1}`}</strong><small>Layer {index + 1} · {overlay.type === 'video' ? 'Video' : 'Image'}</small></span></button>
          <div className="mrp-overlay-layer__actions"><button type="button" aria-label="Reset pengaturan overlay" title="Reset pengaturan overlay" onClick={() => resetOverlay(overlay)}><ResetLayerIcon /></button><button type="button" aria-label={hiddenLayers.has(`overlay:${overlay.id}`) ? 'Tampilkan overlay' : 'Sembunyikan overlay'} title={hiddenLayers.has(`overlay:${overlay.id}`) ? 'Tampilkan di preview' : 'Sembunyikan dari preview'} onClick={() => onToggleLayer(`overlay:${overlay.id}`)}><PreviewEyeIcon hidden={hiddenLayers.has(`overlay:${overlay.id}`)} /></button><button type="button" aria-pressed={!!overlay.locked} aria-label={overlay.locked ? 'Buka kunci overlay' : 'Kunci overlay'} title={overlay.locked ? 'Buka kunci posisi di preview' : 'Kunci posisi di preview'} onClick={() => toggleLock(overlay.id)}><PreviewLockIcon locked={!!overlay.locked} /></button><button type="button" className="is-danger" aria-label="Hapus overlay" title="Hapus overlay" onClick={() => void remove(overlay.id)}><DeleteLayerIcon /></button></div>
        </div>)}</div>
      </section>
    </div>
    <section className="mrp-overlay-section mrp-overlay-panel__inspector" aria-label="Pengaturan overlay terpilih">
      {selectedOverlay && selectedConfig ? <>
        <div className="mrp-overlay-inspector__header"><div><span className="mrp-kicker">SELECTED LAYER</span><h3>{selectedOverlay.path.split(/[\\/]/).at(-1) || `Overlay ${selectedIndex + 1}`}</h3><p>{selectedOverlay.type.toUpperCase()} · Overlay {selectedIndex + 1}{selectedOverlay.locked ? ' · Terkunci' : ''}</p></div><div className="mrp-overlay-inspector__actions"><button type="button" aria-label="Reset pengaturan overlay" title="Reset pengaturan overlay" onClick={() => resetOverlay(selectedOverlay)}><ResetLayerIcon /></button><button type="button" aria-label={hiddenLayers.has(`overlay:${selectedOverlay.id}`) ? 'Tampilkan overlay' : 'Sembunyikan overlay'} title={hiddenLayers.has(`overlay:${selectedOverlay.id}`) ? 'Tampilkan di preview' : 'Sembunyikan dari preview'} onClick={() => onToggleLayer(`overlay:${selectedOverlay.id}`)}><PreviewEyeIcon hidden={hiddenLayers.has(`overlay:${selectedOverlay.id}`)} /></button><button type="button" aria-pressed={!!selectedOverlay.locked} aria-label={selectedOverlay.locked ? 'Buka kunci overlay' : 'Kunci overlay'} title={selectedOverlay.locked ? 'Buka kunci posisi di preview' : 'Kunci posisi di preview'} onClick={() => toggleLock(selectedOverlay.id)}><PreviewLockIcon locked={!!selectedOverlay.locked} /></button><button type="button" className="is-danger" aria-label="Hapus overlay" title="Hapus overlay" onClick={() => void remove(selectedOverlay.id)}><DeleteLayerIcon /></button><button type="button" aria-label={collapsed.has(selectedOverlay.id) ? 'Tampilkan setting overlay' : 'Sembunyikan setting overlay'} aria-expanded={!collapsed.has(selectedOverlay.id)} title="Tampilkan/sembunyikan setting" onClick={() => toggleCollapsed(selectedOverlay.id)}><ChevronIcon expanded={!collapsed.has(selectedOverlay.id)} /></button></div></div>
        {!collapsed.has(selectedOverlay.id) && <>
          <div className="mrp-overlay-inspector__group"><div className="mrp-overlay-group-title"><span>Transform</span><span>↗</span></div><div className="mrp-overlay-inspector__grid">
            <label className="mrp-overlay-number">Posisi X<input type="number" value={selectedConfig.position.x} onChange={(event) => patchNested(selectedOverlay.id, 'position', { ...selectedConfig.position, x: Number(event.target.value) })}/></label>
            <label className="mrp-overlay-number">Posisi Y<input type="number" value={selectedConfig.position.y} onChange={(event) => patchNested(selectedOverlay.id, 'position', { ...selectedConfig.position, y: Number(event.target.value) })}/></label>
            <div className="mrp-overlay-inspector-field"><span>Scale</span>{centeredSlider('', scaleOffset(selectedConfig.resize?.width ?? 320, 320), -100, 100, (offset) => patchNested(selectedOverlay.id, 'resize', { width: scaledValue(offset, 320), height: scaledValue(offset, 180) }), `${Math.round((selectedConfig.resize?.width ?? 320) / 320 * 100)}%`)}</div>
            <div className="mrp-overlay-inspector-field"><span>Rotasi</span>{centeredSlider('', selectedConfig.rotation, -180, 180, (rotation) => patchDraft(selectedOverlay.id, { rotation }), `${selectedConfig.rotation.toFixed(1)}°`)}</div>
            <div className="mrp-overlay-inspector-field"><span>Lebar</span>{centeredSlider('', scaleOffset(selectedConfig.resize?.width ?? 320, 320), -100, 100, (offset) => patchNested(selectedOverlay.id, 'resize', { width: scaledValue(offset, 320), height: selectedConfig.resize?.height ?? 180 }), `${selectedConfig.resize?.width ?? 320} px`)}</div>
            <div className="mrp-overlay-inspector-field"><span>Tinggi</span>{centeredSlider('', scaleOffset(selectedConfig.resize?.height ?? 180, 180), -100, 100, (offset) => patchNested(selectedOverlay.id, 'resize', { width: selectedConfig.resize?.width ?? 320, height: scaledValue(offset, 180) }), `${selectedConfig.resize?.height ?? 180} px`)}</div>
          </div></div>
          <div className="mrp-overlay-inspector__group"><div className="mrp-overlay-group-title"><span>Blend & Opacity</span><span>◈</span></div><div className="mrp-overlay-inspector__grid">
            <label>Blend Mode<select className="mrp-dark-select" value={selectedConfig.blendMode} onChange={(event) => patchDraft(selectedOverlay.id, { blendMode: event.target.value as typeof selectedConfig.blendMode })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option></select></label>
            <div className="mrp-overlay-inspector-field"><span>Opacity</span>{centeredSlider('', Math.round(selectedConfig.opacity * 100), 0, 100, (value) => patchDraft(selectedOverlay.id, { opacity: value / 100 }), `${Math.round(selectedConfig.opacity * 100)}%`)}</div>
            <div className="mrp-overlay-inspector-field"><span>Speed</span>{centeredSlider('', scaleOffset(selectedConfig.speed, 1), -100, 100, (offset) => patchDraft(selectedOverlay.id, { speed: Number((2 ** (offset / 33.333)).toFixed(3)) }), `${selectedConfig.speed.toFixed(2)}×`)}</div>
            <div className="mrp-overlay-inspector-field"><span>Fade In</span>{centeredSlider('', Math.round((selectedConfig.fadeInSec ?? 0) * 10), 0, 300, (value) => patchDraft(selectedOverlay.id, { fadeInSec: value / 10 }), `${(selectedConfig.fadeInSec ?? 0).toFixed(1)} dtk`)}</div>
          </div></div>
          <div className="mrp-overlay-inspector__group"><div className="mrp-overlay-group-title"><span>Background Keying</span><span title="Hilangkan warna latar tertentu">ⓘ</span></div><div className="mrp-overlay-key-mode" role="group" aria-label="Mode keying"><button type="button" className={keyMode === 'none' ? 'is-active' : ''} aria-pressed={keyMode === 'none'} onClick={() => patchDraft(selectedOverlay.id, { chromaKey: { ...selectedConfig.chromaKey, enabled: false }, colorKey: { ...selectedConfig.colorKey, enabled: false } })}>Off</button><button type="button" className={keyMode === 'chroma' ? 'is-active' : ''} aria-pressed={keyMode === 'chroma'} onClick={() => patchDraft(selectedOverlay.id, { chromaKey: { ...selectedConfig.chromaKey, enabled: true }, colorKey: { ...selectedConfig.colorKey, enabled: false } })}>Chroma Key</button><button type="button" className={keyMode === 'color' ? 'is-active' : ''} aria-pressed={keyMode === 'color'} onClick={() => patchDraft(selectedOverlay.id, { chromaKey: { ...selectedConfig.chromaKey, enabled: false }, colorKey: { ...selectedConfig.colorKey, enabled: true } })}>Color Key</button></div>
            {keyMode === 'chroma' && <div className="mrp-overlay-inspector__grid"><label>Chroma Key Color<input type="text" value={selectedConfig.chromaKey.color} onChange={(event) => patchNested(selectedOverlay.id, 'chromaKey', { ...selectedConfig.chromaKey, color: event.target.value })}/></label><div className="mrp-overlay-inspector-field"><span>Key Level</span>{centeredSlider('', Math.round(selectedConfig.chromaKey.similarity * 100), 0, 100, (value) => patchNested(selectedOverlay.id, 'chromaKey', { ...selectedConfig.chromaKey, similarity: value / 100 }), `${Math.round(selectedConfig.chromaKey.similarity * 100)}%`)}</div><div className="mrp-overlay-inspector-field"><span>Edge Blend</span>{centeredSlider('', Math.round(selectedConfig.chromaKey.blend * 100), 0, 100, (value) => patchNested(selectedOverlay.id, 'chromaKey', { ...selectedConfig.chromaKey, blend: value / 100 }), `${Math.round(selectedConfig.chromaKey.blend * 100)}%`)}</div></div>}
            {keyMode === 'color' && <div className="mrp-overlay-inspector__grid"><label>Color Key Color<input type="text" value={selectedConfig.colorKey.color} onChange={(event) => patchNested(selectedOverlay.id, 'colorKey', { ...selectedConfig.colorKey, color: event.target.value })}/></label><div className="mrp-overlay-inspector-field"><span>Key Level</span>{centeredSlider('', Math.round(selectedConfig.colorKey.similarity * 100), 0, 100, (value) => patchNested(selectedOverlay.id, 'colorKey', { ...selectedConfig.colorKey, similarity: value / 100 }), `${Math.round(selectedConfig.colorKey.similarity * 100)}%`)}</div><div className="mrp-overlay-inspector-field"><span>Edge Blend</span>{centeredSlider('', Math.round(selectedConfig.colorKey.blend * 100), 0, 100, (value) => patchNested(selectedOverlay.id, 'colorKey', { ...selectedConfig.colorKey, blend: value / 100 }), `${Math.round(selectedConfig.colorKey.blend * 100)}%`)}</div></div>}
          </div>
        </>}
      </> : <div className="mrp-overlay-inspector__empty"><span>◈</span><strong>Pilih layer overlay</strong><small>Tambahkan media atau pilih salah satu layer untuk mengubah transform, opacity, fade, blend dan keying.</small></div>}
    </section>
  </div>;
}

function SuperpowerIcon({ type }: { type: 'video' | 'audio' | 'asset' | 'speed' | 'image' }): JSX.Element {
  const common = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (type === 'video') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m9 5 2 3h2l2-3M9 19l2-3h2l2 3"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></svg>;
  if (type === 'audio') return <svg {...common}><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/></svg>;
  if (type === 'asset') return <svg {...common}><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/></svg>;
  if (type === 'image') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/></svg>;
  return <svg {...common}><path d="m13 2-9 12h6l-1 8 9-13h-6l1-7Z" fill="currentColor" stroke="none"/></svg>;
}

function HomePage({ onStart, onOpen, recent, onOpenRecent, onRemoveRecent, onNavigate, onOpenSettings }: {
  onStart: () => void;
  onOpen: () => void;
  recent: RecentProject[];
  onOpenRecent: (item: RecentProject) => void;
  onRemoveRecent: (projectId: string) => Promise<void>; 
  onNavigate: (page: MainPage) => void;
  onOpenSettings: () => void;
}): JSX.Element {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [settingsUnavailable, setSettingsUnavailable] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [engineCheck, setEngineCheck] = useState<Awaited<ReturnType<typeof window.magicRender.testRenderEngine>> | null>(null);
  const [engineCheckState, setEngineCheckState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [activeRecentMenuId, setActiveRecentMenuId] = useState<string | null>(null);
  const [recentMenuPosition, setRecentMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [recentDialog, setRecentDialog] = useState<{ mode: 'preview' | 'properties'; item: RecentProject } | null>(null);
  const [recentMetadata, setRecentMetadata] = useState<MediaMetadata | null>(null);
  const [recentMetadataState, setRecentMetadataState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pendingRecentDelete, setPendingRecentDelete] = useState<RecentProject | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [recentActionError, setRecentActionError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void window.magicRender.getSettings()
      .then((value) => {
        if (!active) return;
        setSettings(value); setSettingsUnavailable(false); setEngineCheckState('checking');
        void window.magicRender.testRenderEngine(value.ffmpegPath, value.ffprobePath)
          .then((result) => {
            if (!active) return;
            setEngineCheck(result);
            setEngineCheckState(result.ffmpegReady && result.ffprobeReady && result.progressReady ? 'ready' : 'error');
          })
          .catch(() => { if (active) { setEngineCheck(null); setEngineCheckState('error'); } });
      })
      .catch(() => { if (active) { setSettingsUnavailable(true); setEngineCheckState('error'); } });
    return () => { active = false; };
  }, []);

  const displayedProjects = showAllRecent ? recent : recent.slice(0, 3);
  const features = [
    { type: 'video' as const, title: 'Workspace Render', text: 'Buat project dan mulai proses render.', page: 'Render' as const },
    { type: 'asset' as const, title: 'Bulk Render', text: 'Render beberapa media sekaligus.', page: 'Bulk Render' as const },
    { type: 'image' as const, title: 'Asset Library', text: 'Kelola media dan elemen visual.', page: 'Asset' as const },
  ];
  function recentDate(value: string): string {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Project tersimpan';
    return `Terakhir dibuka ${new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp))}`;
  }
  async function showRecentProperties(item: RecentProject): Promise<void> {
    setRecentActionError(null); setActiveRecentMenuId(null); setRecentMenuPosition(null); setRecentDialog({ mode: 'properties', item }); setRecentMetadata(null);
    if (!item.mainMediaPath) { setRecentMetadataState('ready'); return; }
    setRecentMetadataState('loading');
    try { setRecentMetadata(await window.magicRender.probeMainMedia(item.mainMediaPath)); setRecentMetadataState('ready'); }
    catch { setRecentMetadataState('error'); }
  }
  function showRecentPreview(item: RecentProject): void { setRecentActionError(null); setActiveRecentMenuId(null); setRecentMenuPosition(null); setRecentDialog({ mode: 'preview', item }); }
  function toggleRecentMenu(event: ReactMouseEvent<HTMLButtonElement>, projectId: string): void {
    if (activeRecentMenuId === projectId) { setActiveRecentMenuId(null); setRecentMenuPosition(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 158;
    const menuHeight = 132;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const below = rect.bottom + 6;
    const top = below + menuHeight <= window.innerHeight - 8 ? below : Math.max(8, rect.top - menuHeight - 6);
    setRecentMenuPosition({ top, left });
    setActiveRecentMenuId(projectId);
  }
  useEffect(() => {
    if (!activeRecentMenuId) return;
    const closeOnViewportChange = () => { setActiveRecentMenuId(null); setRecentMenuPosition(null); };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.mrp-home-project-card__menu-wrap')) return;
      closeOnViewportChange();
    };
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [activeRecentMenuId]);
  async function confirmRecentDelete(): Promise<void> {
    if (!pendingRecentDelete || deleteBusy) return;
    setRecentActionError(null); setDeleteBusy(true);
    try { await onRemoveRecent(pendingRecentDelete.projectId); setPendingRecentDelete(null); setActiveRecentMenuId(null); setRecentMenuPosition(null); }
    catch (error) { setRecentActionError(`Project gagal dihapus: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setDeleteBusy(false); }
  }
  return <section className="mrp-home-page">
    <div className="mrp-home-dashboard">
      <div className="mrp-home-primary">
        <header className="mrp-home-hero">
          <div className="mrp-home-hero__content">
            <span className="mrp-home-eyebrow">MAGIC RENDER PRO · VIDEO WORKSPACE</span>
            <h1>Mulai sesi kreatif Anda</h1>
            <p>Siapkan ide, gabungkan media, tambahkan elemen visual, dan hasilkan video berkualitas tinggi dengan Magic Render Pro.</p>
            <div className="mrp-home-hero__actions">
              <button type="button" className="mrp-home-start" onClick={onStart}><span aria-hidden="true" className="mrp-home-start__plus">＋</span>New Project</button>
              <button type="button" className="mrp-home-open" onClick={onOpen}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M3.5 9h17"/></svg>Open Project</button>
            </div>
          </div>
        </header>

        <section className="mrp-home-recent" aria-labelledby="mrp-home-recent-title">
          <div className="mrp-home-section-heading">
            <div><span className="mrp-kicker">LANJUTKAN PEKERJAAN</span><h2 id="mrp-home-recent-title">Project Terbaru</h2></div>
            {recent.length > 3 && <button type="button" className="mrp-home-text-action" onClick={() => setShowAllRecent((value) => !value)}>{showAllRecent ? 'Tampilkan lebih sedikit' : 'Lihat Semua'} <span aria-hidden="true">→</span></button>}
          </div>
          {recent.length === 0
            ? <div className="mrp-home-recent-empty"><span className="mrp-home-recent-empty__icon" aria-hidden="true">▧</span><div><strong>Belum ada project terbaru</strong><p>Buat project baru atau buka file project yang sudah ada untuk mulai bekerja.</p></div><button type="button" className="mrp-btn" onClick={onOpen}>Buka Project</button></div>
            : <div className="mrp-home-project-grid">{displayedProjects.map((item) => <article key={item.projectId} className={`mrp-home-project-card${activeRecentMenuId === item.projectId ? ' is-menu-open' : ''}`}>
              <button type="button" className="mrp-home-project-card__preview" title={`Buka project ${item.name}`} onClick={() => onOpenRecent(item)}>
                {item.mainMediaPath
                  ? (isVideoPath(item.mainMediaPath) ? <video src={mediaUrl(item.mainMediaPath)} muted playsInline preload="metadata" /> : <img src={mediaUrl(item.mainMediaPath)} alt="" />)
                  : <img className="mrp-home-project-card__fallback" src="./assets/magic-render-pro-logo.png" alt="" />}
                <span className="mrp-home-project-card__open-indicator" aria-hidden="true">↗</span>
              </button>
              <div className="mrp-home-project-card__body"><div className="mrp-home-project-card__copy"><strong title={item.name}>{item.name}</strong><span>{recentDate(item.lastOpenedAt)}</span></div><div className="mrp-home-project-card__actions"><button type="button" className="mrp-home-project-card__open" onClick={() => onOpenRecent(item)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H11l2 2h4.5A2.5 2.5 0 0 1 20 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/></svg>Open</button><div className="mrp-home-project-card__menu-wrap"><button type="button" className="mrp-home-project-card__more" aria-label={`Opsi project ${item.name}`} title="Opsi project" aria-haspopup="menu" aria-expanded={activeRecentMenuId === item.projectId} onClick={(event) => toggleRecentMenu(event, item.projectId)}>···</button>{activeRecentMenuId === item.projectId && <div className="mrp-home-project-card__menu" role="menu" style={recentMenuPosition ? { position: 'fixed', top: recentMenuPosition.top, left: recentMenuPosition.left, right: 'auto', bottom: 'auto' } : undefined}><button type="button" role="menuitem" onClick={() => showRecentPreview(item)}>Preview</button><button type="button" role="menuitem" onClick={() => void showRecentProperties(item)}>Properties</button><button type="button" role="menuitem" className="is-danger" onClick={() => { setRecentActionError(null); setActiveRecentMenuId(null); setRecentMenuPosition(null); setPendingRecentDelete(item); }}>Delete</button></div>}</div></div></div>
            </article>)}</div>}
        </section>

        <section className="mrp-home-quick" aria-labelledby="mrp-home-quick-title">
          <div className="mrp-home-section-heading"><div><span className="mrp-kicker">LANJUTKAN DENGAN CEPAT</span><h2 id="mrp-home-quick-title">Akses Cepat</h2></div></div>
          <div className="mrp-home-quick-grid">{features.map((feature) => <button key={feature.page} type="button" className={`mrp-home-quick-card mrp-home-quick-card--${feature.type}`} onClick={() => onNavigate(feature.page)}><span className="mrp-home-quick-card__icon"><SuperpowerIcon type={feature.type} /></span><span className="mrp-home-quick-card__copy"><strong>{feature.title}</strong><span>{feature.text}</span></span><span className="mrp-home-quick-card__arrow" aria-hidden="true">›</span></button>)}</div>
        </section>
      </div>

      <aside className="mrp-home-status" aria-labelledby="mrp-home-status-title">
        <div className="mrp-home-status__heading"><span className="mrp-kicker">RINGKASAN SISTEM</span><h2 id="mrp-home-status-title">Status Aplikasi</h2></div>
        <div className="mrp-home-status-card"><span className="mrp-home-status-card__icon mrp-home-status-card__icon--cpu" aria-hidden="true">▦</span><div><small>Mode Render</small><strong>{settings ? (settings.renderDevice === 'gpu' ? 'GPU Mode' : 'CPU Mode') : settingsUnavailable ? 'Tidak tersedia' : 'Memuat...'}</strong></div><span className={`mrp-home-status-dot${settings ? ' is-ready' : ''}`} aria-hidden="true" /></div>
        <div className="mrp-home-status-card"><span className="mrp-home-status-card__icon" aria-hidden="true">▱</span><div className="mrp-home-status-card__output"><small>Output</small><strong>Folder Export</strong><span title={settings?.outputDir ?? ''}>{settings?.outputDir ?? (settingsUnavailable ? 'Tidak dapat memuat pengaturan' : 'Memuat lokasi...')}</span></div></div>
        <div className={`mrp-home-status-card mrp-home-status-card--engine${engineCheckState === 'ready' ? ' is-ready' : engineCheckState === 'error' ? ' is-error' : ' is-checking'}`}><span className="mrp-home-status-card__icon" aria-hidden="true">⌘</span><div><small>FFmpeg & FFprobe</small><strong>{engineCheckState === 'checking' ? 'Memeriksa engine…' : engineCheckState === 'ready' ? 'Engine siap' : 'Engine perlu diperiksa'}</strong><span className="mrp-home-status-card__hint">{engineCheckState === 'ready' ? (engineCheck?.ffmpegVersion ?? engineCheck?.message ?? 'FFmpeg, FFprobe, dan monitor progres siap.') : engineCheckState === 'error' ? (engineCheck?.message ?? 'Pengujian engine gagal. Periksa path di Settings.') : 'Memeriksa FFmpeg, FFprobe, dan monitor progres.'}</span></div><span className={`mrp-home-status-dot${engineCheckState === 'ready' ? ' is-ready' : engineCheckState === 'error' ? ' is-error' : ''}`} aria-hidden="true" /></div>
        <div className="mrp-home-status__footer"><p>Pastikan lokasi export dan engine render sudah siap sebelum memulai pekerjaan.</p><button type="button" className="mrp-home-settings-action" onClick={onOpenSettings}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19 13.5 1.2 1-.9 1.6-1.5-.4a6.7 6.7 0 0 1-1.5.9l-.3 1.6h-2l-.5-1.5a6.7 6.7 0 0 1-1.7 0l-.8 1.3-1.8-.7.1-1.6a6.7 6.7 0 0 1-1.2-1.3l-1.6.2-.6-1.9 1.3-.9a6.7 6.7 0 0 1 0-1.7l-1.2-1 .9-1.6 1.5.4a6.7 6.7 0 0 1 1.5-.9l.3-1.6h2l.5 1.5a6.7 6.7 0 0 1 1.7 0l.8-1.3 1.8.7-.1 1.6a6.7 6.7 0 0 1 1.2 1.3l1.6-.2.6 1.9-1.3.9a6.7 6.7 0 0 1 0 1.7Z"/></svg>Buka Settings</button></div>
      </aside>
    </div>
    {recentDialog && <div className="mrp-home-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecentDialog(null); }}><section className="mrp-home-dialog" role="dialog" aria-modal="true" aria-labelledby="mrp-home-dialog-title"><header><div><span className="mrp-kicker">RECENT PROJECT</span><h2 id="mrp-home-dialog-title">{recentDialog.mode === 'preview' ? 'Preview Project' : 'Project Properties'}</h2></div><button type="button" className="mrp-btn" aria-label="Tutup" onClick={() => setRecentDialog(null)}>×</button></header>{recentDialog.mode === 'preview' ? <><div className="mrp-home-dialog__media">{recentDialog.item.mainMediaPath ? (isVideoPath(recentDialog.item.mainMediaPath) ? <video src={mediaUrl(recentDialog.item.mainMediaPath)} controls autoPlay muted playsInline preload="metadata" /> : <img src={mediaUrl(recentDialog.item.mainMediaPath)} alt={`Preview ${recentDialog.item.name}`} />) : <div>Project ini belum memiliki media utama.</div>}</div><strong>{recentDialog.item.name}</strong><p className="mrp-home-dialog__path">{recentDialog.item.projectFilePath}</p><button type="button" className="mrp-btn mrp-btn--primary" onClick={() => { const item = recentDialog.item; setRecentDialog(null); onOpenRecent(item); }}>Buka Project</button></> : <><div className="mrp-home-dialog__properties"><div><span>Nama project</span><strong>{recentDialog.item.name}</strong></div><div><span>Terakhir dibuka</span><strong>{new Date(recentDialog.item.lastOpenedAt).toLocaleString('id-ID')}</strong></div><div><span>File project</span><strong>{recentDialog.item.projectFilePath}</strong></div><div><span>Media utama</span><strong>{recentDialog.item.mainMediaPath?.split(/[\\/]/).pop() ?? 'Tidak Ada'}</strong></div>{recentMetadataState === 'loading' && <p>Memuat metadata media…</p>}{recentMetadataState === 'error' && <p>Metadata tidak dapat dibaca. Pastikan file media masih tersedia.</p>}{recentMetadata && <><div><span>Jenis / format</span><strong>{recentMetadata.type.toUpperCase()} · {recentMetadata.formatName || 'Tidak diketahui'}</strong></div><div><span>Resolusi</span><strong>{recentMetadata.resolution ? `${recentMetadata.resolution.width} × ${recentMetadata.resolution.height}` : 'Tidak tersedia'}</strong></div><div><span>Durasi</span><strong>{recentMetadata.durationSeconds == null ? 'Tidak tersedia' : `${recentMetadata.durationSeconds.toFixed(2)} detik`}</strong></div><div><span>Frame rate</span><strong>{recentMetadata.fps == null ? 'Tidak tersedia' : `${recentMetadata.fps.toFixed(3)} FPS`}</strong></div><div><span>Audio</span><strong>{recentMetadata.hasAudioTrack ? 'Ada' : 'Tidak Ada'}</strong></div><div><span>Ukuran file</span><strong>{(recentMetadata.sizeBytes / (1024 * 1024)).toFixed(2)} MB</strong></div></>}</div></>}</section></div>}
    {pendingRecentDelete && <div className="mrp-home-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteBusy) setPendingRecentDelete(null); }}><section className="mrp-home-dialog mrp-home-dialog--confirm" role="alertdialog" aria-modal="true" aria-labelledby="mrp-home-delete-title"><header><div><span className="mrp-kicker">KONFIRMASI</span><h2 id="mrp-home-delete-title">Hapus project?</h2></div></header><p>Project <strong>{pendingRecentDelete.name}</strong> beserta berkas project yang dikelola aplikasi akan dihapus. Media sumber, Asset Library, dan hasil export tidak ikut dihapus.</p>{recentActionError && <p className="mrp-home-dialog__error" role="alert">{recentActionError}</p>}<div className="mrp-home-dialog__actions"><button type="button" className="mrp-btn" disabled={deleteBusy} onClick={() => setPendingRecentDelete(null)}>Batal</button><button type="button" className="mrp-btn mrp-btn--danger" disabled={deleteBusy} onClick={() => void confirmRecentDelete()}>{deleteBusy ? 'Menghapus…' : 'Hapus Project'}</button></div></section></div>}
  </section>;
}

function mediaUrl(filePath: string): string { return `mrp-media://local?path=${encodeURIComponent(filePath)}`; }
function isVideoPath(filePath: string): boolean { return /\.(mp4|mov|mkv|webm|avi)$/i.test(filePath); }
function assetIsVisual(asset: LockedAsset): boolean { return /\.(png|jpe?g|webp|gif|mp4|mov|mkv|webm|avi)$/i.test(asset.metadata.extension || asset.path); }
type AssetLibraryCategory = 'intro' | 'overlay' | 'stickerSubscribe' | 'tracklist';

function formatAssetSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'Ukuran tidak tersedia';
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetLibraryPage({ assets, project, onRefresh, onMessage, onOpenBulkRender }: { assets: LockedAsset[]; project: ProjectData | null; onRefresh: () => Promise<void>; onMessage: (message: string) => void; onOpenBulkRender: (folderId?: string) => void }): JSX.Element {
  const [editing, setEditing] = useState<LockedAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LockedAsset | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AssetLibraryCategory>('overlay');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const groups: Array<{ menu: Exclude<AssetLibraryCategory, 'tracklist'>; title: string; subtitle: string; icon: string }> = [
    { menu: 'intro', title: 'Intro', subtitle: 'Opening media tersimpan', icon: '▣' },
    { menu: 'overlay', title: 'Overlay', subtitle: 'Layer visual tersimpan', icon: '▱' },
    { menu: 'stickerSubscribe', title: 'Sticker Subscribe', subtitle: 'Sticker visual tersimpan', icon: '☺' },
  ];
  const categories: Array<{ key: AssetLibraryCategory; title: string; subtitle: string; icon: string }> = [
    { key: 'intro', title: 'Intro', subtitle: 'Opening', icon: '▣' },
    { key: 'overlay', title: 'Overlay', subtitle: 'Layer visual', icon: '▱' },
    { key: 'stickerSubscribe', title: 'Sticker Subscribe', subtitle: 'Sticker', icon: '☺' },
    { key: 'tracklist', title: 'Tracklist MP3', subtitle: 'Folder audio', icon: '♫' },
  ];
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleAssets = activeCategory === 'tracklist' ? [] : assets.filter((asset) => asset.menu === activeCategory && (!normalizedQuery || `${asset.metadata.originalName} ${asset.metadata.extension} ${asset.path}`.toLocaleLowerCase().includes(normalizedQuery)));
  const selectedAsset = visibleAssets.find((asset) => asset.assetId === selectedAssetId) ?? visibleAssets[0] ?? null;
  const selectedConfig = selectedAsset?.config ?? {};
  const selectedResize = selectedConfig.resize as { width?: number; height?: number } | undefined;
  const selectedPosition = selectedConfig.position as { x?: number; y?: number } | undefined;
  const selectedOpacity = typeof selectedConfig.opacity === 'number' ? Math.round(Math.max(0, Math.min(1, selectedConfig.opacity)) * 100) : 100;
  const selectedBlend = typeof selectedConfig.blendMode === 'string' ? selectedConfig.blendMode : 'Normal';
  const selectedChroma = selectedConfig.chromaKey as { enabled?: boolean } | undefined;
  const selectedColorKey = selectedConfig.colorKey as { enabled?: boolean } | undefined;
  const selectedKeying = selectedChroma?.enabled ? 'Chroma Key' : selectedColorKey?.enabled ? 'Color Key' : 'Off';

  useEffect(() => {
    if (activeCategory === 'tracklist') return;
    setSelectedAssetId((current) => visibleAssets.some((asset) => asset.assetId === current) ? current : visibleAssets[0]?.assetId ?? null);
  }, [activeCategory, assets, searchQuery]);

  async function add(menu: LockedAsset['menu']): Promise<void> {
    try {
      const asset = await window.magicRender.lockAsset(menu);
      if (!asset) return;
      setSelectedAssetId(asset.assetId);
      onMessage(`Asset ${asset.metadata.originalName} ditambahkan.`);
      await onRefresh();
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal menambahkan asset.'); }
  }
  async function refreshLibrary(): Promise<void> {
    setRefreshBusy(true);
    try { await onRefresh(); }
    finally { setRefreshBusy(false); }
  }
  async function togglePin(asset: LockedAsset): Promise<void> {
    try { await window.magicRender.updateLockedAsset(asset.assetId, { pinned: asset.pinned === false }); await onRefresh(); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal mengubah kunci asset.'); }
  }
  async function remove(asset: LockedAsset): Promise<void> {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      await window.magicRender.unlockAsset(asset.assetId);
      setPendingDelete(null);
      if (selectedAssetId === asset.assetId) setSelectedAssetId(null);
      onMessage(`${asset.metadata.originalName} dihapus dari Asset Library.`);
      await onRefresh();
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal menghapus asset.'); }
    finally { setDeleteBusy(false); }
  }

  return <section className="mrp-simple-page mrp-asset-library-page">
    <header className="mrp-asset-library-heading">
      <div><span className="mrp-kicker">MEDIA MANAGEMENT</span><h1>Asset Library</h1><p>Kelola preset Intro, Overlay, Sticker Subscribe, dan folder tracklist audio. Asset yang dipilih dapat ditinjau sebelum dibuka di editor.</p></div>
      <div className="mrp-asset-library-heading__summary"><strong>{assets.length}</strong><span>asset tersedia</span></div>
    </header>

    <div className="mrp-asset-library-workspace" data-category={activeCategory}>
      <aside className="mrp-asset-category-rail" aria-label="Kategori Asset Library">
        <div className="mrp-asset-category-rail__title">Kategori Asset</div>
        <nav className="mrp-asset-category-list">
          {categories.map((category) => {
            const count = category.key === 'tracklist' ? null : assets.filter((asset) => asset.menu === category.key).length;
            return <button key={category.key} type="button" className={`mrp-asset-category${activeCategory === category.key ? ' is-active' : ''}`} aria-pressed={activeCategory === category.key} onClick={() => { setActiveCategory(category.key); setSearchQuery(''); }}>
              <span className="mrp-asset-category__icon" aria-hidden="true">{category.icon}</span><span className="mrp-asset-category__label"><strong>{category.title}</strong><small>{category.subtitle}</small></span><span className="mrp-asset-category__count">{count === null ? 'MP3' : count}</span>
            </button>;
          })}
        </nav>
        <div className="mrp-asset-category-rail__note"><span className="mrp-asset-category-rail__dot"/> File sumber di luar Asset Library tidak dihapus saat melepas daftar asset.</div>
      </aside>

      <section className="mrp-asset-browser" aria-label="Daftar asset">
        <div className="mrp-asset-browser__toolbar">
          <label className="mrp-asset-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari asset..." aria-label="Cari asset berdasarkan nama, format, atau path"/><button type="button" disabled={!searchQuery} onClick={() => setSearchQuery('')} aria-label="Hapus pencarian asset">×</button></label>
          {activeCategory !== 'tracklist' && <button type="button" className="mrp-btn mrp-btn--primary mrp-asset-add-button" onClick={() => void add(activeCategory)}><span aria-hidden="true">＋</span> Tambah Asset</button>}
          <button type="button" className="mrp-btn mrp-asset-refresh-button" disabled={refreshBusy} onClick={() => void refreshLibrary()}><span aria-hidden="true">↻</span> {refreshBusy ? 'Memuat...' : 'Refresh'}</button>
        </div>
        {activeCategory !== 'tracklist' && <>
          <div className="mrp-asset-browser__subheading"><div><span className="mrp-kicker">{groups.find((group) => group.menu === activeCategory)?.title ?? 'Asset'}</span><h2>{groups.find((group) => group.menu === activeCategory)?.subtitle ?? 'Preset tersimpan'}</h2></div><span>{visibleAssets.length} item</span></div>
          <div className="mrp-asset-card-grid">
            {visibleAssets.length === 0 ? <div className="mrp-asset-empty"><span aria-hidden="true">▧</span><strong>{normalizedQuery ? 'Asset tidak ditemukan' : 'Belum ada asset tersimpan'}</strong><p>{normalizedQuery ? 'Coba kata pencarian lain atau hapus filter pencarian.' : 'Tambahkan media ke Asset Library untuk menggunakannya kembali sebagai preset.'}</p>{normalizedQuery ? <button type="button" className="mrp-btn" onClick={() => setSearchQuery('')}>Hapus pencarian</button> : <button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void add(activeCategory)}>＋ Tambah Asset</button>}</div> : visibleAssets.map((asset) => <article key={asset.assetId} className={`mrp-library-asset-card${selectedAsset?.assetId === asset.assetId ? ' is-selected' : ''}`} data-selected={selectedAsset?.assetId === asset.assetId}>
              <button type="button" className="mrp-library-asset-card__select" aria-pressed={selectedAsset?.assetId === asset.assetId} onClick={() => setSelectedAssetId(asset.assetId)}>
                <span className="mrp-library-asset-card__thumb">{assetIsVisual(asset) ? (isVideoPath(asset.path) || /\.gif$/i.test(asset.path) ? <><video src={mediaUrl(asset.path)} muted playsInline preload="metadata"/><span className="mrp-library-asset-card__media-badge">▶</span></> : <img src={mediaUrl(asset.path)} alt="" loading="lazy"/>) : <span>MEDIA</span>}</span>
                <span className="mrp-library-asset-card__copy"><strong title={asset.metadata.originalName}>{asset.metadata.originalName}</strong><small>{(asset.metadata.extension || 'MEDIA').replace(/^\./, '').toUpperCase()} · {formatAssetSize(asset.metadata.sizeBytes)}</small></span>
              </button>
              <div className="mrp-library-asset-card__actions">
                {asset.menu !== 'intro' && <button type="button" className="mrp-lock-button" aria-label={`Edit preset ${asset.metadata.originalName}`} title="Edit ukuran dan tampilan" onClick={() => { setSelectedAssetId(asset.assetId); setEditing(asset); }}>✎</button>}
                <button type="button" className={`mrp-lock-button${asset.pinned !== false ? ' is-locked' : ''}`} aria-label={asset.pinned === false ? 'Kunci asset' : 'Buka kunci asset'} title={asset.pinned === false ? 'Kunci asset' : 'Buka kunci asset'} onClick={() => void togglePin(asset)}><PreviewLockIcon locked={asset.pinned !== false}/></button>
                <button type="button" className="mrp-lock-button mrp-lock-button--delete" aria-label={`Hapus asset ${asset.metadata.originalName}`} title="Hapus dari library" onClick={() => setPendingDelete(asset)}>×</button>
              </div>
            </article>)}
          </div>
        </>}
        <div className="mrp-asset-tracklist-slot" hidden={activeCategory !== 'tracklist'}><TracklistManager onMessage={onMessage} onOpenBulkRender={onOpenBulkRender}/></div>
      </section>

      <aside className="mrp-asset-preview-pane" hidden={activeCategory === 'tracklist'} aria-label="Detail preset asset">
        <div className="mrp-asset-preview-pane__heading"><div><span className="mrp-kicker">PRESET ASSET</span><h2>Preset Asset</h2></div>{selectedAsset && <span className="mrp-asset-preview-pane__status">{selectedAsset.pinned !== false ? 'TERKUNCI' : 'AKTIF'}</span>}</div>
        {selectedAsset ? <>
          <div className="mrp-asset-preview-pane__preview">{assetIsVisual(selectedAsset) ? (isVideoPath(selectedAsset.path) || /\.gif$/i.test(selectedAsset.path) ? <video src={mediaUrl(selectedAsset.path)} muted playsInline loop autoPlay preload="metadata"/> : <img src={mediaUrl(selectedAsset.path)} alt={selectedAsset.metadata.originalName}/>) : <span>MEDIA</span>}</div>
          <div className="mrp-asset-preview-pane__identity"><strong title={selectedAsset.metadata.originalName}>{selectedAsset.metadata.originalName}</strong><span>{(selectedAsset.metadata.extension || 'MEDIA').replace(/^\./, '').toUpperCase()} · {formatAssetSize(selectedAsset.metadata.sizeBytes)}</span></div>
          <div className="mrp-asset-preview-pane__separator"/>
          <div className="mrp-asset-preview-pane__section-title">Pengaturan Preset</div>
          <dl className="mrp-asset-preset-summary">
            <div><dt>Blend Mode</dt><dd>{selectedBlend}</dd></div>
            <div><dt>Opacity</dt><dd>{selectedOpacity}%</dd></div>
            <div><dt>Keying</dt><dd>{selectedKeying}</dd></div>
            <div><dt>Ukuran</dt><dd>{selectedResize?.width && selectedResize?.height ? `${Math.round(selectedResize.width)} × ${Math.round(selectedResize.height)}` : selectedAsset.menu === 'stickerSubscribe' ? `${Math.round(Number(selectedConfig.scale ?? 1) * 100)}% skala` : '1920 × 1080'}</dd></div>
            <div><dt>Posisi</dt><dd>{Math.round(Number(selectedPosition?.x ?? 0))}, {Math.round(Number(selectedPosition?.y ?? 0))}</dd></div>
            <div><dt>Format</dt><dd>{selectedAsset.metadata.extension.replace(/^\./, '').toUpperCase() || '—'}</dd></div>
          </dl>
          <p className="mrp-asset-preview-pane__path" title={selectedAsset.path}>{selectedAsset.path}</p>
          {selectedAsset.menu !== 'intro' && <button type="button" className="mrp-btn mrp-btn--primary mrp-asset-preview-pane__edit" onClick={() => setEditing(selectedAsset)}><span aria-hidden="true">✎</span> Buka Editor Preset</button>}
          {selectedAsset.menu === 'intro' && <p className="mrp-asset-preview-pane__hint">Asset Intro digunakan melalui tab Render → Intro.</p>}
        </> : <div className="mrp-asset-preview-pane__empty"><span aria-hidden="true">▧</span><strong>Pilih asset untuk melihat detail</strong><p>Informasi format dan preset akan tampil di panel ini.</p></div>}
      </aside>
    </div>

    {editing && <AssetVisualEditor key={editing.assetId} asset={editing} mainMedia={project?.mainMedia ?? null} onSaved={onRefresh} onClose={() => setEditing(null)} onMessage={onMessage}/>}
    {pendingDelete && <div className="mrp-delete-confirm" role="alertdialog" aria-modal="true" aria-label="Konfirmasi hapus media"><span className="mrp-delete-confirm__message">Hapus <strong>{pendingDelete.metadata.originalName}</strong> dari Asset Library? File sumber di luar library tidak dihapus.</span><button type="button" className="mrp-btn" disabled={deleteBusy} onClick={() => setPendingDelete(null)}>Batal</button><button type="button" className="mrp-btn mrp-btn--danger" disabled={deleteBusy} onClick={() => void remove(pendingDelete)}>{deleteBusy ? 'Menghapus...' : 'Hapus media'}</button></div>}
  </section>;
}

type RenderMonitorPanelProps = {
  project: ProjectData | null;
  renderProgress: RenderProgress | null;
  etaRemaining: number | null;
  renderInFlight: boolean;
  bulkBusy: boolean;
  lastRenderOutputPath: string | null;
  onMessage: (message: string) => void;
  startRender: () => Promise<void>;
  controlRender: (action: 'pause' | 'resume' | 'cancel') => Promise<void>;
  resetCompletedRender: () => void;
  resetting: boolean;
};

function RenderMonitorPanel({ project, renderProgress, etaRemaining, renderInFlight, bulkBusy, lastRenderOutputPath, onMessage, startRender, controlRender, resetCompletedRender, resetting }: RenderMonitorPanelProps): JSX.Element {
  return <div className="mrp-section-card mrp-render-monitor">
    <div className="mrp-card-title-row mrp-render-monitor__header">
      <div className="mrp-render-monitor__title"><span className="mrp-kicker">FINAL RENDER</span><h3>Render Monitor</h3></div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mrp-status-pill mrp-render-monitor__status" data-status={renderProgress?.status ?? 'idle'} aria-live="polite">{renderInFlight && renderProgress?.status === 'idle' ? 'menyiapkan' : renderProgress?.status ?? 'idle'}</span>
        {renderProgress?.status === 'done' && lastRenderOutputPath && <>
          <button type="button" className="mrp-btn" onClick={() => void window.magicRender.openProjectFolder(lastRenderOutputPath.replace(/[\\/][^\\/]+$/, '')).catch((error) => onMessage(error instanceof Error ? error.message : String(error)))}>Buka Folder</button>
          <button type="button" className="mrp-btn" onClick={() => void window.magicRender.openOutputVideo(lastRenderOutputPath).catch((error) => onMessage(error instanceof Error ? error.message : String(error)))}>▶ Buka Video</button>
          <button type="button" className="mrp-btn" title="Reset tugas render selesai; file video tetap tersimpan" onClick={resetCompletedRender}>↺ Reset</button>
        </>}
      </div>
    </div>
    <div className="mrp-progress mrp-render-monitor__progress" role="progressbar" aria-valuenow={renderProgress?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${renderProgress?.percent ?? 0}%` }} /></div>
    <div className="mrp-stats mrp-render-monitor__stats">
      <span><b>{(renderProgress?.percent ?? 0).toFixed(1)}%</b><small>Progress</small></span>
      <span><b>{formatSeconds(renderProgress?.totalDurationSec || estimatedVideoDuration(project))}</b><small>Total Durasi Video</small></span>
      <span><b>{formatSeconds(renderProgress?.elapsedRenderSec ?? 0)}</b><small>Waktu Render</small></span>
      <span><b>{renderProgress?.speedMultiplier ? `${renderProgress.speedMultiplier.toFixed(2)}×` : '—'}</b><small>Speed</small></span>
      <span><b>{renderProgress?.status === 'done' ? 'Selesai' : renderInFlight && renderProgress?.status === 'compressing_video' && (renderProgress.percent >= 95 || renderProgress.currentTimeSec >= renderProgress.totalDurationSec * .995) ? 'Finalisasi' : etaRemaining === null ? '—' : formatSeconds(etaRemaining)}</b><small>Estimasi tersisa</small></span>
    </div>
    <div className="mrp-monitor-actions mrp-render-monitor__actions">
      <button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void startRender()} disabled={!project || renderInFlight || bulkBusy || resetting || (!!renderProgress && !['idle','done','error','cancelled'].includes(renderProgress.status))}><svg className="mrp-monitor-action-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5.5 19 12 8 18.5z" fill="currentColor" stroke="none"/></svg><span>Render</span></button>
      <button type="button" className="mrp-btn" onClick={() => void controlRender(renderProgress?.status === 'paused' ? 'resume' : 'pause')} disabled={!project || !renderInFlight || resetting}><svg className="mrp-monitor-action-icon" aria-hidden="true" viewBox="0 0 24 24">{renderProgress?.status === 'paused' ? <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/> : <path d="M7 5h4v14H7zM15 5h4v14h-4z" fill="currentColor" stroke="none"/>}</svg><span>{renderProgress?.status === 'paused' ? 'Lanjutkan' : 'Pause'}</span></button>
      <button type="button" className="mrp-btn mrp-btn--danger" onClick={() => void controlRender('cancel')} disabled={!project || !renderInFlight || resetting}><svg className="mrp-monitor-action-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span>{resetting ? 'Membatalkan...' : 'Cancel'}</span></button>
    </div>
    {renderProgress?.logLine && <div className="mrp-inline-note mrp-render-monitor__logline">{renderProgress.logLine}</div>}
  </div>;
}

function RenderPage({ project, setProject, replaceProject, renderTab, setRenderTab, recent, setRecent, onRemoveRecent, onOpenRecentProject, onCreateProject, onRenameProject, onLoadProject, onSaveProject, onImportMedia, onOpenFolder, renderProgress, etaRemaining, renderInFlight, bulkBusy, consoleEntries, lastRenderOutputPath, seoStatus, seoInFlight, seoResult, onSeoStatus, onMessage, onOpenSettings, startRender, controlRender, resetCompletedRender, resetting }: {
  project: ProjectData | null;
  setProject: (project: ProjectData, options?: HistoryOptions) => void;
  replaceProject: (project: ProjectData | null) => void;
  renderTab: RenderTab;
  setRenderTab: (tab: RenderTab) => void;
  recent: RecentProject[];
  setRecent: (items: RecentProject[]) => void;
  onRemoveRecent: (projectId: string) => Promise<void>;
  onOpenRecentProject: (item: RecentProject) => Promise<void>;
  onCreateProject: () => void;
  onRenameProject: () => void;
  onLoadProject: () => Promise<void>;
  onSaveProject: () => Promise<void>;
  onImportMedia: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
  renderProgress: RenderProgress | null;
  etaRemaining: number | null;
  renderInFlight: boolean;
  bulkBusy: boolean;
  consoleEntries: ConsoleLogEntry[];
  lastRenderOutputPath: string | null;
  seoStatus: string;
  seoInFlight: boolean;
  seoResult: YoutubeSeoResult | null;
  onSeoStatus: (status: string) => void;
  onMessage: (message: string) => void;
  onOpenSettings: () => void;
  startRender: () => Promise<void>;
  controlRender: (action: 'pause' | 'resume' | 'cancel') => Promise<void>;
  resetCompletedRender: () => void;
  resetting: boolean;
}): JSX.Element {
  const [recentProjectsCollapsed, setRecentProjectsCollapsed] = useState(true);
  const [showFinalRenderPage, setShowFinalRenderPage] = useState(false);
  const [activeOverlayFeature, setActiveOverlayFeature] = useState<'media' | 'text' | 'particles' | 'visualizer'>('particles');
  const [requestedTextLayerId, setRequestedTextLayerId] = useState<string | null>(null);
  useEffect(() => { setRecentProjectsCollapsed(true); }, [project?.projectId]);
  const hiddenLayers = new Set<string>([
    ...(project?.overlays ?? []).filter((item) => item.hiddenInPreview).map((item) => `overlay:${item.id}`),
    ...(project?.stickerSubscribes?.length ? project.stickerSubscribes : project?.stickerSubscribe ? [project.stickerSubscribe] : []).filter((item) => item.hiddenInPreview).map((item) => `sticker:${item.id}`),
  ]);
  const toggleLayer = (key: string) => {
    if (!project) return;
    const [kind, id] = key.split(':');
    if (kind === 'overlay') setProject({ ...project, overlays: project.overlays.map((item) => item.id === id ? { ...item, hiddenInPreview: !item.hiddenInPreview } : item) });
    if (kind === 'sticker') {
      const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : project.stickerSubscribe ? [project.stickerSubscribe] : [];
      const next = stickers.map((item) => item.id === id ? { ...item, hiddenInPreview: !item.hiddenInPreview } : item);
      setProject({ ...project, stickerSubscribe: next[0] ?? null, stickerSubscribes: next });
    }
  };
  const noProject = <div className="mrp-empty-state"><div className="mrp-empty-state__icon">+</div><h3>Project belum dibuka</h3><p>Buat project baru atau buka kembali project yang pernah digunakan.</p><div className="mrp-empty-state__actions"><button type="button" className="mrp-btn mrp-btn--primary" onClick={onCreateProject}>New Project</button><button type="button" className="mrp-btn" onClick={() => void onLoadProject()}>Open Project</button></div><div className="mrp-recent-empty-list"><div className="mrp-kicker">Recent Projects</div>{recent.length === 0 ? <div className="mrp-inline-note">Belum ada project tersimpan.</div> : recent.map((item) => <div key={item.projectId} className="mrp-recent-item"><div className="mrp-recent-thumb">{item.mainMediaPath ? (isVideoPath(item.mainMediaPath) ? <video src={mediaUrl(item.mainMediaPath)} muted playsInline preload="metadata" /> : <img src={mediaUrl(item.mainMediaPath)} alt="" />) : <span>PROJECT</span>}</div><button type="button" className="mrp-recent-open" onClick={() => void onOpenRecentProject(item)}><strong>{item.name}</strong><span>{item.projectFilePath}</span></button><button type="button" className="mrp-btn mrp-btn--danger" onClick={() => void onRemoveRecent(item.projectId)}>Hapus</button></div>)}</div></div>;
  const mediaPage = project ? (
    <div className="mrp-media-page-content">
      <div className="mrp-section-card mrp-media-project-card">
        <div className="mrp-card-title-row mrp-media-project-card__heading">
          <div><span className="mrp-kicker">Project</span><h3>{project.name}</h3></div>
          <div className="mrp-media-project-card__status-actions">
            <span className="mrp-status-pill">READY</span>
            <button
              type="button"
              className="mrp-media-project-card__collapse"
              aria-label={recentProjectsCollapsed ? 'Tampilkan Recent Projects' : 'Sembunyikan Recent Projects'}
              title={recentProjectsCollapsed ? 'Tampilkan Recent Projects' : 'Sembunyikan Recent Projects'}
              aria-controls="mrp-media-recent-projects"
              aria-expanded={!recentProjectsCollapsed}
              onClick={() => setRecentProjectsCollapsed((value) => !value)}
            ><ChevronIcon expanded={!recentProjectsCollapsed} /></button>
          </div>
        </div>
        <div className="mrp-action-grid mrp-action-grid--media mrp-media-project-actions">
          <button type="button" className="mrp-btn mrp-btn--primary" onClick={onCreateProject}>New</button>
          <button type="button" className="mrp-btn" onClick={() => void onLoadProject()}>Open</button>
          <button type="button" className="mrp-btn" onClick={onRenameProject}>Rename</button>
          <button type="button" className="mrp-btn" onClick={() => void onSaveProject()}>Save</button>
          <button type="button" className="mrp-btn" onClick={() => void onImportMedia()}>Import Media</button>
          <button type="button" className="mrp-btn" onClick={() => void onOpenFolder()}>Open Folder</button>
        </div>
        {!project.mainMedia && <div className="mrp-inline-note">Import gambar atau video untuk menampilkannya di Canvas Preview.</div>}
        <div className="mrp-media-recent-card" id="mrp-media-recent-projects" hidden={recentProjectsCollapsed}>
          <div className="mrp-card-title-row"><div><span className="mrp-kicker">Recent</span><h3>Recent Projects</h3></div><span className="mrp-media-recent-card__count">{recent.length} project</span></div>
          {recent.length === 0 ? <div className="mrp-inline-note">Belum ada recent project.</div> : <div className="mrp-recent-list">{recent.map((item) => <div key={item.projectId} className="mrp-recent-item">
            <div className="mrp-recent-thumb">{item.mainMediaPath ? (isVideoPath(item.mainMediaPath) ? <video src={mediaUrl(item.mainMediaPath)} muted playsInline preload="metadata" /> : <img src={mediaUrl(item.mainMediaPath)} alt="" />) : <span>PROJECT</span>}</div>
            <button type="button" className="mrp-recent-open" onClick={() => void onOpenRecentProject(item)}><strong>{item.name}</strong><span>{item.projectFilePath}</span></button>
            <button type="button" className="mrp-btn mrp-btn--danger" onClick={() => void onRemoveRecent(item.projectId)}>Hapus</button>
          </div>)}</div>}
        </div>
      </div>
      {project.mainMedia && <div className="mrp-media-settings-stack"><MainMediaControlsPanel project={project} onProjectChange={setProject} onReplaceMedia={onImportMedia} /><MainMediaEffectsPanel project={project} onProjectChange={setProject} /></div>}
    </div>
  ) : noProject;
  let control: JSX.Element;
  if (renderTab === 'Media') control = mediaPage;
  else if (!project) control = noProject;
  else if (renderTab === 'Intro') control = <IntroPanel project={project} onProjectChange={setProject} />;
  else if (renderTab === 'Overlay') control = <div className="mrp-overlay-workspace-grid">
    <aside className="mrp-overlay-feature-rail" aria-label="Aktif/nonaktif fitur overlay">
      {([
        { key: 'media', flag: null, label: 'Media Overlay', icon: '▣' },
        { key: 'particles', flag: 'particleEffectsEnabled', label: 'Particle Effects', icon: '✧' },
        { key: 'visualizer', flag: 'visualizersEnabled', label: 'Audio Visualizer', icon: '▥' },
        { key: 'text', flag: 'textOverlaysEnabled', label: 'Text Overlay', icon: 'T' },
      ] as const).map((feature) => {
        const enabled = feature.flag ? project[feature.flag] !== false : true;
        return <div key={feature.key} className={`mrp-overlay-feature${activeOverlayFeature === feature.key ? ' is-selected' : ''}${enabled ? ' is-enabled' : ' is-disabled'}${feature.flag ? '' : ' is-media-feature'}`}>
          <button type="button" className="mrp-overlay-feature__select" aria-pressed={activeOverlayFeature === feature.key} onClick={() => setActiveOverlayFeature(feature.key)}>
            <span className="mrp-overlay-feature__icon" aria-hidden="true">{feature.icon}</span><span className="mrp-overlay-feature__copy"><strong>{feature.label}</strong>{feature.flag && <small>{enabled ? 'Aktif · klik untuk setting' : 'Nonaktif · setting tetap tersimpan'}</small>}</span>
          </button>
          {feature.flag && <button type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? 'Nonaktifkan' : 'Aktifkan'} ${feature.label}`} className={`mrp-overlay-feature__switch${enabled ? ' is-on' : ''}`} onClick={() => {
            if (feature.flag === 'particleEffectsEnabled') setProject({ ...project, particleEffectsEnabled: !enabled });
            else if (feature.flag === 'visualizersEnabled') setProject({ ...project, visualizersEnabled: !enabled });
            else if (feature.flag === 'textOverlaysEnabled') setProject({ ...project, textOverlaysEnabled: !enabled });
          }}>{enabled ? 'ON' : 'OFF'}</button>}
          {feature.key === 'text' && <div className="mrp-overlay-text-layer-tree"><div className="mrp-overlay-text-layer-tree__heading"><span>Layer teks</span><span>{(project.textOverlays ?? []).length}</span></div>{(project.textOverlays ?? []).length === 0 ? <small className="mrp-overlay-text-layer-tree__empty">Belum ada layer teks.</small> : (project.textOverlays ?? []).map((layer, index) => <button type="button" key={layer.id} className="mrp-overlay-text-layer-tree__item" onClick={() => { setActiveOverlayFeature('text'); setRequestedTextLayerId(layer.id); }} title={layer.config.text || `Layer teks ${index + 1}`}><span aria-hidden="true">↳ T</span><span>{layer.config.text || `Layer teks ${index + 1}`}</span></button>)}</div>}
        </div>;
      })}
    </aside>
    <section className="mrp-overlay-selected-settings" aria-label="Pengaturan fitur overlay terpilih">
      {activeOverlayFeature === 'media'
        ? <OverlayPanel project={project} onProjectChange={setProject} hiddenLayers={hiddenLayers} onToggleLayer={toggleLayer} />
        : activeOverlayFeature === 'text'
          ? <TextOverlayPanel project={project} onProjectChange={setProject} requestedLayerId={requestedTextLayerId} onLayerRequestHandled={() => setRequestedTextLayerId(null)} />
          : activeOverlayFeature === 'particles'
            ? <ParticleEffectsPanel project={project} onProjectChange={setProject} />
            : <VisualizerPanel project={project} onProjectChange={setProject} />}
    </section>
  </div>;
  else if (renderTab === 'Playlist') control = <PlaylistPanel project={project} onProjectChange={setProject} />;
  else if (renderTab === 'Sticker Subscribe') control = <StickerPanel project={project} onProjectChange={setProject} hiddenLayers={hiddenLayers} onToggleLayer={toggleLayer} />;
  else control = <YoutubeSeoPanel project={project} onProjectChange={setProject} onMessage={onMessage} onOpenSettings={onOpenSettings} statusLine={seoStatus} autoGenerating={seoInFlight} latestResult={seoResult} onStatus={onSeoStatus} />;
  if (renderInFlight && renderTab !== 'Youtube SEO') control = <div className="mrp-inline-note">Kontrol media dijeda sementara FFmpeg bekerja. Panel YouTube SEO tetap tersedia untuk memantau analisis.</div>;

  const renderNav = <div className="mrp-render-nav">
    <div className="mrp-render-nav__heading">
      <span className="mrp-render-nav__title">RENDER WORKSPACE</span>
      <span className="mrp-render-nav__caption">Pilih tahap kerja</span>
    </div>
    <nav className="mrp-render-nav__tabs" aria-label="Render workspace tabs">
      {renderTabs.map((tab) => <button key={tab} type="button" aria-pressed={!showFinalRenderPage && renderTab === tab} className={`mrp-render-nav__item${!showFinalRenderPage && renderTab === tab ? ' is-active' : ''}`} onClick={() => { setShowFinalRenderPage(false); setRenderTab(tab); }}><span aria-hidden="true">{({ Media: '▣', Intro: '▶', Overlay: '◈', Playlist: '≋', 'Sticker Subscribe': '☆', 'Youtube SEO': '⌕' } as Record<RenderTab,string>)[tab]}</span><strong>{tab}</strong></button>)}
    </nav>
    <div className="mrp-render-nav__actions">
      <button type="button" className={`mrp-render-nav__final-button${showFinalRenderPage ? ' is-active' : ''}`} aria-pressed={showFinalRenderPage} onClick={() => setShowFinalRenderPage(true)}><span aria-hidden="true">▶</span> RENDER</button>
      <div className="mrp-render-nav__console"><ConsoleLogPanel entries={consoleEntries} placement="nav" /></div>
    </div>
  </div>;

  const previewSurface = project
    ? renderInFlight
      ? <div className="mrp-preview-placeholder"><strong>Preview dijeda selama render</strong><span>Komposisi akan tampil kembali setelah render selesai.</span></div>
      : <CanvasPreview project={project} onProjectChange={setProject} onInfo={onMessage} hiddenLayers={hiddenLayers} />
    : <div className="mrp-preview-placeholder"><img src="./assets/magic-render-pro-logo.png" alt="Magic Render Pro"/><strong>Start a project</strong><span>Buka menu Media untuk membuat project.</span></div>;

  const renderMonitor = <RenderMonitorPanel project={project} renderProgress={renderProgress} etaRemaining={etaRemaining} renderInFlight={renderInFlight} bulkBusy={bulkBusy} lastRenderOutputPath={lastRenderOutputPath} onMessage={onMessage} startRender={startRender} controlRender={controlRender} resetCompletedRender={resetCompletedRender} resetting={resetting} />;
  const sourceName = project?.mainMedia?.path.split(/[\\/]/).at(-1) ?? 'Belum ada media utama';
  const audioTracks = project?.playlistTracks ?? [];
  const totalAudioDuration = audioTracks.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0);
  const outputName = project ? ((project.exportFileName ?? '').trim() || `${project.name}.mp4`) : '—';
  const outputDir = project?.settings.outputDir || 'Folder output belum dikonfigurasi';
  const renderCodec = project?.settings.gpuEncoder ? `GPU · ${project.settings.gpuEncoder}` : 'CPU · H.264 / libx264';

  if (showFinalRenderPage) return <section className="mrp-render-page mrp-render-page--workspace mrp-final-render-page">
    {renderNav}
    <div className="mrp-final-render-workspace">
      <aside className="mrp-final-render-preflight" aria-label="Informasi sebelum render final">
        <header className="mrp-final-render-panel-heading"><span className="mrp-kicker">FINAL CHECKLIST</span><h2>Siap Render?</h2><p>Periksa sumber media, audio, serta tujuan penyimpanan sebelum membuat video final.</p></header>
        <section className="mrp-final-render-info-card">
          <div className="mrp-final-render-info-card__heading"><span>01</span><h3>Media utama</h3></div>
          <strong title={project?.mainMedia?.path ?? ''}>{sourceName}</strong>
          <p>{project?.mainMedia ? `${project.mainMedia.type === 'video' ? 'Video' : 'Gambar'} · ${project.mainMedia.metadata?.resolution?.width ?? '?'}×${project.mainMedia.metadata?.resolution?.height ?? '?'} · ${formatSeconds(project.mainMedia.durationSeconds ?? 0)}` : 'Import media pada menu Media sebelum render.'}</p>
          {project?.mainMedia?.metadata?.hasAudioTrack && <small className="mrp-final-render-note">Audio bawaan {project.mainMedia.autoMute ? 'akan dibisukan' : 'akan dipertahankan'}.</small>}
        </section>
        <section className="mrp-final-render-info-card">
          <div className="mrp-final-render-info-card__heading"><span>02</span><h3>Audio & playlist</h3></div>
          <strong>{audioTracks.length ? `${audioTracks.length} track audio` : project?.mainMedia?.metadata?.hasAudioTrack ? 'Audio dari media utama' : 'Belum ada playlist audio'}</strong>
          <p>{audioTracks.length ? `Durasi total diketahui: ${formatSeconds(totalAudioDuration)}. Audio akan disesuaikan dengan durasi video sesuai pengaturan playlist.` : 'Tambahkan audio pada menu Playlist bila video memerlukannya.'}</p>
          {audioTracks.length > 0 && <ul className="mrp-final-render-file-list">{audioTracks.slice(0, 4).map((track, index) => <li key={`${track.path}-${index}`} title={track.path}>{track.path.split(/[\\/]/).at(-1) ?? track.path}</li>)}{audioTracks.length > 4 && <li>+{audioTracks.length - 4} track lainnya</li>}</ul>}
        </section>
        <section className="mrp-final-render-info-card">
          <div className="mrp-final-render-info-card__heading"><span>03</span><h3>Penyimpanan output</h3></div>
          <strong title={outputName}>{outputName}</strong>
          <label className="mrp-final-render-output-name">Nama file video setelah export
            <input maxLength={120} value={project?.exportFileName ?? ''} onChange={(event) => { if (project) setProject({ ...project, exportFileName: event.target.value }); }} placeholder={project ? `Kosong = ${project.name}.mp4` : 'Nama file output'} disabled={!project} />
          </label>
          <p className="mrp-final-render-path" title={outputDir}>{outputDir}</p>
          <small className="mrp-final-render-note">Format video: MP4 · Pastikan ruang penyimpanan mencukupi.</small>
          <button type="button" className="mrp-btn mrp-final-render-folder-button" onClick={() => void onOpenFolder()}>Buka folder project</button>
        </section>
        <section className="mrp-final-render-info-card">
          <div className="mrp-final-render-info-card__heading"><span>04</span><h3>Pengaturan render</h3></div>
          <dl className="mrp-final-render-specs">
            <div><dt>Resolusi</dt><dd>{project?.settings.resolution ?? '—'}</dd></div>
            <div><dt>Frame rate</dt><dd>{project?.settings.fps ?? 30} FPS</dd></div>
            <div><dt>Bitrate</dt><dd>{project ? `${project.settings.bitrateKbps} kbps · ${(project.settings.bitrateMode ?? 'cbr').toUpperCase()}` : '—'}</dd></div>
            <div><dt>Encoder</dt><dd>{project ? renderCodec : '—'}</dd></div>
            <div><dt>Audio akhir</dt><dd>Audio digabung ke video MP4</dd></div>
          </dl>
        </section>
        <div className="mrp-final-render-guidance"><span aria-hidden="true">ⓘ</span><p>Render final dapat memakan waktu sesuai durasi video, efek, resolusi, dan perangkat encoding. Jangan pindahkan file sumber sampai proses selesai.</p></div>
      </aside>
      <section className="mrp-final-render-preview" aria-label="Canvas Preview final">
        <div className="mrp-canvas-head"><div><span className="mrp-kicker">PREVIEW FINAL</span><h2>Canvas Preview</h2></div><span className="mrp-preview-badge">16:9</span></div>
        <div className="mrp-canvas-body" aria-label="Canvas preview surface">{previewSurface}</div>
        
      </section>
      <aside className="mrp-final-render-monitor-column" aria-label="Status dan kontrol render">
        {renderMonitor}
        <div className="mrp-final-render-info-card mrp-final-render-warnings">
          <div className="mrp-final-render-info-card__heading"><span>✓</span><h3>Checklist singkat</h3></div>
          <ul><li className={project?.mainMedia ? 'is-ready' : ''}>Media utama tersedia</li><li className={audioTracks.length || project?.mainMedia?.metadata?.hasAudioTrack ? 'is-ready' : ''}>Audio ditinjau</li><li className={project?.settings.outputDir ? 'is-ready' : ''}>Folder output ditentukan</li><li className={project ? 'is-ready' : ''}>Project aktif terbuka</li></ul>
        </div>
      </aside>
    </div>
  </section>;

  return <section className={`mrp-render-page mrp-render-page--workspace${renderTab === 'Media' && project ? ' mrp-render-page--media-workspace' : ''}${renderTab === 'Intro' && project ? ' mrp-render-page--intro-workspace' : ''}${renderTab === 'Overlay' && project ? ' mrp-render-page--overlay-workspace' : ''}${renderTab === 'Sticker Subscribe' && project && !renderInFlight ? ' mrp-render-page--sticker-workspace' : ''}${renderTab === 'Playlist' && project && !renderInFlight ? ' mrp-render-page--playlist-workspace' : ''}${renderTab === 'Youtube SEO' && project ? ' mrp-render-page--seo-workspace' : ''}`}>
    {renderNav}
    <section className="mrp-render-controls"><div className="mrp-panel-title"><div><span className="mrp-panel-title__eyebrow">{renderTab}</span><h2>{project?.name ?? 'Workspace'}</h2></div>{project && <span className="mrp-panel-title__project">{project.mainMedia ? 'Media loaded' : 'No media'}</span>}</div>{control}</section>
    <section className="mrp-render-right mrp-render-right--workspace"><div className="mrp-canvas-head"><div><span className="mrp-kicker">Preview</span><h2>Canvas Preview</h2></div><span className="mrp-preview-badge">16:9</span></div><div className="mrp-canvas-body" aria-label="Canvas preview surface">{previewSurface}</div></section>
  </section>;
}

function AppContent(): JSX.Element {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => { try { return localStorage.getItem('magic-render-pro:theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } });
  useEffect(() => { document.documentElement.dataset.theme = themeMode; try { localStorage.setItem('magic-render-pro:theme', themeMode); } catch { /* Theme remains active for this session if storage is unavailable. */ } }, [themeMode]);
  const [mainPage, setMainPage] = useState<MainPage>('Home');
  const [renderTab, setRenderTab] = useState<RenderTab>('Media');
  const { project, setProject: recordProject, replaceProject } = useProjectHistory();
  const setProject = (next: ProjectData, options?: HistoryOptions): void => recordProject(next, options);
  const latestProjectRef = useRef<ProjectData | null>(project);
  latestProjectRef.current = project;
  const autosaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const autosaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedSignaturesRef = useRef<Map<string, string>>(new Map());
  const lastAutosaveErrorRef = useRef<string | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);

  const persistProjectSnapshot = useCallback((snapshot: ProjectData | null): Promise<void> => {
    if (!snapshot) return Promise.resolve();
    const pending = autosaveQueueRef.current.catch(() => undefined).then(async () => {
      const latest = latestProjectRef.current;
      // If several edits occurred while a save was queued, persist the newest
      // state for this same project, never a stale snapshot from a prior project.
      const candidate = latest?.projectId === snapshot.projectId ? latest : snapshot;
      const signature = JSON.stringify(candidate);
      if (lastSavedSignaturesRef.current.get(candidate.projectId) === signature) return;
      const result = await window.magicRender.saveProject(candidate);
      lastSavedSignaturesRef.current.set(candidate.projectId, signature);
      setRecent(result.recentProjects);
      lastAutosaveErrorRef.current = null;
    });
    autosaveQueueRef.current = pending;
    return pending;
  }, []);

  const flushProjectSave = useCallback(async (): Promise<void> => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const snapshot = latestProjectRef.current;
    if (snapshot) await persistProjectSnapshot(snapshot);
    // Also wait for an older queued snapshot when there is no active project.
    await autosaveQueueRef.current;
  }, [persistProjectSnapshot]);

  useEffect(() => {
    if (!project) return;
    const snapshot = project;
    const timer = window.setTimeout(() => {
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
      void persistProjectSnapshot(snapshot).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        if (lastAutosaveErrorRef.current === detail) return;
        lastAutosaveErrorRef.current = detail;
        void window.magicRender.logActivity('ERROR', '[AUTOSAVE] Project otomatis gagal disimpan.', detail).catch(() => undefined);
      });
    }, 650);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [project, persistProjectSnapshot]);

  useEffect(() => {
    const unsubscribe = window.magicRender.onPrepareToClose(() => {
      void flushProjectSave().then(() => {
        window.magicRender.notifyCloseReady(true);
      }).catch(async (error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        await window.magicRender.logActivity('ERROR', '[AUTOSAVE] Gagal menyimpan sebelum aplikasi ditutup.', detail).catch(() => undefined);
        window.magicRender.notifyCloseReady(false, detail);
      });
    });
    return unsubscribe;
  }, [flushProjectSave]);
  const [message, setMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [lockedAssets, setLockedAssets] = useState<LockedAsset[]>([]);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [renderInFlight, setRenderInFlight] = useState(false);
  const [resetting, setResetting] = useState(false);
  const renderSession = useRef(0);
  const renderStartedAt = useRef(0);
  const renderPausedAt = useRef(0);
  const renderPausedMs = useRef(0);
  const lastProgressUiAt = useRef(0);
  const lastBulkUiAt = useRef(0);
  const lastConsoleProgressAt = useRef(0);
  const completionAudio = useRef<AudioContext | null>(null);
  const latestProgress = useRef<RenderProgress | null>(null);
  const etaSnapshot = useRef<EtaSnapshot | null>(null);
  const [completion, setCompletion] = useState<RenderCompletion | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleLogEntry[]>([]);
  const [lastRenderOutputPath, setLastRenderOutputPath] = useState<string | null>(null);
  const [seoStatus, setSeoStatus] = useState('SEO belum dijalankan.');
  const [seoInFlight, setSeoInFlight] = useState(false);
  const [seoResult, setSeoResult] = useState<YoutubeSeoResult | null>(null);
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [pendingResolutionProject, setPendingResolutionProject] = useState<ProjectData | null>(null);
  const [showRenameProjectDialog, setShowRenameProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('My Render Project');
  const [bulkMedia,setBulkMedia]=useState<BulkMediaItem[]>([]);
  const [bulkTracklistId,setBulkTracklistId]=useState('');
  const [bulkMp3Count,setBulkMp3Count]=useState(3);
  const [bulkOptions,setBulkOptions]=useState<BulkRenderOptions>({metadataMode:'timestamp',overlay:false,intro:false,fadeIn:false,fadeInSec:1,fadeInStyle:'dark',fadeInBlur:12,fadeInBrightness:-0.25,fadeOut:false,fadeOutSec:1,sticker:false,stickerDurationSec:null,stickerSchedule:{mode:'full-duration',iterativeCount:null,timestamps:[]}});
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkResults,setBulkResults]=useState<BulkItemResult[]>([]);
  const bulkCancelled=useRef(false);
  const bulkRunRef=useRef(false);
  const currentBulkProject=useRef<string|null>(null);
  const bulkProjectToMedia=useRef<Map<string,string>>(new Map());
  const activeProjectId=useRef<string|null>(null);
  activeProjectId.current=project?.projectId??null;
  useEffect(() => { setSeoResult(null); setSeoStatus('SEO belum dijalankan.'); }, [project?.projectId]);

  useEffect(() => {
    if (!message) return;
    setToastVisible(true);
    const timer = window.setTimeout(() => setToastVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => { if (!completion) return; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCompletion(null); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [completion]);

  async function refreshAssets(): Promise<void> {
    try { setLockedAssets(await window.magicRender.listLockedAssets()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat asset library.'); }
  }

  useEffect(() => {
    void window.magicRender.getRecentProjects().then(setRecent).catch(() => setRecent([]));
    void refreshAssets();
    const unsubscribeProgress = window.magicRender.onRenderProgress((progress) => {
      const terminal = ['done', 'error', 'cancelled', 'paused'].includes(progress.status);
      const now = Date.now();
      if (progress.projectId === activeProjectId.current) {
        latestProgress.current = progress;
        if (terminal || now - lastProgressUiAt.current >= 300 || progress.status === 'idle') {
          lastProgressUiAt.current = now;
          setRenderProgress((previous) => mergeRenderProgress(previous, progress));
        }
      }
      const mediaId = bulkProjectToMedia.current.get(progress.projectId);
      if (mediaId && (terminal || now - lastBulkUiAt.current > 500)) { lastBulkUiAt.current = now; setBulkResults((items) => items.map((item) => item.id === mediaId ? { ...item, percent: progress.percent, currentTimeSec:progress.currentTimeSec, totalDurationSec:progress.totalDurationSec, speedMultiplier:progress.speedMultiplier, status: progress.status === 'error' ? 'error' : progress.status === 'cancelled' ? 'cancelled' : progress.status === 'done' ? 'done' : 'rendering', error: progress.errorMessage ?? item.error } : item)); }
      const routineProgress = /%.*×/.test(progress.logLine);
      if (terminal || !routineProgress || now - lastConsoleProgressAt.current > 3000) {
        if (routineProgress) lastConsoleProgressAt.current = now;
        setConsoleEntries((entries) => appendConsoleEntry(entries, progress));
      }
    });
    const unsubscribeLogs = window.magicRender.onApplicationLog((entry) => {
      setConsoleEntries((entries) => appendApplicationLog(entries, entry));
      if (entry.message.startsWith('[AI SEO]')) setSeoStatus(entry.message.replace(/^\[AI SEO\]\s*/, ''));
    });
    const unsubscribeSeo = window.magicRender.onSeoResult((value) => {
      if (value.projectId !== activeProjectId.current) return;
      setSeoResult(value);
      setSeoStatus(`Selesai • ${value.titles.length} judul • ${value.outputFiles.seoTxt}`);
    });
    void window.magicRender.getRecentApplicationLogs().then((logs) => setConsoleEntries((entries) => logs.reduce(appendApplicationLog, entries))).catch(() => undefined);
    const onWindowError = (event: ErrorEvent): void => { void window.magicRender.logActivity('ERROR', 'Unhandled renderer error.', event.error instanceof Error ? event.error.stack ?? event.error.message : event.message); };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => { const detail = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason); void window.magicRender.logActivity('ERROR', 'Unhandled renderer promise rejection.', detail); };
    window.addEventListener('error', onWindowError); window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => { unsubscribeProgress(); unsubscribeLogs(); unsubscribeSeo(); window.removeEventListener('error', onWindowError); window.removeEventListener('unhandledrejection', onUnhandledRejection); };
  }, []);

  useEffect(() => {
    if (!project || !renderInFlight) return;
    let disposed = false;
    const refresh = () => void window.magicRender.getRenderProgress(project.projectId).then((progress) => {
      if (disposed || !progress || progress.projectId !== activeProjectId.current) return;
      latestProgress.current = progress;
      setRenderProgress((previous) => mergeRenderProgress(previous, progress));
    }).catch(() => undefined);
    const poll = window.setInterval(refresh, 3000);
    const clock = window.setInterval(() => setRenderProgress((previous) => {
      if (!previous || previous.projectId !== project.projectId || ['done', 'error', 'cancelled', 'paused'].includes(previous.status)) return previous;
      const elapsed = Math.floor((Date.now() - renderStartedAt.current - renderPausedMs.current) / 1000);
      return Math.floor(previous.elapsedRenderSec) === elapsed ? previous : { ...previous, elapsedRenderSec: Math.max(previous.elapsedRenderSec, elapsed) };
    }), 1000);
    return () => { disposed = true; window.clearInterval(poll); window.clearInterval(clock); };
  }, [project?.projectId, renderInFlight]);

  async function navigateToPage(page: MainPage): Promise<void> {
    try { await flushProjectSave(); }
    catch (error) { setMessage(`Navigasi dibatalkan karena project belum berhasil disimpan: ${error instanceof Error ? error.message : String(error)}`); return; }
    setMainPage(page);
    if (page === 'Render') setRenderTab('Media');
  }
  async function navigateToRenderTab(tab: RenderTab): Promise<void> {
    try { await flushProjectSave(); }
    catch (error) { setMessage(`Perpindahan tab dibatalkan karena project belum berhasil disimpan: ${error instanceof Error ? error.message : String(error)}`); return; }
    setMainPage('Render');
    setRenderTab(tab);
  }

  function createProject(): void { setNewProjectName('My Render Project'); setShowCreateProjectDialog(true); }
  async function confirmCreateProject(): Promise<void> { const name = newProjectName.trim(); if (!name) { setMessage('Nama project wajib diisi.'); return; } try { await flushProjectSave(); const result = await window.magicRender.createProject(name); if (!result) return; replaceProject(result.project); setRecent(result.recentProjects); setShowCreateProjectDialog(false); setShowImportPrompt(true); setMainPage('Render'); setRenderTab('Media'); setMessage(`Project dibuat. Export akan disimpan di ${result.project.settings.outputDir}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuat project.'); } }
  function renameProject(): void { if (!project) return; setNewProjectName(project.name); setShowRenameProjectDialog(true); }
  async function confirmRenameProject(): Promise<void> { if (!project || !newProjectName.trim()) return; try { const result = await window.magicRender.saveProject({ ...project, name: newProjectName.trim() }); lastSavedSignaturesRef.current.set(result.project.projectId, JSON.stringify(result.project)); setProject(result.project, { label: 'Rename project' }); setRecent(result.recentProjects); setShowRenameProjectDialog(false); setMessage(`Nama project: ${result.project.name}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal mengganti nama project.'); } }
  async function loadProject(): Promise<void> { try { await flushProjectSave(); const result = await window.magicRender.loadProject(); if (!result) return; replaceProject(result.project); lastSavedSignaturesRef.current.set(result.project.projectId, JSON.stringify(result.project)); setRecent(result.recentProjects); setMainPage('Render'); setRenderTab('Media'); setMessage(`Loaded: ${result.project.name}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuka project.'); } }
  async function openRecentProject(item: RecentProject): Promise<void> { try { await flushProjectSave(); const result = await window.magicRender.loadProject(item.projectFilePath); if (!result) return; replaceProject(result.project); lastSavedSignaturesRef.current.set(result.project.projectId, JSON.stringify(result.project)); setRecent(result.recentProjects); setMainPage('Render'); setRenderTab('Media'); setMessage(`Loaded: ${result.project.name}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuka project.'); } }
  async function openRecentProjectFolder(item: RecentProject): Promise<void> { try { await window.magicRender.openProjectFolder(item.projectFilePath.replace(/[\\/][^\\/]+$/, '')); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuka folder project.'); } }
  async function removeRecentProject(projectId: string): Promise<void> {
    if (project?.projectId === projectId && (renderInFlight || bulkBusy)) { setMessage('Hentikan render sebelum menghapus project aktif.'); return; }
    try {
      if (project?.projectId === projectId) await flushProjectSave();
      const next = await window.magicRender.removeRecentProject(projectId);
      setRecent(next);
      if (project?.projectId === projectId) replaceProject(null);
      setMessage('Project dan berkas kerja dihapus. Asset serta hasil export tetap tersimpan.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal menghapus project.'); }
  }
  async function saveProject(): Promise<void> { if (!project) { setMessage('Belum ada project aktif.'); return; } try { const result = await window.magicRender.saveProject(project); lastSavedSignaturesRef.current.set(result.project.projectId, JSON.stringify(result.project)); setProject(result.project, { mode: 'replace', label: 'Save project' }); setRecent(result.recentProjects); setMessage('Project saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal menyimpan project.'); } }
  async function importMedia(): Promise<void> { if (!project) { setMessage('Buat atau buka project terlebih dahulu.'); return; } try { const result = await window.magicRender.importMainMedia(project); if (!result) return; setProject(result.project, { label: 'Import main media' }); setRecent(result.recentProjects); setPendingResolutionProject(result.project); setMessage('Media utama diimpor. Pilih resolusi output dan canvas.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal import media.'); } }
  async function chooseImportedResolution(resolution: '720p' | '1080p'): Promise<void> { const pending = pendingResolutionProject; if (!pending) return; try { const updated = { ...pending, settings: { ...pending.settings, resolution } }; const stored = await window.magicRender.saveProject(updated); const saved = await window.magicRender.updateSettings({ resolution }); setProject({ ...stored.project, settings: { ...stored.project.settings, resolution: saved.resolution } }, { label: 'Choose canvas resolution' }); setRecent(stored.recentProjects); setPendingResolutionProject(null); setMessage(`Canvas dan output dipilih: ${resolution}.`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal menyimpan resolusi.'); } }
  async function openFolder(): Promise<void> { if (!project) { setMessage('Belum ada project aktif.'); return; } try { await window.magicRender.openProjectFolder(project.projectDir); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuka folder.'); } }
  function playCompletionSound(): void {
    const context = completionAudio.current;
    if (!context) return;
    void context.resume().then(() => {
      for (const [index, frequency] of [660, 880].entries()) {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        const start = context.currentTime + index * 0.18;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start); oscillator.stop(start + 0.17);
      }
    }).catch(() => undefined);
  }
  async function startRender(): Promise<void> {
    if (bulkRunRef.current) { setMessage('Bulk Render sedang berjalan. Tunggu hingga antrean selesai.'); return; }
    if (!project) { setMessage('Buka project terlebih dahulu.'); return; }
    try { completionAudio.current ??= new AudioContext(); void completionAudio.current.resume(); } catch { /* Playback policy may block sounds. */ }
    const session = ++renderSession.current;
    renderStartedAt.current = Date.now(); renderPausedAt.current = 0; renderPausedMs.current = 0;
    etaSnapshot.current = null; latestProgress.current = null; setCompletion(null); setLastRenderOutputPath(null); setRenderInFlight(true);
    const starting: RenderProgress = { projectId: project.projectId, status: 'idle', percent: 0, currentTimeSec: 0, totalDurationSec: estimatedVideoDuration(project), speedMultiplier: 0, elapsedRenderSec: 0, logLine: '[SISTEM] Permintaan render dikirim. Menyiapkan media dan output...', errorMessage: null };
    setRenderProgress(starting); setConsoleEntries((entries) => appendConsoleEntry(entries, starting));
    window.setTimeout(() => {
      if (renderSession.current !== session) return;
      setRenderProgress((previous) => previous?.projectId === project.projectId && previous.logLine === starting.logLine
        ? { ...previous, logLine: '[PERSIAPAN] Belum ada jawaban dari proses utama. Periksa Console Log dan Path FFmpeg/FFprobe di Settings. Cancel tetap tersedia.' } : previous);
    }, 12_000);
    try {
      const renderTask = window.magicRender.startRender(project);
      if ((project.youtubeSEO.mode ?? 'timestamp') === 'timestamp-seo') {
        setSeoResult(null);
        setSeoInFlight(true);
        setSeoStatus('Render dimulai • menyiapkan analisis visual AI...');
        void window.magicRender.generateYoutubeSeo(project).then((value) => {
          if (session !== renderSession.current) return;
          setSeoResult(value);
          setSeoStatus(`Selesai • ${value.titles.length} judul • ${value.outputFiles.seoTxt}`);
        }).catch((error) => {
          if (session !== renderSession.current) return;
          const detail = error instanceof Error ? error.message : String(error);
          setSeoStatus(`Gagal • ${detail}`);
          setMessage(`SEO AI gagal: ${detail}`);
        }).finally(() => { if (session === renderSession.current) setSeoInFlight(false); });
      }
      const result = await renderTask;
      if (session !== renderSession.current) return;
      const progress = latestProgress.current as RenderProgress | null;
      setLastRenderOutputPath(result.outputPath);
      setCompletion({ outputPath: result.outputPath, durationSec: progress?.totalDurationSec || estimatedVideoDuration(project), elapsedSec: Math.max(0, (Date.now() - renderStartedAt.current - renderPausedMs.current) / 1000),
        resolution: project.settings.resolution, fps: project.settings.fps ?? 30, bitrateKbps: project.settings.bitrateKbps, fileSizeBytes: result.fileSizeBytes ?? null, overlays: project.overlays.length,
        intro: !!(project.intro.enabled && project.intro.path), stickers: project.stickerSubscribes?.length || (project.stickerSubscribe ? 1 : 0),
        renderDevice: result.renderDevice ?? 'cpu', gpu: result.gpu ?? { name: 'GPU tidak terdeteksi', vramMb: null, encoder: null } });
      playCompletionSound();
      setMessage((project.youtubeSEO.mode ?? 'timestamp') === 'timestamp-seo' ? 'Render selesai. Output youtubeseo.txt dipilih; status file terlihat di menu YouTube SEO.' : project.youtubeSEO.mode === 'none' ? 'Render selesai tanpa file metadata tambahan.' : 'Render selesai. timestamp.txt dibuat.');
    } catch (error) {
      if (session !== renderSession.current) return;
      const detail = error instanceof Error ? error.message : 'Render gagal.';
      const cancelled = /dibatalkan|direset/i.test(detail);
      setMessage(detail);
      const failure: RenderProgress = { projectId: project.projectId, status: cancelled ? 'cancelled' : 'error', percent: 0, currentTimeSec: 0, totalDurationSec: 0, speedMultiplier: 0, elapsedRenderSec: 0, logLine: detail, errorMessage: cancelled ? null : detail };
      setRenderProgress((previous) => ({ ...failure, percent: previous?.percent ?? 0, currentTimeSec: previous?.currentTimeSec ?? 0, totalDurationSec: previous?.totalDurationSec ?? 0, elapsedRenderSec: previous?.elapsedRenderSec ?? 0 }));
      setConsoleEntries((entries) => appendConsoleEntry(entries, failure));
    } finally { if (session === renderSession.current) setRenderInFlight(false); }
  }
  async function controlRender(action: 'pause' | 'resume' | 'cancel'): Promise<void> {
    if (!project) return;
    if (action === 'cancel') {
      ++renderSession.current;
      etaSnapshot.current = null; setCompletion(null); setResetting(true); setRenderInFlight(false); setSeoInFlight(false);
      setRenderProgress({ projectId: project.projectId, status: 'cancelled', percent: 0, currentTimeSec: 0,
        totalDurationSec: estimatedVideoDuration(project), speedMultiplier: 0, elapsedRenderSec: 0,
        logLine: 'Membatalkan dan mengosongkan proses render...', errorMessage: null });
      try {
        const result = await window.magicRender.controlRender({ projectId: project.projectId, action: 'cancel' });
        if (!result.accepted) throw new Error('Pembatalan render tidak diterima.');
        setMessage('Render dibatalkan. Monitor siap untuk render baru.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Pembatalan render gagal.'); }
      finally { setResetting(false); }
      return;
    }
    try {
      const result = await window.magicRender.controlRender({ projectId: project.projectId, action });
      if (result.accepted) {
        if (action === 'pause') renderPausedAt.current = Date.now();
        if (action === 'resume' && renderPausedAt.current) { renderPausedMs.current += Date.now() - renderPausedAt.current; renderPausedAt.current = 0; }
        setRenderProgress((previous) => previous?.projectId === project.projectId ? { ...previous, status: result.status, speedMultiplier: 0 } : previous);
      }
      setMessage(result.accepted ? action === 'pause' ? 'Render dijeda.' : 'Render dilanjutkan.' : 'Aksi render tidak diterima.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kontrol render gagal.'); }
  }

  function resetCompletedRender(): void { if (renderInFlight || renderProgress?.status !== 'done') return; setRenderProgress(null); setLastRenderOutputPath(null); setCompletion(null); setConsoleEntries([]); etaSnapshot.current = null; setMessage('Tugas render selesai direset. File hasil tetap tersimpan.'); }
  async function openCompletedVideo(): Promise<void> { if (!completion) return; try { await window.magicRender.openOutputVideo(completion.outputPath); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuka video.'); } }
  async function openCompletedFolder(): Promise<void> { if (!completion) return; try { await window.magicRender.openProjectFolder(completion.outputPath.replace(/[\\/][^\\/]+$/, '')); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuka folder output.'); } }

  async function startBulk():Promise<void> {
    if (renderInFlight || bulkRunRef.current) { setMessage('Selesaikan proses render saat ini terlebih dahulu.'); return; }
    bulkRunRef.current=true;bulkCancelled.current=false;setBulkBusy(true);
    try {
      setMessage('Memeriksa media, MP3 dan asset untuk antrean...');
      const plans=await window.magicRender.prepareBulkRender({media:bulkMedia,tracklistId:bulkTracklistId,mp3Count:bulkMp3Count,options:bulkOptions,seoTemplate:project?.youtubeSEO});
      setBulkResults(plans.map((plan)=>({id:plan.media.id,name:plan.media.path.split(/[\\/]/).at(-1)??plan.media.path,status:'queued',percent:0})));
      bulkProjectToMedia.current=new Map(plans.map((plan)=>[plan.project.projectId,plan.media.id]));
      for (const plan of plans) {
        if (bulkCancelled.current) break;
        currentBulkProject.current=plan.project.projectId;
        setBulkResults((items)=>items.map((item)=>item.id===plan.media.id?{...item,status:'rendering',percent:0,currentTimeSec:0,totalDurationSec:plan.project.playlistTracks?.reduce((sum,track)=>sum+(track.durationSeconds??0),0)??0,speedMultiplier:0}:item));
        let completedOutputPath: string | undefined;
        let completedTimestampPath: string | undefined;
        try {
          const result=await window.magicRender.startRender(plan.project);
          completedOutputPath = result.outputPath;
          completedTimestampPath = result.timestampPath;
          let metadataPath = result.timestampPath;
          if ((plan.project.youtubeSEO.mode ?? 'timestamp') === 'timestamp-seo') {
            // Generate one SEO sidecar after this item's MP4 is finalized. Passing
            // the exact output path ensures each bulk item gets its own filename.
            const seoResult = await window.magicRender.generateYoutubeSeo(plan.project, result.outputPath);
            metadataPath = seoResult.outputFiles.seoTxt || undefined;
            if (!metadataPath) throw new Error('MP4 berhasil dibuat, tetapi file youtubeseo.txt tidak dihasilkan. Periksa log AI SEO.');
          }
          if ((plan.project.youtubeSEO.mode ?? 'timestamp') === 'timestamp' && !metadataPath) throw new Error('MP4 berhasil dibuat, tetapi timestamp.txt tidak dihasilkan. Periksa Console Log.');
          setBulkResults((items)=>items.map((item)=>item.id===plan.media.id?{...item,status:'done',percent:100,outputPath:result.outputPath,timestampPath:result.timestampPath,metadataPath}:item));
        } catch(error) {
          const message=error instanceof Error?error.message:String(error);
          setBulkResults((items)=>items.map((item)=>item.id===plan.media.id?{...item,status:bulkCancelled.current?'cancelled':'error',outputPath:completedOutputPath,timestampPath:completedTimestampPath,metadataPath:completedTimestampPath,error:completedOutputPath?`Video sudah berhasil dirender, tetapi proses metadata gagal: ${message}`:message}:item));
          if (!bulkCancelled.current) setMessage(`Bulk ${plan.media.path.split(/[\\/]/).at(-1)} gagal: ${message}`);
        } finally { currentBulkProject.current=null; }
      }
      if (bulkCancelled.current) setBulkResults((items)=>items.map((item)=>item.status==='queued'?{...item,status:'cancelled'}:item));
      setMessage(bulkCancelled.current?'Antrean Bulk Render dibatalkan.':'Antrean Bulk Render selesai. Periksa daftar hasil.');
    } catch(error) { setMessage(error instanceof Error?error.message:'Persiapan Bulk Render gagal.'); }
    finally {currentBulkProject.current=null;bulkRunRef.current=false;setBulkBusy(false);}
  }
  async function cancelBulk():Promise<void> { bulkCancelled.current=true; const id=currentBulkProject.current; if (id) { try { await window.magicRender.controlRender({projectId:id,action:'cancel'}); } catch(error) { setMessage(error instanceof Error?error.message:'Gagal membatalkan render saat ini.'); } } else setMessage('Antrean berhenti setelah persiapan selesai.'); }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || document.querySelector('.mrp-asset-editor')) return;
      const modal = !!document.querySelector('[role="dialog"]');
      const interactive = event.target instanceof HTMLElement && !!event.target.closest('button, a, [role="button"]');
      const action = editorShortcut(event, isEditingField(event.target) || interactive, modal);
      if (!action) return;
      if (action === 'escape') {
        if (!modal) return;
        event.preventDefault();
        if (completion) setCompletion(null);
        else if (showCreateProjectDialog) setShowCreateProjectDialog(false);
        else if (showRenameProjectDialog) setShowRenameProjectDialog(false);
        else window.dispatchEvent(new Event('mrp:close-modal'));
        return;
      }
      event.preventDefault();
      if (action === 'save') {
        const formSave = document.querySelector<HTMLButtonElement>('[role="dialog"] [data-shortcut-save], .mrp-settings-grid [data-shortcut-save], .mrp-settings-savebar [data-shortcut-save]');
        if (formSave && !formSave.disabled) formSave.click();
        else if (!modal) void saveProject();
        return;
      }
      if (action === 'help') { void navigateToPage('Help'); return; }
      if (action.startsWith('page-')) { const pages: MainPage[] = ['Home','Render','Bulk Render','Asset','Setting','Help']; const target = pages[Number(action.slice(5)) - 1]; if (target) void navigateToPage(target); return; }
      if (action.startsWith('tab-')) { const tab = renderTabs[Number(action.slice(4)) - 1]; if (tab) void navigateToRenderTab(tab); return; }
      if (action === 'new') { createProject(); return; }
      if (action === 'open') { void loadProject(); return; }
      if (action === 'import') { void importMedia(); return; }
      if (action === 'render') { if (mainPage === 'Bulk Render') void startBulk(); else if (mainPage === 'Render') void startRender(); return; }
      if (action === 'pause') { if (renderInFlight) void controlRender(renderProgress?.status === 'paused' ? 'resume' : 'pause'); return; }
      if (action === 'cancel') { if (bulkBusy) void cancelBulk(); else if (renderInFlight) void controlRender('cancel'); return; }
      if (mainPage === 'Render' && !renderInFlight) window.dispatchEvent(new CustomEvent('mrp:preview-action', { detail: { action, step: event.shiftKey ? 10 : 1 } }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const eta = countdownEta(renderProgress, etaSnapshot.current);
  etaSnapshot.current = eta.snapshot;

  const mainNav = <MainNav activeTab={mainPage} onSelect={(page) => { void navigateToPage(page); }} />;
  const page = mainPage === 'Home'
    ? <HomePage onStart={createProject} onOpen={() => void loadProject()} recent={recent} onOpenRecent={(item) => void openRecentProject(item)} onRemoveRecent={removeRecentProject} onNavigate={(target) => { void navigateToPage(target); }} onOpenSettings={() => { void navigateToPage('Setting'); }} />
    : mainPage === 'Render'
      ? <RenderPage project={project} setProject={setProject} replaceProject={replaceProject} renderTab={renderTab} setRenderTab={(tab) => { void navigateToRenderTab(tab); }} recent={recent} setRecent={setRecent} onRemoveRecent={removeRecentProject} onOpenRecentProject={openRecentProject} onCreateProject={createProject} onRenameProject={renameProject} onLoadProject={loadProject} onSaveProject={saveProject} onImportMedia={importMedia} onOpenFolder={openFolder} renderProgress={renderProgress} etaRemaining={eta.seconds} renderInFlight={renderInFlight} bulkBusy={bulkBusy} consoleEntries={consoleEntries} lastRenderOutputPath={lastRenderOutputPath} seoStatus={seoStatus} seoInFlight={seoInFlight} seoResult={seoResult} onSeoStatus={setSeoStatus} onMessage={setMessage} onOpenSettings={() => { void navigateToPage('Setting'); }} startRender={startRender} controlRender={controlRender} resetCompletedRender={resetCompletedRender} resetting={resetting} />
      : mainPage === 'Bulk Render'
        ? <BulkRenderPage media={bulkMedia} setMedia={setBulkMedia} options={bulkOptions} setOptions={setBulkOptions} tracklistId={bulkTracklistId} setTracklistId={setBulkTracklistId} mp3Count={bulkMp3Count} setMp3Count={setBulkMp3Count} busy={bulkBusy} results={bulkResults} onStart={startBulk} onCancel={cancelBulk} onResetResult={(id) => setBulkResults((items) => items.map((item) => item.id === id ? { ...item, status: 'queued', percent: 0, outputPath: undefined, timestampPath: undefined, metadataPath: undefined, error: undefined } : item))} onCloseResult={(id) => setBulkResults((items) => items.filter((item) => item.id !== id))} onMessage={setMessage}/>
      : mainPage === 'Asset'
        ? <AssetLibraryPage assets={lockedAssets} project={project} onRefresh={refreshAssets} onMessage={setMessage} onOpenBulkRender={(folderId) => { if (folderId) setBulkTracklistId(folderId); void navigateToPage('Bulk Render'); }} />
        : mainPage === 'Setting'
          ? <section className="mrp-simple-page mrp-simple-page--settings"><SettingsPanel project={project} onProjectChange={(next, options) => setProject(next, options)} onMessage={setMessage} themeMode={themeMode} onThemeModeChange={setThemeMode} /></section>
          : <HelpPage onNavigate={(target) => { void navigateToPage(target); }} />;

  return <>
    {toastVisible && <div className="mrp-toast" role="status" aria-live="polite"><div className="mrp-toast__body">{message}</div><button type="button" className="mrp-toast__close" aria-label="Close notification" onClick={() => setToastVisible(false)}>×</button></div>}
    {showCreateProjectDialog && <div className="mrp-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreateProjectDialog(false); }}><div className="mrp-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title"><div id="create-project-title" className="mrp-dialog__title">New Project</div><p>Masukkan nama project baru.</p><input autoFocus maxLength={120} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void confirmCreateProject(); if (event.key === 'Escape') setShowCreateProjectDialog(false); }} /><div className="mrp-dialog__actions"><button type="button" className="mrp-btn" onClick={() => setShowCreateProjectDialog(false)}>Cancel</button><button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void confirmCreateProject()}>Create</button></div></div></div>}
    {showRenameProjectDialog && <div className="mrp-dialog-backdrop"><div className="mrp-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-project-title"><div id="rename-project-title" className="mrp-dialog__title">Rename Project</div><p>Nama file export mengikuti nama baru jika kolom nama export kosong.</p><input autoFocus maxLength={120} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void confirmRenameProject(); if (event.key === 'Escape') setShowRenameProjectDialog(false); }} /><div className="mrp-dialog__actions"><button type="button" className="mrp-btn" onClick={() => setShowRenameProjectDialog(false)}>Batal</button><button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void confirmRenameProject()}>Simpan Nama</button></div></div></div>}
    {pendingResolutionProject && <div className="mrp-dialog-backdrop"><div className="mrp-dialog" role="dialog" aria-modal="true" aria-labelledby="resolution-prompt-title"><div id="resolution-prompt-title" className="mrp-dialog__title">Ukuran canvas setelah import</div><p>Pilih resolusi video dan canvas preview. Posisi layer tetap mengikuti proporsi canvas.</p><div className="mrp-dialog__actions"><button type="button" className="mrp-btn" onClick={() => void chooseImportedResolution('720p')}>720p • 1280×720</button><button type="button" autoFocus className="mrp-btn mrp-btn--primary" onClick={() => void chooseImportedResolution('1080p')}>1080p • 1920×1080</button></div></div></div>}
    {showImportPrompt && <div className="mrp-dialog-backdrop"><div className="mrp-dialog" role="dialog" aria-modal="true" aria-labelledby="import-prompt-title"><div id="import-prompt-title" className="mrp-dialog__title">Project siap</div><p>Import gambar atau video utama sekarang?</p><div className="mrp-dialog__actions"><button type="button" className="mrp-btn" onClick={() => setShowImportPrompt(false)}>Nanti</button><button type="button" autoFocus className="mrp-btn mrp-btn--primary" onClick={() => { setShowImportPrompt(false); void importMedia(); }}>Import Media</button></div></div></div>}
    {completion && <div className="mrp-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompletion(null); }}><div className="mrp-dialog mrp-render-complete" role="dialog" aria-modal="true" aria-labelledby="render-complete-title"><div className="mrp-render-complete__head"><div><span className="mrp-kicker">Render selesai</span><h2 id="render-complete-title">Video siap diputar</h2></div><button type="button" autoFocus className="mrp-render-complete__close" aria-label="Tutup ringkasan render" title="Tutup" onClick={() => setCompletion(null)}>×</button></div><div className="mrp-render-complete__grid"><span>Durasi video<b>{formatSeconds(completion.durationSec)}</b></span><span>Resolusi<b>{completion.resolution}</b></span><span>FPS<b>{completion.fps}</b></span><span>Target bitrate<b>{completion.bitrateKbps} kbps</b></span><span>Waktu render<b>{formatSeconds(completion.elapsedSec)}</b></span><span>Ukuran file<b>{completion.fileSizeBytes === null ? '—' : `${(completion.fileSizeBytes / 1024 / 1024).toFixed(2)} MB`}</b></span><span>Overlay<b>{completion.overlays}</b></span><span>Intro<b>{completion.intro ? 'Ya' : 'Tidak'}</b></span><span>Sticker<b>{completion.stickers}</b></span><span>Perangkat Render<b>{completion.renderDevice === 'gpu' ? `GPU • ${completion.gpu.encoder ?? 'H.264'}` : 'CPU • libx264'}</b></span><span>VGA / GPU<b>{completion.gpu.name}</b></span><span>VRAM<b>{completion.gpu.vramMb === null ? 'Tidak tersedia' : `${completion.gpu.vramMb} MB`}</b></span></div><div className="mrp-render-complete__path"><small>Folder penyimpanan</small><strong>{completion.outputPath.replace(/[\\/][^\\/]+$/, '')}</strong><small>File: {completion.outputPath.split(/[\\/]/).at(-1)}</small></div><div className="mrp-dialog__actions"><button type="button" className="mrp-btn" onClick={() => void openCompletedFolder()}>Buka Folder</button><button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void openCompletedVideo()}>▶ Buka Video</button></div></div></div>}
    <main className="mrp-shell"><WindowChrome /><div className="mrp-app-body"><aside className="mrp-main-sidebar" aria-label="Application navigation">{mainNav}<div className="mrp-main-sidebar__footer">© 2026 Radist Ginola. All rights reserved.</div></aside><section className="mrp-page-content" aria-label={`${mainPage} workspace`}>{page}</section></div></main>
  </>;
}

function formatSeconds(value: number): string { const total = Math.max(0, Math.floor(value || 0)); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60; return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

export function App(): JSX.Element { return <HistoryProvider historyLimit={100} initialProject={null}><AppContent /></HistoryProvider>; }
