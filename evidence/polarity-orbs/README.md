# Polarity Orbs — evidence

- Claim label: **prototype**, claimStatus **bounded**, catalog verification **playable** (PRD D8).
- Phase A (local, deterministic): app typecheck, scoped eslint, `tests/unit/polarity-orbs` vitest suite, Vite build,
  `scripts/write-route-health.mjs` → `apps/showcase-polarity-orbs/route-health.json`, `tools/game-checks/run.mjs polarity-orbs`.
- Capture method (Phase B, WP-8): remote runner only (`tools/remote-acr/run.sh`), browser spec
  `tests/browser/polarity-orbs.spec.ts`, JPEG frames via `__AURA_POLARITY_ORBS__.frame()`; final screens at
  1280×720 and 390×844. Any software-WebGL2 captures must be labelled as such; no real-GPU or pixel-parity claims.
- WP-8 appends: build SHA, ACR RUN_IDs, viewports, software-GL caveat.