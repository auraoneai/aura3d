# Aura3D Known Limits

Version: 1.1.0 planning alignment

## Current Report Limits

- `tests/reports/` is ignored by git, so report state is local and must be regenerated in clean checkouts, release jobs, and any workspace used for public claim evidence.
- Passing local reports support only the exact measured categories and routes named by those reports.

## Rendering Limits

- Renderer scene frustum culling is implemented, but it is not a broad large-scene performance claim.
- WebGPU behavior depends on browser and hardware support.
- PBR/IBL/material claims are feature-specific and route/report-specific. HDR environment map input is supported on named paths, but it is not physically complete image-based lighting.
- Postprocess support covers named passes and routes, not every low-level renderer code or game-engine post stack.
- Material coverage includes one primary UV path for glTF render resources, bounded KTX2/Basis transcoding coverage, GPU capability-driven format selection, and no product-studio material-matrix visual coverage.
- Shadow coverage includes unit-level moving-camera cascade split stress and point/spot shadow maps, but browser visual stress for long moving-camera paths remains evidence-bound.
- Skinning palette strategy and external character breadth remain evidence-bound.

## Asset Limits

- glTF/GLB support is strongest for checked fixtures and tested extension paths.
- Compression depends on decoder/transcoder availability and browser/device texture support.
- External marketplace and DCC export coverage requires explicit fixture and report evidence.

## Workflow Limits

- Local examples are not public hosted demo evidence.
- Template scaffolds are starter projects and require build/run verification.

## Game Runtime And Showcase Limits

- Aura3D 1.1.0 ships browser game-runtime helpers; the reusable game-engine foundation continues to expand across releases (1.2 animation engine, 1.3 believable-motion).
- Aura Clash Arena is the live development showcase and runtime proof target, built with starter-grade fighter assets.
- The showcase has not yet proven distinct production fighters, engine-owned combat state, reliable special/guard/down behavior, stable KO/reset flow, audio, performance budgets, and deployed/local parity at the 1.1.0 bar.
- Same-model tinting, debug-like hit artifacts, repeated KO loops, weak move readability, and one/two-hit accidental rounds remain release blockers if reproduced.
- Homepage and marketing pages should use a static approved poster/link until the live playable route passes visual and gameplay gates.

## Animation Engine Non-Goals And Fixtures

These animation capabilities are explicitly NOT provided as production systems. They must never be claimed as parity or production-ready (the `tools/animation-engine-docs-claims` gate enforces this):

- Motion matching is NOT a real engine. `packages/animation/src/MotionMatchingFixtures.ts` is a deterministic fixture (it carries a `claimBoundary` saying it is not a full animation database, inertialization, pose application, foot locking, or Unity/Unreal middleware parity).
- Inertialization is NOT implemented.
- Ragdoll is NOT a production system. `packages/physics/src/PhysicsSandboxFixtures.ts` only spawns a hinge-constrained sandbox preset; there is no `RagdollController`, no joint limits, and no animation-to-physics blend.
- Full-body IK / FABRIK / CCD are NOT implemented. Only an analytical two-bone IK solver exists (`packages/animation/src/IK.ts`).
- Production foot-locking, spring-bone, cloth, and hair simulation are NOT provided. `packages/animation/src/SecondaryAnimationFixtures.ts` is a deterministic fixture, not production secondary animation.
- Unity Mecanim / Unity Animation Rigging / Unreal Control Rig parity is NOT claimed.
- Skinned toon/cel materials are NOT shipped yet (animation shading for rigged characters is deferred); skinned GPU instancing is not provided. WebGPU skinning is now at WebGL2 parity — a 96-joint palette (`MAX_WEBGPU_SKINNING_JOINTS = 96`, matching the WebGL2 `u_jointMatrices[96]`): the WGSL DrawUniforms carries a `joints: array<mat4x4<f32>, 96>` palette and the emulation rasterizer skins the full palette (verified by `webgpu-skinning-parity`). Real-device WGSL execution remains evidence-bound (the CPU-emulated rasterizer covers correctness in CI). GPU morph targets use a uniform fast path up to 4 targets / 64 verts and a texture-backed plan (`createMorphTargetPlan`) for larger facial rigs (sized to device limits); counts beyond the texture limit fall back to the CPU morph. The CPU morph (and the texture plan) morph normals + tangents so lighting follows the deformation; viseme-driven blendshape lip-sync is wired (`applyVisemeMorphInfluences`). The texture-backed GPU sampling branch is implemented in the morph shader; WebGPU/WGSL texture morph execution remains evidence-bound.

## Asset Catalog Limits

- `npx @aura3d/cli@latest assets search` can discover catalog candidates, but search success is not proof that an asset is production-ready.
- Game-character prompts require `--profile fighting-character` plus validation, visual review, license/provenance evidence, bounds checks, clip checks, and route proof.
- The catalog does not generate new production art, guarantee matching rigs, guarantee animation quality, or replace artist direction.
