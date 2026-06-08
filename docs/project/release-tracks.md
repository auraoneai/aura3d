# Release Tracks

Version: 1.2.0
Date: 2026-06-07

Aura3D v1.1.0 is the runtime-foundation, typed GLB actor evidence, asset-catalog profile, CLI, template, docs, npm package, GitHub repository, marketing-site, and Aura Clash development-showcase release track.

## Launch Positioning

Aura3D is the AI-native TypeScript 3D SDK for browser software. It gives developers and AI coding agents a complete path from prompt to polished scene: primitives, scene kits, typed GLB/glTF assets, product viewers, physics, particles, materials, diagnostics, screenshot checks, templates, and static deployment workflows.

Aura3D is positioned for teams searching for a modern Three.js alternative, Babylon.js alternative, Unity-to-web workflow, Unreal-to-web workflow, WebGL/WebGPU 3D library, TypeScript 3D engine, React 3D SDK, GLB viewer, glTF product configurator, prompt-to-3D SDK, and AI agent development toolkit.

## Current Release

- npm package target: `@aura3d/engine@1.1.0`
- Public developer API: `@aura3d/engine`
- CLI package target: `@aura3d/cli@1.1.0`
- Scaffold package target: `create-aura3d@1.1.0`
- Website: `https://aura3d.auraone.ai`
- Repository: `https://github.com/auraoneai/aura3d`
- Primary install path: `npm install @aura3d/engine`

## 1.1.0 Release Note

`@aura3d/engine@1.1.0` ships a scoped browser game-runtime foundation: typed GLB actor/runtime evidence, fighting-game template improvements, CLI `--profile fighting-character` search/resolve/validation behavior, Aura Clash Arena deployed-route proof, docs/claims gates, performance budgets, and npm `@latest` verification.

Publication status: npm `latest` points at `@aura3d/engine@1.1.0`, `@aura3d/asset-index@1.1.0`, `@aura3d/cli@1.1.0`, and `create-aura3d@1.1.0`. Aura Clash Arena is the live development showcase / runtime proof target, built with starter-grade fighter assets.

## 1.2 Animation Engine Track

Aura3D 1.2 is the prepared animation-engine release track on top of 1.1.0. It is implemented and verified in the repo; the `1.2.0` packages are publish-pending while npm `latest` continues to serve the `1.1.x` line.

What 1.2 adds:

- `@aura3d/animation`: locomotion state-graph + kit (`createLocomotionAnimationStateGraph`, `createLocomotionKit`), generic `validateAnimationClipMap`, a shared fighter-animation adapter (`resolveFighterClip`, `fighterCrossfadeWeights`).
- `@aura3d/assets`: per-clip bone-mask blending in `applyClips` for layered playback (`GLTFSceneAnimationClipBoneMask`, `mask?` on the clip sample).
- `@aura3d/cli`: `aura3d assets validate-animation`.
- `create-aura3d`: `animation-studio` and `character-controller` starter templates.
- Aura Clash Arena: a browser-verified motion upgrade — crossfaded transitions, weight/airborne-varied hit reactions, and upper-body attack layering — with deterministic combat replay stable.

Capability boundaries: foot IK is per-limb two-bone; spring bones are secondary dynamics; precise technical limits live in `docs/project/known-limits.md`. Aura Clash reuses its starter fighter art, so it remains a development showcase of the engine.

Primary reference: `docs/animation/believable-motion.md`.

## 1.3 Believable-Motion Track

Aura3D 1.3 is the believable-motion release track on top of 1.2. It is implemented and gate-verified in the repo; the version bump to `1.3.0` / publish is pending authorization.

What 1.3 adds:

