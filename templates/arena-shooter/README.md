# Aura3D Arena Shooter (template)

Top-down 60° arena shooter on the C-24 `createGame` entry: WASD moves the ship,
Space fires pooled bolt primitives, and a wave spawner lands typed drone GLBs on
a 1.8 s cadence. Drone contact costs one shield (shield 5, 0.8 s invulnerability);
R resets the route.

## Commands

```bash
npm install
npm run dev      # live preview route (exposes window.__AURA3D_ARENA_SHOOTER__)
npm run build
npm test         # route-health + playable + screenshot
```

## How it composes the engine

- `createGame({ id, target, scene })` from `@aura3d/engine/contracts` (C-24) mounts
  the route; `auraGame.ready()` publishes `__AURA3D_ROUTE_READY__`.
- `looks.preset("space")` supplies the space backdrop, key light and grade —
  no ambient/fill or background overrides; the scene adds a gloss deck, emissive
  rim rails, an instanced-sphere starfield (one draw) and the scaled
  `meteor_detailed` GLB as the planet setpiece.
- Typed assets live in `src/aura-assets.ts` + `aura.assets.json`
  (`ship`/`drone`/`planet` — Kenney Space Kit, CC0-1.0, vendored under
  `public/aura-assets/`).
- The camera mounts `camera.rigs.fromSpec(...)` once and is driven per-frame via
  `setPose` at a fixed 60° pitch behind the ship; camera state goes to the C-22
  camera, never into evidence.
- Drones and bolts are fixed pools of runtime nodes mounted at scene-build time
  (models hidden via `visible:false`, bolts parked at `scale:0`) — the wave
  spawner toggles them; nothing mounts nodes at runtime.
- Live proof: `window.__AURA3D_ARENA_SHOOTER__` (status, wave, shield, kills,
  pool occupancy, typed-asset ids/urls, look, camera, event log) plus
  `window.__AURA3D_GAME_SOURCE__` scaffold metadata.

## Physics path (optional)

The default scaffold drives arcade kinematics only. To opt into physical
simulation, install the backend-neutral contract and Rapier adapter:

```bash
npm run enable:physics
```
