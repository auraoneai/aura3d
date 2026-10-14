# `@aura3d/showcase-aurora-lander` — Aurora Lander

Precision polar descent showcase built on a single-path `@aura3d/engine` `createGame` runtime (`src/main.ts`) with `qualityRebuild: { flags: ["game"] }`.

## Architecture

- `src/main.ts` — Single-path `createGame` entry driving the Three.js polar terrain, lander vehicle (`auroraLanderProbe`), pad beacons (`auroraPadBeacon`), thruster/RCS/dust FX, HUD widgets, audio cues, and deterministic capture scenarios.
- `src/gameplay/terrain.ts` — Deterministic 1D heightfield with flat landing pads, surface normal, and segment intersection.
- `src/gameplay/lander.ts` — 2D rigid-body lander physics (gravity, main thrust, rotational damping, fuel burn, and wind gusts).
- `src/gameplay/sites.ts` — 3-site campaign progression (Practice Shelf, Crosswind Basin, Needle Ridge) with sinusoidal wind and gust schedules.
- `src/gameplay/touchdown.ts` — 4-metric touchdown grading (`pad`, `verticalSpeed`, `horizontalSpeed`, `tilt`) with `soft`, `hard`, and `crash` outcomes.
- `src/gameplay/prediction.ts` — Ballistic trajectory preview sampling with terrain intersection.
- `src/gameplay/ghost.ts` — Best-run ghost recording, interpolation, and storage serialization.

## Controls

- `W` / `Up` / `Space` — Main thruster
- `A` / `Left` — Rotate counter-clockwise
- `D` / `Right` — Rotate clockwise
- `1` / `2` / `3` — Select site (Practice Shelf / Crosswind Basin / Needle Ridge)
- `N` / `Enter` — Advance to next site after landing
- `R` — Retry current site
- `P` — Pause / resume

## Development

```bash
pnpm --filter @aura3d/showcase-aurora-lander dev
pnpm --filter @aura3d/showcase-aurora-lander typecheck
```
