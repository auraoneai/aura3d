# Number Surge — evidence

- **Claim label:** prototype / playable (bounded). No pixel-parity or real-GPU performance claims; Phase-B captures run on software GL and must carry that caveat.
- **Capture method (Phase B, remote-only):** one shared `tools/remote-acr/run.sh` context runs `tests/browser/number-surge.spec.ts` against `/apps/showcase-number-surge/?manual=1`; the spec drives `__AURA_NUMBER_SURGE__` (begin, stepFrames, runAutopilot, replay) and logs JPEG frames at 1280×720 and 390×844. No local browsers, Docker or Playwright.
- **Look identity:** neon-arcade dusk — deep indigo five-stop sky, cyan/magenta arithmetic gates, gold score geyser and violet wall-shatter shards (`src/look.ts`, `src/art/direction.ts`).
- **Phase A (local, deterministic):** app typecheck, scoped eslint, `tests/unit/number-surge` (sim determinism, meshes, motion 60/120/144 Hz, HUD contrast, shader compile, audio diff, art direction), vite build, `route-health.json`, `tools/game-checks/run.mjs number-surge`.
- WP-8 appends: build SHA, RUN_IDs, viewports, software-GL caveat and final screens/cards.