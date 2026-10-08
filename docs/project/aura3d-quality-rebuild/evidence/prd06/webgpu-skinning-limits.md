# PRD-06 T2.7 — WebGPU deform parts (06 side)

## What changed

- **WGSL twins** (`packages/rendering/src/shaders/deform/*.wgsl.ts`, registered via the lane-11
  twin manifest `registerWgslTwin` — the C-02 `ShaderChunk.wgsl` carrier consumers already read):
  - `skinning.wgsl.ts` — twin of `a3d_prd06_skinning_common`. `u_boneTexture` RGBA32F sampler →
    **`a3dBones: var<storage, read> array<mat4x4<f32>>`** — storage-buffer bones sized to the rig
    (`jointCount * 64` bytes; the `u_boneTextureWidth` texel math disappears). `u_prevBoneTexture` →
    `a3dPrevBones`, declared unconditionally (WebGPU only requires bindings a program statically
    reads). `a3dSkin` → `a3dSkin4`/`a3dSkin8` + `a3dSkinPrev4`/`a3dSkinPrev8`; the `A3D_SKINNING==8`
    preprocessor fork becomes an explicit function fork since WGSL has no preprocessor, and vertex
    attributes become parameters (WGSL builtins/inputs live in the generated entry point).
  - `morph.wgsl.ts` — twin of `a3d_prd06_morph_texture`. Deltas stay
    **`a3dMorphTexture: texture_2d_array<f32>`** (layer = target, texel = `vertexIndex * stride +
    attr`, same packing as `resources/MorphTargetTexture.ts`). The §8.2 scalar ints +
    packed index/weight/`prevWeight` arrays fold into `A3dPrd06MorphUniform` (`dims` vec4 +
    three `array<vec4<f32>, 16>`). `A3D_MORPH_MAX_ACTIVE` becomes a `const` at the Ultra ceiling 64
    (the program generator rewrites per tier). `gl_VertexID` → `vertexIndex` parameter;
    `inout` → `ptr<function>`; `stride`/`target` are WGSL reserved words → `morphStride`/`targetLayer`.
  - `deform.wgsl.ts` — twin of `a3d_prd06_deform`. The GLSL `#ifdef` matrix becomes explicit
    `applyMorph`/`applySkin`/`secondInfluences` selectors; `a3dDeformPrevious` mirrors the §8.5
    previous-frame body (`a3dMorphPrevWeight` + `a3dSkinPrev*`); `out` params → `A3dDeformOut`.
  - `twins.ts` — leaf module (`registerPrd06WgslTwins()`) so `tools/wgsl-validate/emit-twins.ts`
    registers them without pulling the lane's scene/engine import graph; `lanes/prd06.ts` calls it
    at registration time.
- **`WebGPUSkinningLimits.ts`** — `decideSkinningPalettePath` default `maxDataTextureJoints` is now
  `MAX_SKINNING_JOINTS` (1024), not the 96-joint uniform-parity bound: the 06 storage/texture
  palette path carries every rig up to the cache ceiling.
- **`tools/wgsl-validate/emit-twins.ts`** — registers the prd06 twins and composes
  `a3d_prd06_deform` with its requires-chain (skinning → morph → deform) for standalone naga
  validation — WGSL has no `#include`, matching how `hookSplice` concatenates the GLSL chunks.
  Only the emitted file is composed; the registered twin stays the pure per-chunk fragment.

## Deferred (Q-11-1 not landed)

`WebGPUDevice.ts` still has no bone-texture/storage binding (grep: no `boneTexture`/`a3dBones`), so
the T1.12 WebGPU-only `u_jointMatrices` upload in `SkinningUniforms.ts` stays until Q-11-1 (lane-11
device binding) lands — deleting it now would remove the only WebGPU palette path.

## Verification

- `decideSkinningPalettePath({ jointCount: 191 })` → `path: "data-texture"`, `cpuFallback: false`
  (new assertion in `skinning-fallback-and-bounds.test.ts`; previously the default was 96 → `cpu`).
- `pnpm exec tsx tools/wgsl-validate/emit-twins.ts tools/wgsl-validate/out` → 6 twins emitted
  (3 prd06 + 3 prd11), `parity missing=0`.
- `naga 30.0.1` (same pinned version as `qr-prd11-perf.yml`'s wgsl-validate job): all 6 emitted
  files validate clean — `a3d_prd06_skinning_common.wgsl`, `a3d_prd06_morph_texture.wgsl`,
  `a3d_prd06_deform.wgsl` (composed), plus the lane-11 twins.
- `vitest` lane battery: 30/30 pass (`skinning-fallback-and-bounds`, `skinned-joint-bounds`,
  `skinning-palette-decision-diagnostics`, `prd06/actor-velocity-inputs`).
- `tsc -p tsconfig.check.json` + `eslint` on touched files: clean.

## E27 evidence (browser, `native-webgpu-functional-301.yml`)

The workflow is `workflow_dispatch`-only ("dispatched, not edited") and `gh` is unauthenticated in
this environment, so dispatch is pending — recorded protocol for when it runs, pre-Q-11-1 form:

- Render the 191-joint synthetic rig (same `syntheticRig(191)` the `deform-light-view` harness
  builds) on the native WebGPU runner; capture the character mask and diff against the WebGL2 run
  of the same spec. Pre-Q-11-1 the expectation is the pipeline *produces* the mask (upload path via
  `u_jointMatrices`); post-Q-11-1 the bar becomes IoU ≥ 0.98 integrated.
- Lane CI note: the `wgsl-validate` job in `qr-prd11-perf.yml` is `lane:prd11`-label-gated — these
  twins are validated locally here; they enter that job's coverage automatically once it runs.
