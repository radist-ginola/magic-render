# Changelog

## 0.3.25 — P35-HF13 baseline

- Normalized MP4 pixel format/range for better Windows player compatibility.
- Added retry and first-frame fallback behavior for YouTube SEO keyframe extraction.
- Added byte-range handling for the local media preview protocol.
- Hardened the Electron preload bridge and retained `magicRender`/`electronAPI` compatibility.
- Unified Canvas Preview geometry and workspace panel spacing across Media, Intro, Overlay, Sticker Subscribe, YouTube SEO, and Render.
- Normalized Fetch `Headers` before passing request headers to the local media protocol service.
- Preserved the existing render pipeline, project format, IPC boundaries, and Windows x64 NSIS packaging configuration.

This historical entry records the P35-HF13 baseline; in-app automatic updating is not enabled by the current browser-based release checker.

## 0.3.26

- Add Help → Periksa Versi & Update using the public GitHub Releases API.
- Show current/latest version and provide a validated link to the Windows installer or release page.
- Keep recent projects, Asset Library records, settings, and encrypted AI credentials in per-user app data; none are packaged as source data.
- Require GitHub owner/repository configuration before publishing release builds.

## 0.3.27

- Configure Help → Periksa Versi & Update for the public repository `radist-ginola/magic-render`.
- Improve the no-release response so it tells maintainers to publish the current application version tag.
- Update release and privacy documentation and remove stale version pins from historical regression tests.
- The checker still opens the installer download in the system browser; automatic in-app installation is not enabled.
