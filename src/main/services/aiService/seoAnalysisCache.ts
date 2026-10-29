import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AiProvider } from '../../../shared/domain/aiTypes';
import type { Analysis } from './seoPipeline';
import { parseAnalysisResponse } from './seoPipeline';

const VERSION = 'main-media-analysis-v3-promptimageSEO';
export async function analysisSignature(mediaPath: string, keyword: string, niche: string, provider: AiProvider, model: string): Promise<string> {
  const absolute = path.resolve(mediaPath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error('Media untuk analisis AI bukan file.');
  return createHash('sha256').update(JSON.stringify([VERSION,absolute,stat.size,stat.mtimeMs,keyword.trim().toLowerCase(),niche.trim().toLowerCase(),provider,model])).digest('hex');
}
function cachePath(projectDir: string): string { return path.join(path.resolve(projectDir), 'seo-analysis-cache.json'); }
export async function loadAnalysis(projectDir: string, signature: string): Promise<Analysis | null> {
  try {
    const data = JSON.parse(await fs.readFile(cachePath(projectDir), 'utf8')) as { signature?: string; analysis?: unknown };
    return data.signature === signature ? parseAnalysisResponse(JSON.stringify(data.analysis)) : null;
  } catch { return null; }
}
export async function saveAnalysis(projectDir: string, signature: string, analysis: Analysis): Promise<void> {
  const target = cachePath(projectDir), temp = `${target}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.writeFile(temp, JSON.stringify({ signature, analysis }), 'utf8');
    await fs.rename(temp, target);
  } finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
}
