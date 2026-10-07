/**
 * PRD-05 §6.2/§6.3 — shared types for the asset-optimize toolchain.
 *
 * `OptimizeStepRecord` and `AssetBudgetMeasurement` mirror C-17
 * (`packages/aura3d-cli/src/contracts/assetManifest.ts`) so the records this
 * tool writes into `derived.steps` typecheck against the contract.
 */

import type { Document } from "@gltf-transform/core";

export interface OptimizeStepRecord {
  readonly step: string;
  readonly ms: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
}

export type Ktx2Codec = "uastc" | "etc1s" | "none";

export interface ProfileTexturePlan {
  /** Codec for base colour / emissive / sheen / specular colour (sRGB slots). */
  readonly baseColor: Ktx2Codec;
  /** Always UASTC — ETC1S block artefacts are visible in normals (§6.2 note). */
  readonly normal: Ktx2Codec;
  /** ORM / occlusion-roughness-metallic (linear slot). */
  readonly orm: Ktx2Codec;
  /** Max texture dimension on the High tier. */
  readonly maxSize: number;
  /** Ultra tier override (`product` is the only profile that uses it). */
  readonly ultraMaxSize?: number;
}

export type ColliderKind = "none" | "capsule" | "box" | "convex" | "trimesh";

export interface AssetOptimizeProfile {
  readonly id: string;
  /** Manifest roles this profile covers (§6.2 Roles column). */
  readonly roles: readonly string[];
  /** LOD0 triangle floor / target / ceiling (G1 band). */
  readonly triangles: { readonly floor: number; readonly target: number; readonly ceiling: number };
  /** LOD chain as ratios of LOD0, always starting with 1. */
  readonly lodRatios: readonly number[];
  /** §6.3 step 6: meshopt simplify targetError per level after LOD0. */
  readonly lodTargetErrors: readonly number[];
  /** Screen coverage chain stored in `extras.MSFT_screencoverage` (strictly decreasing). */
  readonly screenCoverage: readonly number[];
  readonly textures: ProfileTexturePlan;
  readonly geometry: {
    readonly meshopt: boolean;
    readonly quantize: boolean;
    /** Draco permitted for `--geometry draco` (static worlds only). */
    readonly draco: boolean;
  };
  readonly collider: ColliderKind;
  /** §6.3 step 3: factor-only materials may collapse to a palette texture. */
  readonly paletteAllowed: boolean;
  /** §6.3 step 3: merge primitives sharing a material within a node subtree. */
  readonly joinAllowed: boolean;
}

/** KTX-Software `ktx create` flag sets, pinned per §6.2 (validated against `ktx create --help` in CI). */
export const KTX2_UASTC_FLAGS = ["--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", "1.0", "--zstd", "18"] as const;
export const KTX2_ETC1S_FLAGS = ["--encode", "basis-lz", "--clevel", "2", "--qlevel", "192"] as const;

/** Flags that must appear in `ktx create --help` output for the pinned release (workflow check). */
export const KTX2_REQUIRED_FLAGS = [
  "--encode", "--uastc-quality", "--uastc-rdo", "--uastc-rdo-l", "--zstd",
  "--clevel", "--qlevel", "--format", "--generate-mipmap", "--assign-tf", "srgb"
] as const;

export interface OptimizeStepContext {
  readonly profile: AssetOptimizeProfile;
  /** Report sink; each step appends exactly one record. */
  readonly steps: OptimizeStepRecord[];
  /** Non-fatal flags the gates consume (`texture-waste`, `lod-target-missed`, …). */
  readonly flags: string[];
  /** CLI `--geometry` override; default from profile. */
  readonly geometryOverride?: "meshopt" | "draco" | "none";
  /** Absolute path to the pinned `ktx` binary, or undefined when unavailable. */
  readonly ktxBinary?: string;
  /** KTX2 encode is mandatory for this run (CI); otherwise missing ktx is recorded, not fatal. */
  readonly requireKtx2: boolean;
  /** Temp workspace for texture extraction/encode; caller creates+removes. */
  readonly workDir: string;
  /** Per-texture KTX2 flag record for the metrics/toolchain evidence. */
  readonly ktxFlags: { texture: string; codec: Ktx2Codec; srgb: boolean; args: readonly string[] }[];
  /** Sidecar Document produced by `colliders`; serialized by the pipeline into `collisionGlb`. */
  collisionDoc?: Document;
  readonly log: (line: string) => void;
}

export type OptimizeStep = (doc: Document, ctx: OptimizeStepContext) => Promise<void>;

export interface DocMeasure {
  readonly bytes: number;
  readonly triangles: number;
  readonly vertices: number;
  readonly primitives: number;
  readonly materials: number;
  readonly textures: number;
  readonly maxTextureDimension: number;
  readonly drawCallsEstimate: number;
}
