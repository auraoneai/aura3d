# Aura Clash Arena Showcase Build Guide

Version: 1.1.0

Use this guide when editing, reviewing, or documenting the active Aura3D game showcase in `apps/aura-clash-showcase`.

Aura Clash Arena is the current browser-game development showcase for Aura3D. It proves a scoped runtime foundation: typed GLB assets, a public game lifecycle, input, animation state, engine combat evidence, HUD updates, screenshots, deployment checks, and npm/CLI proof.

It is a development showcase built with starter-grade fighter assets, focused on proving the engine's runtime, animation, and combat systems.

## Non-Negotiables

- Read `llms.txt` before authoring Aura3D code.
- Use public imports from `@aura3d/engine`.
- Use one app/runtime owner per route through the current public game-runtime path.
- Use typed assets from `src/aura-assets.ts`; never pass string asset ids, invented GLB URLs, raw loaders, or direct Three.js imports.
- Use the asset catalog profile for fighter prompts:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" --name fighter --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset auraClashPlayerRig --asset auraClashRivalRig --no-placeholders --require-license
```

- If the catalog returns no production-ready candidate, stop and report the rejection reasons. Do not force a static prop, aircraft, spider, unlicensed sculpt, or broken-scale model into a fighter slot.
- Do not use primitives as release-facing fighter art. Primitives are allowed for set dressing, debug modes, and deterministic tests only.
- Hide hitboxes, boxes, line artifacts, and debug rigs in normal play. Debug visuals must be behind an explicit debug/evidence mode.
- Keep public copy scoped to "development showcase" and "runtime proof" until gameplay, asset, art, audio, performance, deployment, and visual approval gates all pass.

## Active App Shape

| Area | Current source |
| --- | --- |
| App bootstrap | `apps/aura-clash-showcase/src/main.ts` |
| Active playable route | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` |
| Active route stylesheet | `apps/aura-clash-showcase/src/playable/playable.css` |
| Typed assets | `apps/aura-clash-showcase/src/aura-assets.ts` and `apps/aura-clash-showcase/aura.assets.json` |
| Fighter definitions | `apps/aura-clash-showcase/src/fighters/` and `apps/aura-clash-showcase/src/data/` |
| Runtime/game helpers | `apps/aura-clash-showcase/src/game/`, `src/state/`, `src/rendering/`, `src/arenas/` |
| Route evidence | `apps/aura-clash-showcase/evidence/` and `apps/aura-clash-showcase/launch-evidence/` |
| Browser tests | `apps/aura-clash-showcase/tests/` |

Legacy numbered attempt directories must remain deleted. Do not recreate attempt-number source directories or proof object names.

## Required Gameplay Surface

Every release-facing route must prove these controls in automated browser tests and runtime evidence:

| Control | Expected behavior |
| --- | --- |
| `A` / Left | Move left inside arena bounds. |
| `D` / Right | Move right inside arena bounds. |
| `S` / Down | Crouch or fast-fall; the visible state must change. |
| `Space` | Jump high enough to read visually; landing should recover. |
| `Shift` | Dash with bounded distance and recovery. |
| `Q` | Guard without pausing or crashing. |
| `J` | Light attack with a distinct visible clip/state/window. |
| `K` | Heavy attack with a distinct visible clip/state/window. |
| `L` | Special attack or explicit no-meter feedback; it must not pause, crash, or lock the route. |
| `P` | Pause/resume. |
| `R` | Reset/rematch; all HP, timer, input, AI, meter, hitboxes, and animation states return to baseline. |

Combat must stop after KO until reset/rematch. Post-KO hitboxes must be inert, and KO animation must not loop as repeated combat.

## Asset Rules

The active release-facing fighters are contextual typed assets:

- `assets.auraClashPlayerRig`
- `assets.auraClashRivalRig`

Release-facing proof must not depend on:

- same-model tinting as the only fighter distinction;
- retired attempt-named catalog proof assets;
- `assets.auraClashTrainingMannequin`;
- string ids;
- raw remote URLs;
- route-local GLB loader code.

When adding an arena prop, texture, music loop, or SFX, register it:

```bash
npx @aura3d/cli@latest assets add ./assets/hit.wav --name auraClashHitSfx --type audio
```

Then import through the generated `assets` object and include it in deployment proof.

## Evidence Contract

Normal proof must include:

- page 200 for `/playable`, `/apps/aura-clash`, and `/showcase/aura-clash/playable/`;
- JS/CSS/GLB/texture/image/audio 200s;
- no console errors or page errors;
- nonblank canvas;
- runtime proof object `window.__AURA_CLASH_ARENA_PROOF__`;
- typed asset names and hashes;
- frame count advancement;
- visible movement and attacks;
- HP changes only through combat collision;
- KO lock and reset recovery;
- screenshots for first frame, action, hit, KO, reset, and mobile.

Current release evidence is rolled up by:

```bash
pnpm --dir apps/aura-clash-showcase test:playable
pnpm --dir apps/aura-clash-showcase test:flagship
pnpm verify:aura-clash-flagship
pnpm verify:aura3d110-performance
pnpm verify:aura3d110-deployed-visual
pnpm aura3d110:readiness
```

Do not mark a route as flagship quality without visual approval. A green smoke test can prove mechanics and still leave art, animation, audio, and game feel below the public bar.

## Copy Boundary

Allowed:

> Aura Clash Arena is a development showcase proving Aura3D browser runtime mechanics with typed GLB assets, input, animation state, combat evidence, screenshots, and deployment checks.

Not allowed:

- "Aura Clash is a polished flagship fighting game."
- "Aura3D is a Unity replacement."
- "Aura3D is an Unreal competitor."
- "Aura3D has Babylon.js parity."
- "The AI prompt catalog always finds production-ready fighters."
