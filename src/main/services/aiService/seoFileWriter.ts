import fs from 'node:fs/promises';
import path from 'node:path';
import type { YoutubeSeoResult } from '../../../shared/domain/aiTypes';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import { cleanTrackTitle } from './timestampGenerator';

type Draft = Omit<YoutubeSeoResult, 'outputFiles'>;
// Provider prose can contain hashtags despite the JSON contract. Keep the
// generated set only once, after the invitation, for a ready-to-paste description.
const paragraph = (value: string): string => value.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();

/** Read real playlist chapters; never ask AI to invent songs or timestamps. */
export function songLinesFromTimestamp(timestampText: string, hasPlaylist: boolean): string[] {
  if (!hasPlaylist) return [];
  return timestampText.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => /^\d{2}:\d{2}(?::\d{2})?\s+\S/.test(line) && !/^\d{2}:\d{2}(?::\d{2})?\s+Intro$/i.test(line))
    .map((line) => line.replace(/^(\d{2}:\d{2}(?::\d{2})?)\s+(.+)$/, (_all, time: string, name: string) => `${time} ${cleanTrackTitle(name)}`));
}

export function buildReadyDescription(result: Draft, timestampText: string, hasPlaylist: boolean, contentType = 'Musik'): string {
  if (!result.descriptionParts) throw new Error('AI belum menghasilkan deskripsi siap tempel.');
  const { opening, body, bodySecondary, perfectForNarrative, perfectForHeading, audiences, closing } = result.descriptionParts;
  if (audiences.length < 4 || audiences.length > 8) throw new Error('Deskripsi perlu 4–8 tujuan penonton.');
  const tracks = songLinesFromTimestamp(timestampText, hasPlaylist);
  const music = /^musik|music$/i.test(contentType.trim());
  const chosenTitle = result.titles[result.bestTitleIndex ?? 0] ?? result.titles[0];
  const titleHook = chosenTitle ? paragraph(chosenTitle.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, ':').replace(/\s*:+\s*/g, ': ').replace(/[.!?]+$/, '')) : '';
  const audienceLines = audiences.map((item) => `✓ ${paragraph(item).replace(/^this (?:playlist|video) is perfect for:\s*/i, '').replace(/[.!]+$/, '')}`);
  const sections = [
    titleHook ? `${titleHook}. ${paragraph(opening)}` : paragraph(opening),
    paragraph(body ?? result.descriptions.premium),
    paragraph(bodySecondary ?? ''),
    paragraph(perfectForNarrative ?? ''),
    ...(tracks.length ? [`Playlist 🎧\n${tracks.join('\n')}`] : []),
    `${paragraph(perfectForHeading ?? `${music ? 'This playlist' : 'This video'} is perfect for:`)}\n${audienceLines.join('\n')}`,
    paragraph(closing),
    result.hashtags.filter((tag, index, tags) => tags.findIndex((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase()) === index).join(' '),
  ];
  const description = sections.filter(Boolean).join('\n\n');
  if (description.length > 5000) throw new Error('Deskripsi termasuk playlist melebihi 5.000 karakter. Kurangi jumlah lagu atau ringkas konteks.');
  return description;
}

export async function writeYoutubeSeoText(project: ProjectData, result: Draft, outputVideoPath: string, timestampText = '', hasPlaylist = false): Promise<string> {
  const folder = path.dirname(outputVideoPath);
  const target = project.bulkItemId
    ? path.join(folder, `${path.basename(outputVideoPath, path.extname(outputVideoPath))}-youtubeseo.txt`)
    : path.join(folder, 'youtubeseo.txt');
  const description = buildReadyDescription(result, timestampText, hasPlaylist, project.youtubeSEO.context?.contentType ?? 'Musik');
  const tags = result.tags.map((tag) => tag.replace(/^[#\s]+/, '')).join(', ');
  if (tags.length > 500) throw new Error('Gabungan tag melebihi 500 karakter.');
  const name = project.name.replace(/[\r\n]+/g, ' ').trim() || 'Tanpa Nama';
  const lines = [
    `youtube seo untuk ${name}`,
    '',
    '#judul',
    ...result.titles.map((value, index) => `${index + 1}. ${value}`),
    '',
    '#deskripsi',
    description,
    '',
    '#tag',
    tags,
    '',
  ];
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, lines.join('\n'), 'utf8');
  return target;
}
