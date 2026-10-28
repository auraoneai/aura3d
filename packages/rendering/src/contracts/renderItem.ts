/**
 * RenderItem — moved verbatim from ForwardPass.ts:24-48 per §3.3, re-exported
 * from ForwardPass.ts. PR 0a additions (declaration-only):
 *   receiveShadow? (PRD 02), the C-14 previous-frame fields (PRD 03),
 *   lodFade? (PRD 05), cameraFade? (PRD 08), instanceEmissive? (PRD 11).
 */

import type { Geometry } from "../Geometry";
import type { RenderMaterial, SkinningPaletteBinding } from "../ForwardPass";
import type { MorphTargetDelta } from "../MorphTarget";
import type { RenderItemDrawRange, RenderItemInstanceAttribute } from "../ForwardPass";
import type { Texture } from "../Texture";
import type { TextureBinding } from "../TextureBinding";

export interface RenderItem {
  readonly geometry: Geometry;
  readonly material?: RenderMaterial;
  readonly label?: string;
  readonly drawRange?: RenderItemDrawRange;
  readonly includeInAutoFrame?: boolean;
  readonly modelMatrix?: Float32Array | readonly number[];
  /** C-08 (PRD 01 §8.5): innermost `size ⊙ fit` transform; identity when unset. */
  readonly geometryMatrix?: Float32Array | readonly number[];
  readonly normalMatrix?: Float32Array | readonly number[];
  readonly modelViewProjectionMatrix?: Float32Array | readonly number[];
  readonly skinning?: SkinningPaletteBinding;
  readonly morphTargets?: readonly MorphTargetDelta[];
  readonly morphWeights?: readonly number[];
  /**
   * Wrinkle-detail intensity resolved engine-side from live morph weights
   * (`resolveWrinkleMapStrength`). Shaders that declare `u_wrinkleStrength` modulate
   * procedural normal detail by it; absent (or zero) leaves rendering bit-identical.
   */
  readonly wrinkleStrength?: number;
  /**
   * PRD-02 S12 (lane-01 half): per-item environment cube override. When set, the
   * legacy forward path binds this cube (a captured reflection probe) as
   * `u_environmentCubeMapTexture` instead of the scene environment's cube, and
   * `environmentCubeMip` overrides the mip count. Absent → bit-identical.
   */
  readonly environmentCube?: TextureBinding;
  readonly environmentCubeMip?: number;
  readonly instanceTransforms?: Float32Array | readonly number[];
  readonly instanceColors?: Float32Array | readonly number[];
  readonly instanceAttributes?: readonly RenderItemInstanceAttribute[];
  readonly boundingBoxCenter?: readonly [number, number, number];
  /**
   * Coarser stand-in for the shadow depth passes (same vertex format as `geometry`). A dense instanced node is drawn once per cascade
   * as well as once for the camera, and a shadow silhouette needs far fewer triangles than the lit surface. Ignored when the item
   * carries a `drawRange`; absent means the depth pass draws `geometry`.
   */
  readonly shadowGeometry?: Geometry;
  /** Exclude supporting/decorative geometry from renderer-owned shadow depth passes. */
  readonly castShadow?: boolean;
  // PR 0a additions:
  readonly receiveShadow?: boolean;                                   // PRD 02 (C-11)
  readonly previousModelMatrix?: Float32Array;                        // PRD 03 (C-14)
  readonly previousInstanceTransforms?: Float32Array;
  readonly previousJointTexture?: Texture;                            // C-18 palette.previous
  readonly previousMorphWeights?: Float32Array;
  readonly writesReactive?: boolean;                                  // particles/transparents (C-07-IN-8)
  readonly lodFade?: number;                                          // PRD 05 (C-17 LOD cross-fade)
  readonly lodLevel?: number;                                         // PRD 05 (active MSFT_lod level; look-dev LOD strip)
  readonly cameraFade?: number;                                       // PRD 08 (C-22 cut fade)
  readonly instanceEmissive?: Float32Array | readonly number[];       // PRD 11 (C-27 batching)
  // threejs-parity L7 (SG-09/SR-04): fields mirroring three's Object3D for
  // items produced from scene nodes or authored specs.
  /** three's `Object3D.renderOrder` — primary sort key inside a bucket. */
  readonly renderOrder?: number;
  /** three's `Object3D.frustumCulled` — `false` skips the frustum test. */
  readonly frustumCulled?: boolean;
  /** three's `Layers.mask` — intersected against `camera.layerMask`. */
  readonly layerMask?: number;
  /** three's `Object3D.userData` — free-form author metadata. */
  readonly userData?: Record<string, unknown>;
  /** three's `Object3D.onBeforeRender` — invoked immediately before the draw. */
  readonly onBeforeRender?: (item: RenderItem) => void;
  /**
   * threejs-parity L7/SC-01: name of the authored `cameras.cube` node whose
   * latest capture binds as `environmentCube` (three's `material.envMap`).
   */
  readonly cubeCameraEnvMap?: string;
}
