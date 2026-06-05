# Game Runtime Release Contract

Version: 1.0.5
Status: Maintained runtime contract
Replaces: `Aura3D104GameRuntimePRD.md`

This document records the durable game-runtime requirements that came from the 1.0.4 planning work and now serve as the 1.0.5 runtime baseline.

## Objective

Aura3D must support browser game routes without forcing agents or app authors to hand-roll Three.js render loops, raw GLB loaders, mutable scene registries, input systems, kinematic physics, hitbox systems, HUD wiring, or evidence plumbing.

The public path is:

```ts
import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.fighter).runtime(game.runtimeNode("player")))
    .add(lights.studio())
});

const player = app.nodes.require("player");

app.onFrame(({ dt }) => {
  player.translate(dt, 0, 0);
});
```

## Public Runtime Systems

The runtime contract includes:

- `createAuraApp(...)` returning an app handle.
- `app.onFrame(...)`, `app.offFrame(...)`, `app.pause()`, `app.resume()`, `app.step(dt)`, and `app.dispose()`.
- `.runtime(game.runtimeNode("id"))` on nodes that gameplay code must mutate.
- `app.nodes.require("id")` runtime node handles.
- Runtime transform, visibility, material override, effect attachment, animation metadata, and snapshots.
- `game.input(...)` and app-owned input for keyboard, pointer, touch, gamepad snapshots, buffering, combos, and replay.
- Kinematic bodies with gravity, jump, dash, grounding, bounds, knockback, friction, and debug geometry.
- Colliders, hitboxes, hurtboxes, pushboxes, guardboxes, triggers, hit stop, stun, recovery, and combat events.
- Animation controller support for named clips, restart, crossfade, layers, events, diagnostics, and deterministic snapshots.
- Runtime effects for hit sparks, block sparks, dash trails, slash trails, shockwaves, aura bursts, and reduced-motion/reduced-flash modes.
- Camera director support for target framing, side-fighter mode, bounds, smoothing, impact shake, and reduced-motion mode.
- HUD and accessibility helpers for health, meter, timer, combo, round state, debug toggles, labels, reduced motion, reduced flash, high contrast, and pause controls.
- Evidence APIs proving active runtime systems.

## Required CLI Asset Flow

Game routes must use typed assets:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
npx @aura3d/cli@latest assets inspect ./assets/fighter.glb --animation --humanoid --skeleton --morphs --license
npx @aura3d/cli@latest assets validate-game --output artifacts/aura3d/game-assets.json
```

Release blockers:

- The CLI must be published and runnable with `npx @aura3d/cli@latest`.
- `@aura3d/asset-index` must be published before `@aura3d/cli`, because catalog search depends on it.
- Catalog search must return machine-readable candidates from outside the monorepo.
- Resolve/add must write typed asset metadata, source/license evidence, and animation readiness data.

## Runtime Evidence

A game route is not release-ready from source code alone. It needs evidence that:

- the app mounted once and did not recreate the scene every frame;
- the frame loop advances;
- typed runtime nodes exist;
- input changes state;
- runtime nodes move;
- kinematic bodies update;
- collisions resolve;
- hitboxes/hurtboxes produce events;
- animation state changes;
- effects/camera/HUD respond to combat events;
- accessibility and pause controls work;
- screenshots are nonblank and visually readable.

## Release Commands

The runtime release gate should include:

```bash
pnpm typecheck
pnpm build
pnpm game-runtime:unit
pnpm game-runtime:browser
pnpm game-runtime:template
pnpm game-runtime:docs
pnpm game-runtime:package
pnpm game-runtime:release
pnpm verify:package-install-smoke:fresh
```

If command names change, the release report must still cover the same evidence classes.

## Current Status

1.0.5 audit status:

- Root `pnpm typecheck` passed.
- Root `pnpm build` passed.
- `pnpm aura3d105:release` passed.
- Root package install smoke passed for `@aura3d/engine@1.0.5`.
- CLI catalog search works from a packed local tarball when `@aura3d/asset-index` is installed alongside it.

Remaining release blockers:

- npm registry still points `@aura3d/engine@latest` at `1.0.3`.
- `@aura3d/cli` is not published.
- `create-aura3d` is not published.
- npm auth is not available in the current shell.
- Release artifact manifest must be regenerated for the 1.0.5 tarball.
- Aura Clash asset validation is polluted by old failed registered assets and needs a shipping-asset profile or manifest cleanup.

## Definition Of Done

The runtime contract is ship-ready when an external developer can:

```bash
npx create-aura3d@latest aura-fighter --template fighting-game
cd aura-fighter
npm install
npm run build
npm run test
```

And the generated app visibly proves:

- two typed GLB/runtime characters or documented validated placeholders;
- real keyboard and touch input;
- movement, jump, dash, guard, light, heavy, and special;
- hit detection with damage, hit stop, stun, knockback, and HUD update;
- animation state change or visible skeletal clip playback;
- hit sparks/trails/camera response with reduced-motion fallback;
- nonblocking stage with visible depth;
- evidence panel proving Aura3D owns the claimed runtime systems.

