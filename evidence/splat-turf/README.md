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
- WP-8 appends: build SHA, RUN_IDs, viewports, and the software-GL caveat per capture.