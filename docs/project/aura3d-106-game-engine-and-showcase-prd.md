# Aura3D 1.0.6 Game Engine And Flagship Showcase PRD

Version: 1.0.6
Date: 2026-06-05
Status: Scoped 1.0.6 release record plus remaining peer-grade roadmap
Baseline: Aura3D 1.0.6 codebase, npm packages, deployed Aura Clash route, and readiness gates
Primary targets:

1. Mature browser game-engine foundation.
2. Flagship-quality showcase game that credibly demonstrates that foundation.

## Executive Summary

Aura3D 1.0.6 materially improved the product beyond the 1.0.5 baseline. The current codebase has a real public runtime surface, typed asset workflow, npm-published CLI/catalog packages, reusable fighting-game helper APIs, animation source/runtime packages, production GLB rendering paths, Playwright smoke tests, and a contextual Aura Clash Arena route that proves browser mechanics: frame loop, input, GLB loading, clip selection, hit resolution, HUD updates, pause, reset, screenshots, deployment evidence, and npm `@latest` CLI/catalog behavior.

That is not the same thing as a mature game engine.

The honest 1.0.6 state is: Aura3D can prove interactive browser runtime mechanics and a scoped game-runtime foundation, but most mature game-engine depth still lives as isolated helpers, source-level contracts, route-specific code, or smoke-test evidence. Aura Clash Arena is a working runtime proof. It is not a flagship-quality fighting game, and it is not sufficient evidence that Aura3D is close to Unity, Unreal, Babylon.js maturity, or a complete game engine.

The scoped 1.0.6 release closes enough of the gap to ship a runtime-foundation release. It does not close the full gap between "the SDK can technically run a browser fighting demo" and "Aura3D has a reusable, tested, documented browser game-engine foundation with a showcase that looks and feels peer-grade." Public claims must therefore stay scoped to "runtime foundation" rather than "mature game engine."

## Audit Basis

This PRD is based on a direct codebase audit of:

- `llms.txt`
- `README.md`
- `package.json`
- `packages/engine/src/agent-api/GameRuntime.ts`
- `packages/engine/src/agent-api/AuraAppHandle.ts`
- `packages/engine/src/agent-api/RuntimeNodeHandle.ts`
- `packages/engine/src/agent-api/game-kits/fighting.ts`
- `packages/engine/src/production-runtime/index.ts`
- `packages/engine/src/advanced-runtime/A3DRenderer.ts`
- `packages/animation/src/*`
- `packages/physics/src/*`
- `packages/rendering/src/production-runtime/*`
- `packages/aura3d-cli/src/cli.ts`
- `packages/create-aura3d/templates/fighting-game/*`
- `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`
- `apps/aura-clash-showcase/tests/playable-smoke.spec.ts`
- `docs/project/aura-clash-showcase.md`
- `docs/project/aura3d-105-release-gates.md`
- `docs/api/game-runtime.md`
- `docs/api/animation-runtime-events.md`

External package smoke checked during this audit:

```bash
npm view @aura3d/engine version
npm view @aura3d/cli version
npm view @aura3d/asset-index version
npm view create-aura3d version
npx -y @aura3d/cli@latest assets search "animated fighter" --profile fighting-character --json
```

Result:

- `@aura3d/engine`, `@aura3d/cli`, `@aura3d/asset-index`, and `create-aura3d` currently resolve to published `1.0.6`.
- Local packed `@aura3d/cli` and `@aura3d/asset-index` tarballs install in a clean npm project and prove the fighting-character profile search/resolve behavior.
- Published `npx @aura3d/cli@latest` exposes the corrected 1.0.6 profile diagnostics and rejects unsuitable static aircraft resolve requests.
- The remaining public-package issue is not packaging. It is product depth: the catalog can reject bad fighters honestly, but it cannot guarantee a production-ready fighter exists for every prompt.

## Product Positioning For 1.0.6

1.0.6 should not claim Unity or Unreal parity.

1.0.6 may claim a scoped browser game-runtime foundation because the release gates now pass.

1.0.6 must not claim flagship showcase quality because important gameplay, audio, art, tooling, and engine-abstraction work remains open.

Allowed claim after successful scoped 1.0.6:

> Aura3D 1.0.6 provides an AI-native TypeScript browser game-runtime foundation with typed assets, production GLB rendering, animation playback evidence, fighting-game systems, asset/catalog validation, Playwright evidence gates, and an Aura Clash development-showcase route that demonstrates real movement, animation, combat, UX, and deployment proof.

Not allowed after 1.0.6 unless additional proof exists:

- "Unity replacement."
- "Unreal competitor."
- "AAA game engine."
- "Full Babylon.js parity."
- "AI prompt CLI always returns production-ready game assets."
- "Aura Clash proves a mature commercial fighting game."

## What Completing This PRD Must Accomplish

Completing this PRD must not mean "we wrote a plan." It must mean the implementation, tests, docs, release gates, and public proof make it impossible to ship the same weak outcome again.

The intended outcome is:

- Aura3D has a reusable public game runtime path, not a showcase-only loop.
- Typed GLB actors can be animated through public engine APIs, not route-specific renderer internals.
- The CLI/catalog flow can search, score, reject, resolve, and validate game assets for a named profile.
- Aura Clash Arena uses two distinct validated fighter assets or fails the release gate.
- Aura Clash Arena has visible, test-proven movement, jump, down/fast-fall, dash, guard, light, heavy, special, hit, KO, reset, and audio states.
- Normal screenshots show a polished arena and intentional VFX, not debug boxes, random lines, placeholder primitives, or repeated KO artifacts.
- A clean external app can use the same 1.0.6 APIs through `npx create-aura3d@latest` and `npx @aura3d/cli@latest`.
- The release cannot publish if local proof, deployed proof, asset proof, visual proof, performance proof, docs, or version alignment fail.

The unacceptable outcome is:

- The PRD is checked off while Aura Clash still uses same-model tinting as flagship proof.
- J/K/L/Q/S/Space/Shift are only HUD state changes or barely visible pose nudges.
- KO loops, repeated hit lines, one/two-hit accidental rounds, silent input failures, or L-key crashes remain.
- The route depends on private Aura Clash renderer glue that no template or external user can reuse.
- The homepage uses a misleading live crop or poster that is better than the actual playable route.
- Docs claim peer-level engine maturity while readiness gates still report placeholder blockers.

If any unacceptable outcome remains, 1.0.6 may still ship as a smaller bugfix/runtime-foundation release, but it must not be marketed as a mature game engine or flagship game release.

## Definitions

### Mature Game Engine Foundation

For 1.0.6, "mature game engine foundation" means Aura3D has reusable, documented, tested browser game systems that a developer can use outside Aura Clash without copying bespoke route code. It includes deterministic runtime stepping, input, animation, rendering, physics/collision, assets, audio hooks, diagnostics, performance budgets, templates, and release evidence.

It does not mean full editor, marketplace, rollback networking, console deployment, visual scripting parity, terrain tooling, cinematic editor parity, or AAA production completeness.

### Flagship-Quality Showcase Game

For 1.0.6, "flagship-quality showcase game" means Aura Clash or its successor looks intentional, controls reliably, shows visible distinct actions, has readable combat, has no debug artifacts in normal play, has distinct characters/assets, includes audio and UX polish, performs within budget, and passes local/deployed automated and visual approval gates.

It does not need to be a commercial fighting game, but it must stop looking like an engineering smoke test.

## Current State Summary

### What Is Real In 1.0.6

- Public packages are published at `1.0.6`.
- Public CLI catalog search works via `npx @aura3d/cli@latest`.
- `createAuraApp`, `app.onFrame`, runtime nodes, snapshots, pause/resume, `app.step`, and evidence APIs exist.
- `game.input`, `game.kinematicBody`, combat/hitbox helpers, HUD helpers, accessibility helpers, fighting-stage presets, and fighting-kit concepts exist.
- Animation packages support source clips, actions, crossfades, events, layers, root-motion metadata, basic skinning palette support, and imported GLB animation runtime paths.
- Production runtime rendering and `A3DRenderer` paths exist for GLB scene rendering and evidence.
- Aura Clash Arena uses a production GLB animation runtime path rather than pure primitives.
- Aura Clash Arena smoke tests verify boot, frame advancement, GLB fighter loading, movement input, attack clip selection, hit resolution, HUD health, pause, and screenshot capture.
- Docs now acknowledge that Aura Clash is a development showcase and not world-class.

### What Is Weak Or Broken

- Aura Clash still depends on bespoke route-specific game code rather than a reusable engine-level fighting-game controller.
- The visible showcase uses two instances of the same typed GLB asset tinted differently, not two authored production fighters.
- Attacks may register but are not visually satisfying enough: move distinction, special behavior, guard readability, jump/down feel, KO state, and hit feedback need work.
- Normal play has shown box/line artifacts and repeated KO/hit behavior during manual review.
- The damage curve can end rounds too quickly, reducing perceived gameplay.
- Audio is absent or not a first-class engine/showcase proof.
- The asset catalog can return technically pullable but artistically irrelevant or unsuitable results.
- CLI search proves discovery, not production asset selection, rig validation, animation suitability, or showcase readiness.
- The fighting-game template is still source-placeholder oriented and declares `sourceOnly` readiness in tests.
- Tests are smoke tests, not deep engine/game-quality gates.
- Performance budgets, long-session stability, memory/resource disposal, mobile controls, visual regression, and deployed parity are under-specified.
- Documentation still risks over-positioning Aura3D as a game engine without enough qualifying evidence.

## Priority Definitions

- P0: Release blocker for 1.0.6. Without this, do not ship the claim.
- P1: Required for a credible 1.0.6 release, but can ship with a documented limitation if P0s pass.
- P2: Important follow-up. Can move to 1.0.7 if documented.
- P3: Strategic future work. Out of scope for 1.0.6.

## Naming And Versioned-File Cleanup Rule

1.0.6 must stop naming product implementation files by attempt number.

The active codebase must not use `v1`, `v2`, `v3`, `v4`, `v5`, `v6`, `v7`, or similar version-attempt names for app architecture, directories, source files, route IDs, CSS files, proof object names, screenshots, typed asset names, public asset filenames, thumbnails, evidence files, or release-facing docs. Version numbers are acceptable only for package versions, changelog entries, and release artifacts.

Reason: version-attempt filenames keep failed implementation history embedded in the product architecture. They make the active route look like an experiment instead of a designed app, and they make it too easy to accidentally import a failed path.

Required naming pattern:

- Use domain names: `playable`, `arena`, `combat`, `fighters`, `animation`, `audio`, `evidence`, `runtime`, `renderer`, `controls`, `assets`.
- Use product names: `AuraClashArenaApp`, `AuraClashMatchRuntime`, `AuraClashFighterController`, `AuraClashArenaStage`.
- Use capability names: `TypedGLBActor`, `GameAppRuntime`, `FightingCombatWorld`, `GameAssetProfiles`.
- Do not use attempt names: `game-v7`, `AuraClashV7App`, `playable-v6`, `__AURA_CLASH_V6_PROOF__`, `v4UAL1Standard`, `v5CatalogRobot`, `v1Roster`.

Required cleanup:

- [x] Rename the active Aura Clash implementation to contextual filenames before release.
- [x] Remove version-attempt proof objects from the active route.
- [x] Delete historical V3/V4/V5/V6 route source files instead of keeping failed attempt archives.
- [x] Update imports so `/playable/` cannot accidentally mount legacy implementations.
- [x] Rename generated screenshots/proof files from `playable-v6-*` to contextual names such as `aura-clash-arena-first-frame.png`.
- [x] Update docs/marketing copy so "V6" is not a public product label.
- [x] Rename active roster source from `v1Roster.ts` to `originalRoster.ts`.
- [x] Remove empty active `src/aura-clash-v2` attempt directory.
- [x] Delete `apps/aura-clash-showcase/archive/` and `apps/aura-clash-showcase/launch-evidence/archive/` failed-attempt copies.
- [x] Replace release-facing typed asset keys and public asset filenames such as `v4UAL1Standard` and `v5CatalogRobot` with contextual names generated through the CLI.
- [x] Extend `verify:versioned-source-names` so it scans typed asset manifests and public asset directories, not only TypeScript/CSS/docs.

