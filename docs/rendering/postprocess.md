# Renderer Postprocess

Postprocess support exists in lower-level rendering packages and selected
runtime paths, but public root examples must distinguish requested effects from
pixel-backed passes.

## Public Root Boundary

`effects.bloom(...)`, ambient/contact occlusion nodes, fog, and renderer
diagnostics can describe postprocess intent in a root `createAuraApp` scene.
That is not enough to claim a pixel-backed postprocess stack. A root route can
claim a rendered postprocess effect only when:

- the route imports only `@aura3d/engine`;
- `createAuraApp(...).diagnostics()` after mount reports a pixel-backed pass
  status for the requested effect;
- before/after screenshots or mode-change screenshots show pixel differences
  caused by the pass;
- evidence records the backend and any fallback state.

## What Root Currently Proves

`tests/browser/createAuraApp-postprocess-contract.spec.ts` retains the measured
root evidence at
`tests/reports/createAuraApp-postprocess-contract/postprocess-contract.json`.
Every entry is an on/off comparison of the same scene where only the effect node
differs, so a measured delta is attributable to the pass.

| Effect | Root status | Basis |
| --- | --- | --- |
| Tone mapping, colour grade, FXAA | Root-proven as an always-on pixel-backed chain | The production bridge submits them and the runtime reports them in `actualPasses` with `pixelBacked: true`. |
| Bloom | Root-proven | The `bloom` pass runs and changes ~5.5% of the frame (mean channel delta ~5.9) versus an identical scene without `effects.bloom(...)`. |
| Environment fog | Root-proven | `effects.fog(...)` now reaches the forward pass and changes ~66% of the frame (mean channel delta ~22). |
| Ambient / contact occlusion (SSAO) | Partial | The `ssao` pass genuinely executes and `ambientOcclusionPass` is true, but the measured on/off change is near zero. The pass runs; its visible contribution in the probe scene is not provable, so it is not claimed. |
| Outline, SSR, depth of field, motion blur, TAA | Unreachable from root | The public `effects` surface has no node that requests these passes, so they cannot be requested or proven through `createAuraApp`. They remain rendering-package passes. |

The pass set and `pixelBacked` status are also verified to survive canvas resize
and device-pixel-ratio change across three distinct backing stores, so a resize
cannot silently drop the chain to a direct render.

No HDR-dependent or native-WebGPU postprocess claim is made from this contract.

Two root wiring defects were fixed while producing this evidence, both of which
had made a requested effect unprovable:

- `effects.fog(...)` was accepted by the scene builder and reported in
  diagnostics but never submitted as `environmentFog`, so it changed zero pixels
  through the root path.
- Occlusion effects were advertised in `requestedPasses` as `ssao` while no
  `ssao` option was ever submitted, so the advertised pass could not run. The
  option is now submitted, with the public world-space `radius` mapped onto the
  renderer's integer 1-8 sample-kernel range; passing the authored float
  directly made the renderer reject the frame entirely.

## Lower-Level Package Surface

`@aura3d/rendering` contains postprocess/composer classes and production-runtime
passes such as bloom, FXAA-facing paths, SSAO, depth of field, color grading,
depth-aware radial volumetric light, and related render-target helpers. The
volumetric pass has WebGL2 pixel evidence with renderer-owned depth occlusion;
it is not proof of volumetric clouds, froxel lighting, physical atmosphere, or
root support. These remain package-level capabilities until they are proven
through the public root app path.

## Verification

Useful focused package checks:

```sh
pnpm exec vitest run tests/unit/rendering/postprocess-composer.test.ts tests/unit/rendering/renderer-postprocess-plan.test.ts
```

Package tests do not replace browser screenshots for public showcase claims.
Each postprocess claim needs a named pass, route, test/report, and generated
image evidence.
