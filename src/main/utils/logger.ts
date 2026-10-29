import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type Logger = Readonly<{
  debug: (message: string, details?: unknown) => void;
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
}>;

let logFilePath: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const listeners = new Set<(entry: { createdAt: string; level: LogLevel; message: string; detail?: string | null }) => void>();
const recentEntries: Array<{ createdAt: string; level: LogLevel; message: string; detail?: string | null }> = [];
const MAX_RECENT_ENTRIES = 500;

function serialize(details: unknown): string {
  if (details === undefined) return '';
  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return ' [unserializable-details]';
  }
}

function write(level: LogLevel, message: string, details?: unknown): void {
  const createdAt = new Date().toISOString();
  const line = `[${createdAt}] [${level}] ${message}${serialize(details)}\n`;
  const detail = details === undefined ? null : (() => { try { return JSON.stringify(details); } catch { return '[detail tidak dapat ditampilkan]'; } })();
  const entry = { createdAt, level, message, detail };
  recentEntries.push(entry);
  if (recentEntries.length > MAX_RECENT_ENTRIES) recentEntries.splice(0, recentEntries.length - MAX_RECENT_ENTRIES);
  for (const listener of listeners) listener(entry);
  process.stdout.write(line);
  if (!logFilePath) return;
  writeQueue = writeQueue
    .then(() => fs.appendFile(logFilePath as string, line, 'utf8'))
    .catch(() => undefined);
}

export function getRecentLogEntries(): Array<{ createdAt: string; level: LogLevel; message: string; detail?: string | null }> {
  return [...recentEntries];
}

export function subscribeLogger(listener: (entry: { createdAt: string; level: LogLevel; message: string; detail?: string | null }) => void): () => void {
  for (const entry of recentEntries) listener(entry);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initializeLogger(): Promise<void> {
  const directory = app.getPath('logs');
  await fs.mkdir(directory, { recursive: true });
  logFilePath = path.join(directory, 'magic-render-pro.log');
  await fs.appendFile(logFilePath, `\n--- ${new Date().toISOString()} application start ---\n`, 'utf8');
}

export const logger: Logger = Object.freeze({
  debug: (message, details) => write('DEBUG', message, details),
  info: (message, details) => write('INFO', message, details),
  warn: (message, details) => write('WARN', message, details),
  error: (message, details) => write('ERROR', message, details),
});
