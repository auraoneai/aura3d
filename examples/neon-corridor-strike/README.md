# Neon Corridor Strike

Capability label: **`prototype`**

A browser first-person corridor shooter rebuilt single-path on the Aura3D
shared game runtime (`createGame` from `@aura3d/engine/game`, the Blockfall
pilot pattern). There is no `game.fps()` kit: look, locomotion, and hitscan
are decided by the pure, headless rules module in `src/rules.ts` (analytic
ray-vs-target-spheres), and `src/main.ts` renders that state with typed GLB
assets. The former `createAuraApp` orchestrator and its 14-file `src/game/`
tree are deleted; every URL boots `src/main.ts`.

This is not DOOM parity, not a commercial FPS engine, and not a Unity/Unreal
replacement.

## Controls

| Input | Action |
| --- | --- |
| Click canvas | Request pointer lock (the locking click never fires) |
| Mouse | Look — E5 raw `snapshot().pointer.dx/dy` at 0.0024 rad/px; drag-look also works unlocked |
| WASD / arrows | Move (yaw-relative, clamped to the corridor) |
| Shift | Sprint |
| LMB (locked) or J / F | Fire pulse rifle (hitscan, 12-round mag, auto-reload) |
| R | Reset run |
| Esc | Release pointer lock (browser) |

## Objective

Drop all five hovering sentry drones down the corridor (two hits each).
Clearing the last sentry wins the run; R always restores the baseline.

## Typed assets

Fresh coherent CC0 set in `aura.assets.json` / `src/aura-assets.ts`
(~131 KB total, replacing the trashed ~55 MB mixed-generation set):

- `quaterniusWallModular` — corridor wall panels (Quaternius, CC0)
- `quaterniusCubeCrate` — lane cover crates (Quaternius, CC0)
- `kenneyCraftMiner` — sentry drone targets (Kenney Space Kit, CC0-1.0)

The pulse-rifle viewmodel, muzzle flash, and hit spark are emissive
primitive nodes posed per frame; no coherent CC0 rifle GLB is admitted in
the repo yet, so no viewmodel asset is claimed.

## What is real vs prototype

Real: pointer-lock request + raw-pixel mouse-look, WASD locomotion, LMB/J
hitscan with per-target HP, hit feedback (spark node, target pulse,
hitmarker, sfx-pack cues, juice), kill-all win, R reset, crosshair +
arcade-neon HUD widgets, and `window.__aura3dGameSnapshot` evidence with
only measured values (player pose, shots/hits/kills, lock counters).

Prototype limits: kinematic player with corridor-bounds clamping (no
physics body, crates are visual cover outside the walk lane), static
hovering targets with no skeletal animation or return fire (no HP/lose
state), straight corridor so hitscan needs no wall-occlusion test, and a
primitive viewmodel. Pointer-lock *engagement* in headless runners is
unverified; the playable spec asserts the request counter and drives look
and fire through the lock-independent paths.

## Verify

App-local specs (vite dev server on port 4173):

```bash
npm run dev
npx playwright test tests/playable.spec.ts tests/route-health.spec.ts --workers=1
```

Headless rules sim from the repo root:

```bash
vitest run tests/unit/apps/neon-corridor-rules.test.ts
```

The monorepo smoke spec `tests/browser/neon-corridor-strike.spec.ts` boots
this app's vite server and asserts framed boot, lock request, and fire.
The examples-gallery poster (`thumbnail.webp`) was retired with the trash
and awaits a lane recapture of the rebuilt corridor.
