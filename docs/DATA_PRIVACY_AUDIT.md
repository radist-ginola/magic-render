# User-data and secret audit — source repository v0.3.27

## Audit result

The cleaned source tree contains no per-user `recent-projects.json`, user project `project.json`, `magic-render-pro-settings.json`, `magic-render-pro-ai.json`, `.env` file, or bundled user Asset Library directory. It contains only application-owned branding assets and source code.

## How user data is persisted at runtime

- Recent-project index: `%APPDATA%/<app-user-data>/project-state/recent-projects.json` (the application resolves the base path with Electron `app.getPath('userData')`).
- Asset Library records: in the per-user Electron store. Actual media may be copied to the Asset Library directory configured in Settings, defaulting below Electron `userData`.
- AI credentials: stored in `magic-render-pro-ai` using Electron `safeStorage.encryptString`; credentials are decrypted only when needed by the main process.
- General settings: stored in the per-user Electron store `magic-render-pro-settings`.

Those runtime files are not source files and are not included in the GitHub source ZIP or a normal installer build. They should not be deleted as part of release cleanup: doing so would destroy the end user's saved projects, assets, settings, or credentials. App updates should preserve them.

## Repository protections

The `.gitignore` excludes `.env`, generated output, known app-data filenames and common runtime user-data folders. `scripts/test-help-update-check.cjs`, included in `npm test`, checks that forbidden user-data files and common embedded secret formats are absent.

## GitHub update configuration

`src/main/config/updateConfig.ts` points to the public update repository `radist-ginola/magic-render`. The anonymous checker uses only the public GitHub Releases API; no GitHub token is embedded in source or the installed app. No GitHub access token is needed by the app's anonymous latest-release checker, and no write token may be embedded in the application.
