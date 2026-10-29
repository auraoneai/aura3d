# Duneglide: final screenshots (4.5.0 build, after the live-games audit fixes)

- **Build:** `audit-fix/g24` (commits `dcd9c6b2b`..`71c708b4d` on 4.5.0 `31f8945ad`), the **live app page** `/apps/showcase-silt-and-signal-port/index.html` with its credit badge, served by the example dev server. Earlier frames (2026-10-25, `0d965903c`) came from the examples page.
- **Capture:** `tests/browser/audit-fix/silt-and-signal-port.spec.ts`, remote runs `g24after3-a` (titles), `g24after2-b` (play states), `g24after2-c` (card). Decoded with the lane's decoder; numbers in `metrics.jsonl` (luma per frame and per third, HUD rects, sim state, `diagnostics().renderPath`, draw calls, texture status).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU; these frames are not real-GPU evidence.
- **Render path on every frame:** `hdr-msaa`, quality `auto`, `bloomFusion: "separable"`. Draw calls 87-124.
- **Method:** each play state waited for the textured-material upgrade (14 of 31 materials carry textures; one stays `pending` on this runner, so the wait ran to its 9-minute budget on desktop). Titles were taken at least 70 s after mount. Every frame was opened and looked at.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title card (default load). The phone title shows the Text size button and the touch-button row in the controls table |
| `gameplay-early.*` | chapter 1 start, objective 2 ("Land and hold steady"), throttle 0 |
| `key-boost.*` | 120 frames of throttle, steer and boost: Speed 6, Turbo, one impact (toast "Impact: speed 60 to 50"); the hint line reads "Slow down, then hold F / the Hold button for 2.5 s"; the phone frame shows the Hold, Boost and Pause buttons |
| `mid-fly.1280x720` | 360 more frames of throttle: Speed 3, impact toast, textured plaster walls |
| `results.1280x720` | the results card reached by play (chapter 0 portal completed, then the last chapter's final objective): Time in flight 0:01, Lamps restored 9, Chapters flown 2 of 7, Impacts 0, Rating Glass-smooth (run `g24after2-d`) |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame from `key-boost`; the 1x image is the 2x frame downscaled in the page |

## Problems still visible

1. **Low:** the touch Pause label is wider than its 48 px button in `key-boost.390x844` (fixed in `4551fcb07`, after these frames).
2. **Low:** the rider is small on a flat white disc with two cyan ovals in every frame.
3. **Low:** on mobile the chapter buttons truncate long names ("2. The Broken Wat...").
