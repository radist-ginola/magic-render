import type { JSX } from 'react';
import { ChevronIcon } from './LayerActionIcons';
import { useEffect, useMemo, useState } from 'react';
import type { RenderProgress, RenderStatus } from '../../shared/domain/renderTypes';
import type { ApplicationLogEntry } from '../../shared/ipc';

export type ConsoleLogEntry = {
  id: number;
  createdAt: string;
  kind: 'command' | 'activity' | 'progress' | 'error';
  message: string;
  detail?: string | null;
  status: RenderProgress['status'];
};

const descriptions: Record<string, string> = {
  'Bootstrapping Magic Render Pro.': 'Aplikasi sedang disiapkan.',
  'Application bootstrap failed.': 'Aplikasi gagal melakukan persiapan awal.',
  'Electron window initialized before renderer navigation.': 'Jendela aplikasi siap dimuat.',
  'Locked asset persistence initialized.': 'Daftar asset tersimpan berhasil dimuat.',
  'Stale render cache cleanup completed.': 'Cache render lama selesai dibersihkan.',
  'FFmpeg stage started.': 'Perintah tahap render mulai dijalankan.',
  'FFmpeg stage completed.': 'Tahap render selesai.',
  'FFmpeg stage failed.': 'Tahap render gagal. Periksa rincian kesalahan.',
  'Render job failed.': 'Pekerjaan render gagal.',
  'Renderer console error.': 'Terjadi kesalahan pada tampilan aplikasi.',
  'Renderer failed to load.': 'Tampilan aplikasi gagal dimuat.',
  'Renderer process exited unexpectedly.': 'Tampilan aplikasi berhenti tidak terduga.',
  'Media protocol request failed.': 'Media lokal gagal dimuat.',
  'Uncaught exception in Main Process.': 'Terjadi kesalahan aplikasi yang tidak tertangani.',
  'Unhandled promise rejection in Main Process.': 'Proses aplikasi gagal tanpa penanganan.',
  'Unhandled renderer error.': 'Terjadi kesalahan pada tampilan aplikasi.',
  'Unhandled renderer promise rejection.': 'Proses tampilan aplikasi gagal.',
  'Preview video playback failed.': 'Video tidak dapat diputar di preview.',
  'Main image preview failed.': 'Gambar utama tidak dapat dimuat di preview.',
  'Main media element failed to load.': 'Media utama gagal dimuat di preview.',
};

function userMessage(message: string): string {
  if (message.startsWith('FFmpeg command:')) return 'Perintah FFmpeg untuk tahap render telah disiapkan.';
  if (/no such file|enoent|file not found|cannot find/i.test(message)) return 'File atau program yang dibutuhkan tidak ditemukan. Periksa lokasi media dan FFmpeg.';
  if (/permission denied|access denied/i.test(message)) return 'Akses ke file ditolak. Periksa izin folder sumber dan output.';
  if (/unknown encoder|encoder not found/i.test(message)) return 'Encoder video tidak tersedia di FFmpeg yang dipilih.';
  if (/failed to load|fetch failed/i.test(message)) return 'Media atau layanan tidak dapat dimuat.';
  if (/^(?:Error:|TypeError:|RangeError:)|cannot read properties|is not a function|invalid argument/i.test(message)) return 'Terjadi kesalahan internal. Periksa pengaturan dan file yang digunakan.';
  return descriptions[message] ?? message
    .replace(/\[SISTEM\]/g, '[APLIKASI]')
    .replace(/\bRender single-pass\b/g, 'Render satu tahap')
    .replace(/\bStrategy=single-pass\b/g, 'Strategi=satu tahap')
    .replace(/\bStrategy=multi-stage\b/g, 'Strategi=beberapa tahap');
}

