/**
 * C-17 — asset manifest plumbing (engine side, CONTRACTS.md). Provider: PRD 05.
 * Flag: A3D_QR_ASSETS. Declaration-only additions land on AuraAssetDefinition,
 * AuraModelOptions and AuraCreateAppOptions in index.ts (PR 0a).
 */

// AuraAssetDefinition (index.ts:951) additions:
//   variants?: { source?: string; mobile?: string };
//   requiredDecoders?: readonly ("meshopt"|"draco"|"ktx2")[];
//   lods?: readonly { level: number; screenCoverage: number }[];
//   colliderUrl?: string;
//   budget?: { triangles: number; gpuBytesHigh: number }
// AuraModelOptions additions: lod?: false | "auto" | { bias?: number; crossFadeSeconds?: number }; collider?: "auto" | "bounds" | false
// AuraCreateAppOptions.assets?: { decoders?: { basePath?: string; meshopt?: boolean; draco?: boolean; ktx2?: boolean; workerCount?: number }; variant?: "optimized" | "source" | "mobile"; maxTextureSize?: number; lod?: false }

export interface AuraAssetDecodersOption { readonly basePath?: string; readonly meshopt?: boolean; readonly draco?: boolean; readonly ktx2?: boolean; readonly workerCount?: number; }
export interface AuraAssetsOption { readonly decoders?: AuraAssetDecodersOption; readonly variant?: "optimized" | "source" | "mobile"; readonly maxTextureSize?: number; readonly lod?: false; }
export interface AuraAssetLodOption { readonly bias?: number; readonly crossFadeSeconds?: number; }
export type AuraModelLodOption = false | "auto" | AuraAssetLodOption;
export type AuraModelColliderOption = "auto" | "bounds" | false;
export type AuraAssetRequiredDecoder = "meshopt" | "draco" | "ktx2";
export interface AuraAssetVariants { readonly source?: string; readonly mobile?: string; }
export interface AuraAssetLodLevel { readonly level: number; readonly screenCoverage: number; }
export interface AuraAssetBudget { readonly triangles: number; readonly gpuBytesHigh: number; }
