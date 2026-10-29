import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { HistoryOptions } from '../context';
import type { LockedAsset } from '../../shared/domain/lockedAssetTypes';
import { defaultStickerConfig, type ProjectSticker, type StickerMediaType, type StickerScheduleMode, type StickerBackgroundRemoval, type StickerBlendMode } from '../../shared/domain/stickerTypes';
import { PreviewEyeIcon } from './PreviewEyeIcon';
import { PreviewLockIcon } from './PreviewLockIcon';
import { DeleteLayerIcon, ChevronIcon, ResetLayerIcon } from './LayerActionIcons';
import { stickerAssetPreset } from '../../shared/domain/assetPreset';

const mediaKind = (extension: string): StickerMediaType => {
  const normalized = extension.startsWith('.') ? extension : `.${extension}`;
  return /\.(mp4|mov|mkv|webm|avi)$/i.test(normalized) ? 'video' : /\.gif$/i.test(normalized) ? 'gif' : 'image';
};
const stickerMediaUrl = (filePath: string): string => `mrp-media://local?path=${encodeURIComponent(filePath)}`;
const fileName = (filePath: string): string => filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
const formatBytes = (bytes: number): string => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function secondsFromTimestamp(value: string): number {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) && parts[0]! >= 0 && parts[1]! >= 0 && parts[1]! < 60 ? parts[0]! * 60 + parts[1]! : 30;
}