## Target 1: Mature Game Engine Gap Analysis

| Area | Current state | Target state | Concrete work items | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| Runtime lifecycle | `AuraAppHandle` supports frame loop, pause/resume, `step`, runtime nodes, screenshot/evidence. Aura Clash Arena still bypasses much of this with a bespoke `A3DRenderer` route loop. | One engine-supported runtime path for interactive apps that handles loop ownership, deterministic stepping, pause, focus, resize, teardown, evidence, and renderer handoff. | Add an engine-level `createGameApp` or equivalent wrapper that composes `createAuraApp`, `A3DRenderer`, input, evidence, and lifecycle. Move Aura Clash loop lifecycle out of route-only code. Add disposal/resize tests. | P0 | A new sample app and Aura Clash both use the same lifecycle API. Tests verify `start`, `pause`, `resume`, `step`, `resize`, `dispose`, no duplicate loops, and no stale input after reset. |
| Scene/runtime node integration | Runtime nodes mutate transforms and metadata. GLB-rendered characters are handled through custom Aura Clash `collectFighterRenderItems`, not the normal safe scene/model API. | Runtime nodes, imported GLB render items, animation state, and evidence share one public integration path. | Add public binding from typed `model(assets.x)` to production GLB render runtime. Expose node-level imported animation/skeleton status without route-specific resource traversal. | P0 | A typed GLB in a normal Aura scene can be animated through public API, rendered through production runtime, and inspected through evidence without custom `collectRenderItems` code. |
| Input system | `game.input` supports actions/axes and auto-listen. Aura Clash has custom control wrappers and key handling. | Engine-level input supports keyboard, touch, gamepad, focus recovery, input buffering, remapping, accessibility, and replay. | Add input buffer API, touch/gamepad smoke tests, focus-loss recovery, remap serialization, replay recording/playback, and visible input diagnostics. | P0 | Playwright verifies keyboard, touch simulation, pause/focus recovery, buffered attack, replay determinism, and remap persistence. |
| Kinematic movement | `KinematicBody` supports gravity, jump, dash, bounds, depth locking, knockback. Showcase tuning is local. | Reusable controller presets for 2.5D platform/fighting movement with jump height, fast-fall/down, dash windows, crouch, air control, landing events, and tuning evidence. | Add `game.characterController2D` or fighting-kit movement preset. Expose tuning constants and tests for jump apex, fast-fall, dash distance, bounds, landing. | P0 | Automated tests prove jump apex exceeds threshold, down/fast-fall changes velocity, dash distance is bounded, collision bounds clamp, and landing event fires once. |
| Collision and combat | `HitboxWorld` supports combatants, hitboxes, guards, health, hitstop, hitstun, blockstun, recovery, pushbox overlap. Aura Clash uses local combat state and simple hit windows. | Engine-level combat world drives the showcase. Hitboxes, hurtboxes, guards, stun, recovery, knockback, KO, and event hooks are reusable. | Replace Aura Clash local hit logic with `HitboxWorld`/fighting-kit combat. Add move definitions, hurtbox visualization debug mode, KO lock, round reset, damage scaling. | P0 | Tests prove light/heavy/special have distinct active windows, cannot multi-hit after KO, guard blocks, health changes only on collision, and reset fully clears combat state. |
| Animation playback | Source-level `AnimationController`, `AnimationMixer`, imported GLB runtime, skinning helpers exist. Aura Clash Arena proves GLB clip playback evidence, but integration is custom and visual quality is weak. | Public animation API plays, restarts, blends, crossfades, masks, dispatches events, applies root motion, and drives production GLB skinning in a reusable way. | Build first-class `model.animation` or `game.animationControllerFor(model)` API. Add clip restart, blend, one-shot, event-to-hitbox, root-motion suppression, and fallback diagnostics. | P0 | Tests visually and programmatically prove idle/walk/jump/guard/light/heavy/special/hit/KO clips change the visible GLB pose, dispatch events at expected frames, and never get stuck in repeat KO loops. |
| Rendering pipeline | Production renderers, WebGL2/WebGPU paths, GLB render resources, postprocess helpers, HDR/fallback docs exist. Aura Clash background mixes renderer items, CSS, and inline SVG. | Game rendering path supports animated GLB actors, shadows/contact shadows, particles/trails, camera effects, fog/skybox, postprocess, resize, and proof in one API. | Add game-scene render preset with stage, camera, lighting, particles, VFX, contact shadow, and debug overlays. Make normal/debug visual layers separable. | P0 | Showcase uses engine-level render preset. Screenshots show no blank canvas, no debug boxes in normal mode, visible shadows/lighting/VFX, and stable resize on desktop/mobile. |
| Asset pipeline and catalog | `npx @aura3d/cli@latest assets search` works. `assets resolve` can pull candidates. Quality is not guaranteed; search results can include irrelevant or non-game-ready assets. | Asset workflow ranks and validates production suitability for target use: humanoid fighter, rigged, animated, bounds-safe, license-safe, material-safe, performance-safe. | Add `assets search --profile fighting-character`, `assets validate-game --profile fighting-character`, ranking signals for humanoid/skeleton/clips/bounds/materials, reject aircraft/static/sculpts for fighter requests, source evidence. | P0 | A fresh external CLI run returns at least two usable fighter candidates or exits with honest "no production-ready candidate" diagnostics. Bad candidates are rejected with reasons. |
| Templates | Fighting template exists and uses runtime APIs, but still allows source placeholders and marks `sourceOnly`. | Fighting template should be a real runnable starter with replaceable typed assets and engine-level systems, not placeholder proof. | Update fighting-game template to 1.0.6 APIs, require typed assets or explicit placeholder mode, add working clip map, hitbox map, asset validation, screenshots. | P1 | `npx create-aura3d@latest my-fighter --template fighting-game` builds and passes smoke tests outside the monorepo with published packages. |
| Audio | No clear engine-level game audio proof in Aura Clash. | Audio assets, SFX playback, music loop, hit/guard/jump/KO cues, mute/reduced-motion controls, and evidence are first-class. | Add `game.audio` helper or document existing audio API. Register typed audio assets. Add route SFX/music with mute and autoplay-safe unlock. | P0 for showcase, P1 for generic API | Tests verify audio assets return 200, mute works, user gesture unlocks audio, and hit/jump/KO events trigger cues without console errors. |
| UI/HUD/accessibility | HUD/accessibility helpers exist. Aura Clash HUD is custom DOM. | Reusable HUD bindings for health, timer, meter, state, input prompts, pause, reset, accessibility toggles. | Add HUD binding examples and tests. Move Aura Clash HUD state derivation to engine-friendly binding model. | P1 | HUD tests verify values always match game state; pause/reduced-motion/mute/touch controls work and survive reset. |
| Tooling/devtools | Evidence objects and debug overlays exist, but engine debugging is fragmented. | In-browser debug panel for runtime, input, animation, physics, collisions, assets, render stats, and errors. | Add `game.debugPanel` or reusable overlay. Include hitbox/hurtbox toggle, animation clip inspector, input trace, draw calls, memory stats. | P1 | Aura Clash debug mode can be toggled without showing debug artifacts in normal play; screenshots for both modes pass. |
| Performance | Smoke tests exist. Some renderer diagnostics exist. No strict game-performance budget for Aura Clash. | FPS/frame-time budgets, draw-call budgets, memory budgets, load-time budgets, asset size budgets, mobile budgets. | Add performance Playwright tests and renderer stats thresholds. Add long-session soak. Add asset size gates. | P0 | Desktop route sustains target frame budget in automated run; no memory leak over 5 minutes; JS/GLB/CSS budgets documented and enforced. |
| Stability/error handling | Route exposes proof errors. Some fallback docs exist. | No silent failures. Structured errors for asset load, animation binding, renderer backend, WebGL/WebGPU unsupported, input focus, and route boot. | Standardize runtime error schema. Add tests for missing GLB, missing clip, failed canvas, unsupported WebGPU, and recoverable reset. | P0 | No blank route without actionable error. Every simulated failure publishes an error object and visible non-crashing fallback. |
| Testing | Aura Clash has useful smoke tests. Template tests are shallow. | Engine-level unit/integration tests plus showcase E2E tests for gameplay quality, visuals, assets, performance, deployment parity. | Add unit tests for combat/movement/animation. Add visual regression snapshots. Add deployed route checks for JS/CSS/GLB/texture/audio 200s. | P0 | CI fails on console errors, failed assets, blank canvas, no movement, no damage, repeated KO loop, debug artifacts in normal screenshots, and deployed/local mismatch. |
| Developer experience | Docs and llms instructions are strong but sometimes overstate capabilities. | Docs match real capability. Examples are copy-pasteable and tested externally. | Update docs to 1.0.6 API shape, add "what this is not" boundaries, add migration from 1.0.5. | P0 | `pnpm verify:docs-version` passes; all documented commands work from a clean temp app; claims align with release gates. |
| Release and deployment | 1.0.5 release gates exist. | 1.0.6 has explicit engine and flagship gates before npm/GitHub/marketing deploy. | Add `aura3d106:readiness`, `aura3d106:release`, external npm smoke, deployed route proof, screenshot artifacts. | P0 | Release cannot publish unless package, CLI, template, game, docs, screenshots, and deployed proof pass. |

## Target 2: Flagship Showcase Game Gap Analysis

