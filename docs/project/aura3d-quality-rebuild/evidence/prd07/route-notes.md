# PRD-07 route notes — replacement guidance for PRD 14

One section per game route. Every note names the legacy construct (with an
anchor) and the prd07 replacement behind `A3D_QR_VFX` (+ `_SKY` / `_FOG` /
`_VOLUMETRIC` / `_DECALS` where applicable). PRD 14 is the only writer of
`apps/showcase-*`; this lane ships the codemod and these notes, not the edits.

Codemod: `aura3d codemod vfx-pools-to-effects <glob>` reports E25 pooled-
primitive sites and rewrites the simple patterns (`effects.spawnLoop` →
`effects.spawn`; `primitives.box/sphere + .runtime` → `app.effects.burst`,
marked approximate — pool bookkeeping moves to the burst handle).

## showcase-blockfall-reactor

- `src/clear-fx.ts:15,46-60` — 48 pooled `primitives.box` shards with a runtime
  tag, hidden at scale 0.001, re-driven per frame through `handle.setScale(life)`
  (`:167`). E25.
  → `app.effects.burst("explosion-small", rowOrigin, { count })` per cleared
    row + `ring` for quad clears; drop the pool + `hideShard` + per-frame scale
    drive. Burst `stop()` replaces `SHARD_LIFETIME` bookkeeping.
- Codemod rewrites the pool chain (fixture-verified at
  `tests/qr/prd07/fixtures/clear-fx.ts`).

## showcase-turbo-drift-circuit

- `src/main.ts:2612-2640` — `driftParticleCloud`, an `effects.particles` node
  fed by the live slip/asphalt predicate.
  → keep the node; under the flag it lowers to a lit `smoke`-style emitter —
    set emission ∝ slip via `rate`. No route edit needed for pixels (S15).
- `src/main.ts:5025-5060` — skid ribbons drawn as box nodes behind the rear
  axle, length/width ∝ `driftAmount`.
  → `effects.trail({ orientation: "surface", surfaceNormal: [0,1,0] })` per
    rear wheel; the prd07 decal path draws them with polygon offset (no
    z-fighting at speed).

## showcase-skyline-runner

- `src/main.ts:1122-1140` — `planSkyBackdrop` flat-band sky (E32, file owned
  by PRD 10).
  → `sky.gradient` (band look, last-visible-wins) or `sky.preetham` for a
    physical sky; the bands are a backdrop, not an atmosphere input.
- `src/main.ts:1375-1390, 2229-2238, 3864` — five act fog nodes toggled through
  runtime handles; the renderer always used act 0 (E43).
  → works unchanged under `A3D_QR_VFX_FOG`: `LiveAtmosphere` is
    last-visible-wins, so `applySkylineActPaletteVisibility` switching the
    visible act fog now actually switches the fog.
- Snow level → add `weather.snow` (flag `A3D_QR_VFX_WEATHER`… routed through
  the atmosphere API) rather than a sprite pool.

## showcase-deep-recovery

- `src/main.ts:280-285` — the only `effects.volumetricFog` user (E41: CPU
  radial blur, ~0.5 fps).
  → `effects.fog({ mode: "absorption", color, density })` for the water body,
    plus `effects.volumetricFog` → froxel path on High+ (analytic on
    Medium/Low), plus a marine-snow procedural volume (3,000 motes High / 800
    Low, PRD 14 §8.3). Runtime transitions stay supported (`setFog`).

## showcase-patrol-wing

- `src/sky.ts:449-458` — box-slab sky bands; sun is an emissive sphere at
  (-29, 21, -58) (E35).
  → `sky.preetham` with a matching sun direction; keep the emissive sphere
    only as a gameplay beacon if wanted.
- `src/main.ts:592,820,1436` — `orbTrailHandles` (8 hidden trail nodes driven
  per frame). E25.
  → `effects.trail({ path, width })`; the ribbon pass owns history now.

## showcase-rooftop-buckets

- `src/environment.ts:21-56` — box-slab sky bands (E35).
  → `sky.preetham` / `sky.gradient`.
- Contact bursts (E25) → `app.effects.burst("explosion-small", point)`.

## showcase-pulse-tunnel

- `src/main.ts:1737-2000` — route-local particle pool + trails (E25).
  → `app.effects.burst` for sparks, `effects.trail` for streaks; both draw
    under `A3D_QR_VFX` with no pool bookkeeping.

## showcase-neon-swarm

- `src/combat-feel.ts` (150 LOC spark pool, E25: "third instanced pool of
  small spheres driven by the spark list").
  → `app.effects.burst("spark", pos, { count })` per hit; or `game.effects`
    (auto-mounted under the flag — see §6.2 game-effects automount).
- `main.ts` — `game.effects` users spawn but never mount (E24).
  → automount handles it; no route edit.

## showcase-mech-hangar

- `src/arena/feel.ts` (307 LOC pooled feel layer, E25).
  → `app.effects.burst` for impacts/flashes; `effects.trail` for blade
    streaks. Largest single E25 deletion when migrated.

## apps/aura-clash-showcase

- `src/rendering/HitSparkVfx.ts` + `src/playable/AuraClashArenaApp.ts:3570-3700`
  — pooled hit sparks (E25).
  → `app.effects.burst("spark", …)` / `game.effects` `hit-spark` kind.

## showcase-gravity-post

- `src/main.ts:2065` — `syncSparks` pooled spark sync (E25).
  → `app.effects.burst("spark", …)` per sync tick.

## showcase-siege-golf

- `src/main.ts:210` — `trailPuffs` pooled trail puffs (E25).
  → `effects.trail` or `app.effects.burst` for puffs at rest.

## showcase-courier-rush

- `game.effects` spawns and updates but never mounts nodes (E24).
  → automount under `A3D_QR_VFX` covers it; no route edit.

## Flags

| Route need | Flag |
|---|---|
| Particles/trails/bursts/mesh | `A3D_QR_VFX` |
| Preetham/gradient/HDRI sky | `A3D_QR_VFX_SKY` |
| Fog (last-visible-wins, analytic τ, mode 6 parity) | `A3D_QR_VFX_FOG` |
| Froxel volumetrics / weather volumes | `A3D_QR_VFX_VOLUMETRIC` |
| Decals + surface-orientation trails | `A3D_QR_VFX_DECALS` |

Half-res particle path (P6-T4) is available per batch via `lowRes: true` —
off by default, auto-engages when measured particle GPU ms exceeds the tier
budget (`PARTICLE_GPU_BUDGET_MS`: low 8 / medium 6 / high 4 / ultra 3 ms).
