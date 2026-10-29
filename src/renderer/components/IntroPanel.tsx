import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { IntroLibraryItem } from '../../shared/domain/introTypes';
import { activeIntroBlur, effectiveMainFadeIn, getIntroMode, type IntroMode } from '../../shared/domain/introTypes';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
function introMediaUrl(filePath: string): string { return `mrp-media://local?path=${encodeURIComponent(filePath)}`; }
function formatIntroSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'Ukuran tidak tersedia';
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IntroPanel({ project, onProjectChange }: { project: ProjectData; onProjectChange: (project: ProjectData) => void }): JSX.Element {
  const [library, setLibrary] = useState<IntroLibraryItem[]>([]);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try { setLibrary(await window.magicRender.getIntroLibrary()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat Intro Library.'); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { void refresh(); }, [project.projectId]);

  async function importIntro(): Promise<void> {
    if (importing) return;
    setImporting(true);
    try {
      const result = await window.magicRender.importIntro(project);
      if (result) { onProjectChange(result.project); await refresh(); setMessage('Intro media berhasil diimpor dan diaktifkan.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal import Intro.'); }
    finally { setImporting(false); }
  }
  function selectMode(mode: IntroMode): void {
    const currentMode = getIntroMode(project.intro);
    const nextStyle = mode === 'fade' && currentMode !== 'fade' ? 'blur' : project.intro.fallbackStyle ?? 'blur';
    const currentDuration = project.intro.fallbackFadeInSec;
    const nextDuration = mode === 'fade' && currentMode !== 'fade' && currentDuration <= 0 ? 2 : currentDuration;
    onProjectChange({ ...project, updatedAt: new Date().toISOString(), intro: {
      ...project.intro, mode, enabled: mode !== 'none', fallbackStyle: nextStyle, fallbackFadeInSec: nextDuration,
    } });
    setMessage(mode === 'media'
      ? (project.intro.path ? 'Mode Media Intro aktif. Media terpilih akan ditempatkan di awal timeline.' : 'Mode Media Intro aktif. Pilih asset di Intro Library atau gunakan Upload Intro.')
      : mode === 'fade'
        ? 'Mode Opening Fade & Bokeh aktif. Atur durasi dan gaya opening di panel ini.'
        : 'Mode Tidak Ada aktif. Intro media dan opening fade dinonaktifkan; Fade-In Media Utama tetap terpisah.');
  }
  async function select(assetId: string): Promise<void> {
    try { const result = await window.magicRender.selectIntro(project, assetId); onProjectChange(result.project); setMessage('Intro dipilih dan diaktifkan. Preview mengikuti intro pada timeline.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memilih Intro.'); }
  }
  function patch(values: Partial<ProjectData['intro']>): void {
    onProjectChange({ ...project, intro: { ...project.intro, ...values } });
  }

  const introMode = getIntroMode(project.intro);
  const selectedPath = project.intro.path;
  const mainFadeInSec = project.mainMedia?.fade.fadeInSec ?? 0;
  const fallbackDuration = project.intro.fallbackFadeInSec;
  const fallbackControlValue = Math.max(0, Math.min(30, fallbackDuration));
  const effectiveFadeInSec = effectiveMainFadeIn(project);
  const activeBlur = activeIntroBlur(project);
  const isBokeh = project.intro.fallbackStyle === 'blur';
  const mediaIntroActive = introMode === 'media' && !!selectedPath;
  const mediaIntroMissing = introMode === 'media' && !selectedPath;
  const fallbackIsActive = !!project.mainMedia && introMode === 'fade' && mainFadeInSec <= 0 && effectiveFadeInSec > 0;
  const fallbackIsOverridden = introMode === 'fade' && mainFadeInSec > 0;
  const statusTitle = introMode === 'none'
    ? 'Intro dinonaktifkan'
    : mediaIntroMissing
      ? 'Pilih media intro dari library'
      : mediaIntroActive
        ? 'Video Intro aktif di awal timeline'
        : fallbackIsOverridden
          ? 'Fade-In Media Utama mengambil prioritas'
          : fallbackIsActive
            ? (activeBlur ? 'Opening Fade & Bokeh aktif' : 'Opening Fade gelap aktif')
            : 'Fade pembuka belum aktif';
  const statusDetail = introMode === 'none'
    ? 'Mode Tidak Ada: intro media dan opening fade dinonaktifkan. Fade-In Media Utama tetap menjadi pengaturan terpisah.'
    : mediaIntroMissing
      ? 'Pilih asset dari Intro Library atau gunakan Upload Intro. Render tidak akan menyisipkan intro media sebelum asset dipilih.'
      : !project.mainMedia
        ? 'Pengaturan disimpan pada project; preview dan render membutuhkan media utama.'
        : mediaIntroActive
          ? (mainFadeInSec > 0 ? `Intro diputar lebih dahulu. Fade-In Media Utama ${mainFadeInSec.toFixed(1)} s tetap berlaku pada content sesudah Intro.` : 'Klip intro diputar lebih dahulu. Fade masuk klip dapat diatur melalui kontrol Intro Fade.')
          : fallbackIsOverridden
            ? `Fade-In Media Utama ${mainFadeInSec.toFixed(1)} s menang atas fallback. Setel Fade-In Media Utama ke 0 untuk menggunakan pengaturan fallback ini.`
            : fallbackIsActive
              ? `Preview dan render memakai ${activeBlur ? 'bokeh scene-aware' : 'fade gelap'} selama ${(activeBlur?.duration ?? effectiveFadeInSec).toFixed(1)} s.`
              : 'Setel durasi opening di atas 0 untuk mengaktifkan fade pembuka.';

  return <section className="mrp-intro-panel">
    <header className="mrp-intro-panel__header">
      <div className="mrp-intro-panel__heading-copy"><h3>Intro Library</h3></div>
      <div className="mrp-intro-panel__header-actions">
        <button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void importIntro()} disabled={importing}><span aria-hidden="true">＋</span> {importing ? 'Mengimpor...' : 'Upload Intro'}</button>
        <button type="button" className="mrp-btn" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh Intro Library"><span aria-hidden="true">↻</span> {refreshing ? 'Memuat...' : 'Refresh'}</button>
      </div>
    </header>

    <div className="mrp-intro-panel__columns">
      <section className="mrp-intro-panel__library" aria-label="Intro Library assets">
        <div className="mrp-intro-panel__card-heading"><div><span className="mrp-kicker">01 / LIBRARY</span><h4>Media Intro</h4></div><span className="mrp-intro-panel__count">{library.length} asset</span></div>
        <div className="mrp-intro-mode-picker" role="group" aria-label="Pilihan mode intro">
          <button type="button" className={`mrp-intro-mode-option${introMode === 'media' ? ' is-selected' : ''}`} aria-pressed={introMode === 'media'} onClick={() => selectMode('media')}><span className="mrp-intro-mode-option__icon" aria-hidden="true">▣</span><span><strong>Media Intro</strong><small>Upload / Library</small></span><span className="mrp-intro-mode-option__check" aria-hidden="true">{introMode === 'media' ? '✓' : ''}</span></button>
          <button type="button" className={`mrp-intro-mode-option${introMode === 'fade' ? ' is-selected' : ''}`} aria-pressed={introMode === 'fade'} onClick={() => selectMode('fade')}><span className="mrp-intro-mode-option__icon" aria-hidden="true">✦</span><span><strong>Opening Fade & Bokeh</strong><small>Opening built-in</small></span><span className="mrp-intro-mode-option__check" aria-hidden="true">{introMode === 'fade' ? '✓' : ''}</span></button>
          <button type="button" className={`mrp-intro-mode-option${introMode === 'none' ? ' is-selected' : ''}`} aria-pressed={introMode === 'none'} onClick={() => selectMode('none')}><span className="mrp-intro-mode-option__icon" aria-hidden="true">∅</span><span><strong>Tidak Ada</strong><small>Tanpa intro</small></span><span className="mrp-intro-mode-option__check" aria-hidden="true">{introMode === 'none' ? '✓' : ''}</span></button>
        </div>
        {library.length === 0 ? <div className="mrp-intro-panel__empty"><span aria-hidden="true">▧</span><strong>Intro Library masih kosong</strong><p>Upload Intro atau tambahkan media pada kategori Intro di Asset Library.</p></div> : <div className="mrp-intro-library-grid">{library.map((item) => {
          const selected = selectedPath === item.path;
          const isVideo = VIDEO_EXTENSIONS.has(item.extension.toLowerCase());
          return <button type="button" key={item.assetId} aria-pressed={selected} onClick={() => void select(item.assetId)} disabled={introMode !== 'media'} className={`mrp-intro-library-card${selected ? ' is-selected' : ''}${introMode !== 'media' ? ' is-mode-disabled' : ''}`}>
            <span className="mrp-intro-library-card__thumb">{isVideo ? <video src={introMediaUrl(item.path)} muted playsInline preload="metadata" /> : <img src={introMediaUrl(item.path)} alt="" loading="lazy" />}<span className="mrp-intro-library-card__select-mark" aria-hidden="true">{selected ? '✓' : '▶'}</span></span>
            <span className="mrp-intro-library-card__meta"><strong title={item.name}>{item.name}</strong><small><span>{item.extension.replace(/^\./, '').toUpperCase()}</span><span>{formatIntroSize(item.sizeBytes)}</span></small></span>
          </button>;
        })}</div>}
        {project.intro.path && <div className="mrp-intro-panel__selected-file"><span>{introMode === 'media' ? 'Media aktif terpilih' : 'Media tersimpan untuk dipakai nanti'}</span><strong title={project.intro.path}>{project.intro.path.split(/[\\/]/).pop() ?? project.intro.path}</strong></div>}
      </section>

      <section className="mrp-intro-panel__fade" aria-label="Intro and fade settings">
        <div className="mrp-intro-panel__card-heading"><div><span className="mrp-kicker">02 / OPENING STYLE</span><h4>{mediaIntroActive ? 'Fade Video Intro' : 'Fade-Only Opening'}</h4></div><span className={`mrp-intro-panel__status-dot${fallbackIsActive ? ' is-active' : ''}`} aria-hidden="true" /></div>
        
        <div className="mrp-intro-fade-style-grid">
          <button type="button" className={`mrp-intro-fade-style${!isBokeh ? ' is-selected' : ''}`} aria-pressed={!isBokeh} onClick={() => patch({ fallbackStyle: 'dark' })} disabled={introMode !== 'fade'}>
            <span className="mrp-intro-fade-style__sample mrp-intro-fade-style__sample--dark"><i /></span><strong>Fade gelap</strong><small>Fade dari hitam</small><span className="mrp-intro-fade-style__radio" aria-hidden="true">{!isBokeh ? '●' : '○'}</span>
          </button>
          <button type="button" className={`mrp-intro-fade-style${isBokeh ? ' is-selected' : ''}`} aria-pressed={isBokeh} onClick={() => patch({ fallbackStyle: 'blur' })} disabled={introMode !== 'fade'}>
            <span className="mrp-intro-fade-style__sample mrp-intro-fade-style__sample--bokeh"><i /><i /><i /><i /></span><strong>Fade bokeh</strong><small>Blur mengikuti cahaya</small><span className="mrp-intro-fade-style__radio" aria-hidden="true">{isBokeh ? '●' : '○'}</span>
          </button>
        </div>
        <label className="mrp-intro-range"><span><strong>Durasi fade</strong><output>{fallbackDuration.toFixed(1)} s</output></span><input type="range" min="0" max="30" step="0.1" value={fallbackControlValue} disabled={introMode !== 'fade'} onChange={(event) => patch({ fallbackFadeInSec: Number(event.target.value) })}/></label>
        {isBokeh && <>
          <label className="mrp-intro-range"><span><strong>Blur</strong><output>{project.intro.fallbackBlur ?? 12}</output></span><input type="range" min="0" max="30" step="1" value={project.intro.fallbackBlur ?? 12} disabled={introMode !== 'fade'} onChange={(event) => patch({ fallbackBlur: Number(event.target.value) })}/></label>
          <label className="mrp-intro-range"><span><strong>Kecerahan awal</strong><output>{Math.round((project.intro.fallbackBrightness ?? -0.25) * 100)}%</output></span><input type="range" min="-0.7" max="0.7" step="0.01" value={project.intro.fallbackBrightness ?? -0.25} disabled={introMode !== 'fade'} onChange={(event) => patch({ fallbackBrightness: Number(event.target.value) })}/></label>
        </>}
        {mediaIntroActive && <label className="mrp-intro-range"><span><strong>Fade masuk video intro</strong><output>{(project.intro.fadeInSec ?? 0.6).toFixed(1)} s</output></span><input type="range" min="0" max="10" step="0.1" value={Math.max(0, Math.min(10, project.intro.fadeInSec ?? 0.6))} onChange={(event) => patch({ fadeInSec: Number(event.target.value) })}/></label>}
        <div className={`mrp-intro-fade-status${fallbackIsActive ? ' is-active' : fallbackIsOverridden ? ' is-overridden' : ''}`} role="status" aria-live="polite"><span className="mrp-intro-fade-status__icon" aria-hidden="true">{fallbackIsActive ? '✓' : fallbackIsOverridden ? '↗' : 'ⓘ'}</span><span><strong>{statusTitle}</strong><small>{statusDetail}</small>{project.mainMedia && fallbackIsActive && <small>Fade efektif: {effectiveFadeInSec.toFixed(1)} s</small>}</span></div>
      </section>
    </div>
    {message && <div className="mrp-intro-panel__message" role="status" aria-live="polite">{message}</div>}
  </section>;
}
