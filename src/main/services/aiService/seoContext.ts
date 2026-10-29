import type { SeoContext } from '../../../shared/domain/aiTypes';

const LIMITS: Record<Exclude<keyof SeoContext, 'seoStrategy' | 'optimizationGoals' | 'titleStyle'>, number> = {
  contentType: 120,
  nicheGenre: 180,
  channelName: 120, channelNiche: 180, targetAudience: 240, targetLanguage: 80, targetCountry: 80,
  videoTopic: 240, videoSummary: 1800, audioGenre: 120, audioMood: 160, audioDetails: 650,
  lyricsOrTranscript: 2400, thumbnailText: 240, visualCorrections: 650,
  secondaryKeywords: 350, excludeTerms: 350, searchIntent: 160,
  trendNotes: 600, competitorNotes: 600,
};

/** Treat context as user supplied data; bound every field before passing it to a model. */
export function normalizeSeoContext(value: unknown): SeoContext {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Konteks SEO harus berupa objek.');
  const raw = value as Record<string, unknown>;
  const result: SeoContext = {};
  if (raw.contentType === '' || raw.targetCountry === '') throw new Error('Jenis konten dan negara target tidak boleh kosong.');
  for (const [field, max] of Object.entries(LIMITS) as Array<[keyof typeof LIMITS, number]>) {
    if (raw[field] === undefined || raw[field] === '') continue;
    if (typeof raw[field] !== 'string' || (raw[field] as string).length > max) throw new Error(`Konteks ${field} harus berupa teks maksimal ${max} karakter.`);
    result[field] = (raw[field] as string).trim();
  }
  if (raw.seoStrategy !== undefined) {
    if (!['balanced', 'search', 'ctr'].includes(String(raw.seoStrategy))) throw new Error('Strategi SEO tidak valid.');
    result.seoStrategy = raw.seoStrategy as SeoContext['seoStrategy'];
  }
  if (raw.optimizationGoals !== undefined) {
    const allowed = ['youtube-search', 'suggested-videos', 'browse-features', 'brand-awareness', 'balanced'];
    if (!Array.isArray(raw.optimizationGoals) || raw.optimizationGoals.length < 1 || raw.optimizationGoals.length > 5 || new Set(raw.optimizationGoals).size !== raw.optimizationGoals.length || raw.optimizationGoals.some((goal) => !allowed.includes(String(goal)))) throw new Error('Tujuan optimasi SEO harus berupa 1–5 pilihan unik.');
    result.optimizationGoals = raw.optimizationGoals as SeoContext['optimizationGoals'];
  }
  if (raw.titleStyle !== undefined) {
    if (!['seo-friendly', 'cinematic', 'informative', 'curiosity', 'natural'].includes(String(raw.titleStyle))) throw new Error('Gaya judul SEO tidak valid.');
    result.titleStyle = raw.titleStyle as SeoContext['titleStyle'];
  }
  return result;
}
