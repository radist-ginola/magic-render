import type { JSX, DragEvent as ReactDragEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { PlaylistTrack } from '../../shared/domain/playlistTypes';
import { orderedPlaylistTracks } from '../../shared/domain/playlistOrder';
import { activeIntroMediaPath, getIntroMode } from '../../shared/domain/introTypes';

type Props = { project: ProjectData; onProjectChange: (project: ProjectData) => void };

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fileName(filePath: string): string { return filePath.split(/[\\/]/).pop() || filePath; }

function resolutionLabel(project: ProjectData): string {
  const resolution = project.settings.resolution;
  if (resolution === '720p') return '1280 × 720';
  if (resolution === '2K') return '2560 × 1440';
  if (resolution === '4K') return '3840 × 2160';
  return '1920 × 1080';
}

export function PlaylistPanel({ project, onProjectChange }: Props): JSX.Element {
  const storedTracks = project.playlistTracks?.length ? project.playlistTracks : project.playlist.files.map((filePath, order): PlaylistTrack => ({ path: filePath, durationSeconds: null, order }));
  const tracks = useMemo(() => orderedPlaylistTracks(storedTracks, project.playlist.playbackOrder), [storedTracks, project.playlist.playbackOrder]);
  const totalDuration = tracks.reduce((seconds, track) => seconds + Math.max(0, track.durationSeconds ?? 0), 0);
  const durationComplete = tracks.every((track) => track.durationSeconds !== null && Number.isFinite(track.durationSeconds) && track.durationSeconds >= 0);
  const [message, setMessage] = useState('Siap untuk memuat playlist.');
  const [cleaning, setCleaning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [introDuration, setIntroDuration] = useState(0);

  useEffect(() => {
    let active = true;
    const introMediaPath = activeIntroMediaPath(project);
    if (!introMediaPath) { setIntroDuration(0); return () => { active = false; }; }
    void window.magicRender.probeMainMedia(introMediaPath).then((metadata) => {
      if (active) setIntroDuration(metadata?.durationSeconds && metadata.durationSeconds > 0 ? metadata.durationSeconds : 3);
    }).catch(() => { if (active) setIntroDuration(3); });
    return () => { active = false; };
  }, [project.intro.enabled, project.intro.mode, project.intro.path]);

  const fallbackContentDuration = project.mainMedia?.type === 'video' ? Math.max(0, project.mainMedia.durationSeconds ?? 0) : 0;
  const playlistContentDuration = tracks.length > 0 ? totalDuration : fallbackContentDuration;
  const introMode = getIntroMode(project.intro);
  const totalVideoDuration = playlistContentDuration + (introMode === 'media' ? introDuration : 0);

  async function importTracks(): Promise<void> {
    setBusy(true);
    setMessage('Memuat audio dan membaca durasi melalui FFprobe…');
    try {
      const next = await window.magicRender.importPlaylist(project);
      if (!next) { setMessage('Import dibatalkan. Playlist tidak berubah.'); return; }
      onProjectChange(next);
      setMessage('Playlist berhasil diimpor. Durasi track telah diperiksa.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal import playlist.'); }
    finally { setBusy(false); }
  }

  async function cleanMetadata(): Promise<void> {
    setCleaning(true);
    setMessage('Membuat salinan MP3 tanpa metadata. Audio asli tetap utuh.');
    try {
      onProjectChange(await window.magicRender.resetPlaylistMetadata(project));
      setMessage('Metadata playlist dibersihkan pada salinan MP3 tanpa re-encode audio.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membersihkan metadata MP3.'); }
    finally { setCleaning(false); }
  }

  async function reorder(fromIndex: number, toIndex: number): Promise<void> {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= tracks.length || toIndex >= tracks.length) return;
    setBusy(true);
    try {
      onProjectChange(await window.magicRender.reorderPlaylist(project, fromIndex, toIndex));
      setMessage('Urutan manual disimpan. Shuffle otomatis dinonaktifkan sesuai perilaku playlist.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal mengubah urutan playlist.'); }
    finally { setBusy(false); setDragIndex(null); }
  }

  async function remove(index: number): Promise<void> {
    setBusy(true);
    try {
      onProjectChange(await window.magicRender.removePlaylistTrack(project, index));
      setMessage(`Track ${index + 1} dihapus dari playlist. File audio sumber tidak dihapus.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal menghapus track.'); }
    finally { setBusy(false); }
  }

  async function setShuffle(value: boolean): Promise<void> {
    setBusy(true);
    try {
      onProjectChange(await window.magicRender.setPlaylistShuffle(project, value));
      setMessage(value ? 'Shuffle aktif. Urutan yang tersimpan digunakan oleh preview, render, dan timestamp.' : 'Shuffle nonaktif. Urutan playlist dikembalikan ke urutan dasar yang disimpan.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal mengubah shuffle.'); }
    finally { setBusy(false); }
  }

  function previewTrack(index: number): void {
    const track = tracks[index];
    if (!track) return;
    if (tracks.slice(0, index + 1).some((item) => item.durationSeconds === null || !Number.isFinite(item.durationSeconds))) {
      setMessage('Preview mulai track ini membutuhkan durasi track sebelumnya. Import ulang playlist agar FFprobe membaca durasi.');
      return;
    }
    window.dispatchEvent(new CustomEvent('mrp:playlist-preview-track', { detail: { index } }));
    setMessage(`Memindahkan preview ke track ${String(index + 1).padStart(2, '0')} — ${fileName(track.path)}.`);
  }

  function onDragStart(event: ReactDragEvent<HTMLDivElement>, index: number): void {
    if (busy || cleaning) { event.preventDefault(); return; }
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function onDrop(event: ReactDragEvent<HTMLDivElement>, targetIndex: number): void {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData('text/plain').trim();
    const parsed = rawIndex ? Number(rawIndex) : -1;
    const sourceIndex = dragIndex ?? (Number.isInteger(parsed) ? parsed : -1);
    if (sourceIndex >= 0) void reorder(sourceIndex, targetIndex);
    else setDragIndex(null);
  }

  let elapsed = 0;
  let timestampKnown = true;
  const trackRows = tracks.map((track, index) => {
    const startSeconds = elapsed;
    const startLabel = timestampKnown ? formatDuration(startSeconds) : '—';
    if (track.durationSeconds === null || !Number.isFinite(track.durationSeconds)) timestampKnown = false;
    else elapsed += Math.max(0, track.durationSeconds);
    return { track, index, startLabel, durationLabel: track.durationSeconds == null ? 'Durasi belum diketahui' : formatDuration(track.durationSeconds) };
  });

  return <div className="mrp-playlist-panel">
    <aside className="mrp-playlist-summary mrp-section-card" aria-label="Ringkasan project dan audio">
      <div className="mrp-playlist-summary__header"><span className="mrp-kicker">PLAYLIST & AUDIO</span><h3>{project.name}</h3><p>Kelola urutan musik dan sinkronisasi durasi video.</p></div>
      <div className="mrp-playlist-summary__art" aria-hidden="true"><span>♫</span><div><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
      <div className="mrp-playlist-summary__project"><span>Project aktif</span><strong>{project.name}</strong></div>
      <dl className="mrp-playlist-summary__facts">
        <div><dt>Resolusi</dt><dd>{resolutionLabel(project)}</dd></div>
        <div><dt>Frame rate</dt><dd>{project.settings.fps ?? 30} FPS</dd></div>
        <div><dt>Rasio</dt><dd>16:9</dd></div>
        <div><dt>Durasi playlist</dt><dd>{formatDuration(totalDuration)}{!durationComplete && tracks.length > 0 ? ' *' : ''}</dd></div>
        <div><dt>Audio track</dt><dd>{tracks.length} lagu</dd></div>
        <div><dt>Shuffle</dt><dd><span className={`mrp-playlist-status${project.playlist.shuffle ? ' is-active' : ''}`}>{project.playlist.shuffle ? 'Aktif' : 'Nonaktif'}</span></dd></div>
        <div><dt>Status Intro</dt><dd><span className={`mrp-playlist-status${project.intro.enabled ? ' is-active' : ''}`}>{introMode === 'none' ? 'Tidak Ada' : introMode === 'media' ? 'Media Intro' : 'Opening Fade & Bokeh'}</span></dd></div>
      </dl>
      {project.exportFileName && <div className="mrp-playlist-summary__output"><span>Nama output</span><strong>{project.exportFileName}</strong></div>}
      <div className="mrp-playlist-summary__note"><span aria-hidden="true">ⓘ</span><p>Audio sumber tetap terjaga. Reorder hanya mengubah urutan playback dalam project.</p></div>
    </aside>

    <section className="mrp-playlist-main" aria-label="Track playlist">
      <header className="mrp-playlist-main__header">
        <div><span className="mrp-kicker">AUDIO TIMELINE</span><h3>Playlist & Audio</h3><p>Urutan ini digunakan bersama oleh preview, proses render, dan timestamp SEO.</p></div>
        <span className="mrp-playlist-count">{tracks.length} TRACK{tracks.length === 1 ? '' : 'S'}</span>
      </header>
      <div className="mrp-playlist-toolbar">
        <button type="button" className="mrp-btn mrp-btn--primary" disabled={busy || cleaning} onClick={() => void importTracks()}><span aria-hidden="true">＋</span>{busy ? 'Memproses…' : 'Import MP3'}</button>
        <button type="button" className={`mrp-btn mrp-playlist-shuffle${project.playlist.shuffle ? ' is-active' : ''}`} aria-pressed={project.playlist.shuffle} disabled={busy || cleaning || tracks.length < 2} onClick={() => void setShuffle(!project.playlist.shuffle)}><span aria-hidden="true">⤨</span>{project.playlist.shuffle ? 'Shuffle: ON' : 'Shuffle'}</button>
        <button type="button" className="mrp-btn" disabled={busy || cleaning || tracks.length === 0} onClick={() => void cleanMetadata()}>{cleaning ? 'Membersihkan…' : 'Reset Metadata'}</button>
      </div>
      <div className="mrp-playlist-order-note"><span aria-hidden="true">ⓘ</span><span>Urutan yang terlihat adalah urutan playback aktual. Pindahkan track dengan drag-and-drop atau tombol ↑/↓; perpindahan manual akan menonaktifkan Shuffle.</span></div>
      <div className="mrp-playlist-table" role="table" aria-label="Daftar audio playlist">
        <div className="mrp-playlist-table__head" role="row"><span role="columnheader">Urutan</span><span role="columnheader">Judul</span><span role="columnheader">Durasi</span><span role="columnheader">Mulai</span><span role="columnheader">Aksi</span></div>
        {trackRows.length === 0 ? <div className="mrp-playlist-empty"><span className="mrp-playlist-empty__icon" aria-hidden="true">♫</span><strong>Playlist masih kosong</strong><p>Import file MP3 untuk membangun timeline audio dan menghitung durasi video.</p><button type="button" className="mrp-btn mrp-btn--primary" disabled={busy || cleaning} onClick={() => void importTracks()}>＋ Import MP3</button></div> : trackRows.map(({ track, index, startLabel, durationLabel }) => <div key={`${track.path}-${index}`} className={`mrp-playlist-track${dragIndex === index ? ' is-dragging' : ''}`} role="row" draggable={!busy && !cleaning} onDragStart={(event) => onDragStart(event, index)} onDragEnd={() => setDragIndex(null)} onDragOver={(event) => { if (dragIndex !== null) event.preventDefault(); }} onDrop={(event) => onDrop(event, index)}>
          <div className="mrp-playlist-track__order" role="cell"><span className="mrp-playlist-track__grip" aria-hidden="true">⠿</span><strong>{String(index + 1).padStart(2, '0')}</strong></div>
          <div className="mrp-playlist-track__title" role="cell"><span className="mrp-playlist-track__icon" aria-hidden="true">♫</span><div><strong title={fileName(track.path)}>{fileName(track.path)}</strong><small title={track.path}>{track.path}</small></div></div>
          <span className="mrp-playlist-track__duration" role="cell" title={durationLabel}>{track.durationSeconds == null ? '—' : formatDuration(track.durationSeconds)}</span>
          <span className="mrp-playlist-track__start" role="cell">{startLabel}</span>
          <div className="mrp-playlist-track__actions" role="cell"><button type="button" className="mrp-playlist-icon-btn is-play" aria-label={`Preview track ${index + 1}: ${fileName(track.path)}`} title="Preview mulai track ini" disabled={busy || cleaning} onClick={() => previewTrack(index)}>▶</button><button type="button" className="mrp-playlist-icon-btn" aria-label={`Pindahkan ${fileName(track.path)} ke atas`} title="Pindahkan ke atas" disabled={busy || cleaning || index === 0} onClick={() => void reorder(index, index - 1)}>↑</button><button type="button" className="mrp-playlist-icon-btn" aria-label={`Pindahkan ${fileName(track.path)} ke bawah`} title="Pindahkan ke bawah" disabled={busy || cleaning || index === tracks.length - 1} onClick={() => void reorder(index, index + 1)}>↓</button><button type="button" className="mrp-playlist-icon-btn is-remove" aria-label={`Hapus ${fileName(track.path)} dari playlist`} title="Hapus dari playlist" disabled={busy || cleaning} onClick={() => void remove(index)}>×</button></div>
        </div>)}
      </div>
      {tracks.length > 0 && <div className="mrp-playlist-main__footer"><span>{durationComplete ? 'Semua durasi track tersedia.' : '* Total durasi hanya menjumlahkan track yang durasinya telah diketahui.'}</span><strong>{formatDuration(totalDuration)}</strong></div>}
      <div className="mrp-playlist-message" role="status" aria-live="polite"><span className={`mrp-playlist-message__dot${busy || cleaning ? ' is-busy' : ''}`} />{message}</div>
    </section>

    <aside className="mrp-playlist-duration mrp-section-card" aria-label="Durasi video dan timestamp">
      <header><span className="mrp-kicker">TIMELINE SUMMARY</span><h3>Durasi Video</h3></header>
      <div className="mrp-playlist-duration__primary"><span>Playlist</span><strong>{formatDuration(totalDuration)}</strong></div>
      <div className="mrp-playlist-duration__line"><span>Intro</span><strong>{introMode === 'media' ? (introDuration > 0 ? formatDuration(introDuration) : 'Aktif') : introMode === 'fade' ? 'Fade & Bokeh' : 'Tidak Ada'}</strong></div>
      <div className="mrp-playlist-duration__total"><span>Total video</span><strong>{formatDuration(totalVideoDuration)}</strong></div>
      <div className="mrp-playlist-duration__note"><span aria-hidden="true">ⓘ</span><p>Durasi video mengikuti total playlist. Intro aktif ditambahkan sebelum konten utama.</p></div>
      <div className="mrp-playlist-timestamps"><header><span className="mrp-kicker">TIMESTAMP</span><h4>Urutan Track</h4></header>{trackRows.length === 0 ? <p>Timestamp akan muncul setelah audio ditambahkan.</p> : <ol>{trackRows.map(({ track, index, startLabel }) => <li key={`${track.path}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><strong title={fileName(track.path)}>{fileName(track.path)}</strong><time>{startLabel}</time></li>)}</ol>}</div>
      <div className="mrp-playlist-duration__foot"><span aria-hidden="true">ⓘ</span><p>Urutan dan durasi yang sama digunakan ketika export dan saat membuat timestamp SEO.</p></div>
    </aside>
  </div>;
}
