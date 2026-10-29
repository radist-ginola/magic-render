export type IntroMode = 'media' | 'fade' | 'none';

export type ProjectIntro = {
  enabled: boolean;
  /** Explicit opening mode; omitted in legacy projects and inferred from enabled/path. */
  mode?: IntroMode;
  path: string | null;
  fallbackFadeInSec: number;
  fallbackStyle?: 'dark' | 'blur';
  fallbackBlur?: number;
  fallbackBrightness?: number;
  /** Optional explicit fade for the intro clip; zero disables the automatic intro fade. */
  fadeInSec?: number;
};

export type IntroLibraryItem = {
  assetId: string;
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type IntroPipelinePlan = {
  enabled: boolean;
  introPath: string | null;
  fallbackFadeInSec: number;
  mainMediaFadeInSec: number;
  prependIntro: boolean;
};

/** Resolve explicit mode while preserving legacy projects created before mode was added. */
export function getIntroMode(intro: ProjectIntro): IntroMode {
  if (!intro.enabled || intro.mode === 'none') return 'none';
  if (intro.mode === 'fade') return 'fade';
  if (intro.mode === 'media') return 'media';
  return intro.path ? 'media' : 'fade';
}

/** The selected media path is only active in media mode; other modes keep the asset selection for later. */
export function activeIntroMediaPath(project: import('./projectTypes').ProjectData): string | null {
  return getIntroMode(project.intro) === 'media' && project.intro.path ? project.intro.path : null;
}

/** The main media setting wins; Intro's fallback is used only in explicit fade mode. */
export function effectiveMainFadeIn(project: import('./projectTypes').ProjectData): number {
  const ownFade = project.mainMedia?.fade.fadeInSec ?? 0;
  if (ownFade > 0) return ownFade;
  return getIntroMode(project.intro) === 'fade'
    ? Math.max(0, project.intro.fallbackFadeInSec)
    : 0;
}

export function activeIntroBlur(project: import('./projectTypes').ProjectData): { duration: number; blur: number; brightness: number } | null {
  if (getIntroMode(project.intro) !== 'fade' || (project.mainMedia?.fade.fadeInSec ?? 0) > 0 || project.intro.fallbackStyle !== 'blur') return null;
  const duration = Math.max(0, Math.min(30, project.intro.fallbackFadeInSec));
  return duration > 0 ? { duration, blur: project.intro.fallbackBlur ?? 12, brightness: project.intro.fallbackBrightness ?? -0.25 } : null;
}
