# Q-13-14 — Template spec timing, TDZ boot fix, and wall-clock input waits

**Requester:** Lane 15 (PRD-15, Phase 8 `check:templates` bring-up)
**Owner:** Lane 13 (`packages/create-aura3d/templates/**`)
**Status:** applied (fixes landed on `qr/prd15-40-removal`); this file documents the edits per §6.6

## What was broken

`pnpm check:templates` (source-alias scaffold smoke, all 20 templates) failed on
three distinct, independently real causes:

1. **arena-shooter never booted — TDZ crash.** `createGame({ scene: buildScene })`
   calls `options.scene()` eagerly inside `createGame()` (contract stub
   `contracts/stubs/game.ts:115` and the real `packages/game/src/createGame.ts:91`
   agree: eager is the contract). `buildScene` maps the `drones`/`bolts` pools
   into scene nodes via `.addMany(drones.map(...))` / `.addMany(bolts.map(...))`,
   but both arrays were `const`-declared ~60 lines *below* the `createGame` call —
   `ReferenceError: Cannot access 'drones' before initialization` at module eval.
   Broken since the template was authored (d07f194b3); identical on `main`.

   **Fix:** hoisted `DroneState`/`BoltState` interfaces and the two pool arrays
   above `const auraGame = createGame({` — no logic changes. Verified: the app now
   mounts, runs the wave spawner (HUD showed "2 live / 1 queued"), and publishes
   readiness; canvas screenshots succeed.

2. **`canvas.screenshot()` action timeout too small for software GL.** On
   GPU-less runners (this session's VM and the ubuntu-latest "Skills gate + agent
   docs" lane) headless chromium renders via swiftshader at ~0.2 fps — a single
   composited frame can take 30–90 s. `look-floor.ts` called
   `canvas.screenshot()` with the ~30 s action default and `screenshot.spec.ts`
   capped the whole test at 90 s, so heavy scenes (product-viewer,
   cinematic-scene, character-controller, three-compat-*) timed out mid-capture.

   **Fix (all 20 templates, identical edit):**
   `canvas.screenshot({ timeout: 180_000 })` in `tests/look-floor.ts` and
   `test.setTimeout(300_000)` in `tests/screenshot.spec.ts`. Assertions
   unchanged — the rendered pixels still must satisfy the same checks.

3. **Wall-clock key-tap waits miss frames on slow renderers.**
   `mini-game` (ArrowRight 550 ms hold) and `falling-blocks-starter` (`tapKey` +
   `waitForTimeout(120)`) assumed input lands inside a fixed wall budget. Sim
   time is dt-clamped (≤0.25 s per presented frame), so on swiftshader these
   waits raced or expired.

   **Fix:** press the key, then `waitForFunction` on the published state
   predicate (60 s) instead of a wall-clock settle — mini-game waits for
   `player.x > 0.8` while holding ArrowRight; falling-blocks waits on real
   state transitions (`active.x`, `active.rotation`, `hold`, `lines`) after
   each tap. Same assertions afterward, verbatim.

## Remaining (see Q-13-15)

Subject-bounds recalibration, animation-studio color buckets, and
arena-shooter's post-boot framing are **not** covered here — those need a
lane-13/renderer-lane decision, documented with measurements in Q-13-15.
