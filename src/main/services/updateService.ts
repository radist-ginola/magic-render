import { app } from 'electron';
import { isUpdateRepositoryConfigured, UPDATE_GITHUB_OWNER, UPDATE_GITHUB_REPOSITORY } from '../config/updateConfig';
import type { UpdateCheckResult } from '../../shared/ipc';

type GithubRelease = {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  body?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
};

type GithubAsset = { name?: unknown; browser_download_url?: unknown };

function cleanVersion(value: string): string {
  return value.trim().replace(/^v/i, '').split('+')[0] ?? '';
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] | null => {
    const match = cleanVersion(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) throw new Error('Format versi tidak valid. Gunakan format MAJOR.MINOR.PATCH.');
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

function safeReleaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const prefix = `/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPOSITORY}/releases/`;
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.toLowerCase().startsWith(prefix.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function findInstallerUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const assets = value.filter((asset): asset is GithubAsset => Boolean(asset && typeof asset === 'object'));
  const candidates = assets.filter((asset) => typeof asset.name === 'string' && /\.exe$/i.test(asset.name));
  const preferred = candidates.find((asset) => /setup.*\.exe$/i.test(String(asset.name)) || /-setup\.exe$/i.test(String(asset.name)));
  const chosen = preferred ?? candidates[0];
  if (typeof chosen?.browser_download_url !== 'string') return null;
  try {
    const url = new URL(chosen.browser_download_url);
    const prefix = `/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPOSITORY}/releases/download/`;
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.toLowerCase().startsWith(prefix.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function result(status: UpdateCheckResult['status'], currentVersion: string, message: string, extra: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return { status, currentVersion, latestVersion: null, releaseName: null, releaseUrl: null, installerUrl: null, message, ...extra };
}

export async function checkForLatestGithubRelease(currentVersion = app.getVersion()): Promise<UpdateCheckResult> {
  if (!isUpdateRepositoryConfigured()) {
    return result('not-configured', currentVersion,
      'Repositori GitHub Releases belum dikonfigurasi. Isi UPDATE_GITHUB_OWNER dan UPDATE_GITHUB_REPOSITORY pada src/main/config/updateConfig.ts sebelum build rilis.');
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(UPDATE_GITHUB_OWNER)}/${encodeURIComponent(UPDATE_GITHUB_REPOSITORY)}/releases/latest`;
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Magic-Render-Pro-Update-Checker' },
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 404) {
      return result('error', currentVersion, `Belum ada GitHub Release stabil di ${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPOSITORY}. Publikasikan installer Windows sebagai stable release dengan tag v${currentVersion} terlebih dahulu.`);
    }
    if (!response.ok) {
      return result('error', currentVersion, `GitHub Releases tidak dapat diperiksa (HTTP ${response.status}). Periksa koneksi internet dan konfigurasi repository.`);
    }
    const release = await response.json() as GithubRelease;
    if (release.draft === true || release.prerelease === true || typeof release.tag_name !== 'string') {
      return result('error', currentVersion, 'GitHub tidak mengembalikan release stabil dengan tag versi yang valid.');
    }
    const latestVersion = cleanVersion(release.tag_name);
    const releaseUrl = safeReleaseUrl(release.html_url);
    if (!releaseUrl) return result('error', currentVersion, 'URL GitHub Release tidak valid atau tidak sesuai dengan repository updater.');

    let comparison: number;
    try { comparison = compareVersions(latestVersion, currentVersion); }
    catch (error) { return result('error', currentVersion, error instanceof Error ? error.message : 'Format versi rilis tidak valid.'); }

    const releaseName = typeof release.name === 'string' && release.name.trim() ? release.name.trim() : `Magic Render Pro v${latestVersion}`;
    const installerUrl = findInstallerUrl(release.assets);
    if (comparison > 0) {
      return result('update-available', currentVersion, `Versi baru ${latestVersion} tersedia.`, { latestVersion, releaseName, releaseUrl, installerUrl });
    }
    return result('up-to-date', currentVersion, comparison === 0 ? `Aplikasi sudah menggunakan versi terbaru (${currentVersion}).` : `Versi terbaru di GitHub (${latestVersion}) tidak lebih baru dari versi ini (${currentVersion}).`, { latestVersion, releaseName, releaseUrl, installerUrl });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return result('error', currentVersion, `Pemeriksaan update gagal: ${detail}`);
  }
}

export function validateUpdateUrl(rawUrl: string): boolean {
  if (!isUpdateRepositoryConfigured()) return false;
  try {
    const url = new URL(rawUrl);
    const releasePrefix = `/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPOSITORY}/releases/`;
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.toLowerCase().startsWith(releasePrefix.toLowerCase());
  } catch {
    return false;
  }
}
