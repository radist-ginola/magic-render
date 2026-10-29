# Magic Render Pro

**Source version:** `0.3.27`  
**Platform:** Windows x64 desktop application built with Electron, React, Vite, and TypeScript.

Magic Render Pro creates music/video compositions with a main-media canvas, intro and overlay layers, particles, audio visualizers, text and subscribe stickers, playlists, bulk rendering, and YouTube SEO metadata. Video rendering and SEO frame analysis use FFmpeg/FFprobe. Optional AI-assisted features require the selected provider's credentials and network access.

## Development setup

Requirements on the development/build machine:

- Node.js 22 or newer and npm.
- Windows x64 for producing the Windows NSIS installer.
- Internet access to install npm dependencies and any configured AI provider features.

From the repository root:

```cmd
npm ci
npm run dev
```

## Validation and production build

```cmd
npm run build
npm test
npm run dist
```

- `npm run build` compiles the main/preload processes and builds the renderer.
- `npm test` builds current output first, then runs the active regression suite.
- `npm run dist` runs the Windows packaging preflight, builds the app, and produces the NSIS installer under `release/`.

The build machine needs complete Windows x64 `ffmpeg.exe` and `ffprobe.exe` files at `resources/ffmpeg/`. The preflight can copy these from supported npm packages when available; for offline builds, provide the executables manually. Review `resources/ffmpeg/README.md` and the FFmpeg licensing terms before distributing an installer.

End users install the generated `.exe`; they do not need Node.js, npm, Python, or a separate Electron installation. AI/SEO providers may require network access and user-supplied API credentials. Do not commit `.env` files, API keys, personal media, or local project data.

## Important folders

- `src/` — application source code.
- `resources/` — runtime resources and the SEO prompt file.
- `scripts/` — current build, packaging, and regression-test scripts.
- `docs/` — technical references used by the current tests and contributors.

Generated output (`dist/`, `.test-dist/`, and `release/`) is intentionally excluded from source control; build it locally when needed.

## GitHub Releases and in-app updates

GitHub Releases is the intended distribution channel. **Automatic in-app updating is not enabled in source version `0.3.27` yet**; adding a Release or uploading a new installer alone will not update already-installed copies. See [`docs/GITHUB_RELEASES_PREPARATION.md`](docs/GITHUB_RELEASES_PREPARATION.md) for the rollout checklist. Once the updater is implemented, publish the generated installer and updater metadata together, and test upgrading from the previous installed version before announcing a release.

## Licensing

No repository-wide `LICENSE` file is included in this source baseline. Choose and add the appropriate license before making the source repository public. Review the licenses for bundled dependencies and FFmpeg separately.


## GitHub Releases update check (v0.3.27)

The checker is configured for [`radist-ginola/magic-render`](https://github.com/radist-ginola/magic-render). Help → Periksa Versi checks the latest stable release through the anonymous GitHub API and opens the validated installer/release URL for download. The repository currently has no published Releases, so the checker will report that an initial stable Release must be published until `v0.3.27` and its Windows installer are released. Existing installations built before the repository was configured must install this configured build manually once. This feature downloads through the system browser; it does not silently install updates. Do not add a GitHub token to source code or the packaged app.

## Local user data and privacy

Recent projects are stored under Electron `userData/project-state`, Asset Library records use the per-user Electron store and media files are stored in the configured user Asset Library, and AI provider keys are encrypted using Electron `safeStorage` in a per-user credential store. These files are not part of the source repository or source ZIP. Do not delete them during an app update; preserving them keeps user data intact. The repository should never contain `.env` files, project JSON data, recent-projects JSON, or credential stores.
