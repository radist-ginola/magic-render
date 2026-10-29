import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TracklistFolder } from '../../../shared/domain/bulkTypes';
import { getElectronStore } from '../persistentStore/electronStoreAdapter';

type StoredFolder = { id: string; name: string; path: string; sourcePath?: string };
const key = 'tracklistFolders';

async function scanMp3(folder: string): Promise<string[]> {
  const root = path.resolve(folder);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Folder tracklist tidak ditemukan.');
  const files: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && depth < 2) await walk(path.join(dir, entry.name), depth + 1);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.mp3') files.push(path.join(dir, entry.name));
      if (files.length > 1000) throw new Error('Folder tracklist melebihi batas 1000 MP3.');
    }
  }
  await walk(root, 0);
  return files.sort((a,b)=>a.localeCompare(b));
}

export async function listTracklists(): Promise<TracklistFolder[]> {
  const store = await getElectronStore();
  const saved = store.get<StoredFolder[]>(key);
  const folders = Array.isArray(saved) ? saved.filter((f) => typeof f?.id === 'string' && typeof f.name === 'string' && typeof f.path === 'string') : [];
  return Promise.all(folders.map(async (folder) => ({ ...folder, mp3Paths: await scanMp3(folder.path).catch(() => []) })));
}

export async function addTracklist(folderPath: string, assetDir?: string): Promise<TracklistFolder> {
  const absolute = path.resolve(folderPath);
  const mp3Paths = await scanMp3(absolute);
  if (!mp3Paths.length) throw new Error('Folder tidak memiliki MP3. Pilih folder tracklist lain.');
  const store = await getElectronStore();
  const current = (await listTracklists()).map(({ id, name, path: filePath, sourcePath }) => ({ id, name, path: filePath, sourcePath }));
  const existing = current.find((entry) => entry.path.toLowerCase() === absolute.toLowerCase() || entry.sourcePath?.toLowerCase() === absolute.toLowerCase());
  if (existing) return { ...existing, mp3Paths: await scanMp3(existing.path) };
  const id = randomUUID();
  const libraryRoot = assetDir ? path.resolve(assetDir, 'tracklists') : null;
  const needsCopy = libraryRoot && absolute !== libraryRoot && !absolute.startsWith(`${libraryRoot}${path.sep}`);
  const storedPath = needsCopy ? path.join(libraryRoot, id) : absolute;
  if (needsCopy) {
    try {
      for (const source of mp3Paths) {
        const destination = path.join(storedPath, path.relative(absolute, source));
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(source, destination);
      }
    } catch (error) { await fs.rm(storedPath, { recursive: true, force: true }); throw error; }
  }
  const entry = { id, name: path.basename(absolute), path: storedPath, ...(needsCopy ? { sourcePath: absolute } : {}) };
  try { store.set(key, [...current, entry]); }
  catch (error) { if (needsCopy) await fs.rm(storedPath, { recursive: true, force: true }); throw error; }
  return { ...entry, mp3Paths: needsCopy ? await scanMp3(storedPath) : mp3Paths };
}

export async function removeTracklist(id: string): Promise<void> {
  const store = await getElectronStore();
  const current = (await listTracklists()).map(({ id: entryId, name, path, sourcePath }) => ({ id: entryId, name, path, sourcePath }));
  if (!current.some((entry) => entry.id === id)) throw new Error('Tracklist tidak ditemukan.');
  store.set(key, current.filter((entry) => entry.id !== id));
}

/** Random draw without exceeding two occurrences of any MP3 in one output. */
export function pickTracks(paths: string[], count: number, random = Math.random): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 100 || count > paths.length * 2) throw new Error(`Jumlah MP3 harus 1–${Math.min(100,paths.length * 2)}; setiap lagu paling banyak dua kali per video.`);
  const remaining = paths.flatMap((file) => [file,file]);
  const chosen: string[] = [];
  for (let i=0;i<count;i++) { const index = Math.floor(Math.min(0.999999,Math.max(0,random())) * remaining.length); chosen.push(remaining.splice(index,1)[0]!); }
  return chosen;
}
