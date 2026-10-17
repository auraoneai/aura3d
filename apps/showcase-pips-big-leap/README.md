# Pip's Big Leap — 3D Mascot Platformer

A playable mascot platformer for the Aura3D showcase. Pip — an acorn-helmeted
Kenney Oobi hero — leaps through the Whispering Vale gathering **sun-seeds**,
activating checkpoints, dodging hazards, and opening each world's **Sun-Gate**.

## Run

```bash
pnpm install
pnpm --filter @aura3d/showcase-pips-big-leap exec vite   # or the monorepo app host
```

Route: `/apps/showcase-pips-big-leap/` — mounts into `#app` via `createGame`.

## Play

| Input | Move |
| --- | --- |
| WASD / Arrows | Camera-relative movement (camera trails Pip) |
| Space | Jump — variable height, coyote time, jump buffer |
| Space (again, mid-air) | Double jump *(unlocks in World 2)* |
| Space (held while falling) | Glide cape — always available |
| Shift (air) | Dive lunge |
| C / Ctrl (air) | Ground pound |
| Esc | Pause |

Touch: `dpad-2btn` preset — dpad moves, A jumps, B dives/pounds.

## Shell modes

- **Quick Play** — drop into the current venue world.
- **Jump Academy** — Headmaster Sprig's skill gauntlet (movers, timed pads,
  springs, a glide gap).
- **Vale Atlas** — world map with per-world seed counts, completion marks and
  best trial times; click a card to travel.
- **Player Studio** — recolor Pip's acorn cap and glide cape (persisted).
- **Time Trial** — medal clock per world (gold/silver/bronze) with best-time
  persistence.

## Worlds

Six compact completable courses plus the academy, each with its own
`looks.preset`, six sun-seeds (three on challenge lines), acorn trails, a
heart, three checkpoints, hazards, and a seed-gated Sun-Gate:

1. **Whispering Forest** — mushrooms, forks, a fern glider platform, canopy.
2. **Sunmill Wharf** — docks and rope rafts over a swimmable millpond; grants
   double-jump.
3. **Cloudspan Wharf** — cloud spires, fan lift, drifting + timed puffs, glide
   descent.
4. **Ember Cellar** — lava lake, geyser lift, timed vents, a coolant swim
   pocket.
5. **Hollow Palace** — marble climb to **Brambleback** — a three-hit
   roll → wind-up → vulnerable boss guarding the gate.
6. **Starfall Garden** — low-gravity crystal meadows; floaty apex jumps.

## Architecture

- `src/game/types.ts` — `WorldSpec` course format (platforms, movers, timed
  pads, hazards, springs, waters, pickups, checkpoints, gate, decor,
  backdrops, NPCs, look, tuning flags).
- `src/game/worlds.ts` — seven authored courses.
- `src/game/motion.ts` — derives gravity/jump/speed from each course via
  `solvePlatformerMotion`/`validatePlatformerMotion`.
- `src/game/world.ts` — spec → `AuraSceneBuilder` + collision world
  (`SolidBox`/`HazardBox`/`WaterZone`); runtime nodes for movers, timed pads,
  pickups, checkpoint flags, gate, boss, hero + cap/cape accessories.
- `src/game/player.ts` — kinematic AABB controller: axis-separated resolve,
  step-up, mover carry, `game.jumpAssist` coyote+buffer, variable/double jump,
  dive, pound, glide, swim pockets, hazard knockback + i-frames, respawn.
- `src/game/boss.ts` — Brambleback state machine.
- `src/game/certify.ts` — lowers each world into the engine's public
  platformer-geometry pipeline (`game.assetBoundPlatformerLevel` →
  `game.platformerSceneBinding` → `game.publicPlatformerPresentation` →
  `game.certifyPlatformerGeometry`/`certifyPlatformerPresentation`) plus a
  `game.platformer` kit snapshot — honestly, with the world's real typed
  backdrop hash. `publicReady` is `false` only because retained browser proof
  (screenshot + sha-256) requires a captured run.
- `src/game/hud.ts` — DOM for the shell (HUD chips, boss bar, banners, toasts,
  pause/atlas/studio/complete overlays).
- `src/game/save.ts` — schema-1 localStorage save (seeds, completion, best
  trial times, studio colors, double-jump, academy flag).
- `src/main.ts` — `createGame` wiring: input actions/axes, touch, sfx cues,
  juice, feel preset, shoulder camera, per-frame sim + node mirroring, shell
  modes, and the `window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__` evidence global.

## Evidence

`window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__` reports live: world/mode, player
kinematics + state, seeds/acorns, gate + boss state, camera rig, derived
motion + validation report, moveset flags, and the per-world engine-helper
certification results (scene-bound node counts, geometry/presentation
blockers, platformer-kit snapshot).

## Type check

```bash
pnpm exec tsc -p apps/showcase-pips-big-leap/tsconfig.json --noEmit
```
