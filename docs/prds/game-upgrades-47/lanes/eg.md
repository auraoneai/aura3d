# Lane eg (E-G, WP-7 flags, world, sky, instancing) report

- Branch: `gu47/eg` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eg`)
- Base commit: `f797808be` (`gu47/integration`); `gu47/ec` (finished, head `966e0510d`) merged in at `99f195f33` so E-C handoff 1 could be applied verbatim (no file overlap with this lane).
- Wave: 1 (phase 1, code only; no browsers, no remote runs)
- Contract: PRD lines 253-262; checklist 426-433; owned files PRD §4.1 E-G row (line 323) plus `public/index.ts`, `nodes/instances.ts`, `evidence/game-upgrades-47/flag-promotion/`.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EG-0 predecessor work | - | done | e3f7772ae, d568cbb93 | Reviewed and committed the stopped predecessor's 9 files. Fixed two bugs in it: the baked `world.grass({ heightAt })` grid was drawn by the terrain pass (now a sampling-only record), and its normalized heights put blades off by the grid minimum (now raw metres, `heightScale` 1). |
| EG-1 promotion prep (5 flags) | M | in progress | | |
| EG-2 `A3D_QR_TIERS` post-only mode | M | in progress | | |
| EG-3 builder flags honour app flags | M | done | e3f7772ae, d568cbb93 | `world.useAppFlags(qualityRebuild)` / `setWorldBuilderFlags`; builder reads resolve declared flags, then `?a3d-qr=` (unless `allowUrlFlags:false`), then env. `tests/unit/gu47/eg/world-builder-flags.test.ts`. |
| EG-4 `world` export + heightfield sampler | M | done | e3f7772ae, d568cbb93 | `world` and its types exported from `public/index.ts`; `world.scatter({ heightAt })`, `world.grass({ heightAt, bounds, resolution? })`; scatter result carries `transforms`. `tests/unit/gu47/eg/world-heightfield.test.ts`. |
| EG-5 typed sky stars/clouds | M | in progress | e3f7772ae | resolvers done (StarField/CloudLayer, gradient sky night term and cloud lighting); typed options pending. |
| EG-6 instances wind / custom wind / per-instance lights | M | pending | | |
| EG-7 `instanceColorTarget` | M | pending | | |
| EG-8 tests, receipt specs, bundle delta | M | pending | | |
| H-EC1 E-C handoff 1 | - | done | 1c925de2b | `tests/unit/gu47/eg/post-runtime-hook.test.ts` (3 pass). |

## Decisions

- Unowned files edited because the scope needs them and no lane owns them: `agent-api/world/scatter.ts`, `agent-api/world/terrain.ts` (EG-4), `rendering/src/atmosphere/SkyBackgroundPass.ts`, `rendering/src/atmosphere/sky.glsl.ts` (EG-5).

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|

## Handoffs received

| from | item | status |
|---|---|---|
| E-C 1 | `compiler/postprocess.ts` runtime overrides + canvas | applied (1c925de2b) |

## API as shipped

(see the final version of this section)

## CHANGELOG text for WP-38

(pending)

## Phase-2 plan

(pending)

## Verification

- Base (before edits): `per-renderer-flags.test.ts` fails 1 test on the base `f797808be` too (URL beats options since #1232; the test expects the reverse) — pre-existing.
