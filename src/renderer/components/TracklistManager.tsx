import { useEffect, useMemo, useState, type JSX } from 'react';
import type { TracklistFolder } from '../../shared/domain/bulkTypes';

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) || filePath;
}

type Props = {
  onMessage: (message: string) => void;
  onOpenBulkRender: (folderId?: string) => void;
};

export function TracklistManager({ onMessage, onOpenBulkRender }: Props): JSX.Element {
  const [folders, setFolders] = useState<TracklistFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshFolders(): Promise<void> {
    setRefreshing(true);
    try {
      const next = await window.magicRender.listTracklists();
      setFolders(next);
      setSelectedFolderId((current) => next.some((folder) => folder.id === current) ? current : next[0]?.id ?? '');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void refreshFolders(); }, []);

  async function add(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const added = await window.magicRender.addTracklist();
      if (added) {
        const next = await window.magicRender.listTracklists();
        setFolders(next);
        setSelectedFolderId(added.id);
        setSearch('');
        onMessage(`Tracklist ${added.name} berisi ${added.mp3Paths.length} MP3.`);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await window.magicRender.removeTracklist(id);
      setFolders((previous) => previous.filter((folder) => folder.id !== id));
      setSelectedFolderId((current) => current === id ? '' : current);
      onMessage('Folder tracklist dihapus dari daftar. File MP3 sumber tidak dihapus.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0] ?? null;
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (selectedFolder?.mp3Paths ?? []).filter((file) => !query || fileName(file).toLocaleLowerCase().includes(query));
  }, [selectedFolder, search]);
  const totalTracks = folders.reduce((sum, folder) => sum + folder.mp3Paths.length, 0);

  async function copyFolderPath(): Promise<void> {
    if (!selectedFolder) return;
    try {
      await navigator.clipboard.writeText(selectedFolder.path);
      onMessage('Lokasi folder tracklist disalin.');
    } catch {
      onMessage(`Lokasi folder: ${selectedFolder.path}`);
    }
  }

  return (
    <article className="mrp-tracklist-manager">
      <header className="mrp-tracklist-manager__header">
        <div>
          <span className="mrp-kicker">AUDIO LIBRARY</span>
          <h2>Tracklist Manager</h2>
          <p>Kelola folder MP3 yang dapat dipakai untuk pemilihan lagu acak di Bulk Render.</p>
        </div>
        <div className="mrp-tracklist-manager__header-actions">
          <button type="button" className="mrp-btn" disabled={refreshing || busy} onClick={() => void refreshFolders()}>{refreshing ? 'Memuat…' : '↻ Refresh'}</button>
          <button type="button" className="mrp-btn mrp-btn--primary" disabled={busy} onClick={() => void add()}>{busy ? 'Memproses…' : '＋ Tambah Folder'}</button>
          <button type="button" className="mrp-btn mrp-btn--outline" onClick={() => onOpenBulkRender(selectedFolder?.id)}>Buka Bulk Render <span aria-hidden="true">→</span></button>
        </div>
      </header>

      <div className="mrp-tracklist-stats" aria-label="Ringkasan tracklist">
        <div><span className="mrp-tracklist-stat-icon" aria-hidden="true">▰</span><span><small>Folder</small><strong>{folders.length}</strong></span></div>
        <div><span className="mrp-tracklist-stat-icon" aria-hidden="true">♫</span><span><small>Total MP3</small><strong>{totalTracks}</strong></span></div>
        <div><span className="mrp-tracklist-stat-icon" aria-hidden="true">↗</span><span><small>Status</small><strong>{folders.some((folder) => folder.mp3Paths.length > 0) ? 'Siap digunakan' : 'Belum ada lagu'}</strong></span></div>
      </div>

      <div className="mrp-tracklist-workspace">
        <aside className="mrp-tracklist-folder-pane">
          <div className="mrp-tracklist-pane-heading"><div><span className="mrp-kicker">KOLEKSI</span><h3>Folder Tracklist</h3></div><span className="mrp-status-pill">{folders.length}</span></div>
          {folders.length === 0 ? (
            <div className="mrp-tracklist-empty"><span aria-hidden="true">♫</span><strong>Belum ada folder</strong><p>Tambahkan folder berisi file MP3 untuk menyiapkan pilihan lagu.</p><button type="button" className="mrp-btn mrp-btn--primary" disabled={busy} onClick={() => void add()}>＋ Tambah Folder</button></div>
          ) : <div className="mrp-tracklist-folder-list">{folders.map((folder) => (
            <div key={folder.id} className={`mrp-tracklist-folder${selectedFolder?.id === folder.id ? ' is-selected' : ''}`}>
              <button type="button" className="mrp-tracklist-folder__select" aria-pressed={selectedFolder?.id === folder.id} onClick={() => { setSelectedFolderId(folder.id); setSearch(''); }}>
                <span className="mrp-tracklist-folder__icon" aria-hidden="true">▰</span>
                <span className="mrp-tracklist-folder__copy"><strong title={folder.name}>{folder.name}</strong><small>{folder.mp3Paths.length} MP3</small></span>
              </button>
              <button type="button" className="mrp-tracklist-folder__remove" aria-label={`Hapus tracklist ${folder.name}`} title="Hapus folder dari daftar" onClick={() => void remove(folder.id)}>×</button>
            </div>
          ))}</div>}
          <p className="mrp-tracklist-footnote">Menghapus tracklist hanya melepasnya dari daftar. File audio sumber tetap utuh.</p>
        </aside>

        <section className="mrp-tracklist-songs-pane" aria-label="Lagu di folder terpilih">
          <div className="mrp-tracklist-pane-heading"><div><span className="mrp-kicker">DAFTAR AUDIO</span><h3>{selectedFolder ? `Lagu di folder (${selectedFolder.mp3Paths.length})` : 'Lagu di folder'}</h3></div></div>
          <label className="mrp-tracklist-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} disabled={!selectedFolder} placeholder="Cari lagu…" aria-label="Cari lagu pada folder terpilih"/><button type="button" disabled={!search} aria-label="Hapus pencarian lagu" onClick={() => setSearch('')}>×</button></label>
          {!selectedFolder ? <div className="mrp-tracklist-empty mrp-tracklist-empty--compact"><strong>Pilih atau tambahkan folder</strong><p>Daftar lagu akan muncul di sini.</p></div> : filteredTracks.length === 0 ? <div className="mrp-tracklist-empty mrp-tracklist-empty--compact"><strong>{search ? 'Lagu tidak ditemukan' : 'Folder belum berisi MP3'}</strong><p>{search ? 'Coba kata pencarian lain.' : 'Pilih folder lain atau periksa isi folder sumber.'}</p></div> : <div className="mrp-tracklist-table-wrap"><table className="mrp-tracklist-table"><thead><tr><th>No.</th><th>Nama File</th><th>Format</th></tr></thead><tbody>{filteredTracks.map((file, index) => (
            <tr key={`${file}-${index}`}><td>{String(index + 1).padStart(2, '0')}</td><td><span className="mrp-tracklist-song-icon" aria-hidden="true">♫</span><span className="mrp-tracklist-file-name" title={fileName(file)}>{fileName(file)}</span></td><td><span className="mrp-tracklist-format">MP3</span></td></tr>
          ))}</tbody></table></div>}
          <div className="mrp-tracklist-list-footer">Menampilkan {filteredTracks.length} dari {selectedFolder?.mp3Paths.length ?? 0} lagu</div>
        </section>

        <aside className="mrp-tracklist-detail-pane" aria-label="Detail folder terpilih">
          <div className="mrp-tracklist-pane-heading"><div><span className="mrp-kicker">DETAIL</span><h3>Detail Folder</h3></div></div>
          {selectedFolder ? <>
            <div className="mrp-tracklist-detail-identity"><span className="mrp-tracklist-detail-icon" aria-hidden="true">▰</span><div><strong title={selectedFolder.name}>{selectedFolder.name}</strong><span>{selectedFolder.mp3Paths.length} MP3</span></div></div>
            <div className="mrp-tracklist-detail-section"><label>Lokasi Folder</label><div className="mrp-tracklist-path"><span title={selectedFolder.path}>{selectedFolder.path}</span><button type="button" title="Salin lokasi folder" aria-label="Salin lokasi folder" onClick={() => void copyFolderPath()}>▢</button></div></div>
            <div className="mrp-tracklist-detail-status"><span className={selectedFolder.mp3Paths.length > 0 ? 'is-ready' : ''} aria-hidden="true"/><div><small>Status</small><strong>{selectedFolder.mp3Paths.length > 0 ? 'Tersedia untuk Bulk Render' : 'Belum ada MP3'}</strong></div></div>
            <div className="mrp-tracklist-detail-note"><span aria-hidden="true">ⓘ</span><p>Pilih folder ini di menu Bulk Render untuk mengambil lagu secara acak. Jumlah lagu yang digunakan diatur dari sana.</p></div>
            <dl className="mrp-tracklist-detail-metrics"><div><dt>Jumlah lagu</dt><dd>{selectedFolder.mp3Paths.length}</dd></div><div><dt>Ditampilkan</dt><dd>{filteredTracks.length}</dd></div></dl>
            <button type="button" className="mrp-btn mrp-btn--primary mrp-tracklist-detail-action" onClick={() => onOpenBulkRender(selectedFolder.id)}>Gunakan di Bulk Render <span aria-hidden="true">→</span></button>
          </> : <div className="mrp-tracklist-empty mrp-tracklist-empty--compact"><p>Pilih folder untuk melihat detailnya.</p></div>}
        </aside>
      </div>
    </article>
  );
}
