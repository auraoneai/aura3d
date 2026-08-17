# Turbo Drift Circuit — worker brief

**App:** `apps/showcase-turbo-drift-circuit/`
**Route:** `/apps/showcase-turbo-drift-circuit/`
**Class:** `prototype-blocked` arcade racer (`createAuraApp`)

## Keep

- Typed Tsukuba + red Formula player + distinct typed blue/black rival
- Four laps, six ordered gates, Rapier contact, on-asphalt passing
- `createTurboOpponentAi` + `step(dt, playerProgress)` required
- `passing-lane.ts` contracts; opponent `onRoad` is body-on-asphalt
- Chase camera from `resolveChaseFraming` / `game.racingCameraRig`
- Manual throttle / brake / steer / drift; `R` reset
- `window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__` and composition probe
- `race-proof.ts` publishes `provesMountedKitPlayback: false`
- Do not hand-edit `src/generated/game-geometry.ts`

## Current HUD (lab, not a game)

Player-facing in `#panel` (`aria-label="Race controls and evidence"`):

- Brand: `Tsukuba velocity trial` / `Turbo Drift Circuit`
- Metrics: `Speed · km/h`, `Lap`, `Gate`, `Race` (`Ready` | `Racing` | `Finished`)
- Track contract: `Road locked` / `Edge assist` — this is evidence chrome
- Touch: Throttle, Brake, Left, Right, Drift, Reset
- Keys: `W S` drive, `A D` steer, `Space`/`ShiftLeft` drift, `R` reset

No pause. No countdown. Opponent starts on first player input. No result card. No audio.

## Target

### HUD

Player-facing only: speed, lap `2/4`, gate, gap to rival (`+0.42s` / `P1`/`P2`), last/best lap, race status (`Lights` / `Racing` / `Finished`).
Move alignment, offsets, kit telemetry, and “Road locked” / “Edge assist” behind `?debug=1` or a toggle.
Change aside `aria-label` so it is not “controls and evidence”.
Keep existing element IDs that unit tests read, or update `tests/unit/apps/turbo-telemetry-coherence.test.ts` in the same change.
Off-track copy should read `Off track`, not `Edge assist`.

### Feel

- 3-2-1-GO start lights. Input buffered; cars do not move until GO. Jumping the lights is a small time penalty.
- Pause on `P` / `Esc` freezes both cars, AI, and Rapier.
- Reset on `R` restores lights, laps, rival, camera, audio state.
- Drift is a commitment: hold Space/Shift, lose some forward speed, gain yaw, leave marks. Clean hairpin drift → short arcade nitro burst. Not a physics tyre model.
- Drift must read in pixels: keep ribbons; add `game.effects` tyre smoke/dust only while drifting on asphalt. Hide in reduced motion.
- Off-track: grass slowdown, camera nudge, visible “Off track”.
- Finish: camera eases to a 3/4 hero shot; HUD swaps to a result card (time, best lap, position). No debug dump.

### Rival

Stay inside `createTurboOpponentAi` / `createVehicleDriverAi`. Add late-race behavior in that module: defend the inside when the player is close, leave a passing lane when yielded, small speed error after a missed apex. Keep deterministic (seeded or snapshot-driven). Do not break on-asphalt pass proof or `playerOvertookOpponent`.

### Lighting

Keep daylight as default. Author it like late afternoon: warmer key, cooler distant fog, practical start-light glow. Do not fake shadows with dark boxes. Do not claim bloom/SSAO/HDR/WebGPU in copy.

## Tests to run / extend

```bash
pnpm exec vitest run tests/unit/apps/turbo-telemetry-coherence.test.ts
pnpm exec vitest run tests/unit/apps/turbo-sixty-second-race.test.ts
pnpm exec vitest run tests/unit/apps/turbo-passing-lane.test.ts
pnpm --filter @aura3d/showcase-turbo-drift-circuit typecheck
```

Add `tests/unit/apps/turbo-player-feel.test.ts` covering: countdown completes before motion, pause freezes both cars, result card after finish, reset restores lights.

Do not edit `tests/browser/showcase-gameplay-proof.spec.ts` in this wave.

## Do not

- Claim physical tyres, drivetrain, suspension, or motorsport simulation
- Shrink cars or widen the road with a scale hack that fights `gameGeometryContract`
- Replace Tsukuba or the Formula pair
- Set `visualReviewPass: true`
- Import `three` or production-runtime