function userDetail(detail: string | null | undefined, level: ApplicationLogEntry['level'] = 'ERROR', sourceMessage = ''): string | null {
  if (!detail) return null;
  const stageNames: Record<string, string> = {
    'main-media-preparation': 'persiapan media utama', 'visual-layer-composition': 'komposisi lapisan visual',
    'content-flow': 'penyusunan urutan video', 'audio-management': 'pengolahan audio/playlist',
    output: 'encoding dan penyimpanan MP4', 'metadata-output': 'pembuatan file metadata',
  };
  const codeNames: Record<string, string> = {
    INPUT_FILE_MISSING: 'File sumber tidak ditemukan', PERMISSION_DENIED: 'Akses file ditolak', DISK_FULL: 'Ruang disk tidak cukup',
    UNKNOWN_ENCODER: 'Encoder FFmpeg tidak tersedia', INVALID_FILTER: 'Parameter filter visual tidak valid',
    OUTPUT_WRITE_FAILED: 'Gagal menulis MP4', FFMPEG_UNKNOWN_ERROR: 'Kesalahan FFmpeg belum terklasifikasi',
    MOOV_ATOM_NOT_FOUND: 'Struktur file video tidak lengkap',
  };
  try {
    const value = JSON.parse(detail) as Record<string, unknown>;
    const pieces: string[] = [];
    const hasMp4Validation = ['durationSeconds', 'videoCodec', 'pixelFormat', 'audioCodec', 'formatName'].some((key) => value[key] !== undefined);
    if (hasMp4Validation) {
      const duration = typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) ? `${value.durationSeconds.toFixed(2)} detik` : null;
      const video = typeof value.videoCodec === 'string' ? value.videoCodec : null;
      const pixel = typeof value.pixelFormat === 'string' ? value.pixelFormat : null;
      const audio = typeof value.audioCodec === 'string' && value.audioCodec ? value.audioCodec : 'tidak ada';
      const format = typeof value.formatName === 'string' ? value.formatName : null;
      const values = [duration ? `durasi ${duration}` : null, video ? `video ${video}` : null, pixel ? `piksel ${pixel}` : null, `audio ${audio}`, format ? `container ${format}` : null].filter(Boolean);
      if (values.length) pieces.push(`${/lulus|validasi.*mp4/i.test(sourceMessage) ? 'Validasi MP4 final lulus' : 'Informasi hasil MP4'}: ${values.join('; ')}.`);
    }
    if (typeof value.stage === 'string') {
      const stageText = stageNames[value.stage] ?? value.stage.replaceAll('-', ' ');
      const stageLead = /selesai|completed|berhasil|lulus|validasi.*lulus/i.test(sourceMessage) ? 'Tahap selesai' : level === 'ERROR' || level === 'WARN' ? 'Tahap bermasalah' : 'Tahap terkait';
      pieces.push(`${stageLead}: ${stageText}.`);
    }
    if (typeof value.code === 'string' || typeof value.code === 'number') pieces.push(`Kode: ${codeNames[String(value.code)] ?? String(value.code)}.`);
    for (const key of ['message', 'errorDescription', 'reason', 'error', 'description']) {
      if (typeof value[key] === 'string' && String(value[key]).trim()) { pieces.push(userMessage(String(value[key]).trim())); break; }
    }
    const exitCode = typeof value.exitCode === 'number' ? value.exitCode : null;
    if (exitCode !== null) pieces.push(`FFmpeg berhenti dengan kode ${exitCode}.`);
    if (typeof value.jobs === 'number' && pieces.length === 0) pieces.push(`${value.jobs} pekerjaan sementara diproses.`);
    if (pieces.length) return [...new Set(pieces)].join(' ');
    const keys = Object.keys(value).filter((key) => !['command', 'args', 'env', 'input'].includes(key));
    return keys.length ? `Detail tambahan (${keys.join(', ')}) tersedia pada entri log FFmpeg terkait.` : 'Log ini belum memiliki rincian. Periksa entri FFmpeg tepat sebelum error untuk menemukan tahap dan file sumber yang bermasalah.';
  } catch { return userMessage(detail); }
}

export function appendConsoleEntry(entries: ConsoleLogEntry[], progress: RenderProgress): ConsoleLogEntry[] {
  if (entries.some((entry) => entry.status === progress.status && entry.message === userMessage(progress.logLine) && entry.detail === userDetail(progress.errorMessage, 'ERROR', progress.logLine) && entry.kind !== 'command')) return entries;
  const kind = progress.errorMessage ? 'error' : /^(FFmpeg command:|Perintah FFmpeg:)/.test(progress.logLine) ? 'command' : /%|speed|Render (selesai|dijeda|dibatalkan)/i.test(progress.logLine) ? 'progress' : 'activity';
  const entry: ConsoleLogEntry = {
    id: Date.now() + entries.length,
    createdAt: new Date().toISOString(),
    kind,
    message: userMessage(progress.logLine),
    detail: userDetail(progress.errorMessage, 'ERROR', progress.logLine),
    status: progress.status,
  };
  const next = [...entries, entry];
  return next.length > 400 ? next.slice(-400) : next;
}


