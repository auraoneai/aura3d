# Shape Shift Sprint — evidence

- **Claim label:** prototype / bounded, playable. No pixel-parity or real-GPU claims; all captures are
  software-GL (remote runner) until a real-GPU pass is recorded.
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
