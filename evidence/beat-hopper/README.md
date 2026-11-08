# Beat Hopper — evidence

- **Claim label:** bounded · classification prototype · catalog verification `playable` (SplatSiblings PRD D8).
- **Capture method (Phase B, remote-only):** `tests/browser/beat-hopper.spec.ts` boots
  `/apps/showcase-beat-hopper/?manual=1` on the remote ACR runner (`tools/remote-acr/run.sh`), drives the QA surface
  `window.__AURA_BEAT_HOPPER__` (`stepFrames`, `runAutopilot`, `replay`, `frame`, `pixels`, `routeHealth`) and logs
  JPEG frames. Software-WebGL2 captures are labelled as such; no local Playwright/Docker runs.
- **Phase A (this lane):** app-scoped typecheck, eslint, vitest unit suite (determinism, judgement, meshes, motion
  60/120/144 Hz, HUD contrast, GLSL compile, audio diffs, art direction), vite build, route-health probe,
  `tools/game-checks/run.mjs beat-hopper`.
- **Phase B (WP-8, remote software WebGL2):**
  - **Build SHA:** `c5fcd10c9` on branch `games/splat-siblings` (Aura3D `5.1.0`).
  - **ACR Run IDs:** `splat-siblings-wp8-5` (ACR build `ch82t`, ACR run `ch82u`) via `tools/remote-acr/run.sh` on `picassostagingacr` (`SHARED-CI-RG`).
  - **Viewports & Artifacts:** `1280×720` (`title-1280.jpg`, `early-1280.jpg`, `action-1280.jpg`, `mid-1280.jpg`, `results-1280.jpg`), `390×844` (`title-390.jpg`, `early-390.jpg`, `action-390.jpg`, `mid-390.jpg`, `results-390.jpg`), and cards `720×450` (`card.jpg`) + `1440×900` (`card@2x.jpg`) under `evidence/beat-hopper/screens/final/`, plus `public/previews/showcase-index/beat-hopper.webp` (`+@2x.webp`).
  - **Software-WebGL2 Caveat:** Captured on headless Chromium with SwiftShader (software WebGL2) on the remote ACR runner — not real-GPU evidence.
## Art-pass recapture (2026-11-07, local real GPU)

- The site screens under `screens/final/` (title/early/action/mid/results at `1280×720` and `390×844`,
  `card.jpg` `720×450`, `card@2x.jpg` `1440×900`) and the index previews
  `public/previews/showcase-index/beat-hopper.webp` / `@2x.webp` (mirrored in `marketing/public/`) were
  **recaptured locally on a real GPU** (headless Chrome, ANGLE Metal, Apple M4 Max) after the art pass,
  from the current `art/beat-hopper` build (commit `3cb7c6151`,
  `AURA3D_ONLY_ROUTE=showcase-beat-hopper pnpm --dir marketing build`).
- Method: raw CDP against `marketing/dist` served on loopback, `/apps/showcase-beat-hopper/?manual=1`, focus
  emulation on, no reduced-motion emulation, device scale factor 1; the same hook sequence as
  `tests/browser/beat-hopper.spec.ts` (seed `20261101`, `runAutopilot(60/240/600)`, mistake rows `[0..4]`
  for results). The card is the 1440×900 frame after 600 autopilot steps (hopper mid-air); `card.jpg` and
  the `.webp` previews are Lanczos downscales/encodes of it (python3 + PIL).
- These frames supersede the software-WebGL2 caveat above for the screens and previews only; the
  claim label is unchanged.
