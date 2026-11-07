# Beat Hopper — evidence

- **Claim label:** bounded · classification prototype · catalog verification `playable` (SplatSiblings PRD D8).
- **Capture method (Phase B, remote-only):** `tests/browser/beat-hopper.spec.ts` boots
  `/apps/showcase-beat-hopper/?manual=1` on the remote ACR runner (`tools/remote-acr/run.sh`), drives the QA surface
  `window.__AURA_BEAT_HOPPER__` (`stepFrames`, `runAutopilot`, `replay`, `frame`, `pixels`, `routeHealth`) and logs
  JPEG frames. Software-WebGL2 captures are labelled as such; no local Playwright/Docker runs.
- **Phase A (this lane):** app-scoped typecheck, eslint, vitest unit suite (determinism, judgement, meshes, motion
  60/120/144 Hz, HUD contrast, GLSL compile, audio diffs, art direction), vite build, route-health probe,
  `tools/game-checks/run.mjs beat-hopper`.
- WP-8 appends: build SHA, RUN_IDs, viewports (1280×720, 390×844), card sizes, software-GL caveat.