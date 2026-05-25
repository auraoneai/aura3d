# Renderer Skinning And Morphs

The renderer and animation packages now cover more than the original unit stress path:

- `SkinnedUnlitMaterial` and `SkinnedLitMaterial` bind joint matrices from animation skinning palettes.
- Skinned vertex formats carry `a_joints` and `a_weights`.
- `MorphUnlitMaterial` supports uniform-packed morph target position deltas for compatible meshes.
- CPU-side morph application remains available when a material path does not expose GPU morph uniforms.
- `packages/animation` provides skeleton validation, palette generation, additive/base layers, blend trees, root motion, IK helpers, and motion-quality telemetry.
- v8 routes exercise keyframes, skinning blending, additive blending, IK, morphs, multiple animated agents, and procedural walk cycles.

## Current Evidence

- `tests/reports/v8-animation-examples.json` records v8 route evidence for additive blending, IK, keyframes, morphs, multiple agents, skinning blending, and walk routes.
- `tests/reports/current-routes-visual-review.json` accepts the animation screenshots as route evidence while explicitly warning not to treat them as final Three.js-level character quality.
- `tests/assets/gltf-animation-corpus.test.ts` covers pinned Cesium Man and Fox GLBs plus an inline skinned fixture.
- `tests/browser/animation-browser.spec.ts` and `tests/visual/skinned-animation-pixels.spec.ts` verify browser-rendered skinned animation pixels and changed frames.

## Known Gaps

- The character visuals are not yet consistently premium. Some current v8 character routes use low-detail or debug-staged content and should not be used as flagship marketing.
- Retargeting, humanoid rig presets, production animation events, animation compression, and a real timeline/dopesheet editor are not complete.
- Large crowds and thousands of independently skinned characters are not proven. The multiple-agent route is evidence for animation route behavior, not a crowd-system benchmark.
- The GPU morph path has explicit uniform limits and is not a full arbitrary-morph production pipeline.
- The repo still needs higher-quality licensed character assets with multiple clips before making strong animation parity claims against Three.js examples.

## Verification

- `tests/reports/v8-animation-examples.json`
- `tests/reports/current-routes-visual-review.json`
- `tests/assets/gltf-animation-corpus.test.ts`
- `tests/browser/animation-browser.spec.ts`
- `tests/visual/skinned-animation-pixels.spec.ts`
- `tests/unit/rendering/renderer.test.ts`
