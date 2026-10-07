/**
 * PRD-05 lane scene spec extensions (C-30). Scenes mount optimized GLBs only —
 * `asset` ids are keys of `prd05Assets` (§6.3 outputs with meshopt +
 * quantization + KTX2), never raw corpus files.
 */
import type { ModelObjectSpec, PrimitiveObjectSpec, SceneSpec } from "../../shared/types";
import type { Prd05AssetId } from "./assets";

export interface Prd05ModelSpec extends Omit<ModelObjectSpec, "asset"> {
  readonly kind: "model";
  readonly asset: Prd05AssetId;
}

export type Prd05ObjectSpec = Prd05ModelSpec | PrimitiveObjectSpec;

export interface Prd05SceneSpec extends Omit<SceneSpec, "objects"> {
  readonly objects: readonly Prd05ObjectSpec[];
}
