/**
 * PRD-04 lane scene spec extensions (C-30). The shared `SceneSpec`/`ObjectSpec`
 * shapes stay the spine; lane fields ride on top so registrations remain
 * `{ id, spec }` compatible with `BenchSceneRegistration`.
 */
import type {
  MaterialSpec,
  ModelObjectSpec,
  PrimitiveObjectSpec,
  SceneSpec
} from "../../shared/types";
import type { Prd04ModelAssetId, Prd04TextureAssetId } from "./assets";

/** Tint applied per glTF material after load (S3: three side uses material.color.set). */
export interface Prd04ModelTint {
  readonly color: string;
  readonly emissiveColor?: string;
}

export interface Prd04ModelSpec extends Omit<ModelObjectSpec, "asset"> {
  readonly kind: "model";
  readonly asset: Prd04ModelAssetId;
  /** KHR_materials_variants selection, applied to every material that declares it. */
  readonly variant?: string;
  /** C-15 style tint; Aura3D must keep authored maps (E2 regression target). */
  readonly tint?: Prd04ModelTint;
}

export interface Prd04TextureMaps {
  readonly textureSet: Prd04TextureAssetId;
  /** UV repeat (tiles per plane width). */
  readonly repeat: number;
  /** Anisotropy in samples, or "tier" to follow the C-27 quality tier. */
  readonly anisotropy: number | "tier";
}

export interface Prd04PrimitiveSpec extends Omit<PrimitiveObjectSpec, "material"> {
  readonly kind: "primitive";
  readonly material: MaterialSpec;
  readonly textureMaps?: Prd04TextureMaps;
}

export type Prd04ObjectSpec = Prd04ModelSpec | Prd04PrimitiveSpec;

export interface Prd04SceneSpec extends Omit<SceneSpec, "objects"> {
  readonly objects: readonly Prd04ObjectSpec[];
}
