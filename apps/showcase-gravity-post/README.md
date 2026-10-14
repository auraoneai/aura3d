# Gravity Post

Aura3D single-path showcase route: `apps/showcase-gravity-post/` · `/apps/showcase-gravity-post/`.

Gravity Post is a four-delivery orbital courier shift built on a salvaged, pure-TypeScript gameplay core (`src/gameplay/{wells,pod,contracts,scoring,prediction,stations}.ts`) and a single `createGame` (`@aura3d/engine/game`) scene in `src/main.ts`. Players drag or press `Space` to launch a courier skiff, compare a live `1/120 s` fixed-step trajectory prediction with the flown ribbon, spend a single bounded prograde/retrograde course-correction token when granted, and enter the destination station's Rapier dock sensor (`onTriggerEnter`) below its capture-speed limit.

## Salvaged Gameplay Core

- `src/gameplay/wells.ts` — Fixed-step (`1/120 s`) trajectory integrator (`stepPod`, `integratePath`, `wellAcceleration`, `dockPointHash`) with clamped inverse-distance gravity wells and deterministic solar-escape / planet-strike boundaries.
- `src/gameplay/pod.ts` — Pure pod state machine (`createPodRuntime`, `launch`, `applyCorrection`, `updateCoast`, `evaluateCapture`, `resetPodForContract`) with assist-zone logging (`0.45 × wellRadius`), single correction token enforcement, and overspeed sensor bounce.
- `src/gameplay/contracts.ts` — Four authored contracts (`GP-CON-1` direct dispatch, `GP-CON-2` Verdance single-assist, `GP-CON-3` Sol + Gale chained assist, `GP-CON-4` Rust -> Gale hazard mail) across six stations and six gravity wells.
- `src/gameplay/prediction.ts` — Prediction bead downsampler (`buildPredictionBeads`) and live trajectory divergence verifier (`measurePredictionDivergence`, tolerance `0.02` world units).
- `src/gameplay/scoring.ts` — Contract score breakdown (`scoreContract`: base + propellant + assist + flyby + speed + precision bonuses, minus correction penalty) and 3-hull shift failure limit (`SHIFT_FAIL_LIMIT = 3`).
- `src/gameplay/stations.ts` — Play-plane elevation (`PLAY_PLANE_Y = 0.14`), kinematic pod body spec (`POD_BODY_SPEC`), and station dock sensor specs (`buildStations`).

## Controls

| Input | Action |
| --- | --- |
| Pointer drag or `A`/`D` + `W`/`S` | Aim launch direction and power; yellow prediction beads update live |
| Release drag or `Space` / `Enter` | Launch courier skiff from origin dock |
| `W` / `S` (in flight) | Spend the contract's single prograde/retrograde course-correction token |
| Hold `Space` (in flight) | Bounded `×8` coast time-warp |
| `N` / `Enter` (docked) | Advance to next contract after a successful capture |
| `P` | Pause / resume simulation |
| `R` | Retry current contract or reset campaign |

## Typed Assets (`aura.assets.json` / `src/aura-assets.ts`)

- `assets.gravityPostCourierSkiff` — Courier skiff pod model.
- `assets.gravityPostDockGate` & `assets.gravityPostDockBeacon` — Orbital station gate and beacon models.
- `assets.gravityPlanetMercury`, `assets.gravityPlanetEarth`, `assets.gravityPlanetNeptune`, `assets.gravityPlanetMars`, `assets.gravityPlanetJupiter` — NASA-sourced planet models for Cinder, Verdance, Aquaria, Rust, and Gale.
- `assets.deepSpaceDomeHdr` — Vendored 1k deep-space HDRI environment map.

## Verification

```bash
pnpm --dir apps/showcase-gravity-post typecheck
pnpm vitest run tests/unit/apps/gravity-post-wells.test.ts tests/unit/apps/gravity-post-scoring.test.ts
```
