import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

export type LocalMediaProtocolRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
};

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif', '.bmp': 'image/bmp', '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
};

/** Serve local project media with correct MIME and byte-range support for Chromium previews. */
export async function serveLocalMediaRequest(request: LocalMediaProtocolRequest): Promise<Response> {
  const url = new URL(request.url);
  const requestedPath = url.searchParams.get('path');
  if (!requestedPath) return new Response('Missing media path.', { status: 400 });

  const absolutePath = path.resolve(requestedPath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) return new Response('Media file not found.', { status: 404 });
  if (stat.size <= 0) return new Response('Media file is empty.', { status: 404 });

  const rangeValue = request.headers.range ?? request.headers.Range ?? '';
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (rangeValue) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeValue.trim());
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' } });
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' } });
      start = Math.max(0, stat.size - suffixLength);
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(stat.size - 1, Number(match[2])) : stat.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' } });
    }
    status = 206;
  }

  const length = end - start + 1;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
    'Content-Length': String(length),
    'Content-Type': MIME_TYPES[path.extname(absolutePath).toLowerCase()] ?? 'application/octet-stream',
    'Last-Modified': stat.mtime.toUTCString(),
  });
  if (status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  if (request.method.toUpperCase() === 'HEAD') return new Response(null, { status, headers });

  const nodeStream = createReadStream(absolutePath, { start, end });
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}
