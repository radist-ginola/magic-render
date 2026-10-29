import { useEffect, useMemo, useState, type JSX } from 'react';
import type { BulkItemResult, BulkMediaItem, BulkRenderOptions, TracklistFolder } from '../../shared/domain/bulkTypes';

const clock = (time: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(time) ? time : 0));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
};
const fileUrl = (filePath: string) => `mrp-media://local?path=${encodeURIComponent(filePath)}`;
type Props = {
  media: BulkMediaItem[];
  setMedia: (value: BulkMediaItem[]) => void;
  options: BulkRenderOptions;
  setOptions: (value: BulkRenderOptions) => void;
  tracklistId: string;
  setTracklistId: (value: string) => void;
  mp3Count: number;
  setMp3Count: (value: number) => void;
  busy: boolean;
  results: BulkItemResult[];
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
  onResetResult: (id: string) => void;
  onCloseResult: (id: string) => void;
  onMessage: (message: string) => void;
};

export function BulkRenderPage({ media, setMedia, options, setOptions, tracklistId, setTracklistId, mp3Count, setMp3Count, busy, results, onStart, onCancel, onResetResult, onCloseResult, onMessage }: Props): JSX.Element {
  const [folders, setFolders] = useState<TracklistFolder[]>([]);
  useEffect(() => { void window.magicRender.listTracklists().then(setFolders).catch((error) => onMessage(error instanceof Error ? error.message : String(error))); }, []);

  async function upload(type: 'image' | 'video'): Promise<void> {
    try {
      if (media.length && media[0]?.type !== type) {
        onMessage('Gambar dan video tidak boleh dicampur dalam satu antrean. Hapus media sebelumnya dahulu.');
        return;
      }
      const selected = await window.magicRender.chooseBulkMedia(type);
      const paths = new Set(media.map((item) => item.path.toLowerCase()));
      const additions = selected.filter((item) => !paths.has(item.path.toLowerCase()));
      if (media.length + additions.length > 100) throw new Error('Maksimal 100 media per antrean.');
      setMedia([...media, ...additions]);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const folder = folders.find((entry) => entry.id === tracklistId);
  const toggle = (name: keyof Pick<BulkRenderOptions, 'overlay' | 'intro' | 'fadeIn' | 'fadeOut' | 'sticker'>, label: string) => (
    <label className="mrp-bulk-switch" key={name}>
      <input type="checkbox" checked={options[name]} disabled={busy} onChange={(event) => setOptions({ ...options, [name]: event.target.checked })} />
      <span>{label}</span>
    </label>
  );
  const seconds = (name: 'fadeInSec' | 'fadeOutSec', label: string) => (
    <label className="mrp-bulk-range" key={name}>{label}: <b>{options[name].toFixed(1)} detik</b><input type="range" min="0" max="15" step="0.1" disabled={busy} value={options[name]} onChange={(event) => setOptions({ ...options, [name]: Number(event.target.value) })} /></label>
  );
  const bokehControls = options.fadeIn && <div className="mrp-bulk-bokeh">
    <label>Gaya fade awal<select disabled={busy} value={options.fadeInStyle ?? 'dark'} onChange={(event) => setOptions({ ...options, fadeInStyle: event.target.value as 'dark' | 'blur' })}><option value="dark">Fade gelap</option><option value="blur">Fade blur (bokeh)</option></select></label>
    {options.fadeInStyle === 'blur' && <>
      <label>Defokus: {options.fadeInBlur ?? 12}<input type="range" min="0" max="30" step="1" disabled={busy} value={options.fadeInBlur ?? 12} onChange={(event) => setOptions({ ...options, fadeInBlur: Number(event.target.value) })} /></label>
      <label>Kecerahan awal: {Math.round((options.fadeInBrightness ?? -0.25) * 100)}%<input type="range" min="-0.7" max="0.7" step="0.01" disabled={busy} value={options.fadeInBrightness ?? -0.25} onChange={(event) => setOptions({ ...options, fadeInBrightness: Number(event.target.value) })} /></label>
    </>}
  </div>;

  const schedule = options.stickerSchedule ?? { mode: 'full-duration' as const, iterativeCount: null, iterativeUnit: 'minutes' as const, timestamps: [] };
  const setScheduleTime = (index: number, total: number) => {
    const timestamps = [...schedule.timestamps];
    timestamps[index] = String(Math.max(1, Math.floor(total)));
    setOptions({ ...options, stickerSchedule: { ...schedule, timestamps } });
  };
  const stickerControls = options.sticker && <div className="mrp-bulk-bokeh mrp-bulk-detail">
    <label>Schedule sticker<select disabled={busy} value={schedule.mode} onChange={(event) => {
      const mode = event.target.value as typeof schedule.mode;
      setOptions({ ...options, stickerSchedule: { mode, iterativeCount: mode === 'iterative' ? (schedule.iterativeCount ?? 3) : null, iterativeUnit: mode === 'iterative' ? (schedule.iterativeUnit ?? 'minutes') : schedule.iterativeUnit, timestamps: mode === 'timestamp' ? (schedule.timestamps.length ? schedule.timestamps : ['30']) : [] } });
    }}><option value="full-duration">Dari 00:30 sampai akhir</option><option value="iterative">Berulang setelah interval</option><option value="timestamp">Waktu tertentu</option></select></label>
    <label>Durasi sekali tampil<select disabled={busy} value={options.stickerDurationSec == null ? 'auto' : 'manual'} onChange={(event) => setOptions({ ...options, stickerDurationSec: event.target.value === 'auto' ? null : 3 })}><option value="auto">Otomatis sesuai sticker terpilih</option><option value="manual">Atur manual</option></select></label>
    {options.stickerDurationSec != null ? <label>Detik tiap kemunculan<input disabled={busy} type="number" min="0.1" max="3600" step="0.1" value={options.stickerDurationSec} onChange={(event) => { const value = Number(event.target.value); if (value > 0) setOptions({ ...options, stickerDurationSec: value }); }} /></label> : <p className="mrp-bulk-hint">Video/GIF mengikuti durasi sumber sticker yang diacak untuk tiap video. Gambar tampil 3 detik.</p>}
    {schedule.mode === 'iterative' && <><label>Unit interval<select disabled={busy} value={schedule.iterativeUnit ?? 'minutes'} onChange={(event) => setOptions({ ...options, stickerSchedule: { ...schedule, iterativeUnit: event.target.value as 'seconds'|'minutes', iterativeCount: event.target.value === 'seconds' ? Math.min(86400,Math.max(1,(schedule.iterativeCount ?? 3)*60)) : Math.min(100,Math.max(1,Math.round((schedule.iterativeCount ?? 180)/60))) } })}><option value="seconds">Detik</option><option value="minutes">Menit</option></select></label><label>Interval ({(schedule.iterativeUnit ?? 'minutes') === 'seconds' ? 'detik' : 'menit'})<input type="number" min="1" max={(schedule.iterativeUnit ?? 'minutes') === 'seconds' ? 86400 : 100} step="1" disabled={busy} value={schedule.iterativeCount ?? 3} onChange={(event) => setOptions({ ...options, stickerSchedule: { ...schedule, iterativeCount: Number(event.target.value) } })} /></label><p className="mrp-bulk-hint">Kemunculan pertama setelah interval; sticker tidak muncul pada 00:00.</p></>}
    {schedule.mode === 'timestamp' && <div className="mrp-bulk-schedule-list"><span>Waktu kemunculan</span>{schedule.timestamps.map((stamp, index) => {
      const total = Number(stamp) || 0;
      return <div className="mrp-bulk-time" key={index}>
        <label>Menit<input type="number" min="0" step="1" disabled={busy} value={Math.floor(total / 60)} onChange={(event) => setScheduleTime(index, Math.max(0, Number(event.target.value)) * 60 + total % 60)} /></label>
        <label>Detik<input type="number" min="0" max="59" step="1" disabled={busy} value={total % 60} onChange={(event) => setScheduleTime(index, Math.floor(total / 60) * 60 + Math.max(0, Math.min(59, Number(event.target.value))))} /></label>
        <button type="button" className="mrp-btn" disabled={busy || schedule.timestamps.length === 1} aria-label={`Hapus waktu ${index + 1}`} onClick={() => setOptions({ ...options, stickerSchedule: { ...schedule, timestamps: schedule.timestamps.filter((_, i) => i !== index) } })}>×</button>
      </div>;
    })}<button type="button" className="mrp-btn" disabled={busy || schedule.timestamps.length >= 100} onClick={() => setOptions({ ...options, stickerSchedule: { ...schedule, timestamps: [...schedule.timestamps, String((Number(schedule.timestamps.at(-1)) || 0) + 60)] } })}>＋ Tambah waktu</button></div>}
  </div>;

  const doneCount = results.filter((item) => item.status === 'done').length;
  const errorCount = results.filter((item) => item.status === 'error').length;
  const activeCount = results.filter((item) => item.status === 'rendering').length;
  const queueProgress = results.length ? Math.round(results.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.percent)), 0) / results.length) : 0;
  const queueSummary = useMemo(() => {
    if (!results.length) return 'Antrean belum dijalankan';
    if (busy) return activeCount ? 'Render sedang berjalan' : 'Mempersiapkan antrean';
    if (doneCount === results.length) return 'Semua media selesai dirender';
    if (errorCount) return `${errorCount} media perlu diperiksa`;
    return 'Antrean siap dilanjutkan';
  }, [results.length, busy, activeCount, doneCount, errorCount]);

  return (
    <section className="mrp-simple-page mrp-bulk-page">
      <header className="mrp-bulk-hero">
        <div><span className="mrp-kicker">RENDER WORKFLOW / BATCH</span><h1>Bulk Render</h1><p>Satu gambar atau video utama menghasilkan satu MP4. Lagu dan asset opsional dipilih acak untuk tiap media.</p></div>
        <div className="mrp-bulk-hero-badges"><span className="mrp-bulk-live-badge"><i /> {busy ? 'ANTREAN BERJALAN' : 'BATCH WORKSPACE'}</span><span className="mrp-bulk-count-badge">{media.length} / 100 media</span></div>
      </header>

      <div className="mrp-bulk-layout">
        <div className="mrp-bulk-left-column">
          <article className="mrp-section-card mrp-bulk-media-card">
            <div className="mrp-card-title-row">
              <div><span className="mrp-kicker">01 · INPUT MEDIA</span><h3>Media Antrean <span className="mrp-bulk-title-count">{media.length}</span></h3></div>
              <span className="mrp-bulk-kind-pill">{media[0]?.type === 'video' ? 'Video' : media[0]?.type === 'image' ? 'Gambar' : 'Belum dipilih'}</span>
            </div>
            <div className="mrp-bulk-media-toolbar"><div className="mrp-bulk-upload-actions"><button type="button" className={`mrp-btn${media[0]?.type !== 'video' ? ' mrp-btn--primary' : ''}`} disabled={busy} onClick={() => void upload('image')}>▧ ＋ Gambar</button><button type="button" className={`mrp-btn${media[0]?.type === 'video' ? ' mrp-btn--primary' : ''}`} disabled={busy} onClick={() => void upload('video')}>▷ ＋ Video</button></div><button type="button" className="mrp-btn mrp-btn--danger" disabled={busy || !media.length} onClick={() => setMedia([])}>Hapus Semua</button></div>
            <p className="mrp-bulk-hint">Satu antrean hanya boleh berisi gambar atau video, maksimal 100 file. File duplikat tidak ditambahkan.</p>
            {media.length ? <div className="mrp-bulk-media-grid">{media.map((item, index) => (
              <article className="mrp-bulk-media" key={item.id}>
                <div className="mrp-bulk-media__thumb">{item.type === 'image' ? <img src={fileUrl(item.path)} alt="" loading="lazy"/> : <video src={fileUrl(item.path)} muted preload="metadata"/>}<span className="mrp-bulk-media__number">{String(index + 1).padStart(2, '0')}</span></div>
                <span title={item.path.split(/[\\/]/).at(-1)}>{item.path.split(/[\\/]/).at(-1)} <small>ID {item.id.slice(0, 8)}</small></span>
                <button type="button" aria-label={`Hapus media ${index + 1}`} title="Hapus media" disabled={busy} onClick={() => setMedia(media.filter((entry) => entry.id !== item.id))}>×</button>
              </article>
            ))}</div> : <div className="mrp-bulk-empty"><span aria-hidden="true">▧</span><strong>Belum ada media dalam antrean</strong><p>Tambahkan gambar atau video. Setiap file akan menjadi satu output MP4.</p><div><button type="button" className="mrp-btn mrp-btn--primary" disabled={busy} onClick={() => void upload('image')}>＋ Pilih Gambar</button><button type="button" className="mrp-btn" disabled={busy} onClick={() => void upload('video')}>＋ Pilih Video</button></div></div>}
          </article>

          <article className="mrp-section-card mrp-bulk-results-card">
            <div className="mrp-card-title-row"><div><span className="mrp-kicker">03 · OUTPUT PER MEDIA</span><h3>Antrean Render</h3></div><span className="mrp-status-pill">{doneCount}/{results.length} selesai</span></div>
            {results.length ? <div className="mrp-bulk-results">{results.map((item) => (
              <div key={item.id} className={`mrp-bulk-result mrp-bulk-result--${item.status}`}>
                <div className="mrp-bulk-result__main"><div className="mrp-bulk-result__identity"><span className={`mrp-bulk-result__status mrp-bulk-result__status--${item.status}`} aria-hidden="true">{item.status === 'done' ? '✓' : item.status === 'rendering' ? '◌' : item.status === 'error' ? '!' : item.status === 'cancelled' ? 'Ⅱ' : '·'}</span><div><strong>{item.name}</strong><span>{item.status} · {clock(item.currentTimeSec ?? 0)} / {item.totalDurationSec ? clock(item.totalDurationSec) : '—'} · {item.percent.toFixed(1)}% · {item.speedMultiplier ? `${item.speedMultiplier.toFixed(2)}×` : '—'}{item.error ? ` · ${item.error}` : ''}</span></div></div><div className="mrp-progress" role="progressbar" aria-label={`Progres ${item.name}`} aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${item.percent}%` }} /></div>
                  {item.outputPath && <small className="mrp-bulk-result__path">{item.outputPath}</small>}{(item.metadataPath || item.timestampPath) && <small className="mrp-bulk-result__path">Metadata: {item.metadataPath || item.timestampPath}</small>}
                </div>
                <div className="mrp-bulk-result__actions">{item.status === 'done' && item.outputPath && <><button type="button" className="mrp-btn" onClick={() => void window.magicRender.openProjectFolder(item.outputPath!.replace(/[\\/][^\\/]+$/, '')).catch((error) => onMessage(error instanceof Error ? error.message : String(error)))}>Buka Folder</button><button type="button" className="mrp-btn" onClick={() => void window.magicRender.openOutputVideo(item.outputPath!).catch((error) => onMessage(error instanceof Error ? error.message : String(error)))}>▶ Buka Video</button></>}<button type="button" className="mrp-btn" title="Reset status agar siap render ulang; file hasil tetap tersimpan" onClick={() => onResetResult(item.id)}>↺ Reset</button><button type="button" className="mrp-btn mrp-btn--danger" title="Tutup tugas dari daftar" aria-label={`Tutup hasil ${item.name}`} onClick={() => onCloseResult(item.id)}>×</button></div>
              </div>
            ))}</div> : <div className="mrp-bulk-empty mrp-bulk-empty--short"><span aria-hidden="true">▤</span><strong>Belum ada hasil antrean</strong><p>Hasil dan progress akan muncul setelah proses Bulk Render dimulai.</p></div>}
          </article>
        </div>

        <aside className="mrp-section-card mrp-bulk-settings-card">
          <div className="mrp-card-title-row"><div><span className="mrp-kicker">02 · AUDIO & ASSET</span><h3>Pengaturan Antrean</h3></div><span className="mrp-bulk-settings-icon" aria-hidden="true">☷</span></div>
          <div className="mrp-bulk-fields">
            <div className="mrp-bulk-audio"><label>Folder tracklist<select value={tracklistId} disabled={busy} onChange={(event) => setTracklistId(event.target.value)}><option value="">Pilih folder di Asset Library</option>{folders.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.mp3Paths.length} MP3)</option>)}</select></label><label>MP3 per video<input type="number" min="1" max={Math.min(100, (folder?.mp3Paths.length ?? 0) * 2) || 100} step="1" value={mp3Count} disabled={busy} onChange={(event) => setMp3Count(Number(event.target.value))}/></label></div>
            <p className="mrp-bulk-hint">Lagu dipilih acak. Satu lagu maksimal dua kali dalam video yang sama. Folder yang hilang atau tanpa MP3 perlu diperbaiki dari Asset Library.</p>
            <section className="mrp-bulk-group mrp-bulk-metadata"><strong>Output metadata · YouTube SEO</strong><label>File tambahan<select value={options.metadataMode ?? 'timestamp'} disabled={busy} onChange={(event) => setOptions({ ...options, metadataMode: event.target.value as NonNullable<BulkRenderOptions['metadataMode']> })}><option value="timestamp">timestamp.txt</option><option value="timestamp-seo">youtubeseo.txt (AI)</option><option value="none">Tidak Ada</option></select></label><p className="mrp-bulk-hint">Setiap video menghasilkan file metadata unik berdasarkan nama MP4. Opsi AI memakai keyword dan konteks YouTube SEO dari project aktif; untuk membuat SEO, buka project dan isi keyword terlebih dahulu.</p></section>
            <div className="mrp-bulk-switches"><div className="mrp-bulk-group"><strong>Lapisan opsional</strong>{toggle('overlay', 'Overlay acak')}{toggle('intro', 'Intro acak')}{toggle('sticker', 'Sticker subscribe acak')}{stickerControls}</div><div className="mrp-bulk-group"><strong>Transisi video</strong>{toggle('fadeIn', 'Fade in awal video')}{options.fadeIn && seconds('fadeInSec', 'Durasi fade in')}{bokehControls}{toggle('fadeOut', 'Fade out akhir video')}{options.fadeOut && seconds('fadeOutSec', 'Durasi fade out')}</div></div>
            <div className="mrp-bulk-output-note"><span aria-hidden="true">▣</span><div><strong>Output mengikuti Settings</strong><p>Resolusi, encoding dan folder export diambil dari pengaturan aplikasi yang sudah tersimpan.</p><span>Media sumber: {media.length ? (media[0]?.type === 'video' ? 'Video' : 'Gambar') : 'Belum dipilih'} · Maks. 100</span></div></div>
          </div>
        </aside>
      </div>

      <footer className="mrp-bulk-footer">
        <div className="mrp-bulk-footer__progress"><div className="mrp-bulk-footer__heading"><div><span className="mrp-kicker">PROGRES KESELURUHAN</span><strong>{queueSummary}</strong></div><b>{queueProgress}%</b></div><div className="mrp-progress" role="progressbar" aria-label="Progres keseluruhan Bulk Render" aria-valuenow={queueProgress} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${queueProgress}%` }} /></div><small>{results.length ? `${doneCount} dari ${results.length} video selesai${errorCount ? ` · ${errorCount} error` : ''}${activeCount ? ` · ${activeCount} berjalan` : ''}` : `${media.length} media menunggu pengaturan dan siap dimasukkan ke antrean`}</small></div>
        <div className="mrp-bulk-footer__metrics"><div><small>Total media</small><strong>{media.length}</strong></div><div><small>Folder MP3</small><strong>{folder ? `${folder.mp3Paths.length} lagu` : 'Belum dipilih'}</strong></div></div>
        <div className="mrp-bulk-footer__actions"><button type="button" className="mrp-btn mrp-btn--primary" disabled={busy || !media.length || !tracklistId} onClick={() => void onStart()}>{busy ? 'Render berjalan…' : `▶ Mulai Bulk Render${media.length ? ` (${media.length})` : ''}`}</button><button type="button" className="mrp-btn mrp-btn--danger" disabled={!busy} onClick={() => void onCancel()}>■ Batalkan antrean</button></div>
      </footer>
    </section>
  );
}