- `@aura3d/animation`: critically-damped, momentum-preserving state transitions (`Inertialization` module + `fighterInertializedWeights`, the new default fighter transition with the linear crossfade kept as a fallback), runtime two-bone foot IK with a foot-lock (`FootIk.ts`), spring-bone secondary dynamics (`SpringBones.ts`), and animation event tracks (`AnimationEventTrackContainer`) with an `EventTrackEditor` browser authoring lane.
- `@aura3d/rendering`: a texture-backed morph-target path (`createMorphTargetPlan`) that lifts the 4-target/64-vertex GPU cap for facial blendshape rigs, normal morphing so lighting follows the deformation, and WebGPU character skinning at 96-joint WebGL2 parity.
- `@aura3d/engine`: a first-class `node.morphInfluence(name, weight)` API and viseme-driven blendshape lip-sync (`applyVisemeMorphInfluences`).
- Aura Clash Arena: now runs the foot IK + foot-lock (with footsteps), spring body-sway, critically-damped move transitions, and authored clip-event hit/footstep/VFX frames live, with deterministic combat replay still stable.

Capability boundaries: foot IK is per-limb two-bone; spring bones are secondary dynamics; precise limits live in `docs/project/known-limits.md`. The Aura Clash fighter rigs carry no facial blendshapes, so the morph/viseme work is exercised by Animation Studio and the morph proofs. Aggregate gate: `pnpm animation-engine:believable-motion`.

## 1.1 Animation Studio Track

Aura3D 1.1 is the proposed animation-studio and animation-engine release track. It builds on 1.1.0 prompt-animation contracts, AuraVoice timing packages, typed assets, shot timelines, captions, visemes, render queues, templates, and release evidence.

The 1.1 track is complete only when a clean external project can scaffold `animation-studio`, validate two typed character assets and one typed set, preview a real episode route, render a playable episode file, export captions and metadata, write a package folder, and produce motion/visual/review evidence.

Allowed planning language:

- "Aura3D 1.1 is planned to provide a browser-native animation episode pipeline."
- "The target workflow turns typed assets, show-bible metadata, shot timelines, dialogue/captions, visemes, and render queues into an episode package."
- "The release gate will reject still-image puppet output as animation proof."

Blocked language until the 1.1 gates pass:

- "Aura3D generates Pixar-quality animations."
- "Aura3D turns any still image into a production animated episode."
- "Aura3D replaces Blender, Maya, Toon Boom, Unity, Unreal, or a production animation studio."
- "A still image with CSS transforms, shake, pan, zoom, fake parallax, or subtitles is real animation animation."

Primary reference: `docs/examples/animation-studio.md`.

## 1.0.5 Release Note

`@aura3d/engine@1.0.5` folds in the 1.0.4 game-runtime foundation plus animation/editor/visual-scripting source evidence, the federated asset catalog, CLI `assets search` and `assets resolve` flow, prompt-plan intent resolution, prompt-animation/AuraVoice source contracts, typed templates, and the previous no-Three.js runtime boundary.

Publication status: historical. The current npm `latest` release is 1.1.0.

## 1.0.4 Release Note

`@aura3d/engine@1.0.4` was the asset-catalog and game-runtime source track that led into 1.0.5. Treat it as historical planning context, not the active public package target.

## 1.0.3 Release Note

`@aura3d/engine@1.0.3` removed Three.js from the root engine runtime and npm dependency graph. That cleanup remains part of the 1.0.4 baseline.

## Launch Copy

Use direct product language:

- Aura3D turns prompts into editable TypeScript 3D scenes.
- Aura3D gives AI coding agents maintained scene systems instead of blank renderer glue.
- Aura3D ships typed assets, scene kits, diagnostics, screenshots, templates, and deploy checks.
- Aura3D helps teams build browser 3D product viewers, configurators, cinematic scenes, mini-games, data scenes, physics playgrounds, and AI-generated environments.
- Aura3D is built for developers comparing modern browser 3D libraries, Three.js alternatives, Babylon.js alternatives, Unity web options, and Unreal web options.

## Launch Assets

Keep these surfaces aligned for each public release:

- Root README and npm package metadata.
- GitHub description, homepage, and topics.
- Marketing website and generated HTML docs.
- Published npm package README.
- Agent docs under `docs/agents/`.
- Examples and template README files.

## Planning Document Cleanup

The former root planning PRDs were decomposed into durable docs and launch-facing evidence artifacts. Current docs should use these files instead of a root planning PRD:

- `docs/agents/prompt-to-3d-workflow.md`
- `docs/project/release-tracks.md`
- `docs/project/launch-positioning.md`
- `docs/project/marketing-site.md`
- `docs/examples/advanced-gallery.md`