| Area | Current state | Target state | Concrete work items | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| Showcase concept | Aura Clash Arena is a 2.5D fighting demo proving runtime mechanics. It is perceived as a 3/10 prototype, not a flagship. | A focused vertical slice: two distinct fighters, one polished arena, responsive controls, distinct moves, audio, game-state polish, evidence. | Keep the product name `Aura Clash Arena` and move implementation to contextual filenames. Freeze scope to one polished match mode. Delete legacy version-attempt code from active and archived paths. | P0 | One active route only. No legacy route path, archive copy, old GLB/procedural path, or version-attempt evidence is used in marketing proof. |
| Fighter assets | Aura Clash Arena uses two tinted instances of `assets.auraClashTrainingMannequin`. This proves skinned GLB playback but not character quality, silhouette variety, or final art direction. | Two distinct, licensed, typed, rigged fighters with compatible clip sets, different silhouettes/materials, and documented provenance. | Source or commission two CC0/owned fighters. Use CLI validation profile. Reject same-model tinting for flagship proof. Add asset evidence with license, checksum, bounds, clips, skeleton. Keep typed asset keys contextual. | P0 | `assets validate-game --profile fighting-character --no-placeholders --require-license` passes for both fighters; screenshots show visibly distinct characters; release-facing manifest contains no attempt-named fighter assets. |
| Animation set | Current moves can switch clips but user review reports J/K barely move, L/Q unclear, KO repeats, jump too low. | Readable idle, walk, run, jump, fall, land, crouch/down, guard, jab, heavy, special, hit, knockdown, KO, win clips. | Build clip map per fighter. Add animation event markers for startup/active/recovery. Tune jump/down/guard/special. Stop KO repeat. | P0 | Manual and Playwright tests prove each control causes distinct visible animation within 250 ms. KO stays in KO until reset. |
| Gameplay depth | Simple movement/combat, fast KO, local AI. | Small but real fighting loop: spacing, attack ranges, block/guard, meter-gated special, jump-in, crouch/down/fast-fall, hitstun, recovery, knockback, round pacing. | Define move data table. Add damage tuning, cooldowns, meter rules, block rules, round timer, best-of-one flow, reset/rematch. | P0 | No one/two accidental hit KO. Light/heavy/special differ in damage/range/startup/recovery. Guard reduces damage. Special requires meter or clear cooldown. |
| Controls | Keyboard controls exist. User reports Q/L issues and no "go down" behavior before latest fixes. | Controls are reliable, visible, documented, remappable enough, and work after reset/KO/pause. | Add control-state tests for A/D/S/Space/Shift/Q/J/K/L/P/R. Add input focus recovery and disabled-after-KO rules. | P0 | Automated tests assert every listed key changes the expected state and does not crash/pause incorrectly. |
| AI opponent | Simple deterministic opponent. | Opponent spaces, blocks sometimes, attacks with readable timing, does not spam after KO, and can be tuned. | Add finite-state AI with distance bands, cooldowns, guard chance, jump avoidance, KO stop. | P1 | AI can win if player does nothing, but does not feel like a broken loop. AI stops after round end. |
| Hit feedback and VFX | Hit feedback has shown line/box artifacts and overdraw. | Hits show intentional sparks/slashes/camera shake/hitstop/audio, with debug hitboxes hidden by default. | Replace box/line hit effects with stylized particles/trails. Add debug toggle for hitboxes. Add reduced-motion mode. | P0 | Normal screenshot has no box/line debug artifacts. Debug screenshot can show hitboxes intentionally. |
| Arena art | Upgraded CSS/SVG arena is visually better: portal, skyline, fog, neon platform. It is not deeply integrated with engine rendering. | Arena is a proper Aura3D-authored stage or a stable hybrid with clear ownership, depth, lighting, shadows, reflections, and responsive layout. | Implement the handoff `Aura Clash Arena.html` design as the visual target. Port skybox, portal, skyline, fog, platform rim, corner posts, ropes, reflections, and tweaks panel into app source. | P0 | Screenshot matches the handoff target closely enough for visual approval. Mobile/desktop layouts do not crop fighters or HUD. |
| Audio | No flagship audio proof. | Music loop, hit/guard/jump/dash/special/KO/UI SFX, mute, volume, autoplay unlock. | Add licensed/owned audio assets through typed assets or documented public paths. Wire event-driven SFX. | P0 | Browser proof verifies audio files 200, controls unlock audio, mute works, and game can be played silently. |
| UX flow | Route starts directly. KO requires reset. Some repeated round behavior has looked broken. | Start state, fight callout, KO, win, reset/rematch, pause/settings, tweaks, evidence links are clear. | Add start/restart state machine. Disable attacks after KO. Add rematch button. Keep evidence/debug links separate from play. | P0 | After KO, no further damage/hit events occur until reset. Reset returns both fighters, HP, timer, clips, AI, and input state to baseline. |
| Visual identity | Teal/amber/violet identity is present. Characters are monochrome/tinted and not aspirational. | Cohesive art direction with distinct characters, lighting, silhouettes, effects, HUD, and marketing screenshot. | Art pass on HUD typography, fighter materials, camera framing, arena depth, palette presets. | P1 | A single screenshot can be used on homepage without looking like a debug prototype. |
| Performance | Playwright screenshot proof exists; no strict budgets in showcase docs. | Stable frame rate, fast load, no memory leak, bounded assets, desktop/mobile budgets. | Add performance budgets and route-health JSON. Optimize GLB sizes/textures. Lazy-load only non-critical panels. | P0 | Load under budget, frame time under budget, draw calls under budget, no long-session leak, no failed assets on deployed route. |
| Marketing integration | Homepage embeds/link-previews the game but route quality has not matched claims. | Homepage either uses a static approved poster or a live preview that passes the same proof gates. | Generate approved static poster for homepage until live embed reaches visual/perf gate. Align headline claims with proof. | P0 | Homepage screenshot does not crop awkwardly, header fits on one line, version is current, and the game link route passes deployment proof. |

## 1.0.6 Work Plan

### Phase 0: Claim Reset And Release Gate

Goal: stop marketing drift before deeper engineering.

Work items:

- Add this PRD to docs.
- Update public docs to say Aura3D 1.0.5 is a runtime foundation, not a mature game engine.
- Add `docs/project/aura3d-106-release-gates.md` after implementation scope is accepted.
- Add release script placeholders:
  - `pnpm aura3d106:readiness`
  - `pnpm aura3d106:release`
  - `pnpm verify:aura-clash-flagship`
- Define claims allowed/not allowed in `docs/project/claim-guidelines.md`.

Acceptance:

- Docs do not claim engine maturity until P0 gates pass.
- README/marketing/site docs all use the same version and claim language.

### Phase 1: Engine Runtime Unification

Goal: remove the split between safe Aura app runtime and bespoke Aura Clash production-renderer loop.

Work items:

- Add public interactive game app wrapper.
- Add typed GLB production render binding to public scene/model API.
- Standardize runtime evidence schema for:
  - frame loop;
  - input;
  - animation;
  - physics;
  - combat;
  - renderer;
  - assets;
  - audio;
  - errors.
- Add route lifecycle tests for boot, pause, resume, reset, dispose, resize, and focus loss.

Acceptance:

- Aura Clash and the fighting template use the same runtime lifecycle path.
- No route-specific renderer resource traversal is needed for ordinary typed animated GLB fighters.

### Phase 2: Animation And Combat Integration

Goal: make animation visually real, event-driven, and reusable.

Work items:

- Add public animation controller for imported typed GLB models.
- Add per-clip event markers for hitbox start/end, footstep, land, special release, KO lock.
- Add clip restart and crossfade tests.
- Connect animation events to `HitboxWorld` instead of route-local hit timing.
- Add guard/block/hitstun/recovery/KO state machine to fighting kit.

Acceptance:

- `J`, `K`, `L`, `Q`, `Space`, `S`, and `Shift` visibly and mechanically differ.
- Hits occur from animation-event windows, not arbitrary local timers.
- KO cannot loop or continue receiving hits until reset.

### Phase 3: Asset Pipeline Quality Gate

Goal: make "AI prompt CLI" useful for game assets, not just technically functional.

Work items:

- Add catalog profiles:
  - `fighting-character`;
  - `animated-humanoid`;
  - `arena-prop`;
  - `audio-sfx`;
  - `environment-skybox`.
- Add validation scoring:
  - license;
  - direct download;
  - GLB/glTF format;
  - triangle count;
  - texture count/size;
  - bounds;
  - skeleton count;
  - humanoid bone names;
  - animation clips;
  - material health;
  - no placeholder/fan-art/IP-risk labels for flagship use.
- Make resolver fail honestly when no candidate meets profile.
- Generate asset evidence for selected showcase assets.

Acceptance:

- `npx @aura3d/cli@latest assets search "stylized animated fighting game character" --profile fighting-character --json` either returns usable candidates with scores or exits with actionable no-match diagnostics.
- The showcase assets pass validation without manual explanation.

### Phase 4: Flagship Showcase Rebuild

Goal: turn Aura Clash from runtime proof into a credible vertical slice.

Work items:

- Port the `Aura Clash Arena.html` handoff visual target into app source.
- Replace same-asset tinting with two distinct fighters.
- Add tuned move data table and per-fighter clip map.
- Add audio, VFX, camera shake, hitstop, and reduced-motion alternatives.
- Add clean start/KO/reset/rematch flow.
- Add tweak panel without polluting normal gameplay.
- Hide debug hitboxes/artifacts by default.
- Rename active app files by domain context, not by attempt number.

Acceptance:

- Manual review can rate the route as a polished SDK showcase, not a primitive smoke test.
- Screenshots show intentional art, readable characters, and no debug artifacts.
- All controls visibly work and are tested.

## Peer-Grade Engine Ambition For 1.0.6

The baseline 1.0.6 plan above is enough to turn Aura3D into a credible browser game-runtime foundation. It is not enough to say Aura3D is at the same level as Three.js, Babylon.js, Unity, or Unreal.

If the goal is to credibly compete with peers, 1.0.6 needs a larger "peer-grade" track. This does not mean matching every Unity/Unreal feature in one release. It means Aura3D must become strong in the areas where its product strategy can win:

- browser-first TypeScript runtime;
- AI-agent-safe API;
- typed asset workflow;
- prompt/catalog asset resolution;
- evidence-driven deployment;
- reusable game systems;
- production GLB animation;
- strong visual showcase;
- docs and templates that work from npm.

The peer-grade target is:

> Aura3D 1.0.6 should not be a toy wrapper around WebGL. It should be a serious AI-native browser game engine foundation with enough rendering, animation, asset, runtime, tooling, performance, and showcase proof that a developer can compare it to Three.js/Babylon.js for browser game work without dismissing it immediately.

### Peer Comparison Baseline

| Peer | What they are strong at | 1.0.6 must close enough to be credible | 1.0.6 does not need to match yet |
| --- | --- | --- | --- |
| Three.js | Low-level browser 3D rendering, loaders, materials, animation primitives, huge ecosystem. | Aura3D must render typed GLBs, play animation, expose cameras/lights/materials/postprocess, support asset loading, and make browser deployment easier. | Full Three.js ecosystem breadth or every example parity. |
| Babylon.js | Browser game engine features: scene graph, materials, GUI, animation, physics integrations, inspector, WebXR, loaders. | Aura3D must have reusable game lifecycle, input, physics/combat helpers, imported animation, debug/profiling, templates, and a showcase with real gameplay. | Complete Babylon feature parity, WebXR breadth, editor/inspector maturity. |
| Unity | Editor, prefab workflow, animation controller, physics, asset pipeline, UI, profiling, build targets. | Aura3D must add a lightweight browser editor/devtools/profiler path, prefab-like scene packaging, animation state graph, and evidence gates. | Full editor parity, asset store, multi-platform native builds. |
| Unreal | High-end renderer, cinematic tools, Blueprints, animation tooling, large-world/AAA workflows. | Aura3D must not compete head-on; it must win on fast web-native AI-generated interactive 3D and typed deployment proof. | Nanite/Lumen/Blueprint/Sequencer/AAA production parity. |

### Peer-Grade Feature Workstreams

