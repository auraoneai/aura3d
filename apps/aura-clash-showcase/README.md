# Aura Clash

Aura Clash Arena is a playable Aura3D fighting showcase proving browser-runtime mechanics with two current, textured, animated Quaternius GLB fighters, input, animation state, combat evidence, screenshots, and deployment checks.

The route uses production-runtime render resources with the advanced-runtime
`A3DRenderer`; it does not make a root `createAuraApp` capability claim or a
current flagship-quality claim.

## Routes

- Promoted route path from the 2026-07-23 release snapshot: `/showcase/aura-clash/`
- `/playable/` launches the playable fighting route with HUD, combat controls, typed GLB scene composition, AI pressure, timer, result states, GitHub link, and npm link.
- `/evidence/` shows developer proof for typed assets, Quaternius provenance, route coverage, controls, animation states, and acceptance gates.
- `/accessibility/` exposes reduced motion, reduced flash, and high contrast controls.
- `/deploy-check/` documents the route and asset readiness checks needed before public promotion.
- `/poster/` defines screenshot and Open Graph capture scenarios.

## Aura3D package surfaces

Aura Clash uses normal TypeScript and includes root `@aura3d/engine` APIs, but
the complete app also imports scoped advanced-runtime, production-runtime,
rendering, scene, and animation package surfaces:

```ts
import { camera, createAuraApp, effects, lights, model, scene } from "@aura3d/engine";
import { assets } from "./src/aura-assets";

const fightScene = scene()
  .add(model(assets.arenaNeonDowntownTextured))
  .add(model(assets.auraClashPlayerRig))
  .add(model(assets.auraClashRivalRig))
  .add(lights.ambient({ color: "#8ee7bd", intensity: 0.36 }))
  .add(camera.perspective({ fov: 42, position: [0, 2.35, 7.4] }));

createAuraApp("#aura-stage", { scene: fightScene });
```

Runtime code must use generated typed assets from `src/aura-assets.ts`. Do not use raw string asset IDs in the safe API.

## Asset pipeline

- Source downloads live outside runtime in `downloads/` and selected extracted assets are staged under `assets/quaternius-source/selected/`.
- Source GLBs are generated into `assets/source/`.
- Public registered assets are generated into `public/aura-assets/`.
- Provenance is tracked in `assets/quaternius-asset-provenance.json`.
- Typed assets are generated in `src/aura-assets.ts`.

Useful scripts:

```bash
npm run assets:stage
npm run assets:build
npm run assets:register
npm run assets:provenance
npm run assets:check
npm run routes:check
```

## Controls

- `A` / `D`: move
- `Space`: jump
- `Shift`: dash
- `Q`: guard
- `J`: light attack
- `K`: heavy attack
- `L`: Aura Burst special
- `R`: restart round
- `P`: pause or resume round
- `[` / `]`: scrub the training exchange replay (training/debug routes only)

## Capability incorporations (02-Aura-Clash-Arena)

Implemented per `CurrentGames-PRD/02-Aura-Clash-Arena.md`. Label stays
`production-runtime` / `development showcase` — never "flagship", no kit claims.
The `@aura3d/engine/production-runtime` imports remain allowed on this app only.
Frame data in `src/playable/combat/auraClashMoveData.ts` stayed byte-identical;
all proof-object additions are optional fields.

- **AC-A1 · Clip-event presentation bridge** — authored `sfx` / `vfx` /
  `camera.impulse` metadata (`src/playable/animation/auraClashClipMaps.ts`) is
  sampled at exact clip frames by `src/playable/combat/clipEventBridge.ts` and
  delivered through an `onEvent` subscription. Presentation only; the `hitbox`
  lane stays the sole combat authority. Unit:
  `tests/unit/apps/clash-clip-events.test.ts`; audio spec asserts the swing cue
  fires from the event, not a timer.
- **AC-A2 · Training exchange replay** — `src/playable/training/ExchangeReplay.ts`
  records the last 6 s of mirrored engine state; `[` / `]` scrub it on
  training/debug routes and live input snaps back. Hidden on the public playable
  path. Unit: `tests/unit/apps/clash-exchange-replay.test.ts` (identical HP
  timeline round-trip); smoke spec covers visibility gating.
- **AC-A3 · Instanced rooftop crowd** — `src/playable/arena/CrowdInstances.ts`
  renders every fan silhouette as ONE instanced draw item
  (`InstancedUnlitMaterial` + `instanceTransforms`) with deterministic per-fan
  bob and a synchronized cheer bounce on heavy/special connects. Never enters
  the fighter lane; frozen under reduced motion.
- **AC-A4 · Round ceremony text3D** — `src/playable/arena/RoundCeremony.ts`
  renders ROUND n / K.O. / WIN / DRAW as extruded glyph meshes
  (`createAuraText3DGeometry`); complements the DOM HUD, never replaces it.
  Screenshot spec captures round-intro and KO stills.
- **AC-A5 · Spring-joint neon signs** — `src/playable/arena/SpringJointSigns.ts`
  hangs two signs outside the lane on deterministic damped springs that react to
  slams and settle to the same rest state every run. Reduced motion keeps them
  rendered but static.
- **AC-A6 · Audio bus separation** — cues are split across `music` / `sfx` /
  `voice` / `ui` buses with independent levels
  (`src/playable/audio/auraClashAudioManifest.ts`); a round-over KO duck drops
  the sfx bus for 1.3 s and restores it. Bus levels and duck state publish on
  the audio proof.
- **AC-A7 · Formal rival roles** — three seeded `createCombatAi` presets
  (rushdown 0.8 / balanced 0.55 / keep-away 0.35) in
  `src/playable/combat/clashAiRoles.ts` gate strike appetite behind the existing
  role system. Deterministic for replay tests. Unit:
  `tests/unit/apps/clash-ai-roles.test.ts`.

The AC-01 audit note lives at `docs/ac-01-ai-and-event-audit.md`.

## Human visual review

Automated evidence is green locally, but per repo policy the exact final
artifacts require independent human review before any promotion claim
(`window.__AURA_CLASH_VISUAL_REVIEW__.humanApprovalRequired` stays `true`).

## Current completion boundary

The game architecture, current typed fighters, source-archive provenance, evidence surfaces, route metadata, readiness checks, combat systems, mounted browser gameplay proof, and local visual-regression proof are implemented. Public promotion still requires approval of the exact final screenshots and verification of the deployed production URL; local evidence is not a deployment claim.
