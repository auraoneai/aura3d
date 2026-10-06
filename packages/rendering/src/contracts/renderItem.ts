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

export interface RenderItem {
  readonly geometry: Geometry;
  readonly material?: RenderMaterial;
  readonly label?: string;
  readonly drawRange?: RenderItemDrawRange;
  readonly includeInAutoFrame?: boolean;
  readonly modelMatrix?: Float32Array | readonly number[];
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
  readonly instanceTransforms?: Float32Array | readonly number[];
  readonly instanceColors?: Float32Array | readonly number[];
  readonly instanceAttributes?: readonly RenderItemInstanceAttribute[];
  readonly boundingBoxCenter?: readonly [number, number, number];
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
  readonly cameraFade?: number;                                       // PRD 08 (C-22 cut fade)
  readonly instanceEmissive?: Float32Array | readonly number[];       // PRD 11 (C-27 batching)
}
