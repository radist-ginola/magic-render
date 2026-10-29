/**
 * GitHub Releases configuration for the in-app Help → Check version & update action.
 * Public release repository: https://github.com/radist-ginola/magic-render.
 * No access token belongs here: latest stable releases are read anonymously.
 */
export const UPDATE_GITHUB_OWNER = 'radist-ginola';
export const UPDATE_GITHUB_REPOSITORY = 'magic-render';

export function isUpdateRepositoryConfigured(): boolean {
  const owner = UPDATE_GITHUB_OWNER.trim();
  const repository = UPDATE_GITHUB_REPOSITORY.trim();
  return Boolean(owner && repository
    && /^[A-Za-z0-9_.-]+$/.test(owner)
    && /^[A-Za-z0-9_.-]+$/.test(repository));
}

export function getUpdateReleasesBaseUrl(): string | null {
  return isUpdateRepositoryConfigured()
    ? `https://github.com/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPOSITORY}/releases`
    : null;
}
