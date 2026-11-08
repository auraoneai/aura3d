# Shape Shift Sprint — evidence

- **Claim label:** prototype / bounded, playable. No pixel-parity claims. The current site screens and
  index previews were recaptured locally on a real GPU after the art pass (2026-11-07, see below); the
  WP-8 Phase B notes further down describe the earlier software-GL captures they replaced.
- **Capture method:** remote-only Playwright via `tools/remote-acr/run.sh`, spec
  `tests/browser/shape-shift-sprint.spec.ts`, route `/apps/showcase-shape-shift-sprint/?manual=1`, QA
  hooks `window.__AURA_SHAPE_SHIFT__`. Frames are logged as `SHAPE_SHIFT_FRAME <name> <base64>` JPEGs.
- **Look identity:** candy primaries on cream — per-shape colour coding (red sphere, yellow cube, blue
  cone) on a warm cream road under a day gradient sky, glowing matched hole rims, morph burst, and
  shape-confetti trail (`src/look.ts`, `src/art/direction.ts`).
- **Phase A (local, deterministic):** typecheck, eslint, vitest unit battery (sim determinism, meshes,
  motion 60/120/144 Hz, HUD contrast, GLSL compile, audio, art direction), vite build, route-health.
- **Phase B (WP-8, remote software WebGL2):**
  - **Build SHA:** `c5fcd10c9` on branch `games/splat-siblings` (Aura3D `5.1.0`).
  - **ACR Run IDs:** `splat-siblings-wp8-5` (ACR build `ch82t`, ACR run `ch82u`; initial 5-game capture pass `splat-siblings-wp8-4` / `ch82q` / `ch82s`) via `tools/remote-acr/run.sh` on `picassostagingacr` (`SHARED-CI-RG`).
  - **Viewports & Artifacts:** `1280×720` (`title-1280.jpg`, `early-1280.jpg`, `action-1280.jpg`, `mid-1280.jpg`, `results-1280.jpg`), `390×844` (`title-390.jpg`, `early-390.jpg`, `action-390.jpg`, `mid-390.jpg`, `results-390.jpg`), and cards `720×450` (`card.jpg`) + `1440×900` (`card@2x.jpg`) under `evidence/shape-shift-sprint/screens/final/`, plus `public/previews/showcase-index/shape-shift-sprint.webp` (`+@2x.webp`).
  - **Software-WebGL2 Caveat:** Captured on headless Chromium with SwiftShader (software WebGL2) on the remote ACR runner — not real-GPU evidence.

## Recapture after the art pass (2026-11-07, local real GPU)

- **What:** every file under `screens/final/` (`title/early/mid/action/results` at `1280x720` and `390x844`,
  `card.jpg` 720x450, `card@2x.jpg` 1440x900) and `public/previews/showcase-index/shape-shift-sprint{,@2x}.webp`
  (mirrored in `marketing/public/previews/showcase-index/`) were recaptured from the current `art/shape-shift-sprint`
  build. Names, formats and dimensions are unchanged.
- **How:** `AURA3D_ONLY_ROUTE=showcase-shape-shift-sprint pnpm --dir marketing build`, `marketing/dist` served on
  loopback, headless Chrome over raw CDP on the local GPU (`ANGLE Metal Renderer: Apple M4 Max`), focus emulation
  on, no reduced-motion emulation. Frames were taken at DPR 2 (1280x720, 390x844 with touch emulation, and
  1440x900 for the cards) during a live run started with a real click on PLAY NOW and steered by the live
  autopilot, then centre-cropped and downscaled with PIL (Lanczos). Results frames come from a real game over.
- **Play-through (same build, 1280x720 mouse + keys and 390x844 touch):** start, drag steering, arrow-key
  steering, P and button pause/resume (sim frozen while paused), mute button and M, matching holes score
  (PERFECT/MILESTONE popups), wrong shape costs a life (OUCH!), shield blocks one miss (BLOCKED), morph,
  wildcard (ANY SHAPE), shield and x2 tokens all collected, lives 3 -> 0 -> SPLAT! results, PLAY AGAIN resets
  score, lives, combo, multiplier and shape. No console errors, unhandled rejections or `RENDERER_MOUNT_FAILED`;
  about 47-60 fps while playing on a heavily loaded machine.
- **Fixes made in this pass:** blended overlays (wall contact strips, ball shadow, shield bubble, wildcard ring)
  no longer cast into the sun shadow map, which removed the `DEPTH_ALPHA_HASH_DEGRADED` warning on every load;
  the keyboard-only hints ("Space or Enter to play again", "P or Esc to resume") are hidden on touch devices.
