# Pip's Big Leap — 3D Mascot Platformer

A playable mascot platformer for the Aura3D showcase. Pip — an acorn-helmeted
sprout hero — leaps through the Whispering Vale gathering **sun-seeds**,
activating checkpoints, dodging hazards, and opening each world's **Sun-Gate**.

## Run

```bash
pnpm install
pnpm --filter @aura3d/showcase-pips-big-leap exec vite   # or the monorepo app host
```

Route: `/apps/showcase-pips-big-leap/` — mounts into `#app` via `createGame`.

## Assets

Hero, boss, and the interactive props are **bespoke Meshy generations**
imported into this app's own catalog (`aura.assets.json` →
`public/aura-assets/`, generated key surface `src/aura-catalog.ts`,
rights/metadata evidence under `aura-evidence/meshy/`):

| Key | Asset | Notes |
| --- | --- | --- |
| `pipsPip` | hero (rigged, `animated.glb`) | clips: Idle, Quick_Walk, RunFast, Regular_Jump, happy_jump_m, Dead, Victory_Cheer |
| `pipsBrambleback` | W5 boss (rigged, `animated.glb`) | clips: Idle, Quick_Walk, Attack, Hit_Reaction, Dead, Chest_Pound_Taunt |
| `pipsSunseed` | sun-seed collectible | replaces the old emissive sphere pickups |
| `pipsGoldenAcorn` | golden acorn collectible | replaces the old capsule pickups |
| `pipsCheckpointFlag` | checkpoint flag | replaces the old pole + box flag |
| `pipsSungate` | Sun-Gate arch | replaces the old pillar/lintel frame (emissive ring + seed-lock kept) |

`src/aura-assets.ts` is the facade the game imports: it exposes the Meshy
catalog plus the shared repo-catalog props and NPC runners it uses. Those
shared entries come from `src/aura-assets.shared.ts`, a generated copy of just
the 25 entries the game needs (`node apps/showcase-pips-big-leap/scripts/sync-shared-assets.mjs`;
`tests/unit/pips-big-leap/shared-assets.test.ts` fails when it drifts from the
root catalog). The page no longer imports the 2.6 MB root `src/aura-assets.ts`.
The `backdrop` world kits are not mounted; `certify.ts` reads only their hash.
Platforms, waters and the glide cape stay procedural.

## Play

| Input | Move |
| --- | --- |
| WASD / Arrows | Camera-relative movement. The camera turns behind Pip while he runs forward; A/D strafe on a steady axis |
| Q / E, mouse drag, right stick | Turn the camera |
| Space | Jump — variable height, coyote time, jump buffer |
| Space (again, mid-air) | Double jump *(unlocks in World 2)* |
| Space (held while falling) | Glide cape — always available |
| Shift (air) | Dive lunge |
| C / Ctrl (air) | Ground pound |
| Esc / P, or the pause button | Pause |

Touch: `dpad-2btn` preset — dpad or left stick moves, A jumps, B dives/pounds,
right stick turns the camera, and the 44 px button at top right pauses.

## Shell modes

- **Quick Play** — drop into the current venue world.
- **Jump Academy** — Headmaster Sprig's skill gauntlet (movers, timed pads,
  springs, a glide gap).
- **Vale Atlas** — world map with per-world seed counts, completion marks and
  best trial times; click a card to travel.
- **Player Studio** — recolor Pip's glide cape (persisted). Pip's GLB has one
  baked material, so there is no separate cap to tint.
- **Time Trial** — medal clock per world with best-time persistence. Gold is
  an expert run plus 20% (`src/game/medals.ts`), silver 1.5x gold, bronze 2x.

The autopilot demo (`?autoplay=1` or the Auto button) plays against an
in-memory copy of the save, so it never writes seeds, clears, best times or
unlocks into the player's progress.

## Worlds

Six compact completable courses plus the academy, each with its own
`looks.preset`, six sun-seeds (three on challenge lines), acorn trails, a
heart, three checkpoints, hazards, and a seed-gated Sun-Gate:

1. **Whispering Forest** — mushrooms, forks, a fern glider platform, canopy.
2. **Sunmill Wharf** — docks and rope rafts over a swimmable millpond; grants
   double-jump (opening any later world first grants it too).
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
  `solvePlatformerMotion`/`validatePlatformerMotion`. The validator gets the
  course edge to edge with real XZ gaps; spring-launched rises and swum gaps
  are judged separately. Where a world's limits differ from the engine
  defaults (double jump from World 2, Starfall's float, the forgiving 13.4 m/s
  jump of Academy and World 1), `motionAllowances` says so and why. Every
  world's report passes.
- `src/game/world.ts` — spec → `AuraSceneBuilder` + collision world
  (`SolidBox`/`HazardBox`/`WaterZone`); runtime nodes for movers, timed pads,
  pickups, checkpoint flags, gate, boss, hero + cape. Pickups,
  checkpoint flags, the Sun-Gate and Brambleback mount the bespoke Meshy GLBs
  via `model()` + `targetHeight`/`targetMaxDimension` auto-fit.
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
- `src/game/gate.ts`, `framing.ts`, `medals.ts`, `simInput.ts` — pure rules
  for the Sun-Gate lock, portrait camera framing, medal times and the per-frame
  input latch (unit tests in `tests/unit/pips-big-leap/`).
- `src/main.ts` — `createGame` wiring: input actions/axes, touch, sfx cues and
  per-world ambient beds, juice, feel preset, shoulder camera, a fixed 60 Hz
  sim (`createFixedStepLoop` with an interpolating presenter), cached node
  handles, shell modes, and the `window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__`
  evidence global (rebuilt at 4 Hz).

## Evidence

`window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__` reports, refreshed 4 times a second: world/mode, player
kinematics + state, seeds/acorns, gate + boss state, camera rig, derived
motion + validation report, moveset flags, and the per-world engine-helper
certification results (scene-bound node counts, geometry/presentation
blockers, platformer-kit snapshot).

## Type check

```bash
pnpm exec tsc -p apps/showcase-pips-big-leap/tsconfig.json --noEmit
```