| Workstream | Current 1.0.5 weakness | 1.0.6 peer-grade target | Files to create or modify | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| Scene graph and prefab system | Scene composition exists, but game objects/prefab authoring are not first-class enough for game production. | Reusable entities/prefabs with transform hierarchy, components, serialization, cloning, typed asset references, and evidence. | Modify `packages/scene/src/*`, `packages/ecs/src/*`, `packages/engine/src/agent-api/index.ts`; create `packages/engine/src/game/Prefab.ts`, `packages/engine/src/game/GameObject.ts`, `docs/concepts/scene-vs-ecs.md`. | P1 | A fighting character prefab can be cloned twice with independent animation/combat/audio state and saved/loaded from JSON. |
| Component model | Runtime helpers exist but route code still wires systems manually. | Engine-owned component model for renderable, animator, rigid/kinematic body, hitbox, audio source, input receiver, AI, HUD binding. | Create `packages/engine/src/game/components/*`; modify `packages/ecs/src/*`; add `tests/unit/game-components.test.ts`. | P1 | Components can be added/removed at runtime and evidence reports component state. |
| Animation state graph | Clips and mixers exist, but no mature game animation graph. | Blend-tree/state-machine layer for idle/run/jump/attack/hit/KO with transitions, guards, one-shots, events, root-motion policy. | Create `packages/animation/src/AnimationStateGraph.ts`, `packages/animation/src/BlendTree.ts`, `packages/animation/tests/animation-state-graph.test.ts`, update `docs/concepts/animation.md`. | P0 | Aura Clash uses an animation graph, not ad hoc clip names. Tests prove no stuck attack/KO loops. |
| Imported character retargeting | Imported GLB animation works, but retargeting/humanoid validation is weak. | Humanoid profile validation, bone mapping, clip compatibility checks, and explicit retarget unsupported diagnostics. | Create `packages/animation/src/HumanoidRigProfile.ts`, `packages/animation/src/RetargetingDiagnostics.ts`; modify `packages/aura3d-cli/src/game-asset-validator.ts`. | P1 | CLI can say why a fighter asset is/ is not compatible with Aura Clash. |
| Renderer material quality | Production GLB renderer exists; visual quality still behind peer expectations. | PBR material correctness, shadows/contact shadows, tone mapping, bloom, fog, particles, reflections, instancing, debug views. | Modify `packages/rendering/src/production-runtime/*`, `packages/rendering/src/materials/*`; create `packages/rendering/src/game/GamePostProcessing.ts`, `packages/rendering/src/game/GameParticles.ts`; update `docs/rendering/*`. | P0 | Aura Clash screenshots show no flat/debug look; renderer evidence reports postprocess, shadows, particles, and frame budget. |
| Asset import and optimization | CLI can add/search assets, but does not guarantee production game readiness. | Game-ready import pipeline: profile validation, meshopt/Draco/KTX2 guidance, texture budgets, LOD metadata, animation clip maps, licensing evidence. | Modify `packages/aura3d-cli/src/*`, `docs/assets/gltf-compression.md`, `docs/rendering/texture-compression.md`; create `tools/game-asset-profile-readiness/index.ts`. | P0 | Bad assets fail before code uses them; selected assets meet budget and license checks. |
| Resource manager | Routes manually load assets and can silently overfetch or leak. | Engine resource manager with preloading, cache, disposal, dependency graph, progress, retry, and failure evidence. | Create `packages/engine/src/runtime/ResourceManager.ts`, `packages/engine/src/runtime/AssetPreloader.ts`, `tests/unit/resource-manager.test.ts`. | P0 | Tests prove GLB/audio/texture preload, cache hit, disposal, and error reporting. |
| Audio engine | Audio is not first-class in showcase proof. | Event-driven Web Audio helper with typed audio assets, buses, volume/mute, spatial option, SFX pooling, autoplay unlock. | Modify/create `packages/audio/src/*`, `packages/engine/src/game/GameAudio.ts`, `docs/api/game-runtime.md`, `apps/aura-clash-showcase/src/playable/audio/*`. | P0 | Aura Clash has music/SFX/mute; tests verify events trigger audio after user gesture. |
| Physics/gameplay integration | Physics and combat helpers exist but are not integrated like a game engine. | Unified gameplay simulation tick with kinematic body, pushbox, hitbox, hurtbox, collision events, replay determinism. | Modify `packages/physics/src/*`, create `packages/engine/src/game/GameSimulation.ts`, `tests/integration/game-simulation.test.ts`. | P0 | Same input replay produces same HP/positions/events every run. |
| Input and controls | Keyboard works in smoke, but no robust player-input system. | Keyboard, touch, gamepad, remapping, buffering, focus recovery, dead zones, input display, replay. | Modify `packages/input/src/*`, `packages/engine/src/game/GameInput.ts`, `docs/controls/interaction-and-picking.md`. | P0 | Every Aura Clash control has automated proof and no focus-loss failure. |
| AI and scripting | Bespoke opponent AI exists. Behavior-tree/visual scripting packages exist separately. | Minimal reusable AI controller and behavior-tree example integrated into game runtime. | Modify `packages/scripting/src/BehaviorTree.ts`, create `packages/engine/src/game/GameAI.ts`, `apps/aura-clash-showcase/src/playable/ai/OpponentBehavior.ts`. | P1 | Opponent behavior is data-driven and stops after KO. |
| Editor/devtools | Editor-runtime exists, but not tied to game debugging. | In-browser game inspector: hierarchy, components, animation state, input trace, hitboxes, renderer stats, assets, errors. | Modify `packages/editor-runtime/src/*`; create `packages/engine/src/debug/GameInspector.ts`, `docs/editor/browser-first-workflow.md`, `tests/browser/game-inspector.spec.ts`. | P1 | Inspector can be toggled and screenshots prove debug/normal separation. |
| Profiler | Some performance tools exist, but showcase budget is weak. | CPU frame timing, renderer stats, asset load time, memory trend, draw calls, long-session soak. | Create `packages/engine/src/debug/GameProfiler.ts`, `tools/aura-clash-flagship-readiness/index.ts`; modify `docs/debug/profiling-and-diagnostics.md`. | P0 | Performance budgets fail CI on regression. |
| Save/load and deterministic state | Route reset exists; no strong save/load/replay story. | Serializable match state, replay input log, deterministic restore, evidence export. | Modify `apps/aura-clash-showcase/src/state/*`; create `packages/engine/src/game/GameStateSnapshot.ts`, `tests/integration/game-replay-determinism.test.ts`. | P1 | Replay JSON restores the same positions, health, timer, and events. |
| Visual effects pipeline | Hit VFX can look like debug boxes. | Named VFX events, particle emitters, trails, screen shake, hitstop, reduced-motion mode. | Create `packages/engine/src/game/GameVfx.ts`, `packages/rendering/src/game/GameParticles.ts`, update `apps/aura-clash-showcase/src/rendering/HitSparkVfx.ts`. | P0 | Normal screenshots show intentional VFX only; reduced-motion is honored. |
| Benchmark and peer evidence | Comparisons exist in docs, but Aura Clash does not prove peer-grade. | Automated benchmark/evidence comparing Aura3D game route health against equivalent Three.js/Babylon demo baselines where reasonable. | Modify `docs/benchmarks/babylon-comparison.md`, `docs/benchmarks/pbr-rendering-comparison.md`; create `tools/game-engine-peer-benchmark/index.ts`. | P1 | Report states where Aura3D wins, loses, and is incomplete with numbers and screenshots. |

### Peer-Grade P0 Checklist

- [ ] Public game app lifecycle API exists and is used by Aura Clash.
- [ ] Public typed GLB actor API exists and replaces route-specific render traversal.
- [ ] Animation state graph exists and drives Aura Clash.
- [ ] Resource manager handles GLB/audio/texture preload, cache, disposal, and errors.
- [ ] CLI game-asset profiles reject bad candidates.
- [ ] Renderer proves shadows/contact shadows, postprocess, particles/VFX, and stable frame budget.
- [ ] Audio engine/event hooks exist and are used by Aura Clash.
- [ ] Game simulation tick is deterministic under replay.
- [ ] Input system supports buffer, focus recovery, touch/gamepad baseline, and replay.
- [x] Profiler/performance budgets fail CI on regression for the current Aura Clash route budget scope.
- [x] Aura Clash is not implemented in a version-attempt directory.
- [x] Marketing and docs compare honestly to peers with evidence, not aspiration, for the current 1.0.6 scoped runtime-foundation release and future mature-engine/flagship-game work.

### Peer-Grade Stretch Checklist

These are P1/P2 unless the release claim says Aura3D is directly peer-level with Babylon/Unity-style game authoring.

- [ ] Prefab system with component serialization.
- [ ] In-browser game inspector.
- [ ] Behavior-tree AI integration.
- [ ] Animation retargeting diagnostics and humanoid rig profile.
- [ ] Save/load and deterministic replay export.
- [ ] Peer benchmark reports with screenshots and metrics.
- [ ] Template generator creates a game using the same engine systems as Aura Clash.

## 1.0.6 Superiority Track

If 1.0.6 is meant to do more than repair Aura Clash, it needs a deliberately superior lane instead of a catch-up-only lane. Aura3D should not try to beat Unity or Unreal at native editor depth in one release. Aura3D can become stronger than the common browser-engine workflow in these areas:

1. AI-safe game creation from typed assets.
2. Built-in release evidence.
3. Browser-first game runtime with deterministic tests.
4. Prompt/catalog asset suitability scoring.
5. Copy-pasteable templates that use the same engine systems as the flagship.

The following features are recommended additions to make 1.0.6 meaningfully stronger:

| Feature | Why it matters | Files to create or modify | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Game object/prefab authoring | Three.js leaves this to the app. Babylon has scene entities but not Aura3D's typed/prompt workflow. Aura3D needs reusable gameplay objects instead of bespoke route state. | Create `packages/engine/src/game/GameObject.ts`, `packages/engine/src/game/Prefab.ts`, `packages/engine/src/game/ComponentRegistry.ts`; modify `packages/engine/src/index.ts`; add `docs/concepts/game-objects-and-prefabs.md`. | P1 | A fighter prefab can be cloned twice with independent transforms, animator state, combat state, audio state, and evidence IDs. |
| Deterministic simulation runner | A real engine must replay the same fight from the same input. This is stronger than visual-only demos. | Create `packages/engine/src/game/GameSimulation.ts`, `packages/engine/src/game/InputReplay.ts`; add `tests/integration/game-replay-determinism.test.ts`; use from `apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts`. | P0 | Same replay file produces identical positions, HP, timer, move events, and KO state across three runs. |
| Imported GLB actor abstraction | Aura Clash should not know renderer internals. This is the core bridge from scene SDK to game engine. | Create `packages/engine/src/production-runtime/TypedGLBActor.ts`; modify `packages/rendering/src/production-runtime/*`; add `tests/browser/typed-glb-actor.spec.ts`. | P0 | Public API loads a typed model, binds clips, plays one-shots, reports skeleton/clip/material evidence, and renders two independent actors. |
| Animation state graph | Visible action quality depends on transitions, one-shots, locks, and events. Clip names alone are not a game animation system. | Create `packages/animation/src/AnimationStateGraph.ts`, `packages/animation/src/AnimationEventTrack.ts`; modify `packages/animation/src/AnimationController.ts`; add `docs/api/animation-state-graph.md`. | P0 | J/K/L/Q/Space/S/Shift each drive a distinct state, active frames dispatch events once, and KO cannot loop or re-enter attack. |
| Humanoid profile and retarget diagnostics | The asset CLI must stop letting bad "animated" search results become showcase blockers. | Create `packages/aura3d-cli/src/humanoid-profile.ts`, `packages/aura3d-cli/src/game-asset-validator.ts`; modify `packages/aura3d-cli/src/pull-bridge.ts`. | P0 | CLI explains missing skeleton, bad bounds, no required clips, non-humanoid rigs, IP/license risk, and texture/performance failures. |
| Game-ready asset scoring corpus | Prompt search needs objective scoring, not vibes. | Create `tests/fixtures/game-assets/manifest.json`, `tests/unit/asset-index/game-asset-scoring.test.ts`, `docs/project/asset-corpus-results.md`. | P0 | Known bad candidates fail with reasons; known good candidates pass; reports are written under `tests/reports/aura3d106/`. |
| Renderer quality preset | Peer credibility requires lighting, shadows, fog, VFX, and performance evidence. | Create `packages/rendering/src/game/GameRenderPreset.ts`, `packages/rendering/src/game/GameParticles.ts`, `packages/rendering/src/game/ContactShadows.ts`; modify `packages/engine/src/production-runtime/GameRenderPreset.ts`. | P0 | Aura Clash uses preset; normal screenshots show contact shadows, portal/fog/particles, no debug geometry, and stable frame budget. |
| Game audio event bus | A fighting game without hit/jump/KO audio feels incomplete. | Create `packages/audio/src/GameAudioBus.ts`, `packages/engine/src/game/GameAudio.ts`; add `apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest.ts`. | P0 | Hit, block, jump, dash, special, KO, UI, and music events fire through a muteable/autoplay-safe system. |
| In-browser game inspector | Unity/Babylon have strong debugging surfaces. Aura3D needs a lightweight browser-native inspector. | Create `packages/engine/src/debug/GameInspector.ts`; modify `packages/editor-runtime/src/*`; add `docs/debug/game-inspector.md`. | P1 | Inspector shows hierarchy, components, input trace, animation graph, hitboxes, render stats, asset load status, and errors without normal-mode artifacts. |
| Performance budget runner | Claiming an engine requires budgets, not screenshots only. | Create `tools/game-performance-budget/index.ts`, `apps/aura-clash-showcase/tests/performance-budget.spec.ts`; modify `tools/aura3d106-release-readiness/index.ts`. | P0 | CI fails if FPS/frame time, draw calls, memory trend, asset size, boot time, or console errors exceed thresholds. |
| Deployment parity checker | Aura3D can win by proving local and deployed app parity automatically. | Create `tools/deployed-game-route-proof/index.ts`; modify `apps/aura-clash-showcase/tests/deployed-playable.spec.ts`. | P0 | Page, JS, CSS, GLB, texture/image, audio all return 200; no console errors; screenshot/hash and proof schema match local. |
| Prompt-to-game starter | The AI angle should be real: prompt selects assets, validates, scaffolds a playable route, and refuses bad assets. | Modify `packages/create-aura3d/src/*`, `packages/create-aura3d/templates/fighting-game/*`, `packages/aura3d-cli/src/cli.ts`; create `docs/examples/prompt-to-fighting-game.md`. | P1 | A clean temp project can run one command sequence from prompt to typed assets to playable starter, or fails with useful no-match diagnostics. |

### Superiority Acceptance Bar

Aura3D 1.0.6 can be described as superior in its chosen AI-native browser lane only if:

