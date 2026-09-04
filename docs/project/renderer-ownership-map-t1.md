# T1 Renderer-Path Ownership Map (muse3jsparity-PRD)

Source-verified 2026-09-03. Who owns pixels per path, and the dedup decision.

## Paths

| Path | Entry | Pixel owner | Mounted by |
| --- | --- | --- | --- |
| Root `createAuraApp` | `packages/engine/src/agent-api/index.ts` | Production bridge (`packages/engine/src/production-runtime/`, `packages/rendering/src/production-runtime/`) incl. the T3 framegraph passes (`DepthPrepass → ShadowPass → SkyboxPass → OpaquePass → TransparentPass → ToneMappingPass`) | All `createAuraApp` routes (root safe API) |
| Advanced app kit | `packages/engine/src/advanced-runtime/A3DRenderer.ts:41` (`A3DRenderer`) | Core `Renderer` from `@aura3d/rendering` — `A3DRenderer` holds it as `readonly renderer` (:47) and every `render`/`renderAsync` overload delegates to `this.renderer.render*` (:69-99) | 20 apps via `@aura3d/engine/advanced-runtime` (loader-instancing, skinning-additive/blending/morph, camera-multiple-views, postprocessing-bloom/depth-outline, loader-material-extensions/gltf-variants/obj, animation-multiple, geometry-drawrange, interactive-picking, texture-anisotropy, public-scene, parallax-barrier, lights-spotlight, controls-orbit, advanced-examples-gallery, wow-common gltf-showcase) |
| Advanced bare wrapper | `packages/rendering/src/advanced-runtime/AdvancedRenderer.ts:19` (`AdvancedRenderer`) | Same core `Renderer` — private-constructor wrapper, `create` delegates to `Renderer.create` (:22-23) | Zero routes (re-exported by `packages/rendering/src/advanced-runtime/index.ts` and `packages/rendering/src/index.ts` only) |

## Decision: formally subordinate (no merge, no third behavior)

- `A3DRenderer` is NOT a second renderer: it is a lifecycle/evidence wrapper
  (frame-time recording, `A3DRendererEvidence`, `A3DScene` normalization) over
  the single core `Renderer`. Pixels are owned once.
- `AdvancedRenderer` is the same wrapper minus the evidence layer, with no
  route usage. It stays as the documented minimal alias; if a route ever
  mounts an undocumented renderer, the export audit fails closed.
- The production bridge remains the only root-path pixel owner. Advanced
  paths are labeled advanced/production-runtime, never root `createAuraApp`.

## Checks

- [ ] No route mounts an undocumented renderer (table above is exhaustive as of this commit; re-run the two greps on change).
- [ ] `check:public-surface-diff` green with zero multi-owner pixel symbols (run at release commit per R1; see T1 status in the phase report).
- [ ] T3 topology (`FramegraphTopology.validatePassOrder`) is the production-bridge order proof.
