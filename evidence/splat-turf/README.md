# Splat Turf — evidence

- **Claim label:** prototype / bounded, playable. No pixel-parity or real-GPU claims; all captures are
  software-GL (remote runner) until a real-GPU pass is recorded.
- **Capture method:** remote-only Playwright via `tools/remote-acr/run.sh`, spec
  `tests/browser/splat-turf.spec.ts`, route `/apps/showcase-splat-turf/?manual=1`, QA hooks
  `window.__AURA_SPLAT_TURF__`. Frames are logged as `SPLAT_TURF_FRAME <name> <base64>` JPEGs.
- **Look identity:** paint-world carnival — white road, saturated per-cell trail paint (one batch,
  per-cell tone attribute), plum ink HUD, cyan solvent wipe wash (`src/look.ts`, `src/art/direction.ts`).
- **Phase A (local, deterministic):** typecheck, eslint, vitest unit battery (sim determinism, meshes,
  motion 60/120/144 Hz, HUD contrast, GLSL compile, audio, art direction), vite build, route-health.
- **Phase B (WP-8, remote software WebGL2):**
  - **Build SHA:** `c5fcd10c9` on branch `games/splat-siblings` (Aura3D `5.1.0`).
  - **ACR Run IDs:** `splat-siblings-wp8-5` (ACR build `ch82t`, ACR run `ch82u`) via `tools/remote-acr/run.sh` on `picassostagingacr` (`SHARED-CI-RG`).
  - **Viewports & Artifacts:** `1280×720` (`title-1280.jpg`, `early-1280.jpg`, `action-1280.jpg`, `mid-1280.jpg`, `results-1280.jpg`), `390×844` (`title-390.jpg`, `early-390.jpg`, `action-390.jpg`, `mid-390.jpg`, `results-390.jpg`), and cards `720×450` (`card.jpg`) + `1440×900` (`card@2x.jpg`) under `evidence/splat-turf/screens/final/`, plus `public/previews/showcase-index/splat-turf.webp` (`+@2x.webp`).
  - **Software-WebGL2 Caveat:** Captured on headless Chromium with SwiftShader (software WebGL2) on the remote ACR runner — not real-GPU evidence.
## Art-pass recapture (2026-11-07, local real GPU)

- The site screens under `screens/final/` (title/early/action/mid/results at `1280×720` and `390×844`,
  `card.jpg` `720×450`, `card@2x.jpg` `1440×900`) and the index previews
  `public/previews/showcase-index/splat-turf.webp` / `@2x.webp` (mirrored in `marketing/public/`) were
  **recaptured locally on a real GPU** (headless Chrome, ANGLE Metal, Apple M4 Max) after the art pass
  (floating carnival causeway over a sunset cloud sea), from the current `art/splat-turf` build
  (commit `74c4dff3e`, `AURA3D_ONLY_ROUTE=showcase-splat-turf pnpm --dir marketing build`).
- Method: raw CDP against `marketing/dist` served on loopback, `/apps/showcase-splat-turf/?manual=1`, focus
  emulation on, no reduced-motion emulation, device scale factor 1; the same hook sequence as
  `tests/browser/splat-turf.spec.ts` (seed `20261121`, `runAutopilot(60/180/600)`, reckless autopilot for
  results). The card is the 1440×900 frame after 540 autopilot steps; `card.jpg` and the `.webp` previews
  are Lanczos downscales/encodes of it (python3 + PIL).
- These frames supersede the software-WebGL2 caveat above for the screens and previews only; the
  claim label stays prototype / bounded, playable.
