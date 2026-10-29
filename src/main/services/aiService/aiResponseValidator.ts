import type { YoutubeSeoResult } from '../../../shared/domain/aiTypes';

type Raw = Record<string, unknown>;

export function parseAndValidateAiResponse(rawText: string): Omit<YoutubeSeoResult, 'outputFiles'> {
  let value: unknown;
  try { value = JSON.parse(rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw new Error('Respons AI bukan JSON yang valid. Periksa batas output model.'); }
  if (!value || typeof value !== 'object') throw new Error('Respons AI harus berupa object JSON.');
  const data = value as Raw;
  const primary = boundedStringArray(data.keywordsPrimary, 1, 8, 'keywordsPrimary');
  const secondary = boundedStringArray(data.keywordsSecondary, 0, 12, 'keywordsSecondary');
  const longTail = boundedStringArray(data.keywordsLongTail, 0, 6, 'keywordsLongTail');
  const titles = boundedStringArray(data.titles, 1, 5, 'titles').map((title) => title.trim());
  if (titles.some((title) => title.length === 0 || title.length > 95)) throw new Error('Ada judul AI yang kosong atau melebihi 95 karakter.');
  const descriptions = data.descriptions;
  if (!descriptions || typeof descriptions !== 'object') throw new Error('Deskripsi AI tidak valid.');
  const descriptionObject = descriptions as Raw;
  const descriptionsResult = {
    seoRich: boundedString(descriptionObject.seoRich, 1400, 'descriptions.seoRich'),
    engagement: boundedString(descriptionObject.engagement, 900, 'descriptions.engagement'),
    premium: boundedString(descriptionObject.premium, 900, 'descriptions.premium'),
  };
  const tags = boundedStringArray(data.tags, 0, 15, 'tags');
  const tagText = tags.join(',');
  if (tagText.length >= 500) throw new Error('Total karakter tags AI harus di bawah 500 karakter.');
  const hashtags = stringArray(data.hashtags, 'hashtags');
  if (hashtags.length < 3 || hashtags.length > 7) throw new Error('Jumlah hashtag AI harus 3 sampai 7.');
  const normalizedHashtags = hashtags.map((tag) => tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`);
  const evidence = data.visualEvidence && typeof data.visualEvidence === 'object' ? data.visualEvidence as Raw : {};
  const visualEvidence = {
    observed: optionalStringArray(evidence.observed, 5), interpreted: optionalStringArray(evidence.interpreted, 3),
    uncertain: optionalStringArray(evidence.uncertain, 3), visibleText: optionalStringArray(evidence.visibleText, 8),
  };
  const titleNotes = optionalStringArray(data.titleNotes, 5);
  return {
    visualAnalysis: requiredString(data.visualAnalysis, 'visualAnalysis'),
    audienceIntent: requiredString(data.audienceIntent, 'audienceIntent'),
    visualEvidence,
    titleNotes,
    keywordsPrimary: primary,
    keywordsSecondary: secondary,
    keywordsLongTail: longTail,
    titles,
    descriptions: descriptionsResult,
    tags,
    hashtags: normalizedHashtags,
  };
}

function boundedStringArray(value: unknown, min: number, max: number, label: string): string[] {
  const values = stringArray(value, label);
  if (values.length < min || values.length > max) throw new Error(`${label} harus ${min}–${max} item.`);
  return values;
}

function optionalStringArray(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()).slice(0, max).map((item) => item.trim()) : [];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} harus berupa array.`);
  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) throw new Error(`${label}[${index}] tidak valid.`);
    return item.trim();
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} tidak valid.`);
  return value.trim();
}

function boundedString(value: unknown, max: number, label: string): string {
  const text = requiredString(value, label);
  if (text.length > max) throw new Error(`${label} melebihi ${max} karakter.`);
  return text;
}