export function appendApplicationLog(entries: ConsoleLogEntry[], entry: ApplicationLogEntry): ConsoleLogEntry[] {
  if (!entry || typeof entry.message !== 'string' || typeof entry.createdAt !== 'string') return entries;
  if (entries.some((previous) => previous.createdAt === entry.createdAt && previous.message === userMessage(entry.message) && previous.detail === userDetail(entry.detail, entry.level, entry.message))) return entries;
  const kind: ConsoleLogEntry['kind'] = entry.level === 'ERROR' ? 'error' : /\[(RENDER|PROSES)\]/.test(entry.message) ? 'progress' : 'activity';
  const status: RenderStatus = entry.level === 'ERROR' || entry.level === 'WARN' ? 'error' : 'idle';
  const applicationEntry: ConsoleLogEntry = {
    id: Date.now() + entries.length,
    createdAt: entry.createdAt,
    kind,
    message: userMessage(entry.message),
    detail: userDetail(entry.detail, entry.level, entry.message),
    status,
  };
  const next: ConsoleLogEntry[] = [...entries, applicationEntry];
  return next.length > 400 ? next.slice(-400) : next;
}

export function ConsoleLogPanel({ entries, placement = 'inline' }: { entries: ConsoleLogEntry[]; placement?: 'inline' | 'nav' }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | ConsoleLogEntry['kind']>('all');
  const visible = useMemo(() => filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter), [entries, filter]);

  useEffect(() => {
    if (!expanded) return;
    const node = document.getElementById('magic-render-console-log');
    if (node) node.scrollTop = node.scrollHeight;
  }, [visible.length, expanded]);

  useEffect(() => {
    if (!expanded || placement !== 'nav') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded, placement]);

  const entriesView = <div id="magic-render-console-log" className="mrp-console-log__entries">{visible.length === 0 ? <div className="mrp-console-log__empty">Belum ada log render.</div> : visible.map((entry) => <div key={entry.id} className={`mrp-console-log__entry mrp-console-log__entry--${entry.kind}`}><div className="mrp-console-log__meta"><span>{entry.createdAt.slice(11, 19)}</span><span className="uppercase">{{command:'Perintah', activity:'Aktivitas', progress:'Progres', error:'Kesalahan'}[entry.kind]}</span><span>{{idle:'Siap', compressing_video:'Memproses video', assembling_overlay:'Menyusun overlay', composing_text:'Menyusun konten', processing_audio:'Memproses audio', paused:'Dijeda', done:'Selesai', error:'Gagal', cancelled:'Dibatalkan'}[entry.status]}</span></div><div className="mrp-console-log__message">{entry.message}</div>{entry.detail && <div className="mrp-console-log__detail">{entry.detail}</div>}</div>)}</div>;

  if (placement === 'nav') {
    return <section className={`mrp-console-log mrp-console-log--nav${expanded ? ' is-expanded' : ''}`}>
      <button type="button" className="mrp-console-log__toggle" aria-label={expanded ? 'Tutup log console' : 'Buka log console'} title={expanded ? 'Tutup Console Log' : `Buka Console Log (${entries.length} entri)`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4z"/><path d="m7 9 3 3-3 3M12.5 15H17"/></svg>
        {entries.length > 0 && <span className="mrp-console-log__badge">{entries.length > 99 ? '99+' : entries.length}</span>}
      </button>
      {expanded && <div className="mrp-console-log__popover" role="dialog" aria-label="Console Log">
        <header className="mrp-console-log__header">
          <div className="mrp-console-log__heading"><strong>Console Log</strong><span>Aktivitas, command FFmpeg, progress, dan error terjemahan</span></div>
          <div className="mrp-console-log__tools"><select aria-label="Filter log console" className="mrp-console-log__filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">Semua</option><option value="command">Perintah</option><option value="activity">Aktivitas</option><option value="progress">Progres</option><option value="error">Kesalahan</option></select><button type="button" className="mrp-console-log__toggle mrp-console-log__popover-close" aria-label="Tutup log console" title="Tutup Console Log" onClick={() => setExpanded(false)}>×</button></div>
        </header>
        {entriesView}
      </div>}
    </section>;
  }

  return <section className="mrp-console-log">
    <header className="mrp-console-log__header">
      <div className="mrp-console-log__heading"><strong>Console Log</strong><span>Aktivitas, command FFmpeg, progress, dan error terjemahan</span></div>
      <div className="mrp-console-log__tools"><select aria-label="Filter log console" className="mrp-console-log__filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">Semua</option><option value="command">Perintah</option><option value="activity">Aktivitas</option><option value="progress">Progres</option><option value="error">Kesalahan</option></select><button type="button" className="mrp-console-log__toggle" aria-label={expanded ? 'Tutup log console' : 'Buka log console'} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronIcon expanded={expanded} /></button></div>
    </header>
    {expanded && entriesView}
  </section>;
}
