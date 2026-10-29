# ONIXLabs-Inspired Visualizer Reference (P35)

Reference repository: <https://github.com/onix-labs/onixlabs-media-player>
Reference README: <https://github.com/onix-labs/onixlabs-media-player#readme>
Reference license: MIT, <https://github.com/onix-labs/onixlabs-media-player/blob/main/LICENSE> (Copyright (c) 2026 ONIXLabs).

This project uses the upstream README as a design reference. The Magic-Render-Pro visualizers below are independently implemented using Canvas 2D and FFmpeg filters; upstream source code, assets, and brand artwork were not copied into this project. Visual similarity is approximate, not a pixel-identical port of ONIXPlayer's real-time renderer.

## Included design families

| ONIXLabs style | Magic-Render-Pro option | Preview / export implementation | Notes |
| --- | --- | --- | --- |
| Analyzer | `onix-analyzer` | Vertical frequency bars / `showfreqs` | Gradient, bar count, symmetry, sensitivity and frequency range. |
| Classic | `onix-classic` | Oscilloscope line / `showwaves` | Glow approximation depends on thickness and color mode. |
| Modern | `onix-modern` | Gradient spectrum / `showfreqs` | Uses user-selected primary/secondary colors rather than upstream brand assets. |
| Plasma | `onix-plasma` | Two channel waveforms / channel split + `showwaves` | Channel colors may be customized. |
| Infinity | `onix-infinity` | Circular waveform / polar `avectorscope`-based approximation | Circular shape differs from upstream shader animation. |
| Neon | `onix-neon` | Counter-rotating cross approximation in preview; polar export fallback | FFmpeg filter chain cannot reproduce arbitrary GPU/WebGL shaders exactly. |
| Hawking | `onix-hawking` | Spiked circular/radial approximation | Export uses FFmpeg-native polar/vector primitives. |
| Onix | `onix-core` | Pulsing gradient core / concentric radial approximation | Not the upstream logo or brand design. |
| Reactor | `onix-reactor` | Concentric frequency tower approximation | Full particle and palette-switch shader behavior is not replicated. |
| Spotlight | `onix-spotlight` | Ambient radial/concentric approximation | Approximate Canvas/FFmpeg version. |
| Twirl | `onix-twirl` | Rotating spiral / `showwaves` + rotation | FFmpeg-native rotation filter. |
| Warp | `onix-warp` | Radial distortion approximation | Export uses `lenscorrection`; visual details differ from upstream shader. |
| Ripple | `onix-ripple` | Concentric ripple approximation | Export maps to a polar vectorscope primitive. |
| Pulsar | `onix-pulsar` | Pulsing rings / radial approximation | Exact bass-triggered spin reversal is not yet identical. |
| Hallucia | `onix-hallucia` | Spectral spiral approximation | Export uses hue and rotation on waveform frames. |
| Logo | `onix-logo` | User-selected image centered and scaled | Static, not audio-reactive. Select an image/logo file. |
| Album Art | `onix-album-art` | User-selected artwork centered and scaled | Static image workflow; embedded cover art is **not** automatically extracted per playlist track. |
| Blank | `onix-blank` | No visualizer layer | Leaves the underlying video unchanged. |

Magic-Render-Pro retains older saved-project values for backward compatibility, but new visualizer selection lists the ONIXLabs-inspired models, the three simple/static modes, and the additional radial/waveform aliases requested in prior updates.

## Controls

- Visual: model/type, project-space position X/Y, width/height, line thickness, bar/sample count, symmetry/mirror.
- Color: single color, gradient end color, neon palette, amber-vintage palette, per-channel colors when the model supports them, opacity.
- Audio: sensitivity, temporal smoothing, minimum and maximum frequency, waveform amplitude scale/mode where supported.
- Output: project output resolution and FPS; temporary alpha format (`rgba` or `yuva444p10le`); final encoder/codec shown from project settings. Final MP4 formats such as H.264/yuv420p do not preserve alpha; transparency is for intermediate compositing only.
- Canvas: select and drag a visualizer, resize using corner handles, or hold Ctrl (Windows/Linux) / Cmd (macOS) while scrolling to zoom. Zoom changes the visualizer layer dimensions, not the entire canvas zoom.

Unsupported or semantically irrelevant controls are hidden for models that do not use them. For example, static Logo/Album Art modes do not expose frequency sensitivity or bar count. Album Art is an uploaded image, not automatic metadata art extraction.

## Verification

`scripts/test-p35-onix-visualizers.cjs` renders each listed style to a short H.264 MP4 with FFmpeg, verifies dimensions, codec and pixel format with FFprobe, and separately checks the temporary `yuva444p10le` alpha path. These are filter-level smoke tests; they do not prove pixel identity between browser Canvas and FFmpeg output or constitute a Windows Electron package test.
