# Repository maintenance notes

- The active source repository keeps current user-facing documentation, FFmpeg/visualizer references, build configuration, and tests used by `npm test`.
- Generated output (`dist/`, `.test-dist/`, and `release/`) is excluded; `npm test` builds first so compiled-output tests use artifacts generated from the checked-out source.
- Historical per-phase reports/checkpoints and old one-off verification scripts are retained in the separate development-history archive, not at the repository root. The complete pre-clean P35-HF13 baseline ZIP should also be retained as a backup.
- Update `README.md` and `CHANGELOG.md` with each maintained release. Do not commit `.env`, API keys, local project files, or personal media.