- [ ] A clean external developer can scaffold a fighting starter, resolve validated game assets, run it locally, and get screenshots without reading monorepo internals.
- [ ] The flagship uses the same public engine APIs as the template.
- [ ] The engine provides deterministic replay evidence that Three.js users normally have to build themselves.
- [ ] The CLI refuses bad prompt-selected game assets with structured reasons.
- [ ] The deployed route proof is generated automatically and fails the release on blank canvas, failed assets, broken input, console errors, or screenshot mismatch.
- [ ] Public docs show exact commands and exact limitations instead of claims that depend on private route code.

### Phase 5: Tests, Performance, Deployment

Goal: prove local and deployed behavior match.

Work items:

- Expand `apps/aura-clash-showcase/tests/playable-smoke.spec.ts`.
- Add visual regression screenshots:
  - first frame;
  - movement;
  - jump;
  - guard;
  - light;
  - heavy;
  - special;
  - hit;
  - KO;
  - reset.
- Add deployment proof:
  - page 200;
  - JS chunks 200;
  - CSS 200;
  - GLBs 200;
  - textures/images 200;
  - audio 200;
  - no console errors;
  - no blank canvas;
  - controls still work;
  - screenshot parity with local.
- Add performance and long-session stability tests.

Acceptance:

- `pnpm typecheck`, `pnpm build`, package smoke, template smoke, Aura Clash smoke, visual proof, and deployment proof all pass before npm/GitHub release.

## Filename-Level Implementation Map

This section is intentionally explicit. 1.0.6 is not complete because a concept exists in a PRD; it is complete only when the named source files, tests, docs, scripts, and release artifacts below are created or modified and their checkboxes pass.

### Engine Package Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/engine/src/agent-api/GameRuntime.ts` | Modify | Promote the fighting-game helpers from broad declarations into a reusable runtime contract that exposes input buffering, combat lifecycle, character movement presets, HUD bindings, debug state, audio hooks, and standardized evidence. | P0 | [ ] `game.inputBuffer` or equivalent exists. [ ] `game.fighting` exposes movement/combat state machine pieces. [ ] Evidence includes input, movement, combat, animation, renderer, audio, errors. [ ] Existing public APIs remain source-compatible or migration notes exist. |
| `packages/engine/src/agent-api/AuraAppHandle.ts` | Modify | Add or expose game-app lifecycle support so interactive routes do not need bespoke `requestAnimationFrame` and renderer loop ownership. | P0 | [ ] One public lifecycle path supports `start`, `pause`, `resume`, `step`, `resize`, `dispose`. [ ] Duplicate frame loops are prevented. [ ] App evidence records lifecycle state and last frame error. |
| `packages/engine/src/agent-api/RuntimeNodeHandle.ts` | Modify | Let runtime nodes bind imported GLB animation/rendering state without route-only resource traversal. | P0 | [ ] Runtime node evidence exposes imported skeleton, clip, skinning palette, morph, bounds, and render item counts. [ ] Missing clip/bone/morph reports structured diagnostics. |
| `packages/engine/src/agent-api/game-kits/fighting.ts` | Modify | Turn the fighting kit into the reusable implementation Aura Clash consumes. | P0 | [ ] Move table supports startup, active, recovery, damage, block damage, meter, hitstun, blockstun, knockback, cancel flags. [ ] KO/round/reset state machine exists. [ ] Debug hitbox mode is separate from normal visuals. |
| `packages/engine/src/production-runtime/index.ts` | Modify | Provide public typed-GLB animation/render binding APIs currently duplicated by Aura Clash Arena route code. | P0 | [ ] Public API can load a typed GLB asset, play named clips, blend, restart, read skeleton/morph evidence, and produce render items. [ ] No showcase-specific `collectFighterRenderItems` clone is required. |
| `packages/engine/src/advanced-runtime/A3DRenderer.ts` | Modify | Expose stable game rendering lifecycle, stats, frame budget evidence, and resize/dispose safety. | P0 | [ ] Renderer evidence includes backend, draw calls, frame time, render size, asset failures, and context-loss status. [ ] Resize and dispose tests pass. |
| `packages/engine/src/index.ts` | Modify | Export any new 1.0.6 public game-runtime and typed-GLB animation APIs. | P0 | [ ] Public exports documented. [ ] `pnpm verify:exports` passes. [ ] No private showcase-only API leaks. |
| `packages/engine/src/production-runtime/GameAppRuntime.ts` | Create | Central runtime wrapper for game routes that compose renderer, input, animation, physics/combat, audio, evidence, and lifecycle. | P0 | [ ] Used by Aura Clash and fighting template. [ ] Unit and browser tests cover lifecycle. |
| `packages/engine/src/production-runtime/TypedGLBActor.ts` | Create | First-class actor abstraction for typed GLB models with animation, skinning, bounds, and render evidence. | P0 | [ ] Supports two independent instances of the same asset and distinct assets. [ ] Clip playback is visible. [ ] Missing clip fallback is explicit, not silent. |
| `packages/engine/src/production-runtime/GameRenderPreset.ts` | Create | Engine-level scene preset for side-view fighting/gameplay stages: camera, lights, floor, fog, particles, debug overlays. | P1 | [ ] Aura Clash can use this instead of route-specific stage boilerplate. |

### Animation Package Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/animation/src/AnimationController.ts` | Modify | Add game-grade one-shot actions, restart rules, event windows, stuck-action prevention, and evidence for visible clip state. | P0 | [ ] `playOnce` or equivalent exists. [ ] Repeated KO/Death loops can be disabled. [ ] Active action evidence includes started/ended/loop counts. |
| `packages/animation/src/AnimationMixer.ts` | Modify | Strengthen blending, layer masks, root-motion suppression, and deterministic event dispatch. | P0 | [ ] Crossfade tests pass. [ ] Root motion can be applied or suppressed per action. [ ] Events fire once at clip-local time. |
| `packages/animation/src/Skinning.ts` | Modify | Ensure imported skeleton palette refresh is testable and visible through evidence. | P0 | [ ] Skinning palette counts update when clips play. [ ] Tests catch frozen T-pose regressions. |
| `packages/animation/src/GLTFSceneAnimationRuntime.ts` | Create or modify existing equivalent | Consolidate imported GLB scene clip playback so routes do not call lower-level helpers directly. | P0 | [ ] Public runtime supports apply clip, blend clips, restart, one-shot, events, morphs, and snapshot. |
| `packages/animation/tests/game-animation-runtime.test.ts` | Create | Unit coverage for gameplay animation semantics. | P0 | [ ] Tests idle, walk, jump, guard, attack, hit, KO, restart, loop, event windows. |

### Physics And Combat Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/physics/src/KinematicBody.ts` | Modify | Add or expose game-feel controls for jump apex, fast-fall/down, crouch, dash lockout, landing recovery, and bounds evidence. | P0 | [ ] Jump height is tunable and tested. [ ] Down input can fast-fall or crouch. [ ] Dash distance/cooldown are deterministic. |
| `packages/physics/src/HitboxWorld.ts` | Modify | Make combat world sufficient for Aura Clash instead of local hit logic. | P0 | [ ] Guards, blockstun, hitstun, hitstop, recovery, pushback, KO lock, and hit-once rules are covered. |
| `packages/physics/src/CollisionVolumes.ts` | Modify | Add debug/normal rendering metadata for hitboxes/hurtboxes without leaking debug boxes into normal play. | P1 | [ ] Debug volumes are opt-in only. [ ] Normal screenshot has no box/line artifacts. |
| `packages/physics/src/CharacterController.ts` | Modify | Expose fighting/platformer controller presets over raw kinematic bodies. | P1 | [ ] Fighting controller covers walk, dash, jump, fast-fall, crouch, landing. |
| `packages/physics/tests/fighting-combat-world.test.ts` | Create | Regression tests for fighting-game collision and combat semantics. | P0 | [ ] Light/heavy/special hit windows pass. [ ] Guard blocks. [ ] KO stops hit resolution. [ ] Reset clears timers. |
| `packages/physics/tests/kinematic-fighting-controller.test.ts` | Create | Movement feel tests. | P0 | [ ] Jump apex, fast-fall, dash, bounds, landing, and knockback pass numeric thresholds. |

### CLI, Asset Catalog, And Asset Validation Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/aura3d-cli/src/cli.ts` | Modify | Add `--profile` support to `assets search`, `assets resolve`, and `assets validate-game`. | P0 | [x] Source CLI supports `--profile fighting-character` for search, resolve, and validate-game. [x] Built dist CLI profile search smoke passes in `tests/reports/aura3d106/cli-profile-smoke.json`. [x] Help text documents profiles. [x] `--profile fighting-character` works from published `npx`. |
| `packages/aura3d-cli/src/pull-bridge.ts` | Modify | Rank and reject catalog candidates based on profile fitness, not just query text and pullability. | P0 | [x] Aircraft/sculpt/static/fan-art/IP-risk results are rejected for fighting-character profile in local source and packed CLI proof. [x] No-match output is honest and actionable through `rejectedCandidates` and rejection reasons. [ ] Published `@latest` exposes the same behavior. |
| `packages/aura3d-cli/src/index.ts` | Modify | Export profile validators and evidence report types. | P0 | [x] Programmatic API can run the same profile checks as CLI through `validateGameAssets`. [x] `fighting-character` validation reports profile targets, profile-ready assets, and skipped non-fighter models instead of failing arenas as fighters. [x] Explicit two-fighter validation passes for `auraClashPlayerRig` and `auraClashRivalRig`. |
| `packages/aura3d-cli/src/game-asset-profiles.ts` | Create | Central definitions for `fighting-character`, `animated-humanoid`, `arena-prop`, `environment-skybox`, `audio-sfx`. | P0 | [ ] Profiles define required/optional metadata, scoring, and rejection reasons. |
| `packages/aura3d-cli/src/game-asset-validator.ts` | Create | Validate GLB/game assets against profile requirements. | P0 | [ ] Checks license, bounds, skeleton, clips, morphs, texture sizes, triangle budget, checksum. |
| `tests/unit/aura3d-cli/assets.test.ts` | Modify | Regression tests for asset profile scoring and mixed game manifests. | P0 | [x] Bad fighter candidates fail. [x] Known good fixture passes. [x] Mixed manifests skip arena/stage assets while still requiring two distinct release-ready fighters for full game validation. [x] JSON evidence includes profile target/ready/skipped counts. |
| `docs/api/assets.md` | Modify | Document game-asset profile commands and failure semantics. | P0 | [x] Docs include search, resolve, add, validate-game examples with `--profile`. |
| `docs/project/asset-corpus-results.md` | Modify | Record 1.0.6 fighter/arena/audio asset corpus findings. | P1 | [ ] Selected assets have provenance, license, checksum, clips, bounds, and approval status. |

