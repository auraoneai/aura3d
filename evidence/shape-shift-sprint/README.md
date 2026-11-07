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
- WP-8 appends: build SHA, RUN_IDs, viewports, and the software-GL caveat per capture.
