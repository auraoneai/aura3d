# Aurora Lander

Status: prototype-blocked — machine-verified three-site landing campaign, pending independent exact-artifact review

Claim label: `prototype` · renderer path: `createAuraApp` root safe API

Primary typed assets: `assets.auroraLanderProbe` (lander hero), `assets.auroraPadBeacon` (pad beacon props). Both are original in-repo synthesized GLBs (`scripts/build-models.mjs`, CC0, author "Aura3D synthesis") registered through the asset CLI; all ten audio cues are original synthesized WAVs (`scripts/build-sfx.mjs`) registered the same way. No raw URLs, no invented ids.

## What this route is

An aurora-lit expedition lander across three sites of increasing hostility: Wide Valley teaches vertical-speed control, Canyon Shelf adds lateral displacement and telegraphed gusts, and Ridgeline combines the narrowest pad, shortest fuel budget, strongest gusts, and 0.62 whiteout density. The probe starts 72 m above each pad. Players manage authored thrust, attitude, lateral drift, fuel, and persistent campaign hull while following an eight-second bounded current-control landing estimate.

Touchdowns below 2 m/s vertical speed are soft; contacts from 2 m/s up to (but not including) 4 m/s are hard and remove 30 hull; contacts at 4 m/s or faster crash. The probe must also remain within 12° of the pad normal and inside the ringed sensor zone. A valid landing banks base points × fuel bonus × site multiplier. Clearing all three sites produces the renderer-owned extraction tableau; a crash ends the run, while `R`/`Space` performs a full campaign reset.

## Engine firsts proven here (root safe API only)

- **Static heightfield contact evidence** — the seeded value-noise terrain grid is registered as a real static heightfield collider through `game.collisionWorld` (Rapier). A route-owned lander contact proxy witnesses genuine solver contacts against that heightfield; the route cross-checks the contact against its pad/surface query before grading. Rapier owns only static contact detection here, not the probe's motion.
- **BVH `createMeshSurfaceQuery` terrain reads** — altitude above ground, slope warnings, the bounded prediction, and the contact cross-check ask the triangles every frame (60 queries/s in the retained canonical contact artifact). The same grid drives the visible mesh, static collider, and query.
- **`game.inputReplay` export/import as a player-facing feature** — every attempt records its control stream; the best graded run is stored per site and replayed on the next attempt as a translucent, visual-only ghost through `game.importReplay` + `game.inputReplayDriver`. Toggle with `G`. `tests/unit/apps/aurora-lander-ghost.test.ts` proves a hash-identical round trip.

## Controls

| Input | Action |
|---|---|
| `W` / `↑` | Main thrust |
| `A` / `D` | Rotate (RCS puffs) |
| `Space` / `R` | Quick-restart site |
| `G` | Ghost overlay |
| `P` | Pause |

Touch: left vertical slider = thrust, RCS buttons for rotate; Ghost/Pause/Restart buttons mirror the keys.

## Boundary (read before quoting this route)

- **Terrain is static-only.** Heightfield colliders are static by design; there is no deformable terrain, no orbital mechanics, no fuel transfer, no day cycle and no multiple ships.
- **Dynamics are authored arcade values, not physical simulation.** Gravity (-1.7 authored units/s²), thrust (4.4 authored units/s²), rotation, gust response, fuel burn, hull, and prediction are route-local values integrated by a fixed-step deterministic model. Rapier provides static-terrain contact detection; the authored integrator owns probe motion. No physical-simulation or orbital-mechanics parity is claimed.
- **Prediction is deliberately bounded.** It advances the same authored model for at most eight seconds using the current control state. It is an estimate, not a promised touchdown point.
- **Whiteout remains renderer-owned.** Up to 45 scene nodes communicate snow and wind at the accepted maximum density. Reduced motion removes camera impulse while retaining terrain, pad, probe, force/contact feedback, and weather truth.
- **The ghost mesh is visual-only.** It never collides and never affects grading or scoring.
- DOM HUD elements are UI and accessibility surfaces only. World claims are backed by Aura3D-rendered pixels plus runtime telemetry in `window.__AURA3D_SHOWCASE_AURORA_LANDER__` and `window.__AURORA_LANDER_EVIDENCE__`.

## Evidence map

| Claim | Proof |
|---|---|
| Grading, scoring, hull, fuel, reset, gust determinism, bounded prediction, and all-site completion | `tests/unit/apps/aurora-lander-touchdown.test.ts` (25 focused unit assertions with the ghost suite) |
| Ghost export/import round-trip (hash-identical) | `tests/unit/apps/aurora-lander-ghost.test.ts` |
| Full three-site campaign, hard contact/hull, direct Site Three, typed touch input, audio, mobile, and reduced motion | `tests/browser/aurora-lander-campaign.spec.ts`; `tests/reports/aurora-lander-campaign/` |
| Terrain contact + surface-query agreement + pad sensor + soft landing | `tests/browser/aurora-lander-terrain.spec.ts`; `tests/reports/aurora-lander-terrain/contact-evidence.json` |
| Input-to-state changes, fuel, restart, pause freeze, ghost import, and crash | `tests/browser/aurora-lander-playable.spec.ts`; `tests/reports/aurora-lander-playable/` |
| Three-site timing and strongest-whiteout budgets | `performance-report.json` (`pass: true`) |
| Claims, artifact hashes, typed provenance, primitive budget, and promotion blocker | `route-health.json` (`machinePass: true`, `publicShowcase: false`) |
| Typed primary-subject readability and freshness | `tests/reports/showcase-route-primary-probes/showcase-aurora-lander.json` (`pass: true`) |
| Static/build/release deploy/classification/route-primary launch gates | `tests/reports/showcase-library-build-deploy.json` (`routes[id=showcase-aurora-lander].ok: true`) |

Run the narrow suites:

```bash
pnpm exec vitest run tests/unit/apps/aurora-lander-touchdown.test.ts tests/unit/apps/aurora-lander-ghost.test.ts
pnpm exec playwright test tests/browser/aurora-lander-campaign.spec.ts tests/browser/aurora-lander-playable.spec.ts tests/browser/aurora-lander-terrain.spec.ts
pnpm --dir apps/showcase-aurora-lander evidence:performance
pnpm --dir apps/showcase-aurora-lander evidence:route-health
pnpm --dir apps/showcase-aurora-lander build
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-aurora-lander/dist --release --source apps/showcase-aurora-lander/src --asset auroraLanderProbe --asset auroraPadBeacon
```

## Rebuilding generated assets

```bash
node apps/showcase-aurora-lander/scripts/build-models.mjs   # 2 GLB props
node apps/showcase-aurora-lander/scripts/build-sfx.mjs      # 10 WAV cues
node apps/showcase-aurora-lander/scripts/register-sfx.mjs   # CLI registration + type generation
# Re-register the model files with the CLI command documented in build-models.mjs
# whenever their bytes change, then regenerate every hash-bound report.
```

Machine evidence is current and passing. Independent human review of the exact hash-bound approach, gust, whiteout, pad-lock/soft/hard/crash, extraction, mobile, and reduced-motion artifacts is requested and pending. Until that external verdict is recorded, the route remains `prototype-blocked`, stays absent from the public showcase card slate, and must not be described as release-approved.
