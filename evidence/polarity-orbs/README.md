# Polarity Orbs — evidence

- Claim label: **prototype**, claimStatus **bounded**, catalog verification **playable** (PRD D8).
- Phase A (local, deterministic): app typecheck, scoped eslint, `tests/unit/polarity-orbs` vitest suite, Vite build,
  `scripts/write-route-health.mjs` → `apps/showcase-polarity-orbs/route-health.json`, `tools/game-checks/run.mjs polarity-orbs`.
- Capture method (Phase B, WP-8): remote runner only (`tools/remote-acr/run.sh`), browser spec
  `tests/browser/polarity-orbs.spec.ts`, JPEG frames via `__AURA_POLARITY_ORBS__.frame()`; final screens at
  1280×720 and 390×844. Any software-WebGL2 captures must be labelled as such; no real-GPU or pixel-parity claims.
- **Phase B (WP-8, remote software WebGL2):**
  - **Build SHA:** `c5fcd10c9` on branch `games/splat-siblings` (Aura3D `5.1.0`).
  - **ACR Run IDs:** `splat-siblings-wp8-5` (ACR build `ch82t`, ACR run `ch82u`) via `tools/remote-acr/run.sh` on `picassostagingacr` (`SHARED-CI-RG`).
  - **Viewports & Artifacts:** `1280×720` (`title-1280.jpg`, `early-1280.jpg`, `action-1280.jpg`, `mid-1280.jpg`, `results-1280.jpg`), `390×844` (`title-390.jpg`, `early-390.jpg`, `action-390.jpg`, `mid-390.jpg`, `results-390.jpg`), and cards `720×450` (`card.jpg`) + `1440×900` (`card@2x.jpg`) under `evidence/polarity-orbs/screens/final/`, plus `public/previews/showcase-index/polarity-orbs.webp` (`+@2x.webp`).
  - **Software-WebGL2 Caveat:** Captured on headless Chromium with SwiftShader (software WebGL2) on the remote ACR runner — not real-GPU evidence.
## Art-pass recapture (2026-11-07, local real GPU)

- The site screens under `screens/final/` (title/early/action/mid/results at `1280×720` and `390×844`,
  `card.jpg` `720×450`, `card@2x.jpg` `1440×900`) and the index previews
  `public/previews/showcase-index/polarity-orbs.webp` / `@2x.webp` (mirrored in `marketing/public/`) were
  **recaptured locally on a real GPU** (headless Chrome, ANGLE Metal, Apple M4 Max) after the art pass,
  from the current `art/polarity-orbs` build (commit `d9eeb5981`,
  `AURA3D_ONLY_ROUTE=showcase-polarity-orbs pnpm --dir marketing build`).
- Method: raw CDP against `marketing/dist` served on loopback, `/apps/showcase-polarity-orbs/?manual=1`, focus
  emulation on, no reduced-motion emulation, device scale factor 1; the same hook sequence as
  `tests/browser/polarity-orbs.spec.ts` (seed `20261124`, `runAutopilot(60/180/600)`, mistake rows
  `[0..5]` for results). The card is the 1440×900 frame after 540 autopilot steps; `card.jpg` and the
  `.webp` previews are Lanczos downscales/encodes of it (python3 + PIL). No console errors or warnings.
- These frames supersede the software-WebGL2 caveat above for the screens and previews only; the
  claim label is unchanged.
