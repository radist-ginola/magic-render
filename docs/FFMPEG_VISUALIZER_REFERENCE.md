# FFmpeg Visualizer Reference Catalog — P34

This document maps all 17 sections in the `readloud/ffmpeg-batch-script` guide to Magic Render Pro and records the implementation boundary. It is a product integration map, not a claim that every FFmpeg filter or every video-processing recipe is exposed as a GUI control.

Primary references:
- [Complete FFmpeg Audio Visualization & Video Processing Guide](https://github.com/readloud/ffmpeg-batch-script/blob/main/Complete%20FFmpeg%20Audio%20Visualization%20%26%20Video%20Processing%20Guide.md)
- [Official FFmpeg Filters Documentation](https://ffmpeg.org/ffmpeg-filters.html)
- [FFmpeg audio-visualization examples by H. H. Springs](https://hhsprings.bitbucket.io/docs/programming/examples/ffmpeg/audio_visualization/index.html)

## All table-of-contents sections and product mapping

| # | Guide section | Product mapping | Implementation status / notes |
|---:|---|---|---|
| 1 | Waveform Basics | Audio Visualizer: Stereo Split, Mirrored, Gap, Split Colors; `showwaves` | Integrated. Alpha-keyed waveform frames overlay on the project media. `waveformMode` and `waveformScale` are project settings. |
| 2 | Waveform Modes & Styles | Mode control: `line`, `cline`, `p2p`, `point` | Integrated using valid `showwaves` modes. The guide also lists `solid`, `filled`, and `intensity`, but these are not valid `showwaves` mode values in the FFmpeg 7.1.5 build inspected for P34. Similar filled/volume looks are provided through spectrum/frequency/VU models instead of passing unsupported values to FFmpeg. |
| 3 | Background Integration | Main media layer, alpha-keyed transparent visualization overlay | Integrated for composition over a video/image background. The visualizer stage uses RGBA and removes the black backing before overlay. Black keying can affect very dark pixels, so it is not a substitute for a native alpha output from every filter. |
| 4 | Stereo Visualizations | `basic-split`, `mirrored`, `gap`, `split-colors`, `rainbow`, `glow`, `reflection` | Integrated. Channels are split where appropriate and rendered into a common layer. |
| 5 | Circular & Radial Visualizations | `polar` visualizer and `avectorscope` | Integrated as a polar vectorscope plus the existing Lissajous modes. It is a stereo phase/relationship view, not a conventional circular frequency-bar spectrum. A true radial spectrum would need a separate polar transform/composition model. |
| 6 | VU Meters & Volume Displays | VU Meter: `showvolume` | Integrated with peak/RMS and horizontal/vertical choices. Canvas Preview approximates the meter display from analyser values; exact FFmpeg meter coloring can differ slightly. |
| 7 | Spectrum Analyzers | Spectrum (`showspectrum`), Frequency Bars/Line/Dots (`showfreqs`), Constant-Q (`showcqt`) | Integrated. Palette, scroll direction, frequency scale and frequency draw mode are project-level controls. |
| 8 | Text Overlays & Title Animations | Text Overlay menu | Core text layers, typography, fade, stroke/glow and transform editing use the native text overlay pipeline. Not every animation example from the guide is a separate named preset in the GUI. |
| 9 | Logo & Image Overlays | Overlay and Asset Library; Media/Logo Reactive Visualizer | Integrated as overlays and reactive image/logo visualizer with crop, blend and optional chroma key. |
| 10 | Glow Effects | Glow Stereo visualizer and layer effects | Integrated using blur and alpha composition for the visualizer. Strong blur increases render cost. |
| 11 | Screen Recording | Import a recorded video as Main Media | Desktop/screen capture itself is not implemented by this visualizer update. Existing file-based composition accepts a recording as a media source; adding a native desktop recorder would require a separate permission, capture and lifecycle feature. |
| 12 | Video Rotation | Main Media, Overlay and layer rotation controls | Existing rotation controls apply to supported media/layer types. `avectorscope` is not a replacement for video rotation. |
| 13 | Scrolling Text | Text Overlay / animation controls | Text overlay remains available; the guide's individual `drawtext` scrolling commands are not all separate named presets. |
| 14 | Static Waveform Images | `showwavespic` / `showspectrumpic` reference recipes | Documented as a still-image/asset-generation workflow, not a realtime animated visualizer layer. A future dedicated “Generate waveform image” action should create an asset and handle long-audio memory/caching intentionally. |
| 15 | Scale Modes | Waveform amplitude scale; spectrum and frequency scale | Integrated modes are restricted to values supported by each filter. `showwaves` scale is `lin`, `log`, `sqrt`, or `cbrt`; `showfreqs` has its own frequency and amplitude scales. |
| 16 | Color Reference Palette | Rainbow, Fire, Cool, Viridis, Magma and channel colors | Integrated palette choices are exposed for spectrum. Stereo waveform channels have separate colors where meaningful. Other FFmpeg palettes remain available as documented recipes, not arbitrary unvalidated strings. |
| 17 | Troubleshooting & Tips | Help → FFmpeg Visualizer Reference, Console Log, render settings | Integrated as in-app help and diagnostic reference. Always validate actual filter options against the FFmpeg binary bundled with the app; guide examples may target another FFmpeg build or contain unsupported option values. |

## Models available in the Audio Visualizer menu

- **Stereo Split / Mirrored / Gap / Split Colors** — separate left and right channels using valid `showwaves` modes.
- **Rainbow / Glow / Reflection** — waveform composition variants that retain independent channel settings and opacity.
- **Constant-Q** — `showcqt`-based spectrum display.
- **Scrolling Spectrum** — `showspectrum` with supported `rainbow`, `fire`, `cool`, `viridis`, `magma`, or channel palette and `scroll`, `rscroll`, or `replace` slide modes.
- **Frequency Bars / Line / Dots** — `showfreqs` with `bar`, `line`, or `dot` display modes.
- **VU Meter** — `showvolume` with Peak/RMS and horizontal/vertical orientation.
- **Vector Scope / Polar Scope** — `avectorscope` with `lissajous`, `lissajous_xy`, or `polar` modes.
- **Media / Logo Reactive** — image/logo crop, motion, blend and chroma-key controls.

## Why the GUI does not accept every recipe verbatim

FFmpeg filter options vary by filter and version. The guide's `showwaves` modes `solid`, `filled`, and `intensity` are not valid values in the tested FFmpeg 7.1.5 binary; blindly adding them to a dropdown would cause render failures. Similarly, the inspected `avectorscope` supports `lissajous`, `lissajous_xy`, and `polar`; `circular` / `ascope` in examples should not be passed as its mode on that build. P34 maps these aesthetics to supported filters where possible and documents where an example is not a directly interchangeable filter option.

## Additional useful styles and filters to explore

These are candidate references for future visualizer models rather than all active GUI controls in P34:

- `ahistogram` / `aphasemeter` — audio distribution / phase diagnostics.
- `showcwt` — continuous wavelet transform visualization where present in the FFmpeg build.
- `showspectrumpic` and `showwavespic` — still spectrum/waveform artwork for thumbnails or background assets.
- `showvolume` layered with `showwaves` / `showcqt` — combined volume + waveform + spectrum compositions.
- `avectorscope=draw=line` / `draw=aaline` — phase trajectories with line/anti-aliased line drawing.
- `showspectrum=color=rainbow|fire|cool|viridis|magma` with `slide=scroll|rscroll|replace` — waterfall-style spectrum variations.
- `split`, `gblur`, `blend`, `overlay`, `format=rgba`, and alpha controls — composite and glow techniques.

Every new model should be checked against the bundled FFmpeg filter help, smoke-rendered with a short audio sample, and added to the Canvas Preview renderer before it is exposed to users. Preview is a browser/Web Audio approximation, whereas export runs FFmpeg; exact pixel-for-pixel equality is not guaranteed for FFT/spectrum filters without sharing the same analysis and rendering pipeline.
