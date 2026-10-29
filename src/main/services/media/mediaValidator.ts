import path from 'node:path';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm']);
export function detectMainMediaType(filePath: string): 'image' | 'video' {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  throw new Error(`Format media utama tidak didukung: ${ext || 'tanpa ekstensi'}.`);
}
export function validateMediaPath(filePath: string, expected?: 'image' | 'video'): void {
  const actual = detectMainMediaType(filePath);
  if (expected && actual !== expected) throw new Error(`Tipe media tidak sesuai: expected ${expected}, got ${actual}.`);
}