### Aura Clash App Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `apps/aura-clash-showcase/src/main.ts` | Modify | Route only the active flagship implementation. Stop accidental fallback to legacy version-attempt variants. | P0 | [x] `/playable/` mounts one active app. [x] Legacy code is not imported. [x] Route proof reports release `1.0.6` without using a version-attempt object name. |
| `apps/aura-clash-showcase/src/game-v6/AuraClashV6App.ts` | Delete | Failed implementation-attempt filename. This route has been replaced by contextual source names under `src/playable/`; it must not remain in source or archive paths. | P0 | [x] Deleted from active source. [x] No archive copy remains. [x] Active route imports only `src/playable/AuraClashArenaApp.ts`. |
| `apps/aura-clash-showcase/src/game-v6/playable.css` | Delete | Failed implementation-attempt stylesheet. The active stylesheet is contextual under `src/playable/`. | P0 | [x] Deleted from active source. [x] No archive copy remains. [x] Active route imports only `src/playable/playable.css`. |
| `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Create | Clean active implementation using engine game app, typed GLB actors, engine combat, audio, arena target, proof hooks. | P0 | [x] Publishes contextual proof such as `window.__AURA_CLASH_ARENA_PROOF__`. [ ] Uses public Aura3D APIs only, without route-specific production renderer glue. [x] Uses two distinct typed fighters: `assets.auraClashPlayerRig` and `assets.auraClashRivalRig`. [x] Runtime proof exposes fighter asset ids, URLs, hashes, distinctness, and release readiness. [ ] Uses engine fighting kit as the sole combat source of truth. |
| `apps/aura-clash-showcase/src/playable/playable.css` | Create | Production arena and HUD styling based on `Aura Clash Arena.html` handoff. | P0 | [ ] Portal, skyline, fog, platform rim, corner posts, ropes, reflections, particles, tweaks panel, responsive HUD. |
| `apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage.ts` | Create | Source representation of the visual target arena. | P0 | [ ] Visual target elements are named, togglable, and evidence-backed. |
| `apps/aura-clash-showcase/src/playable/arena/ArenaTweaksPanel.ts` | Create | Palette/backdrop/fog/motion/particles/reflections controls. | P1 | [ ] Tweaks do not affect proof determinism unless included in evidence. |
| `apps/aura-clash-showcase/src/playable/combat/auraClashMoveData.ts` | Create | Single move-data source of truth for light/heavy/special/guard/jump/down/dash. | P0 | [ ] Damage/range/startup/active/recovery/meter/cooldown defined. [ ] Damage cannot cause accidental one/two-hit KO. |
| `apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController.ts` | Create | Route adapter over engine fighting controller. | P0 | [ ] No route-only hit calculations except adapter glue. |
| `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts` | Create | Per-fighter clip map and fallback diagnostics. | P0 | [x] Active route now uses per-fighter clip maps for `auraClashPlayerRig` and `auraClashRivalRig` so UAL1/UAL2 actions resolve to embedded clips. [x] Playwright proves movement, jump/down, guard, J/K/L, KO, reset, and animation proof without missing-clip crashes. [ ] Clip maps still need extraction to this contextual module instead of living inline in `AuraClashArenaApp.ts`. |
| `apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest.ts` | Create | Audio asset map and event-to-SFX mapping. | P0 | [ ] Hit, guard, jump, dash, special, KO, UI cues mapped. |
| `apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts` | Create | Stable proof schema for local/deployed automation. | P0 | [ ] Includes assets, clips, controls, hits, HP, KO, reset, audio, renderer, performance, errors. |
| `apps/aura-clash-showcase/src/aura-assets.ts` | Modify via CLI | Register final two fighters, arena props/textures, and audio assets with contextual names. Remove release-facing attempt keys such as `v4UAL1Standard` and `v5CatalogRobot`. | P0 | [x] No invented paths for current typed assets. [x] Assets are typed. [x] Provenance exists in manifest/source evidence for current release assets. [x] No public release proof imports `assets.v4*` or `assets.v5*`. [x] Final two distinct 1.0.6 fighter rigs are registered as `auraClashPlayerRig` and `auraClashRivalRig`. [ ] Final audio assets are registered. |
| `apps/aura-clash-showcase/aura.assets.json` | Modify via CLI | Asset manifest for final registered assets. Old exploratory assets must be removed or renamed through the CLI before release. | P0 | [x] Current active manifest includes source, checksum, bounds, clips, skeleton, and asset metadata. [x] No release-facing asset id starts with an implementation-attempt prefix. [x] `auraClashPlayerRig` and `auraClashRivalRig` include CC0/Quaternius provenance, distinct hashes, bounds, humanoid skeleton metadata, and embedded clips. [ ] Final audio assets include complete license and audio metadata. |
| `apps/aura-clash-showcase/public/aura-assets/*` | Modify via CLI | Public asset filenames and thumbnails must be contextual for final release assets. | P0 | [x] No release-facing GLB/thumbnail filename begins with `v4`, `v5`, or another attempt prefix. [x] Removed assets are not referenced by manifest/tests/build output. |
| `apps/aura-clash-showcase/src/fighters/originalRoster.ts` | Rename from attempt file | Contextual roster source replacing `v1Roster.ts`. | P0 | [x] Active export barrel imports `originalRoster`. [ ] Roster data references only final contextual typed assets before release. |
| `apps/aura-clash-showcase/src/game/AudioDirector.ts` | Modify or retire | Existing app audio director should either back the contextual playable route or be replaced by engine-level audio hook. | P0 | [ ] No dead audio abstraction. [ ] Active route audio evidence proves cues. |
| `apps/aura-clash-showcase/src/game/CombatResolver.ts` | Modify or retire | Existing route combat should not conflict with engine combat world. | P0 | [ ] Engine `HitboxWorld` is source of truth. |
| `apps/aura-clash-showcase/src/game/AnimationDirector.ts` | Modify or retire | Existing animation director should use public imported GLB animation API or be removed. | P0 | [ ] No source-only animation claims for visible fighters. |
| `apps/aura-clash-showcase/src/game/InputController.ts` | Modify or retire | Existing route input should use engine input buffer/focus recovery. | P0 | [ ] Controls cannot silently fail because canvas/root lost focus. |
| `apps/aura-clash-showcase/src/data/fighters.ts` | Modify | Replace same-asset fighter metadata with two real fighters and provenance. | P0 | [ ] Distinct names, assets, palettes, clip maps, stats. |
| `apps/aura-clash-showcase/src/data/moves.ts` | Modify | Align move data with engine combat profile and active playable move table. | P0 | [ ] One canonical move table or generated from contextual playable move data. |
| `apps/aura-clash-showcase/src/data/animation-map.ts` | Modify | Map final clips; remove misleading fallback-only entries for flagship proof. | P0 | [ ] Missing required clips fail validation. |
| `apps/aura-clash-showcase/src/rendering/HitSparkVfx.ts` | Modify | Replace box/line hit artifacts with production VFX and debug toggle. | P0 | [ ] Normal play has no debug geometry. [ ] Debug play can show hitboxes intentionally. |
| `apps/aura-clash-showcase/src/rendering/GameLighting.ts` | Modify | Use final arena lighting and character readability settings. | P1 | [ ] Fighters read clearly against arena in first/action/KO frames. |
| `apps/aura-clash-showcase/src/rendering/GamePostProcess.ts` | Modify | Add acceptable bloom/vignette/scanline/reduced-motion handling. | P1 | [ ] Effects do not hide gameplay or reduce performance below budget. |
| `apps/aura-clash-showcase/src/seo/routeMetadata.ts` | Modify | Update metadata to 1.0.6 and honest claims. | P0 | [ ] No claim that game is mature until gates pass. |
| `apps/aura-clash-showcase/playable/index.html` | Modify | Ensure root target, SEO, preload, and accessibility metadata match the active contextual playable route. | P0 | [ ] GLB/audio/previews load with correct paths. |
| `apps/aura-clash-showcase/evidence/index.html` | Modify | Show 1.0.6 proof schema and latest artifacts. | P1 | [ ] Evidence page reads current proof, not stale deleted-attempt artifacts. |

### Aura Clash Tests And Evidence Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `apps/aura-clash-showcase/tests/playable-smoke.spec.ts` | Modify | Expand from smoke to control/gameplay regression proof. | P0 | [x] Tests A/D/S/Space/Shift/Q/J/K/L/P/R. [x] Tests no L crash/pause. [x] Tests KO lock and reset. |
| `apps/aura-clash-showcase/tests/visual-regression.spec.ts` | Create | Screenshot proof for visual quality states. | P0 | [ ] Captures first frame, movement, jump, guard, light, heavy, special, hit, KO, reset, mobile. |
| `apps/aura-clash-showcase/tests/performance-budget.spec.ts` | Create | Enforce load, frame, draw, memory, and asset budgets. | P0 | [ ] Fails on excessive draw calls, frame time, asset size, long-session leak. |
| `apps/aura-clash-showcase/tests/deployed-playable.spec.ts` | Create | Verify deployed route matches local requirements. | P0 | [ ] Page, JS, CSS, GLB, texture/image, audio return 200. [ ] No console errors. [ ] Controls work. |
| `apps/aura-clash-showcase/tests/asset-quality.spec.ts` | Create | Ensure final assets meet flagship criteria. | P0 | [x] `tests/flagship-readiness.spec.ts` now rejects same-model tinting and the old training mannequin in runtime proof. [x] CLI `assets validate-game --profile fighting-character --asset auraClashPlayerRig --asset auraClashRivalRig --no-placeholders --require-license` passes. [ ] Dedicated `asset-quality.spec.ts` still needs to be created if this proof should live outside the flagship suite. |
| `apps/aura-clash-showcase/tests/audio.spec.ts` | Create | Audio unlock/mute/event tests. | P0 | [ ] Audio files return 200. [ ] Mute persists. [ ] Hit/jump/KO trigger cues after user gesture. |
| `apps/aura-clash-showcase/launch-evidence/aura-clash-106-readiness.json` | Create/generated | Machine-readable final release evidence. | P0 | [ ] Generated by readiness script. [ ] Checked into release artifacts only when current. |
| `apps/aura-clash-showcase/launch-evidence/playable-106-first-frame.png` | Create/generated | Approved first-frame screenshot. | P0 | [ ] Shows readable fighters and arena. |
| `apps/aura-clash-showcase/launch-evidence/playable-106-combat-frame.png` | Create/generated | Approved action screenshot. | P0 | [ ] Shows distinct attack/hit feedback, no debug artifacts. |
| `apps/aura-clash-showcase/launch-evidence/playable-106-ko-reset.png` | Create/generated | KO/reset proof screenshot. | P0 | [ ] KO is stable, no repeated hit loop. |
| `apps/aura-clash-showcase/launch-evidence/deployed-106-proof.json` | Create/generated | Deployment parity proof. | P0 | [ ] URLs/status/errors/screenshots match deployed route. |
| `apps/aura-clash-showcase/scripts/collect-launch-evidence.mjs` | Modify | Generate 1.0.6 screenshots/proof schema. | P0 | [ ] Writes current contextual Aura Clash Arena 1.0.6 artifacts. |
| `apps/aura-clash-showcase/scripts/check-production-assets.mjs` | Modify | Enforce 1.0.6 asset profile gates. | P0 | [x] Fails same-model tinting, retired training mannequin usage, missing provenance, missing license, weak skeletons, and missing clips. |
| `apps/aura-clash-showcase/scripts/check-launch-evidence-manifest.mjs` | Modify | Validate new evidence artifact list. | P0 | [ ] Fails stale deleted-attempt evidence. |
| `apps/aura-clash-showcase/launch-evidence.manifest.json` | Modify | Include required 1.0.6 artifacts. | P0 | [ ] Manifest references all current screenshots and JSON reports. |

### Template Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/create-aura3d/templates/fighting-game/src/main.ts` | Modify | Use the same engine-level fighting runtime path as Aura Clash. | P1 | [ ] No copied route-specific Aura Clash logic. [ ] Works with typed assets. |
| `packages/create-aura3d/templates/fighting-game/src/game/fighters.ts` | Modify | Make placeholder mode explicit and validation-driven. | P1 | [ ] Placeholder mode cannot be confused with production proof. |
| `packages/create-aura3d/templates/fighting-game/src/game/stage.ts` | Modify | Use 1.0.6 game render preset. | P1 | [ ] Stage does not mark production proof as `sourceOnly`. |
| `packages/create-aura3d/templates/fighting-game/src/aura-assets.ts` | Modify | Document required asset keys and validation profiles. | P1 | [ ] Generated project tells users exactly what to add. |
| `packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts` | Modify | Add real movement/combat/animation validation. | P1 | [ ] External generated template passes build and smoke tests. |
| `packages/create-aura3d/templates/fighting-game/README.md` | Modify | Explain 1.0.6 requirements, asset profiles, and limitations. | P1 | [ ] Docs do not market placeholders as production game assets. |

### Release Tooling Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `package.json` | Modify | Add 1.0.6 readiness/release scripts and package version when release starts. | P0 | [x] `aura3d106:readiness` exists. [x] `aura3d106:release` exists. [x] `verify:aura-clash-flagship` exists. [x] `verify:aura3d106-performance` exists. [x] `verify:aura3d106-docs-claims` exists. [x] `verify:aura3d106-local-cli-pack` exists. [x] `verify:aura3d106-deployed-visual` exists. [x] `verify:aura3d106-published-cli` exists. |
| `tools/aura3d106-release-readiness/index.ts` | Create | Enforce 1.0.6 gates across engine, CLI, templates, docs, Aura Clash, assets, deployment. | P0 | [x] Exits nonzero on P0 failures. [x] Writes JSON report. [x] Internal source/local/docs/performance/packed-CLI gates are backed by authoritative reports instead of placeholder blockers. [x] Published CLI and deployed-route gates are included in the final readiness rollup. |
| `tools/aura-clash-flagship-readiness/index.ts` | Create | App-specific gate for gameplay, screenshots, performance, and deployment proof. | P0 | [x] Fails if visual/debug/control/KO/audio/performance gates fail. [x] Fails if active source uses same-model tinting or the old training mannequin as release-facing fighter proof. [x] `pnpm verify:aura-clash-flagship` passes locally after source readiness plus Playwright. |
| `tools/aura3d106-performance-budget/index.ts` | Create | Enforce 1.0.6 performance budgets for Aura Clash proof reports, source thresholds, and built JS/CSS/GLB payloads. | P0 | [x] Fails on clamped/fake frame timing. [x] Fails on oversized built JS/CSS/GLB route payloads. [x] Writes `tests/reports/aura3d106/performance-budget.json`. |
| `tools/aura3d106-docs-claims/index.ts` | Create | Enforce current-release version wording, scoped 1.0.6 claims, marketing header fit, and no unscoped engine/showcase overclaims. | P0 | [x] Fails stale current version/dependency claims. [x] Fails unscoped Unity/Unreal/Babylon/mature-engine/flagship claims. [x] Verifies marketing header one-line labels. [x] Writes `tests/reports/aura3d106/docs-claims.json`. |
| `tools/aura3d106-local-cli-pack-proof/index.ts` | Create | Pack local CLI/catalog packages and prove clean external install plus profile search/resolve behavior before publish. | P0 | [x] Packs with `pnpm pack`. [x] Verifies packed dependency is publishable semver, not `workspace:`. [x] Installs tarballs in a clean npm project. [x] Proves fighting-character search either returns suitable candidates or honest no-production-ready diagnostics. [x] Proves static aircraft resolve is rejected. |
| `tools/aura3d106-published-cli-proof/index.ts` | Create | Verify post-publish `npx @aura3d/cli@latest` exposes the corrected CLI/catalog behavior. | P0 | [x] Fails stale published packages. [x] Passes against published 1.0.6. |
| `tools/aura3d106-deployed-visual-proof/index.ts` | Create | Verify public Aura Clash routes load current code/assets and match the 1.0.6 proof contract. | P0 | [x] Checks page 200, JS/CSS/GLB/image/audio resources, console/page errors, canvas nonblank, control smoke, proof object, screenshots, and stale version text. [x] Fails stale deployment. [x] Passes after deployment update and custom-domain alias. |
| `tools/game-asset-profile-readiness/index.ts` | Create | CLI/catalog profile smoke and selected-asset validation. | P0 | [x] Covered by `tools/aura3d106-local-cli-pack-proof/index.ts` for packed local CLI. [x] Published `npx` smoke passes after publish. [x] Validates final distinct fighter assets through the Aura Clash production-asset gate. |
| `tools/docs-version-alignment/index.ts` / `tools/aura3d106-docs-claims/index.ts` | Modify/create | Ensure 1.0.6 docs/marketing/package versions and claims align with the current publish state. | P0 | [x] Catches stale current-release and marketing dependency mismatches before publish. [x] Catches unscoped overclaims. [x] Catches stale `1.0.5` current-release wording. |
| `docs/project/release-artifacts.json` | Modify/generated | Record 1.0.6 tarballs/checksums when publishing. | P0 | [ ] Includes engine, CLI, asset-index, create-aura3d artifacts. |

### Documentation Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `docs/project/aura3d-106-game-engine-and-showcase-prd.md` | Modify | This file: detailed source of truth for 1.0.6 scope and remaining peer-grade roadmap. | P0 | [x] Filename-level plan exists. [x] Checklists are current for verified local/internal/deployed/npm gates. [x] Remaining open boxes describe future mature-engine/flagship-game scope rather than blocking the scoped 1.0.6 foundation release. |
| `docs/project/aura3d-106-release-gates.md` | Create | Implementation-time gate replacing this planning checklist with actual commands/results. | P0 | [x] Lists exact required commands and pass/fail evidence. [x] Documents local packed CLI proof and honest no-production-ready catalog behavior. [x] Refreshed after published CLI/deployed proof. |
| `docs/project/aura-clash-showcase.md` | Modify | Update current status, contextual playable target, known gaps, and Definition of Done. | P0 | [ ] Removes stale version-attempt-as-final language. [ ] References 1.0.6 gates. |
| `docs/project/known-limits.md` | Modify | Explicitly state remaining engine limits. | P0 | [ ] No ambiguity about Unity/Unreal/Babylon parity. |
| `docs/project/product-boundaries.md` | Modify | Align public claims with 1.0.6 evidence. | P0 | [x] Mature engine claim is gated and scanned by `verify:aura3d106-docs-claims`. |
| `docs/project/current-state.md` | Modify | Update current package/release state after implementation. | P0 | [x] Accurate package versions and current scoped status. |
| `docs/project/claim-guidelines.md` | Modify | Add 1.0.6 allowed/not-allowed claims. | P0 | [x] Marketing cannot overstate game-engine maturity without failing `verify:aura3d106-docs-claims`. |
| `docs/project/documentation-index.md` | Modify | Keep 1.0.6 docs discoverable. | P0 | [ ] Links PRD and release gates. |
| `docs/project/site-map.md` | Modify | Link PRD/release gates in repo docs. | P0 | [ ] No orphaned release docs. |
| `docs/api/game-runtime.md` | Modify | Document 1.0.6 runtime lifecycle, fighting kit, combat, HUD, debug, audio evidence. | P0 | [ ] Examples compile. [ ] No route-only APIs. |
| `docs/api/animation-runtime-events.md` | Modify | Document imported GLB game animation events and clip requirements. | P0 | [ ] Clip event to hitbox examples included. |
| `docs/api/assets.md` | Modify | Document game-asset profiles and resolver rejection behavior. | P0 | [ ] External CLI commands work. |
| `docs/animation/runtime-support.md` | Modify | State exactly what imported GLB animation supports and does not support. | P0 | [ ] T-pose/stuck animation failure modes are documented. |
| `docs/physics/runtime.md` | Modify | Document fighting movement/combat helpers. | P1 | [ ] Jump/down/dash/guard/hitstun examples included. |
| `docs/examples/fighting-game.md` | Modify | Align example with 1.0.6 template. | P1 | [ ] Example is generated and tested. |
| `docs/agents/game-showcase-build.md` | Modify | Tell agents how to build a game showcase without inventing assets or debug primitives. | P0 | [ ] Uses CLI profiles and typed assets. |
| `docs/agents/asset-workflow.md` | Modify | Include `--profile` workflow and no-match behavior. | P0 | [ ] Agents know not to force bad candidates. |
| `llms.txt` | Modify | Update compact agent guidance after 1.0.6 APIs are real. | P0 | [ ] Tells agents the exact public game-runtime path. [ ] Does not overclaim. |
| `README.md` | Modify | Update 1.0.6 release summary and honest game-runtime/showcase status. | P0 | [x] Badges/current release wording align with npm baseline `1.0.6`. [x] Scoped release summary is active after publish/deploy/readiness gates. [x] README still states Aura3D is not a mature commercial game engine. |
| `CHANGELOG.md` | Modify | Add 1.0.6 release notes after implementation. | P0 | [ ] Separates engine, CLI, showcase, docs, fixes, known limits. |

### Marketing And Website Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `marketing/index.html` | Modify | Update version, claims, homepage Aura Clash preview/poster, header fit, and game CTA. | P0 | [x] Version says 1.0.6 after publish. [x] Header labels fit one line. [x] Static poster/preview is used while live preview remains gated. |
| `marketing/src/styles.css` | Modify | Header layout, one-line nav labels, responsive preview, and Aura Clash visual polish. | P0 | [x] `Aura Clash`, `Agent context`, and `Get started` do not wrap. |
| `marketing/src/main.ts` | Modify if needed | Update interactive copy buttons/version data or poster behavior. | P1 | [ ] No stale 1.0.5 command copy after release. |
| `marketing/sections/aura-clash-homepage.html` | Modify | Use approved static poster or proven live preview. | P0 | [x] Uses static preview instead of unstable live embed until 1.0.6 visual/gameplay gates pass. [ ] Homepage crop must still be verified after deploy. |
| `marketing/sections/aura-clash-homepage.css` | Modify | Preview sizing and responsive behavior. | P0 | [ ] No awkward clipped HUD/game view. |
| `marketing/previews/aura-clash-poster.svg` | Replace/generated | Static fallback poster until live embed is good enough. | P0 | [ ] Poster matches current game route and is visually approved. |
| `marketing/public/previews/aura-clash-poster.svg` | Replace/generated | Public copy of approved poster. | P0 | [ ] Deployed homepage loads this asset with 200. |
| `marketing/docs/aura-clash.html` | Modify | Update showcase docs and evidence. | P0 | [ ] No stale version-attempt claims after the contextual Aura Clash Arena implementation ships. |
| `marketing/docs/aura-clash-showcase.html` | Modify | Same as above if both pages remain. | P0 | [ ] Pages are not contradictory. |
| `marketing/docs/*.html` | Modify as needed | Version and claim alignment. | P0 | [x] Current public marketing entry point and docs-claims gate use 1.0.6 scoped wording. |
| `marketing/package.json` | Modify | Depend on `@aura3d/engine@1.0.6` after release. | P0 | [ ] Install/build succeeds. |
| `marketing/package-lock.json` | Modify/generated | Lockfile update after version bump. | P0 | [ ] Lockfile references published 1.0.6. |

### Files To Delete Or Quarantine

Failed implementation attempts should be deleted, not archived inside the app. Quarantine is allowed only for release artifacts that must be retained as historical evidence under an explicit non-shipping docs/evidence location. Quarantined files must not be imported, built, linked, used by screenshots, or referenced by marketing proof.

| File or directory | Action | Reason | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `apps/aura-clash-showcase/src/game-v3/` | Delete | Pose-fallback legacy implementation. | P1 | [x] Deleted. [x] Not imported. [x] Not linked by route. |
| `apps/aura-clash-showcase/src/game-v4/` | Delete | Failed external-asset route. | P1 | [x] Deleted. [x] Not imported. [x] Not used for proof. |
| `apps/aura-clash-showcase/src/game-v5/` | Delete | Procedural primitive route that damaged showcase credibility. | P1 | [x] Deleted. [x] Not imported. [x] Not used for proof. |
| `apps/aura-clash-showcase/src/game-v6/` | Delete | Useful runtime proof but not flagship-quality implementation; contextual source replaced it. | P1 | [x] Deleted. [x] Not imported. [x] Not linked by route. |
| `apps/aura-clash-showcase/archive/` | Delete | Failed route attempts should not stay in repo as alternate implementations. | P0 | [x] Deleted. |
| `apps/aura-clash-showcase/launch-evidence/archive/` | Delete | Stale screenshots/proofs should not look like release evidence. | P0 | [x] Deleted. |
| stale `launch-evidence/*v5*` and stale `*v6*` artifacts | Replace/delete | Prevent release reports from proving the wrong route. | P0 | [x] Stale V5/V6 artifacts removed from active evidence path. [ ] 1.0.6 manifest points only to current evidence. |
| `apps/aura-clash-showcase/src/fighters/v1Roster.ts` | Rename/delete | Attempt-number roster name in active source. | P0 | [x] Renamed to `src/fighters/originalRoster.ts`. |
| `apps/aura-clash-showcase/src/aura-clash-v2/` | Delete | Empty attempt-number directory in active source. | P0 | [x] Deleted. |

### Required Versioned-Name Rename Map

The release should not merely stop importing version-attempt files. It should rename the active implementation to product/context names and delete failed historical attempts.

| Current name | Required active/context name | Action | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- |
| `apps/aura-clash-showcase/src/game-v6/AuraClashV6App.ts` | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Replace with contextual implementation. | P0 | [x] Active route imports only `AuraClashArenaApp`. |
| `apps/aura-clash-showcase/src/game-v6/playable.css` | `apps/aura-clash-showcase/src/playable/playable.css` | Replace with contextual stylesheet. | P0 | [x] Active route imports only contextual stylesheet. |
| `window.__AURA_CLASH_V6_PROOF__` | `window.__AURA_CLASH_ARENA_PROOF__` | Rename proof object and update tests. | P0 | [x] Browser proof reads contextual object only. |
| `launch-evidence/playable-smoke-v6-first-frame.png` | `launch-evidence/aura-clash-arena-first-frame.png` | Rename generated screenshot artifact. | P0 | [x] Playwright writes contextual screenshot. [ ] Manifest references contextual screenshot only. |
| `launch-evidence/playable-smoke-v6-combat-frame.png` | `launch-evidence/aura-clash-arena-combat-frame.png` | Rename generated screenshot artifact. | P0 | [x] Playwright writes contextual screenshot. [ ] Manifest references contextual screenshot only. |
| `game-v3` directory | Deleted | Delete historical implementation. | P1 | [x] Not imported or linked. |
| `game-v4` directory | Deleted | Delete historical implementation. | P1 | [x] Not imported or linked. |
| `game-v5` directory | Deleted | Delete historical implementation. | P1 | [x] Not imported or linked. |
| `game-v6` directory | Deleted | Delete after active replacement passes. | P1 | [x] Not imported or linked. |
| `src/fighters/v1Roster.ts` | `src/fighters/originalRoster.ts` | Rename active roster source. | P0 | [x] Export barrel imports contextual name. |
| `src/aura-clash-v2/` | Deleted | Delete empty attempt directory. | P0 | [x] Directory removed. |
| `assets.v4UAL1Standard` / `assets.auraClashTrainingMannequin` as release fighter proof | `assets.auraClashPlayerRig` and `assets.auraClashRivalRig` | Replace attempt-named and same-model training proof with two contextual, distinct typed fighter rigs registered through the CLI. | P0 | [x] Active playable route does not import attempt-named asset keys. [x] Final active fighters are distinct contextual typed assets with different hashes. [x] Playwright smoke/flagship tests reject the retired training mannequin as release-facing proof. |
| `assets.v5CatalogRobot` | Deleted from release-facing manifest/public assets | Removed failed catalog proof asset from release-facing app assets. | P0 | [x] Manifest and public assets do not expose failed catalog proof as release-facing content. |
| Marketing text `Aura Clash V6` | `Aura Clash Arena` | Update public copy. | P0 | [x] No public page exposes attempt number as product label. |
| Test type `AuraClashV6Proof` | `AuraClashArenaProof` | Update test contract. | P0 | [x] Tests use contextual proof type. |

### Versioned-Name Release Check

Create a release check that fails on active version-attempt names.

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `tools/versioned-source-name-check/index.ts` | Create/modify | Scan active source/docs/marketing/tests, asset manifests, and public asset filenames for forbidden implementation names. | P0 | [x] Fails on `game-v7`, `AuraClashV7`, `__AURA_CLASH_V6_PROOF__`, `playable-v6`, public `Aura Clash V6` labels, `v1Roster`, `assets.v4UAL1Standard`, and `v5CatalogRobot`. [x] Allows package versions and the PRD's forbidden-name examples. [x] Excludes lockfiles so dependency hashes do not create false positives. [x] Current report is clean after current contextual asset re-registration. |
| `package.json` | Modify | Add `verify:versioned-source-names`. | P0 | [x] Included as package script. [x] Included in `aura3d106:readiness`. |
| `tools/aura3d106-release-readiness/index.ts` | Modify | Run versioned-name check as a release blocker. | P0 | [x] 1.0.6 readiness fails if active version-attempt names remain. |

## Detailed Implementation Checklist

### P0 Engine Checklist

- [ ] Create public game-app lifecycle API.
- [ ] Bind typed GLB models to production renderer through public API.
- [ ] Expose imported GLB animation evidence on runtime nodes.
- [ ] Add clip restart, one-shot, blend, event-window, and KO-loop prevention.
- [ ] Move Aura Clash hit resolution to engine `HitboxWorld`.
- [ ] Add fighting movement preset with high jump, fast-fall/down, dash, crouch, bounds.
- [ ] Add input buffer, focus recovery, replay, and remapping baseline.
- [ ] Add game audio event hooks and mute/unlock behavior.
- [ ] Add renderer performance and lifecycle evidence.
- [ ] Add structured error schema for renderer, asset, animation, input, audio, and route boot failures.

### P0 Aura Clash Checklist

- [x] Create contextual active route under `apps/aura-clash-showcase/src/playable/`.
- [x] Use two distinct licensed typed fighter GLBs for the active local route: `assets.auraClashPlayerRig` and `assets.auraClashRivalRig`.
- [x] Use the approved arena handoff design in the current CSS/SVG hybrid route.
- [ ] Implement visible distinct J light, K heavy, L special, Q guard, Space jump, S down/fast-fall, Shift dash.
- [ ] Tune damage so rounds do not end from one or two accidental hits.
- [x] Stop all combat and animation spam after KO.
- [x] Add reset/rematch that fully resets HP, timer, AI, input, animation, meter, and proof state.
- [x] Remove box/line/debug artifacts from normal hit VFX.
- [ ] Add music/SFX and mute.
- [x] Add performance and visual proof.
- [ ] Update homepage to static approved poster or proven live preview.

### P0 CLI/Asset Checklist

- [x] Add `--profile` to `assets search`.
- [x] Add `--profile` to `assets resolve`.
- [x] Add `--profile` to `assets validate-game`.
- [x] Reject unsuitable fighting-character candidates with reasons beyond the current animated/license/GLB/triangle profile filters in local source and packed CLI proof.
- [x] Validate final two active local fighters with license/provenance/checksum/bounds/clips/skeleton through explicit `assets validate-game --profile fighting-character --asset auraClashPlayerRig --asset auraClashRivalRig --no-placeholders --require-license`.
- [ ] Validate arena/textures/audio assets.
- [x] Run packed local CLI smoke from a clean temp directory.
- [x] Run external `npx @aura3d/cli@latest` smoke from a temp directory after publish.

### P0 Test Checklist

- [ ] Root `pnpm typecheck` passes.
- [ ] Root `pnpm build` passes.
- [ ] Engine unit tests pass.
- [ ] Animation unit/browser tests pass.
- [ ] Physics/combat tests pass.
- [ ] CLI profile tests pass.
- [ ] Template generation smoke passes externally.
- [x] Aura Clash local Playwright tests pass.
- [ ] Aura Clash visual regression screenshots pass review.
- [ ] Aura Clash audio tests pass.
- [x] Aura Clash performance budget passes.
- [ ] Deployed route proof passes.
- [ ] No console errors.
- [ ] No failed JS/CSS/GLB/texture/image/audio requests.
- [ ] No blank canvas.

### P0 Docs/Release Checklist

- [x] `README.md` updated with honest current-release and scoped 1.0.6 wording.
- [x] `llms.txt` updated with 1.0.6 claim boundaries and current public API guidance.
- [ ] `CHANGELOG.md` updated.
- [ ] `docs/project/aura3d-106-release-gates.md` created.
- [ ] `docs/project/aura-clash-showcase.md` updated.
- [ ] `docs/project/known-limits.md` updated.
- [x] `docs/project/product-boundaries.md` updated.
- [x] `docs/project/claim-guidelines.md` updated.
- [ ] `docs/api/game-runtime.md` updated.
- [ ] `docs/api/animation-runtime-events.md` updated.
- [ ] `docs/api/assets.md` updated.
- [x] Marketing current version/dependency wording and header fit fixed for the current 1.0.6 baseline.
- [x] npm package versions verified at 1.0.6 for public packages.
- [ ] GitHub release text matches proof.

## Required 1.0.6 Acceptance Gates

### Engine Gates

- [x] Public `npx @aura3d/cli@latest` works for search, resolve, add, validate-game, and check-deploy outside the monorepo for the scoped proof cases.
- [ ] Asset catalog profiles reject unsuitable game assets.
- [ ] Public runtime lifecycle API is used by Aura Clash and one template.
- [ ] Public typed GLB animation API drives visible renderer-side skeletal animation.
- [ ] Engine combat world, not route-only local logic, drives hit resolution in the showcase.
- [ ] Input buffering, focus recovery, touch/gamepad baseline, and replay evidence exist.
- [ ] Audio event hooks or game audio helper exist and are documented.
- [x] Performance budgets are enforced for current local Aura Clash route proof and built route payloads.
- [ ] Error schema prevents blank/no-proof failures.
- [x] Docs and README claim only what tests prove for the current 1.0.6 scoped runtime-foundation release and keep mature-engine/flagship-game claims out of scope.

### Showcase Gates

- [x] Two distinct licensed typed fighters pass the current local active-route proof.
- [ ] Usable clip set for idle, walk/run, jump/fall/land, down/crouch/fast-fall, dash, guard, light, heavy, special, hit, KO, win.
- [ ] Every control visibly changes state and cannot crash/pause accidentally.
- [ ] Damage curve avoids accidental one/two-hit KO in both automated proof and manual review after the latest tuning.
- [x] KO stops combat until reset/rematch.
- [x] No debug boxes, random lines, placeholder shapes, or repeated hit artifacts in normal play.
- [ ] Arena matches the upgraded visual target with portal, skyline, fog, neon platform, corner posts, ropes, reflections, and responsive layout.
- [ ] Audio works with mute and autoplay-safe unlock.
- [ ] Playwright screenshots are approved for first frame, action, hit, KO, reset, and mobile.
- [x] Deployed route matches local route for the scoped 1.0.6 proof gate.
- [x] Homepage uses approved static poster/preview behavior, not an unstable embedded crop.

## Out Of Scope And Peer-Grade Boundaries For 1.0.6

1.0.6 should raise Aura3D to a peer-credible browser-engine foundation. That is in scope.

The following remain out of scope unless the release is explicitly expanded beyond this PRD:

- Complete Unity/Unreal editor parity.
- Rollback netcode or multiplayer matchmaking.
- Console/native mobile build targets.
- Marketplace-quality asset store.
- Full terrain/world authoring tools.
- Full visual scripting production editor.
- AAA animation retargeting pipeline.
- Full commercial physics-engine parity.
- Full Babylon.js feature parity.

The important boundary is this:

- 1.0.6 should be competitive enough that Aura3D is not dismissed as primitive AI slop.
- 1.0.6 should not pretend to have every feature, editor workflow, renderer feature, and ecosystem depth of engines that have existed for years.

If public copy says "same level as Three.js/Babylon.js for browser game work," then the peer-grade P0 checklist and peer benchmark report are mandatory release blockers.

## Release Claim Rules

### If All P0 Gates Pass

Aura3D 1.0.6 may say:

- "AI-native TypeScript browser game-runtime foundation."
- "Production GLB animation and combat showcase evidence."
- "Typed asset and catalog workflow with game-asset validation profiles."
- "Flagship browser fighting showcase route with local and deployment proof."

### If Engine P0 Gates Pass But Showcase P0 Gates Do Not

Aura3D 1.0.6 may say:

- "Game-runtime foundation improved."
- "Flagship showcase remains in development."

Aura3D 1.0.6 must not say:

- "Flagship game shipped."
- "Mature game engine."

### If Showcase P0 Gates Pass But Engine P0 Gates Do Not

Aura3D 1.0.6 may say:

- "Aura Clash is a polished custom showcase built on Aura3D."

Aura3D 1.0.6 must not say:

- "Aura3D has reusable mature game-engine systems."

## Final 1.0.6 Definition Of Done

Aura3D 1.0.6 is done only when:

- the engine runtime path is reusable and documented;
- typed animated GLB playback is public, visible, tested, and not route-specific;
- catalog/CLI game-asset profiles prevent poor prompt-selected assets from becoming flagship blockers;
- Aura Clash or its successor is visually and mechanically credible;
- all controls, combat states, KO, reset, audio, and UX pass tests;
- local and deployed proof agree;
- docs, README, marketing, npm package metadata, and GitHub release claims match evidence;
- no release-facing doc implies Aura3D is a mature game engine unless the engine gates above are green.
