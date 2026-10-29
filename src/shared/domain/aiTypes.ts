export type AiProvider = 'openai' | 'gemini' | 'openrouter' | 'groq' | 'mistral' | 'ollama';

export type AiCredentialsStatus = {
  provider: AiProvider;
  model: string;
  configured: boolean;
  valid: boolean;
  authenticated?: boolean;
  checkedAt: string | null;
  message: string;
};

export type Keyframe = {
  timestampSec: number;
  mimeType: string;
  base64: string;
};

export type SeoContext = {
  contentType?: string;
  optimizationGoals?: Array<'youtube-search' | 'suggested-videos' | 'browse-features' | 'brand-awareness' | 'balanced'>;
  titleStyle?: 'seo-friendly' | 'cinematic' | 'informative' | 'curiosity' | 'natural';
  nicheGenre?: string;
  channelName?: string;
  channelNiche?: string;
  targetAudience?: string;
  targetLanguage?: string;
  targetCountry?: string;
  videoTopic?: string;
  videoSummary?: string;
  audioGenre?: string;
  audioMood?: string;
  audioDetails?: string;
  lyricsOrTranscript?: string;
  thumbnailText?: string;
  visualCorrections?: string;
  secondaryKeywords?: string;
  excludeTerms?: string;
  searchIntent?: string;
  seoStrategy?: 'balanced' | 'search' | 'ctr';
  trendNotes?: string;
  competitorNotes?: string;
};

export type YoutubeSeoResult = {
  titles: string[];
  descriptions: { seoRich: string; engagement: string; premium: string };
  descriptionParts?: { opening: string; body?: string; bodySecondary?: string; perfectForNarrative?: string; perfectForHeading?: string; audiences: string[]; closing: string };
  bestTitleIndex?: number;
  readyDescription?: string;
  tags: string[];
  hashtags: string[];
  keywordsPrimary: string[];
  keywordsSecondary: string[];
  keywordsLongTail: string[];
  visualAnalysis: string;
  audienceIntent: string;
  visualEvidence?: { observed: string[]; interpreted: string[]; uncertain: string[]; visibleText: string[] };
  titleNotes?: string[];
  outputFiles: { seoTxt: string; timestampTxt: string };
};

export type YoutubeSeoGenerateRequest = {
  projectId: string;
  project: import('./projectTypes').ProjectData;
  outputPath?: string;
  mainKeyword: string;
  provider: AiProvider;
  model: string;
  apiKey?: string;
  /** When false, generate youtubeseo.txt without creating timestamp.txt as a sidecar. */
  writeTimestampSidecar?: boolean;
};