function StickerScheduleEditor({ stickerId, value, onChange }: { stickerId: string; value: string; onChange: (seconds: number) => void }): JSX.Element {
  const current = Math.max(0, Math.floor(secondsFromTimestamp(value)));
  const [minuteText, setMinuteText] = useState(String(Math.floor(current / 60)));
  const [secondText, setSecondText] = useState(String(current % 60));
  const [timeText, setTimeText] = useState(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
  useEffect(() => {
    const seconds = Math.max(0, Math.floor(secondsFromTimestamp(value)));
    setMinuteText(String(Math.floor(seconds / 60)));
    setSecondText(String(seconds % 60));
    setTimeText(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
  }, [stickerId, value]);
  const restore = () => {
    setMinuteText(String(Math.floor(current / 60)));
    setSecondText(String(current % 60));
    setTimeText(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
  };
  const commit = (minute: string, second: string) => {
    const m = Number(minute), s = Number(second);
    if (minute.trim() && second.trim() && Number.isInteger(m) && Number.isInteger(s) && m >= 0 && s >= 0 && s < 60) onChange(m * 60 + s);
    else restore();
  };
  const commitTime = () => {
    const match = /^(\d+):([0-5]?\d)$/.exec(timeText.trim());
    if (match) onChange(Number(match[1]) * 60 + Number(match[2])); else restore();
  };
  return <div className="mrp-sticker-schedule-editor">
    <div className="mrp-sticker-schedule-editor__inputs">
      <label>Menit<input className="mrp-sticker-time-input" type="number" min="0" step="1" value={minuteText} onChange={(e) => setMinuteText(e.target.value)} onBlur={() => commit(minuteText, secondText)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <label>Detik<input className="mrp-sticker-time-input" type="number" min="0" max="59" step="1" value={secondText} onChange={(e) => setSecondText(e.target.value)} onBlur={() => commit(minuteText, secondText)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <label>Waktu (mm:ss)<input className="mrp-sticker-time-input" type="text" inputMode="numeric" value={timeText} onChange={(e) => setTimeText(e.target.value)} onBlur={commitTime} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    </div>
    <input className="mrp-sticker-time-range" aria-label="Waktu kemunculan sticker" type="range" min="0" max={Math.max(3600, current)} step="1" value={current} onChange={(e) => onChange(Number(e.target.value))} />
    <div className="mrp-sticker-help">Tulis menit dan detik, lalu klik di luar kolom atau tekan Enter.</div>
  </div>;
}

export function StickerPanel({ project, onProjectChange, hiddenLayers, onToggleLayer }: { project: ProjectData; onProjectChange: (project: ProjectData, options?: HistoryOptions) => void; hiddenLayers: Set<string>; onToggleLayer: (key: string) => void }): JSX.Element {
  const latest = useRef(project);
  latest.current = project;
  const [type, setType] = useState<StickerMediaType>(() => {
    const saved = sessionStorage.getItem('mrp-sticker-media-type');
    return saved === 'video' || saved === 'gif' ? saved : 'image';
  });
  const [library, setLibrary] = useState<LockedAsset[]>([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  function toggleCollapsed(id: string): void {
    setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const stickers = project.stickerSubscribes?.length ? project.stickerSubscribes : (project.stickerSubscribe ? [project.stickerSubscribe] : []);
  const selectedSticker = stickers.find((item) => item.id === selectedStickerId) ?? stickers[0] ?? null;
  const matchingLibrary = library.filter((item) => mediaKind(item.metadata.extension) === type && `${item.metadata.originalName} ${item.metadata.extension} ${item.path}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function refreshLibrary(): Promise<void> {
    try { setLibrary((await window.magicRender.listLockedAssets()).filter((item) => item.menu === 'stickerSubscribe')); }
    catch { setLibrary([]); }
  }
  useEffect(() => { void refreshLibrary(); }, []);
  useEffect(() => { sessionStorage.setItem('mrp-sticker-media-type', type); }, [type]);
  useEffect(() => {
    if (selectedStickerId && stickers.some((item) => item.id === selectedStickerId)) return;
    setSelectedStickerId(stickers[0]?.id ?? null);
  }, [project.stickerSubscribes, project.stickerSubscribe, selectedStickerId]);
  // Legacy projects may contain a manually configured sticker duration. Keep
  // non-image stickers aligned to their actual source length after loading.
  useEffect(() => {
    let cancelled = false;
    stickers.filter((item) => item.type !== 'image').forEach((sticker) => {
      void window.magicRender.probeMainMedia(sticker.path).then((metadata) => {
        const sourceDuration = metadata?.durationSeconds;
        if (cancelled || typeof sourceDuration !== 'number' || !Number.isFinite(sourceDuration) || sourceDuration <= 0) return;
        const base = latest.current;
        const current = base.stickerSubscribes?.length ? base.stickerSubscribes : base.stickerSubscribe ? [base.stickerSubscribe] : [];
        const target = current.find((item) => item.id === sticker.id);
        if (!target || Math.abs(target.config.durationSec - sourceDuration) < 0.05) return;
        const updated = current.map((item) => item.id === sticker.id ? { ...item, config: { ...item.config, durationSec: sourceDuration } } : item);
        const nextProject = { ...base, stickerSubscribes: updated, stickerSubscribe: updated[0] ?? null };
        latest.current = nextProject;
        onProjectChange(nextProject, { mode: 'replace', label: 'Sync sticker source duration' });
      }).catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [stickers.map((item) => `${item.id}:${item.path}:${item.type}`).join('|')]);

  async function add(filePath?: string, selectedType = type, asset?: LockedAsset): Promise<void> {
    try {
      const result = await window.magicRender.addSticker(latest.current, selectedType, filePath);
      if (result) {
        const saved = result.project.stickerSubscribes ?? [];
        const next = saved.map((item, index) => index === saved.length - 1 && asset ? { ...item, config: { ...item.config, ...stickerAssetPreset(asset), schedule: item.config.schedule, durationSec: item.config.durationSec, fade: item.config.fade } } : item);
        const nextProject = { ...result.project, stickerSubscribes: next, stickerSubscribe: next[0] ?? null };
        latest.current = nextProject;
        setSelectedStickerId(next.at(-1)?.id ?? null);
        onProjectChange(nextProject);
      }
    } catch (error) {
      void window.magicRender.logActivity('ERROR', 'Sticker import gagal.', error instanceof Error ? error.message : String(error));
    }
  }
  async function update(sticker: ProjectSticker): Promise<void> {
    try { onProjectChange((await window.magicRender.updateSticker(latest.current, sticker)).project); }
    catch (error) { void window.magicRender.logActivity('ERROR', 'Sticker update gagal.', error instanceof Error ? error.message : String(error)); }
  }
  async function remove(id: string): Promise<void> {
    try {
      const result = await window.magicRender.removeSticker(latest.current, id);
      const nextProject = result.project;
      latest.current = nextProject;
      const remaining = nextProject.stickerSubscribes?.length ? nextProject.stickerSubscribes : nextProject.stickerSubscribe ? [nextProject.stickerSubscribe] : [];
      if (selectedStickerId === id) setSelectedStickerId(remaining[0]?.id ?? null);
      onProjectChange(nextProject);
    } catch (error) { void window.magicRender.logActivity('ERROR', 'Sticker remove gagal.', error instanceof Error ? error.message : String(error)); }
  }
  function patch(sticker: ProjectSticker, patchValue: Partial<ProjectSticker['config']>): void {
    const base = latest.current;
    const current = base.stickerSubscribes?.length ? base.stickerSubscribes : base.stickerSubscribe ? [base.stickerSubscribe] : [];
    const updated = current.map((item) => item.id === sticker.id ? { ...item, config: { ...item.config, ...patchValue } } : item);
    const result = { ...base, stickerSubscribes: updated, stickerSubscribe: updated[0] ?? null };
    latest.current = result;
    onProjectChange(result, { mode: 'coalesce', label: 'Sticker controls' });
    if (patchValue.schedule) window.dispatchEvent(new Event('mrp:sticker-schedule-changed'));
  }
  function commit(): void { onProjectChange(latest.current, { mode: 'commit-coalesced', label: 'Sticker controls' }); }
  function toggleLock(id: string): void {
    const current = latest.current.stickerSubscribes?.length ? latest.current.stickerSubscribes : latest.current.stickerSubscribe ? [latest.current.stickerSubscribe] : [];
    const next = current.map((item) => item.id === id ? { ...item, locked: !item.locked } : item);
    const result = { ...latest.current, stickerSubscribes: next, stickerSubscribe: next[0] ?? null };
    latest.current = result;
    onProjectChange(result);
  }
  function setTimestamp(sticker: ProjectSticker, seconds: number): void {
    if (Number.isInteger(seconds) && seconds >= 0) patch(sticker, { schedule: { ...sticker.config.schedule, timestamps: [String(seconds)] } });
  }
  function reset(sticker: ProjectSticker): void {
    patch(sticker, { ...defaultStickerConfig(), durationSec: sticker.type === 'image' ? 3 : sticker.config.durationSec });
  }
  function selectSticker(sticker: ProjectSticker): void {
    setSelectedStickerId(sticker.id);
    setCollapsed((current) => { const next = new Set(current); next.delete(sticker.id); return next; });
  }

  return <div className="mrp-sticker-workspace" onPointerUp={commit} onKeyUp={commit} onBlur={commit}>
    <aside className="mrp-sticker-library-panel" aria-label="Sticker library dan layer">
      <section className="mrp-sticker-section mrp-sticker-library">
        <header className="mrp-sticker-section__header">
          <div><span className="mrp-kicker">Asset</span><h3>Sticker Library</h3></div>
          <div className="mrp-sticker-section__header-actions"><span className="mrp-sticker-count">{library.length}</span><button type="button" className="mrp-sticker-icon-button" onClick={() => void refreshLibrary()} aria-label="Refresh Sticker Library" title="Refresh">↻</button></div>
        </header>
        <label className="mrp-sticker-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari sticker, misalnya subscribe, like…" aria-label="Cari sticker" /></label>
        <div className="mrp-sticker-type-tabs" role="tablist" aria-label="Jenis media sticker">
          {(['image', 'video', 'gif'] as const).map((kind) => {
            const count = library.filter((item) => mediaKind(item.metadata.extension) === kind).length;
            return <button key={kind} type="button" role="tab" aria-selected={type === kind} className={type === kind ? 'is-active' : ''} onClick={() => setType(kind)}><span>{kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'GIF'}</span><small>{count}</small></button>;
          })}
        </div>
        <div className="mrp-sticker-asset-grid">
          {matchingLibrary.length === 0 ? <div className="mrp-sticker-empty"><span aria-hidden="true">✦</span><strong>{search ? 'Sticker tidak ditemukan' : `Belum ada ${type === 'image' ? 'gambar' : type === 'video' ? 'video' : 'GIF'} tersimpan`}</strong><small>Impor sticker atau simpan asset melalui Asset Library.</small></div> : matchingLibrary.map((item) => {
            const kind = mediaKind(item.metadata.extension);
            return <button key={item.assetId} type="button" className="mrp-sticker-asset-card" title={`Tambahkan ${item.metadata.originalName} ke project`} onClick={() => void add(item.path, kind, item)}>
              <span className="mrp-sticker-asset-card__thumb">{kind === 'video' ? <video src={stickerMediaUrl(item.path)} muted playsInline preload="metadata" /> : <img src={stickerMediaUrl(item.path)} alt="" loading="lazy" />}</span>
              <span className="mrp-sticker-asset-card__name">{item.metadata.originalName}</span>
              <small>{kind.toUpperCase()} · {formatBytes(item.metadata.sizeBytes)}</small>
              <span className="mrp-sticker-asset-card__add">＋ Tambahkan</span>
            </button>;
          })}
        </div>
        <div className="mrp-sticker-import-row">
          <label htmlFor="sticker-media-type">Import sebagai</label>
          <select id="sticker-media-type" value={type} onChange={(e) => setType(e.target.value as StickerMediaType)} className="mrp-dark-select"><option value="image">Gambar</option><option value="video">Video</option><option value="gif">GIF</option></select>
          <button type="button" onClick={() => void add()} className="mrp-btn mrp-btn--primary"><span aria-hidden="true">⇧</span> Import Sticker</button>
        </div>
      </section>

      <section className="mrp-sticker-section mrp-sticker-layers" aria-label="Lapisan sticker">
        <header className="mrp-sticker-section__header"><div><span className="mrp-kicker">Project</span><h3>Lapisan Sticker</h3><p>Urutan dan visibilitas sticker pada canvas.</p></div><span className="mrp-sticker-count">{stickers.length}</span></header>
        {stickers.length === 0 ? <div className="mrp-sticker-empty mrp-sticker-empty--compact"><span aria-hidden="true">▧</span><strong>Belum ada layer</strong><small>Pilih sticker di library atau impor file untuk memulai.</small></div> : <div className="mrp-sticker-layer-list">
          {stickers.map((sticker, index) => <div key={sticker.id} className={`mrp-sticker-layer${selectedSticker?.id === sticker.id ? ' is-selected' : ''}`}>
            <button type="button" className="mrp-sticker-layer__select" onClick={() => selectSticker(sticker)} aria-pressed={selectedSticker?.id === sticker.id}>
              <span className="mrp-sticker-layer__thumb">{sticker.type === 'video' ? <video src={stickerMediaUrl(sticker.path)} muted playsInline preload="metadata" /> : <img src={stickerMediaUrl(sticker.path)} alt="" loading="lazy" />}</span>
              <span className="mrp-sticker-layer__labels"><strong>{fileName(sticker.path)}</strong><small>Sticker {index + 1} · {sticker.type.toUpperCase()}</small></span>
            </button>
            <div className="mrp-sticker-layer__actions">
              <button type="button" aria-label={hiddenLayers.has(`sticker:${sticker.id}`) ? 'Tampilkan sticker' : 'Sembunyikan sticker'} title={hiddenLayers.has(`sticker:${sticker.id}`) ? 'Tampilkan di preview' : 'Sembunyikan dari preview'} onClick={() => onToggleLayer(`sticker:${sticker.id}`)}><PreviewEyeIcon hidden={hiddenLayers.has(`sticker:${sticker.id}`)} /></button>
              <button type="button" aria-pressed={!!sticker.locked} aria-label={sticker.locked ? 'Buka kunci sticker' : 'Kunci sticker'} title={sticker.locked ? 'Buka kunci posisi di preview' : 'Kunci posisi di preview'} onClick={() => toggleLock(sticker.id)}><PreviewLockIcon locked={!!sticker.locked} /></button>
              <button type="button" aria-label="Hapus sticker" title="Hapus sticker" className="is-danger" onClick={() => void remove(sticker.id)}><DeleteLayerIcon /></button>
              <button type="button" aria-label={collapsed.has(sticker.id) ? 'Tampilkan setting sticker' : 'Sembunyikan setting sticker'} title="Tampilkan/sembunyikan setting" aria-expanded={!collapsed.has(sticker.id)} onClick={() => { setSelectedStickerId(sticker.id); toggleCollapsed(sticker.id); }}><ChevronIcon expanded={!collapsed.has(sticker.id)} /></button>
            </div>
          </div>)}
        </div>}
      </section>
    </aside>

    <aside className="mrp-sticker-inspector" aria-label="Sticker Subscribe - pengaturan sticker terpilih">
      {!selectedSticker ? <section className="mrp-sticker-section mrp-sticker-inspector__empty"><span aria-hidden="true">✦</span></section> : (() => {
        const sticker = selectedSticker;
        const config = sticker.config;
        const mode = config.backgroundRemoval;
        const isCollapsed = collapsed.has(sticker.id);
        return <section className="mrp-sticker-section mrp-sticker-inspector__section">
          <header className="mrp-sticker-inspector__header"><div><h3 title={fileName(sticker.path)}>{fileName(sticker.path)}</h3></div><div className="mrp-sticker-inspector__header-actions"><button type="button" aria-label="Reset pengaturan sticker" title="Reset pengaturan sticker" onClick={() => reset(sticker)}><ResetLayerIcon /></button><button type="button" aria-label={hiddenLayers.has(`sticker:${sticker.id}`) ? 'Tampilkan sticker' : 'Sembunyikan sticker'} title={hiddenLayers.has(`sticker:${sticker.id}`) ? 'Tampilkan di preview' : 'Sembunyikan dari preview'} onClick={() => onToggleLayer(`sticker:${sticker.id}`)}><PreviewEyeIcon hidden={hiddenLayers.has(`sticker:${sticker.id}`)} /></button><button type="button" aria-pressed={!!sticker.locked} aria-label={sticker.locked ? 'Buka kunci sticker' : 'Kunci sticker'} title={sticker.locked ? 'Buka kunci posisi di preview' : 'Kunci posisi di preview'} onClick={() => toggleLock(sticker.id)}><PreviewLockIcon locked={!!sticker.locked} /></button><button type="button" aria-label="Hapus sticker" title="Hapus sticker" className="is-danger" onClick={() => void remove(sticker.id)}><DeleteLayerIcon /></button><button type="button" aria-label={isCollapsed ? 'Tampilkan setting sticker' : 'Sembunyikan setting sticker'} title="Tampilkan/sembunyikan setting" aria-expanded={!isCollapsed} onClick={() => toggleCollapsed(sticker.id)}><ChevronIcon expanded={!isCollapsed} /></button></div></header>
          {!isCollapsed && <div className="mrp-sticker-inspector__body">
            <section className="mrp-sticker-control-group"><h4>Mode & Tampilan</h4><div className="mrp-sticker-control-grid">
              <label>Mode Blend<select className="mrp-dark-select" value={config.blendMode} onChange={(e) => patch(sticker, { blendMode: e.target.value as StickerBlendMode })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option></select></label>
              <label>Background Keying<select className="mrp-dark-select" value={mode} onChange={(e) => { const value = e.target.value as StickerBackgroundRemoval; patch(sticker, { backgroundRemoval: value, chromaKey: { ...config.chromaKey, enabled: value === 'chroma' }, colorKey: { ...config.colorKey, enabled: value === 'color' } }); }}><option value="none">Off</option><option value="chroma">Chroma Key</option><option value="color">Color Key</option></select></label>
              <label className="mrp-sticker-check"><input type="checkbox" checked={config.audioMuted} disabled={sticker.type !== 'video'} onChange={(e) => patch(sticker, { audioMuted: e.target.checked })} /> Matikan audio {sticker.type === 'video' ? '' : '(video saja)'}</label>
              <label className="mrp-sticker-slider">Opacity<input type="range" min="0" max="1" step="0.01" value={config.opacity} onChange={(e) => patch(sticker, { opacity: Number(e.target.value) })}/><span>{Math.round(config.opacity * 100)}%</span></label>
              <label className="mrp-sticker-slider">Speed<input type="range" min="0.1" max="8" step="0.1" value={config.speed ?? 1} onChange={(e) => patch(sticker, { speed: Number(e.target.value) })}/><span>{(config.speed ?? 1).toFixed(1)}×</span></label>
            </div></section>
            <section className="mrp-sticker-control-group"><h4>Transform</h4><div className="mrp-sticker-control-grid">
              <label>Scale<input type="number" min="0.1" max="20" step="0.1" value={config.scale} onChange={(e) => { const scale = Number(e.target.value); if (scale > 0 && scale <= 20) patch(sticker, { scale }); }}/></label>
              <label>Rotation (°)<input type="number" min="-360" max="360" step="1" value={config.rotation} onChange={(e) => { const rotation = Number(e.target.value); if (Number.isFinite(rotation) && rotation >= -360 && rotation <= 360) patch(sticker, { rotation }); }}/></label>
              <label>Posisi X<input type="number" min="-3840" max="7680" step="1" value={Math.round(config.position.x)} onChange={(e) => { const x = Number(e.target.value); if (Number.isFinite(x)) patch(sticker, { position: { ...config.position, x } }); }}/></label>
              <label>Posisi Y<input type="number" min="-2160" max="4320" step="1" value={Math.round(config.position.y)} onChange={(e) => { const y = Number(e.target.value); if (Number.isFinite(y)) patch(sticker, { position: { ...config.position, y } }); }}/></label>
            </div></section>
            <section className="mrp-sticker-control-group"><h4>Fade & Durasi</h4><div className="mrp-sticker-control-grid">
              <label className="mrp-sticker-slider">Fade In<input type="range" min="0" max="30" step="0.1" value={config.fade.fadeInSec} onChange={(e) => patch(sticker, { fade: { ...config.fade, fadeInSec: Number(e.target.value) } })}/><span>{config.fade.fadeInSec.toFixed(1)} dtk</span></label>
              <label className="mrp-sticker-slider">Fade Out<input type="range" min="0" max="30" step="0.1" value={config.fade.fadeOutSec} onChange={(e) => patch(sticker, { fade: { ...config.fade, fadeOutSec: Number(e.target.value) } })}/><span>{config.fade.fadeOutSec.toFixed(1)} dtk</span></label>
              <div className="mrp-sticker-source-duration" aria-live="polite">{sticker.type === 'image' ? 'Durasi sumber: gambar statis' : `Durasi sumber: ${config.durationSec.toFixed(2)} detik`}</div>
            </div></section>
            <section className="mrp-sticker-control-group"><h4>Jadwal Tampil</h4><div className="mrp-sticker-control-grid">
              <label className="mrp-sticker-control-grid__wide">Mode jadwal<select className="mrp-dark-select" value={config.schedule.mode} onChange={(e) => { const nextMode = e.target.value as StickerScheduleMode; patch(sticker, { schedule: { ...config.schedule, mode: nextMode, iterativeCount: nextMode === 'iterative' ? (config.schedule.iterativeCount ?? 3) : config.schedule.iterativeCount, iterativeUnit: nextMode === 'iterative' ? (config.schedule.iterativeUnit ?? 'minutes') : config.schedule.iterativeUnit, timestamps: nextMode === 'timestamp' && !config.schedule.timestamps.length ? ['30'] : config.schedule.timestamps } }); }}><option value="iterative">Berulang</option><option value="timestamp">Timestamp tertentu</option><option value="full-duration">Sepanjang video</option></select></label>
              {config.schedule.mode === 'iterative' && <>
                <label>Unit interval<select className="mrp-dark-select" value={config.schedule.iterativeUnit ?? 'minutes'} onChange={(e) => patch(sticker, { schedule: { ...config.schedule, iterativeUnit: e.target.value as 'seconds' | 'minutes', iterativeCount: e.target.value === 'seconds' ? Math.min(86400, Math.max(1, (config.schedule.iterativeCount ?? 3) * 60)) : Math.min(100, Math.max(1, Math.round((config.schedule.iterativeCount ?? 180) / 60))) } })}><option value="seconds">Detik</option><option value="minutes">Menit</option></select></label>
                <label>Interval ({((config.schedule.iterativeUnit ?? 'minutes') === 'seconds') ? 'detik' : 'menit'})<input type="number" min="1" max={(config.schedule.iterativeUnit ?? 'minutes') === 'seconds' ? 86400 : 100} step="1" value={config.schedule.iterativeCount ?? 3} onChange={(e) => { const iterativeCount = Number(e.target.value); const max = (config.schedule.iterativeUnit ?? 'minutes') === 'seconds' ? 86400 : 100; if (Number.isInteger(iterativeCount) && iterativeCount >= 1 && iterativeCount <= max) patch(sticker, { schedule: { ...config.schedule, iterativeCount } }); }}/></label>
              </>}
              {config.schedule.mode === 'iterative' && <p className="mrp-sticker-help mrp-sticker-control-grid__wide">Kemunculan pertama setelah {config.schedule.iterativeCount ?? 3} {((config.schedule.iterativeUnit ?? 'minutes') === 'seconds') ? 'detik' : 'menit'}; tidak tampil pada 00:00.</p>}
              {config.schedule.mode === 'timestamp' && <StickerScheduleEditor stickerId={sticker.id} value={config.schedule.timestamps[0] ?? '30'} onChange={(seconds) => setTimestamp(sticker, seconds)} />}
            </div></section>
            {mode === 'chroma' && <section className="mrp-sticker-control-group"><h4>Chroma Key</h4><div className="mrp-sticker-control-grid">
              <label>Chroma Key Level<input type="range" min="0" max="1" step="0.01" value={config.chromaKey.similarity} onChange={(e) => patch(sticker, { chromaKey: { ...config.chromaKey, enabled: true, similarity: Number(e.target.value) } })}/><small>{Math.round(config.chromaKey.similarity * 100)}%</small></label>
              <label>Key Blend<input type="range" min="0" max="1" step="0.01" value={config.chromaKey.blend} onChange={(e) => patch(sticker, { chromaKey: { ...config.chromaKey, enabled: true, blend: Number(e.target.value) } })}/><small>{Math.round(config.chromaKey.blend * 100)}%</small></label>
            </div></section>}
            {mode === 'color' && <section className="mrp-sticker-control-group"><h4>Color Key</h4><div className="mrp-sticker-control-grid">
              <label>Color Key Level<input type="range" min="0" max="1" step="0.01" value={config.colorKey.similarity} onChange={(e) => patch(sticker, { colorKey: { ...config.colorKey, enabled: true, similarity: Number(e.target.value) } })}/><small>{Math.round(config.colorKey.similarity * 100)}%</small></label>
              <label>Key Blend<input type="range" min="0" max="1" step="0.01" value={config.colorKey.blend} onChange={(e) => patch(sticker, { colorKey: { ...config.colorKey, enabled: true, blend: Number(e.target.value) } })}/><small>{Math.round(config.colorKey.blend * 100)}%</small></label>
            </div></section>}
          </div>}
        </section>;
      })()}
    </aside>
  </div>;
}
