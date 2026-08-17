# Skyline Runner — worker brief

**App:** `apps/showcase-skyline-runner/`
**Route:** `/apps/showcase-skyline-runner/`
**Class:** `prototype-blocked` five-act platformer (`createAuraApp`)

## Keep

- Five acts / ten districts, authored 95s, finish window 70–115s
- Typed Kenney Oobi hero + typed verdant world + mesh-derived surfaces
- `createSkylineLevel()` is the single level owner
- Move, variable jump, coyote, dash, fall, checkpoint respawn, coins, ember volleys (`J`/`L`), stompable typed robot sentries, finish beacon
- Side-scroller camera readability band (do not zoom the hero into a mascot)
- `window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__` and composition probe including `settleSubjectPose()`
- `level-proof.ts` publishes `provesMountedKitPlayback: false`
- Do not hand-edit `src/generated/game-geometry.ts`
- Do not author new playable rectangles that fight the mesh-derived surface map
- Collision boxes stay smaller than sentry silhouettes (already tuned)

## Current HUD (lab, not a game)

`#panel` `aria-label="Skyline Runner controls and evidence"`:

- Brand: `Verdant relay` / `Skyline Runner`
- Metrics: Distance (`x-value` = `state.player.x`), Score, Coins, Ember, Flow chain, Falls, Relay `NN/6`
- Objective: `{Act title} · {objective} · {Grounded|Airborne}`
- Route contract: `Surface locked`
- Keys: A/D move, W/Up/Space jump, Shift/K dash, J/L ember, R reset
- No pause key

Acts exist in `level-layout.ts`. Lighting/sky is one global dusk palette. `planSkyBackdrop` / `blendSkyBandColor` are already imported — drive them from act.

## Target

### HUD

Player-facing only: score, coins, ember stock, current act title, checkpoint pips, lives/retries.
Hide raw `x`, surface IDs, `Grounded`/`Airborne`, and raw challenge multipliers unless `?debug=1`.
Public layout must no longer show raw `x`. Keep or alias IDs so existing unit tests can be updated in-app unit files.

### Act palettes (scene, not CSS)

| Act | Mood |
| --- | --- |
| Home Grove | warm gold-green |
| Broken Canopy | stormier, less gold |
| Sentry Pass | colder steel |
| Cloudstep Rise | higher, thinner air / cooler lift |
| Aurora Crown | dusk magenta/teal |

Shift sky ramp, key color, fog color/density, practical lights with act. Use existing `blendSkyBandColor` / `planSkyBackdrop`.

### Feel

- Sentries face the player, visible idle, 0.4–0.6s telegraph before intercept. Defeat = hide + `game.effects` burst + score pop (audio later).
- Ember volley: muzzle flash in-scene, travel, impact, one-shot defeat, limited stock. Empty stock has a deny cue path (sound later; visible deny now).
- Collectibles glitter in-scene (emissive / `game.effects` sparkle).
- Summit beacon: if no clean CC0/CC-BY catalog prop, keep primitives but design one silhouette (plinth + mast + emissive core) and light it like a goal.
- Camera: short land dip and dash punch via `game.cameraDirector`. Reduced motion disables shake.
- Checkpoints: brief act title card (DOM UI OK), optional warm light pulse on the relay.
- Optional: one high coin path per act if it does not blow the 70–115s window.
- Death is fast: sting path, respawn at last relay. No long death animation.
- Pause on `P` freezes sim, sentries, challenge clock semantics needed for tests.
- Reset on `R` restores act 1, coins, ember, deaths, sentries.

## Tests to run / extend

```bash
pnpm exec vitest run tests/unit/apps/skyline-sixty-second-level.test.ts
pnpm exec vitest run tests/unit/apps/skyline-platformer-loop.test.ts
pnpm exec vitest run tests/unit/apps/skyline-challenge-feedback.test.ts
pnpm exec vitest run tests/unit/apps/skyline-subject-pose-determinism.test.ts
pnpm --filter @aura3d/showcase-skyline-runner typecheck
```

Add `tests/unit/apps/skyline-player-feel.test.ts` covering: act palette changes with progression, pause freezes sim, public HUD helper no longer exposes raw `x` in the default layout.

Keep `level-proof.ts` green. If polish slows the route, retune spacing in `level.ts` / `level-layout.ts` and re-run the unit proof.

Do not edit `tests/browser/showcase-gameplay-proof.spec.ts` in this wave.

## Do not

- Break the 70–115s completion window
- Use a primitive as the hero or the world
- Import `three` or production-runtime
- Set `visualReviewPass: true`
- Add a second level
