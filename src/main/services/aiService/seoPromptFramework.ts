import fs from 'node:fs/promises';
import path from 'node:path';

const FILENAME = 'promptimageSEO.md';

/** The same user-supplied prompt ships in the installer and the source archive. */
export async function loadSeoPromptFramework(): Promise<string> {
  const candidates = [
    path.join(process.resourcesPath || '', 'seo', FILENAME),
    path.join(process.cwd(), 'resources', 'seo', FILENAME),
    path.join(__dirname, '..', '..', '..', '..', 'resources', 'seo', FILENAME),
  ];
  for (const candidate of candidates) {
    const contents = await fs.readFile(candidate, 'utf8').catch(() => null);
    if (contents?.includes('PROMPT AI YOUTUBE METADATA GENERATOR')) return contents;
  }
  throw new Error(`Prompt SEO ${FILENAME} tidak ditemukan di resources/seo. Periksa paket aplikasi.`);
}

export function frameworkForStage(markdown: string, stage: 'analysis' | 'production'): string {
  const sections = markdown.split(/(?=^## (?:\d+\. |Instruksi Utama))/m);
  // Section 10 describes the markdown layout of the reference prompt. The
  // user's new #judul/#deskripsi/#tag layout is written locally instead.
  const required = stage === 'analysis' ? ['1.', '2.', '3.', '4.', '9.', 'Instruksi Utama'] : ['1.', '2.', '5.', '6.', '7.', '8.', '9.', 'Instruksi Utama'];
  return sections.filter((section) => required.some((heading) => section.startsWith(`## ${heading}`))).join('\n').trim();
}
