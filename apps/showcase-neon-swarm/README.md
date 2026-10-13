# Neon Swarm

Status: single-path rebuild on the salvaged gameplay core; independent human
visual review pending

Claim label: `prototype`

Primary assets: `neonCourierAvatar`, `neonBarricadeProp`, `neonStreetLampProp`
(catalog-registered typed GLBs, declared app-locally in `aura.assets.json` /
`src/aura-assets.ts`), plus 13 deterministic CC0 synthesized WAV cues (`neonPulseFireSfx`,
`neonDroneHitSfx`, `neonDroneDeathSfx`, `neonPlayerHurtSfx`, `neonDashSfx`,
`neonChargePickupSfx`, `neonWaveStartSfx`, `neonWaveClearSfx`, `neonDeathSfx`,
`neonAmbientHumSfx`, `neonRadialBurstSfx`, `neonGrazeSfx`, `neonComboBreakSfx`).

Neon Swarm is a finite five-wave top-down horde-survival game: a courier crosses
a rain-dark neon street arena, collects risky gold charge pickups, chooses
upgrades between waves, and uses pulse fire, dash invulnerability, grazes, and a
charged radial burst to survive a 320-drone finale.

## Architecture (single code path)

Every URL boots `src/main.ts`; the former legacy/v2 dispatcher is deleted.

- **Salvaged core (unchanged, unit-pinned)** — `src/gameplay/arena.ts` (street
  arena bounds, four obstacles, wave compression insets, deterministic wall and
  obstacle slide resolution), `src/gameplay/swarm.ts` (dual typed-array pools:
  360 grunts + 96 elites, deterministic spatial-hash separation, seek/orbit/flee
  steering, elite telegraph/burst cycle, pulse and radial-burst resolution),
  `src/gameplay/waves.ts` (five authored wave schedules escalating from 36
  opening grunts to 320 live finale drones with deterministic checksums),
  `src/gameplay/player.ts` (movement, aim, pulse fire cadence, dash
  invulnerability, burst meter, grazes, upgrades), `src/gameplay/pickups.ts`
  (once-per-wave spatial gold relay awarding +250 score and +25% burst charge),
  `src/gameplay/run.ts` (`playing` -> `intermission` -> `victory`/`defeat` state
  machine and deterministic FNV-1a terminal hash). The `src/*.ts` files beside
  `main.ts` are 3-line re-export shims imported by unit tests.
- **Scene & `createGame` lifecycle** — `src/main.ts` mounts through `createGame`
  (`qualityRebuild: { flags: ["game"] }`), calls `start()`, applies the
  `neon-arcade` output preset and overhead tactical camera rig
  (`neon-swarm.overhead`), drives `instances.capsule` (capacity 360) and
  `instances.box` (capacity 96) pools directly from the `SwarmPool` typed
  buffers, and binds keyboard/mouse, dual-stick touch, HUD, and `sfx-pack` audio.
- **Controls** — `WASD`/arrows move, mouse aims, `J`/left-click fires pulse,
  `Shift` dashes with invulnerability, `Space`/`K` unleashes radial burst at
  full charge, `1`/`2`/`3` or `Enter` selects intermission upgrades, `P` pauses,
  `R` resets with the next deterministic seed. `?autorun=1` drives autonomous
  orbiting, pickup collection, pulse/burst combat, and intermission upgrades;
  `?scenario=combat|intermission|finale|victory|defeat` selects a starting beat.
- **Evidence** — `window.__aura3dGameSnapshot` and
  `window.__AURA3D_GAME_EVIDENCE__["showcase-neon-swarm"]` publish framed state,
  five-wave progress, player/enemy/pickup state, instanced pool capacities and
  observed counts, applied look, and requested-vs-played audio events.

## Proof

- Headless: `tests/unit/apps/neon-swarm-steering.test.ts` (16 unit tests
  covering deterministic wave schedules, 320-drone finale budget, separation,
  obstacle sliding, arena compression, spatial pickups, upgrades, and terminal
  outcome hashes).
- Browser: `tests/playable.spec.ts` (boot framed, movement/combat/burst,
  intermission upgrade transition, deterministic reset, dual-viewport framing)
  and `tests/route-health.spec.ts`; PRD-14 S-rows via
  `tests/qr/prd14/browser/neon-swarm-dispatch.spec.ts`.

Run locally: `pnpm --filter @aura3d/showcase-neon-swarm dev` (port 4181).
