import type { Analysis } from './seoPipeline';

const NOISE = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'music', 'video', 'playlist', 'a', 'of', 'to', 'in', 'at', 'on']);
function tokens(value: string): Set<string> {
  return new Set((value.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 2 && !NOISE.has(word)));
}

/** Score every extracted primary/secondary phrase against user context and observed frames. */
export function rankKeywordTags(mainKeyword: string, nicheGenre: string, analysis: Analysis): string[] {
  const keywords = mainKeyword.split(',').map((part) => part.trim()).filter(Boolean);
  const main = tokens(keywords.join(' ')), niche = tokens(nicheGenre);
  const scene = tokens([analysis.visualAnalysis, ...(analysis.visualEvidence?.observed ?? [])].join(' '));
  const intent = tokens(analysis.audienceIntent);
  const seen = new Set<string>();
  return [...keywords, ...analysis.keywordsPrimary, ...analysis.keywordsSecondary, ...(analysis.keywordsLongTail ?? [])]
    .map((value, index) => ({ phrase: value.replace(/[,\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(), index }))
    .filter(({ phrase }) => {
      const key = phrase.toLocaleLowerCase('en-US');
      if (!phrase || phrase.length > 80 || seen.has(key)) return false;
      seen.add(key); return true;
    })
    .map(({ phrase, index }) => {
      const words = tokens(phrase);
      let score = index < keywords.length ? 10000 - index * 100 : index < keywords.length + analysis.keywordsPrimary.length ? 3 : 0;
      for (const word of words) score += (main.has(word) ? 5 : 0) + (niche.has(word) ? 3 : 0) + (scene.has(word) ? 4 : 0) + (intent.has(word) ? 1 : 0);
      score -= Math.max(0, words.size - 6);
      return { phrase, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ phrase }) => phrase);
}

export function buildRelevantTags(mainKeyword: string, nicheGenre: string, analysis: Analysis, suggested: string[] = []): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  let length = 0;
  const main = mainKeyword.split(',').map((part) => part.trim()).filter(Boolean);
  const allowed = tokens([mainKeyword, nicheGenre, analysis.visualAnalysis, analysis.audienceIntent, ...(analysis.visualEvidence?.observed ?? []), ...analysis.keywordsPrimary, ...analysis.keywordsSecondary].join(' '));
  const relevantSuggestions = suggested.filter((phrase) => [...tokens(phrase)].some((token) => allowed.has(token)));
  for (const candidate of [...main, ...relevantSuggestions, ...rankKeywordTags(mainKeyword, nicheGenre, analysis)]) {
    const phrase = candidate.replace(/[,\r\n]+/g, ' ').replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim();
    const key = phrase.toLocaleLowerCase('en-US');
    if (!phrase || phrase.length > 80 || seen.has(key)) continue;
    seen.add(key);
    const additional = phrase.length + (tags.length ? 2 : 0);
    if (length + additional >= 500) continue;
    tags.push(phrase); length += additional;
    if (tags.length === 30) break;
  }
  return tags;
}
