# GitHub Releases preparation

Current source version: `0.3.27`.

## Update repository configuration

The update checker is already configured in `src/main/config/updateConfig.ts` for [`radist-ginola/magic-render`](https://github.com/radist-ginola/magic-render). The Help page's **Periksa Versi** button reads the latest stable release from the anonymous GitHub Releases API and compares its `tag_name` against the installed app version. If a newer version exists, the UI offers the installer asset (`.exe`) or the release page in the system browser.

This initial release checker does **not** silently install or restart the app. Each release is still installed by running the downloaded NSIS installer. In-app background download/install can be added later via `electron-updater` after the repository owner/name and release pipeline are set.

## Before publishing source

1. Review `.gitignore`; do not commit `.env`, API keys, user projects, recent-project records, local Asset Library data, generated `dist/`, `.test-dist/`, `release/`, or `node_modules/`.
2. Choose and add a `LICENSE` before making source public. Review third-party assets and FFmpeg/FFprobe licensing.
3. Run `npm ci`, `npm run build`, `npm test`, and `npm run dist` on Windows x64.
4. Install the generated installer in a clean Windows VM and check rendering, SEO keyframes, preview, and update checking.
5. The repository currently has no published Releases. For the first release, tag the version represented by `package.json` (currently `v0.3.27`), attach the NSIS `.exe`, and publish as a stable (non-draft, non-prerelease) GitHub Release.
6. Do not publish a GitHub write token in source or inside the installed app. Use CI secrets only for publishing.

## User data handling

Recent project indexes live in `app.getPath('userData')/project-state`, Asset Library records use `electron-store` and source media remains in a user-configured asset directory, while AI keys are stored encrypted through Electron `safeStorage` in the per-user credential store. These are not shipped in source ZIPs and should be preserved during application updates. Deletion of a user's own data should be an explicit in-app action, not part of release packaging.
