# Current State

Version: 1.3.3

Aura3D is a developer library, asset deployment pipeline, template system,
diagnostics surface, and agent-readable documentation set for AI coding agents
that write browser 3D app code.

Active product pillars:

- public agent API in `@aura3d/engine`
- optional `@aura3d/react` adapter
- `@aura3d/cli` asset and deployment workflow
- `create-aura3d` starter templates
- live starter examples
- prompt-plan and scene-kit workflows for AI coding agents
- typed GLB/glTF asset provenance
- diagnostics, screenshots, route health, and deployment checks
- marketing/docs site grounded in shipped APIs

Current published package version (npm `latest`):

- `@aura3d/engine@1.3.3`
- `@aura3d/cli@1.3.3`
- `@aura3d/asset-index@1.3.3`
- `create-aura3d@1.3.3`

All 26 packages (`@aura3d/*` + `create-aura3d`) are published and installable. The
repo is at `1.3.3` (Believable-Motion + Animation Studio).

Current release tracks:

- Aura3D SDK npm/deployed artifact: complete for the scoped 1.3.3 believable-motion + animation-studio release. See `docs/project/release-tracks.md`.
- Aura3D 1.2 Animation Engine: prepared release track. `@aura3d/animation` adds a locomotion state-graph + kit, generic clip-map validation, a shared fighter-animation adapter, and per-clip bone-mask blending in `applyClips` (layered playback); the CLI adds `assets validate-animation`; `create-aura3d` adds `animation-studio` and `character-controller` templates. The deployed Aura Clash arena gained a browser-verified motion upgrade (crossfaded transitions, weight/airborne-varied hit reactions, upper-body attack layering) with deterministic combat replay stable. Documented in `docs/animation/believable-motion.md`.
- Aura3D 1.3 Believable-Motion: published release track on top of 1.2 (live on npm as `1.3.3`). `@aura3d/animation` adds critically-damped momentum-preserving state transitions, runtime two-bone foot IK with a foot-lock, spring-bone secondary dynamics, and animation event tracks (hitbox active-frames + footstep/VFX, with a browser editor authoring lane). `@aura3d/rendering` adds a texture-backed morph-target path (lifts the 4-target/64-vertex cap), normal morphing, a `node.morphInfluence` API with viseme lip-sync, and WebGPU character skinning at 96-joint parity. Every feature is gate-backed via `pnpm animation-engine:believable-motion`. The Aura Clash arena now runs the foot IK, spring body-sway, critically-damped transitions, and authored clip-event hit/footstep/VFX frames live. Documented in `docs/animation/believable-motion.md`.
- Aura3D animation engine: the 1.2/1.3 work ships critically-damped transitions, two-bone foot IK with a foot-lock, spring-bone secondary dynamics, animation event tracks, texture-backed facial morph targets with viseme lip-sync, and 96-joint character skinning on WebGL2 and WebGPU — each gate-backed via `pnpm animation-engine:believable-motion`. Capability boundaries (per-limb two-bone foot IK; spring-bone secondary dynamics) are documented precisely in `docs/project/known-limits.md`.
- Aura3D 1.1 Animation Studio: shipped major-release track. See `docs/examples/animation-studio.md`.

Current Aura Clash status:

- Aura Clash Arena is a development showcase and runtime proof target built with starter-grade fighter assets.
- 1.2 added a verified motion upgrade — crossfaded state transitions, hit reactions that vary by attack weight and grounded/airborne state, and attacks layered on an upper-body bone mask over a walking lower body. 1.3 layers on the believable-motion runtimes live: critically-damped (momentum-preserving) move transitions, two-bone foot IK with a foot-lock (planted feet stop sliding) plus footsteps, spring-bone body-sway, and authored clip-event hit/footstep/VFX frames. It uses the same starter fighter art (the rigs carry no facial blendshapes, so morph/viseme is exercised in Animation Studio).
- Public pages may link the deployed playable route when release evidence is current, but marketing copy must keep Aura Clash framed as a development showcase rather than a polished commercial game.

Legacy pre-cutover work is preserved under `archive/legacy-ai-runtime/` and is
not an active product surface.

Current animation/animation boundary:

- `animation-channel` and `prompt-animation-channel` are source-level examples unless their browser render, motion, package, and review gates pass.
- `animation-studio` is the planned 1.1 production template, not a completed shipped studio workflow yet.
- Still-image puppet output, including CSS wobble, pan, zoom, shake, fake parallax, subtitles over a generated still, or reports marked `notTrue3D: true`, is rejected as publish-ready animation evidence.
- Aura3D may use generated images as concept frames, thumbnails, textures, style references, or background plates, but the animation claim must come from typed assets, rigs or segmented puppet parts, timelines, visemes, captions, render output, and visual/motion acceptance evidence.
