# Migrating three.js code to Aura3D

Version: 4.6.2

Current release: Aura3D 4.6.2.

## Current migration surface

Aura3D is a standalone engine with its own renderer (`@aura3d/rendering`) and no `three` dependency. There is no compatibility package: a port is a rewrite of the scene against `@aura3d/engine`, helped by the `aura3d migrate three` codemod.

Start with [docs/migration/from-threejs.md](../migration/from-threejs.md). It covers the fast path (scaffold the closest template, run the codemod as a report, write the scene with the mapping table, admit assets as typed refs, run `aura3d check-deploy`) and the codemod's full mapping.

## What the codemod covers

`aura3d migrate three` maps 245 three.js constructs: 48 exact, 150 approximate, 47 with no equivalent and 0 pending (counted from `packages/aura3d-cli/src/migrate-three/mappings.ts`). Its output is an annotated worklist that names the Aura3D API for each construct, not a finished port. It does not make Aura3D a drop-in for every three.js API, addon, shader chunk or loader; a migration note should name the specific API or workflow that was ported and point to code and tests.

`@aura3d/engine` has no `three` dependency. Public Aura3D agent APIs, typed assets, templates, diagnostics, screenshots, runtime helpers and asset workflows run on Aura3D-owned runtime code.

## Camera projection

Renderer auto-framing has an explicit projection choice:

- `RenderSource.cameraProjection` defaults to `"perspective"`. Every scene that does not set it renders as before, so this is not a breaking change.
- Scenes that want a parallel projection set `cameraProjection: "orthographic"`. `createAutoFrameCamera` previously built only a perspective frustum, so such a scene renders differently (correctly) from how it did before.
- `cameraFrameOptions` is typed as `RendererCameraFrameOptions`, which is `PerspectiveCameraFrameOptions & OrthographicCameraFrameOptions`. It is a widening, so existing option objects still typecheck.

Routes that hardcoded a scale multiplier to size an asset inside a region can move to `fitSizeToRegion(region, { occupancy })`, which returns a `targetMaxDimension` for `model(asset, { targetMaxDimension })`. A hardcoded multiplier keeps working; it just does not follow the asset or scene when either changes size.

Claim boundary: these are `createAuraApp` root safe-API and `rendering` internal surfaces. They add camera and sizing capability. Named same-asset comparison routes pass their bounded protocols, and that evidence is not a blanket rendering-quality claim.

Migration wording and public-release notes are governed by `docs/project/product-studio-claim-registry.md`.

## WebGPU post-process helpers

Low-level WebGPU post-process shader builders and option normalizers import from `@aura3d/rendering/webgpu`. `runWebGPURenderToTextureProof` remains available from the root rendering package. This keeps optional WebGPU shader source off WebGL and template startup graphs while preserving the supported WebGPU escape hatch.
