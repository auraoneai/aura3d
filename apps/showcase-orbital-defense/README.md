# Orbital Defense

Creative arcade defense game sketch for internal Aura3D route experiments.

## Remediation Status

- Classification: blocked; remove from public showcase lists until rebuilt.
- Route health: `apps/showcase-orbital-defense/route-health.json`.
- Asset status: no typed primary assets.
- Primitive status: planet, stations, player, enemies, projectiles, and shields
  are all procedural primitives, including the primary subject.
- Claim status: bounded to an internal primitive-only gameplay sketch. It must
  not be described as a public showcase, public release candidate, or
  asset-backed defense game.

This route uses one mounted Aura app, runtime nodes, deterministic wave state,
keyboard input, HUD state, and route evidence. It intentionally uses procedural
game assets for the first pass instead of invented model URLs, which is why it
is blocked from public showcase promotion under the current PRD.

## Route

```text
/apps/showcase-orbital-defense/
```

## Controls

- `A` / `ArrowLeft`: rotate counter-clockwise
- `D` / `ArrowRight`: rotate clockwise
- `Space`: fire interceptor
- `Q`: emit shield pulse
- `R`: reset deterministic wave
- `P`: pause or resume

## Evidence

The route publishes:

```ts
window.__AURA3D_SHOWCASE_ORBITAL_DEFENSE__
```

The evidence object includes app id, status, frame count, score, wave, planet
integrity, heat, active enemies/projectiles, replay checksum, controls, systems,
and claim boundary.

## Claim Boundary

This is an internal browser-native Aura3D runtime sketch using procedural
assets. It can be used to inspect route-local game-loop, input, mutable
runtime-node, HUD, deterministic wave, and route-evidence behavior. It is not a
public showcase game and is not final commercial game art.
