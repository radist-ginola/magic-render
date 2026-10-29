# Help Update Checker and User Data Privacy (v0.3.27)

## Help → Periksa Versi & Update

The Help page now has a typed IPC-backed GitHub Releases checker. It calls the public GitHub API for the latest stable release, compares its semantic version with `app.getVersion()`, and when newer, provides a validated browser link to the Windows installer (`.exe`) or release page.

The checker is configured in `src/main/config/updateConfig.ts` for the exact public repository:

```ts
export const UPDATE_GITHUB_OWNER = 'radist-ginola';
export const UPDATE_GITHUB_REPOSITORY = 'magic-render';
```

No GitHub token is necessary for checking public releases. Never put a write token in the source or installed app. The repository currently has no published stable Releases; publish the first release with tag `v0.3.27` and attach the generated Windows installer before testing the checker.

This v0.3.27 implementation checks the latest release and opens the download in the system browser; it does not silently install, restart, or roll back an application. The user must run the downloaded NSIS installer. A background in-app installer would require a follow-up `electron-updater` integration and Windows installed-app upgrade test.

For releases, increment `package.json` and `package-lock.json`, run `npm ci`, `npm run build`, `npm test`, and `npm run dist` on Windows, and attach the generated installer `.exe` to a stable GitHub Release with a tag such as `v0.3.27`. The check uses `/releases/latest`, which excludes drafts and prereleases.

## Data included in the source archive

The cleaned source archive is audited to exclude per-user records and secrets: no actual `.env`, recent project JSON, user project JSON, API credential store, or user Asset Library is bundled. Source-controlled branding assets are application resources and remain included.

Runtime persistence remains intentionally implemented:

- Recent project index: `app.getPath('userData')/project-state/recent-projects.json`.
- Asset Library metadata: per-user `electron-store`; media files stay in the configured user asset directory.
- API credentials: `magic-render-pro-ai`, encrypted using Electron `safeStorage`.
- Settings: `magic-render-pro-settings` in per-user `electron-store`.

These local files are not part of the GitHub repository or source ZIP. Do not erase them during app upgrades; updates should preserve the user's saved project list, assets, settings, and AI credentials.
