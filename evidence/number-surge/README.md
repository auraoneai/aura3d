# Number Surge — evidence

- **Claim label:** prototype / playable (bounded). No pixel-parity or real-GPU performance claims; Phase-B captures run on software GL and must carry that caveat.
- **Capture method (Phase B, remote-only):** one shared `tools/remote-acr/run.sh` context runs `tests/browser/number-surge.spec.ts` against `/apps/showcase-number-surge/?manual=1`; the spec drives `__AURA_NUMBER_SURGE__` (begin, stepFrames, runAutopilot, replay) and logs JPEG frames at 1280×720 and 390×844. No local browsers, Docker or Playwright.
- **Look identity:** neon-arcade dusk — deep indigo five-stop sky, cyan/magenta arithmetic gates, gold score geyser and violet wall-shatter shards (`src/look.ts`, `src/art/direction.ts`).
- **Phase A (local, deterministic):** app typecheck, scoped eslint, `tests/unit/number-surge` (sim determinism, meshes, motion 60/120/144 Hz, HUD contrast, shader compile, audio diff, art direction), vite build, `route-health.json`, `tools/game-checks/run.mjs number-surge`.
- **Phase B (WP-8, remote software WebGL2):**
  - **Build SHA:** `c5fcd10c9` on branch `games/splat-siblings` (Aura3D `5.1.0`).
  - **ACR Run IDs:** `splat-siblings-wp8-5` (ACR build `ch82t`, ACR run `ch82u`) via `tools/remote-acr/run.sh` on `picassostagingacr` (`SHARED-CI-RG`).
  - **Viewports & Artifacts:** `1280×720` (`title-1280.jpg`, `early-1280.jpg`, `action-1280.jpg`, `mid-1280.jpg`, `results-1280.jpg`), `390×844` (`title-390.jpg`, `early-390.jpg`, `action-390.jpg`, `mid-390.jpg`, `results-390.jpg`), and cards `720×450` (`card.jpg`) + `1440×900` (`card@2x.jpg`) under `evidence/number-surge/screens/final/`, plus `public/previews/showcase-index/number-surge.webp` (`+@2x.webp`).
  - **Software-WebGL2 Caveat:** Captured on headless Chromium with SwiftShader (software WebGL2) on the remote ACR runner — not real-GPU evidence.