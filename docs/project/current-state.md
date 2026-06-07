# Current State

Version: 1.0.10

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

Current published package version:

- `@aura3d/engine@1.0.10`
- `@aura3d/cli@1.0.10`
- `@aura3d/asset-index@1.0.10`
- `create-aura3d@1.0.10`

Current release tracks:

- Aura3D SDK npm/deployed artifact: complete for the scoped 1.0.10 runtime-foundation release. See `docs/project/release-tracks.md` and `docs/project/aura3d-110-release-gates.md`.
- Aura3D mature game-engine and flagship-showcase target: still future work beyond the scoped 1.0.10 claim boundary.
- Aura3D 1.1 Cartoon Studio: proposed major-release track. The current codebase has prompt-animation contracts, AuraVoice bridge metadata, shot timelines, captions, viseme cues, render queues, typed asset profiles, and source-level templates. It does not yet have a completed publish-ready cartoon episode pipeline. The 1.1 definition of done is tracked in `docs/project/aura3d-1.1-cartoon-studio-prd.md`.

Current Aura Clash status:

- Aura Clash Arena is a development showcase and runtime proof target.
- It should not be described as a flagship-quality game or proof of mature game-engine parity.
- Public pages may link the deployed playable route when release evidence is current, but marketing copy must keep Aura Clash framed as a development showcase rather than a polished commercial game.

Legacy pre-cutover work is preserved under `archive/legacy-ai-runtime/` and is
not an active product surface.

Current cartoon/animation boundary:

- `cartoon-channel` and `prompt-cartoon-channel` are source-level examples unless their browser render, motion, package, and review gates pass.
- `cartoon-studio` is the planned 1.1 production template, not a completed shipped studio workflow yet.
- Still-image puppet output, including CSS wobble, pan, zoom, shake, fake parallax, subtitles over a generated still, or reports marked `notTrue3D: true`, is rejected as publish-ready cartoon evidence.
- Aura3D may use generated images as concept frames, thumbnails, textures, style references, or background plates, but the animation claim must come from typed assets, rigs or segmented puppet parts, timelines, visemes, captions, render output, and visual/motion acceptance evidence.
