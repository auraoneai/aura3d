# Siege Golf: Wrecking Green

Status: single-path rebuild on the salvaged gameplay core; independent human
visual review pending

Claim label: `prototype`

Primary assets: `siegeGolfCourseWorld`, `siegeGolfBall`, `siegeWoodenCrate`,
`siegeWoodenBarrel`, `siegePlankSet` (catalog-registered typed GLBs, declared
app-locally in `aura.assets.json` / `src/aura-assets.ts`)

Rigid-body physics as gameplay: launch a weighted range ball at stacked,
jointed destructible structures; knock-down pins must end up resting inside
sensor cup zones. Fewest strokes wins. Nine authored holes escalate the joint
usage: free stacks → fixed gate joints → hinged flip panels → barrels and a
ramp → a spring pad → a hinged pendulum → a crowned tower → staggered double
hinges → a finale mixing every mechanic across two cups.

## Architecture (single code path)

Every URL boots `src/main.ts`; the former legacy/v2 dispatcher is deleted.

- **Salvaged core (unchanged, unit-pinned)** — `src/gameplay/course.ts`
  (9 hole definitions), `structures.ts` (Rapier hole simulation: dynamic
  ball/crates/barrels/planks/pins, hinge/spring/fixed joints, once-per-overlap
  cup sensors, pose hashing), `hole-flow.ts` (aiming → simulating →
  complete/failed, deterministic reset with hash proof), `score.ts` (par,
  stroke limit par+4, stars, round totals), `shot.ts`, `solutions.ts`
  (verified canonical strokes), `replay-proof.ts` (60-second deterministic
  replay). The `src/*.ts` files beside `main.ts` are re-export shims the
  unit suites import through.
- **Kit division** — the public mini-golf kit
  (`games.createMiniGolfState()` oracle + `games.miniGolfPointerShot()`)
  canonicalizes every shot input and launch speed via `shot.ts`; the scene
  never re-derives aim/power math. The kit has no structures or hole flow,
  which is why those modules travel salvaged instead of being rebuilt on a
  kit. No `games.miniGolf*` prefab nodes are used.
- **Scene** — one union scene built once from every hole's `PropVisual`
  descriptors; hole changes re-pose/hide runtime nodes (no scene swaps).
  `createGame` owns mount/lifecycle (`start()` is called), the
  sports-broadcast HUD (score / power meter / objective), aim-drag touch,
  sfx-pack cues and juice. Aim with A/D or arrows, hold Space to charge and
  release to drive, Enter advances, R resets the hole. `?autorun=1` replays
  the canonical solution for each hole through the real input path;
  `?scenario=finale|tower|charged` selects a starting state.
- **Evidence** — `window.__aura3dGameSnapshot` publishes framed state, hole,
  phase, strokes, round score, ball position/resting state, structures
  standing vs toppled, applied look and requested-vs-played audio events.

## Proof

- Headless: `tests/unit/apps/siege-golf-scoring.test.ts` (14),
  `siege-golf-physics.test.ts` (14, full Rapier holes incl. all-nine
  completion via canonical solutions), `siege-golf-replay.test.ts` (5).
- Browser: `tests/playable.spec.ts` (boot framed, charged shot launches and
  rests, hole 1 completes via solution replay, reset, dual-viewport framing)
  and `tests/route-health.spec.ts`; PRD-14 S-rows via
  `tests/qr/prd14/browser/siege-golf-dispatch.spec.ts`.

Run locally: `pnpm --filter @aura3d/showcase-siege-golf dev` (port 5199).
