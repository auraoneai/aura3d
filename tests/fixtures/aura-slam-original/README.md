# Aura Slam: original scripts (test oracle only)

These ten hand-written UMD scripts and the original Aura3D renderer adapter are the **oracle data** the native Aura Slam (`examples/aura-slam`) is checked against: differential tests load them as data in Node and compare the typed TypeScript port bit for bit (see `tests/unit/aura-slam/` and `docs/aura-slam/ARCHITECTURE.md`).

They are **not shipped**: the live route `/apps/showcase-top-tennis/` now serves the native game, and nothing under `apps/` or `public/` includes these files. They were copied unchanged from `apps/showcase-top-tennis/public/toptennis/` and `apps/showcase-top-tennis/src/main.ts` at commit `655a8e67c` (release 4.1.2).

The original `game.js` is also retained as a text fixture for the QA-hook shape comparison; tests do not ship or execute it as the live game.

Not kept: the original game's menu, tour, tournament, online, PWA and analytics scripts, its HTML and CSS, and its 1.7 MB tour bundle (Phase 2 of the conversion; recoverable from tag `v4.1.2`).
