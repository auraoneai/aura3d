/**
 * C-30 — benchmark scene spec additions and readiness payload (CONTRACTS.md).
 * Provider: PRD 12. Re-exported by shared/types.ts.
 */

export type ReferenceProfile = "contract" | "showcase";
export type SceneOwner = "prd12" | "prd15" | "prd01" | "prd02" | "prd03" | "prd04" | "prd05" | "prd06" | "prd07" | "prd08" | "prd10" | "prd11";
export type BrokenControlId = "no-shadows" | "no-ibl" | "dpr-half" | "no-aa" | "no-tonemap" | "flat-sky" | "albedo-only";
export type MaskId = "object-id" | "shadow-receiver" | "sky" | "metal" | "silhouette-edge";
export type RegionId = "frame" | "subject" | `object:${number}` | MaskId | "scene-minus-hud";
export interface StripSpec { readonly frames: number; readonly intervalMs: number; readonly orbitDegrees: number; }
// SceneSpec (existing, benchmarks/quality-rebuild/shared/types.ts) gains (PR 0a, optional until PRD 12 makes them required):
//   owner: SceneOwner; referenceProfile: ReferenceProfile; dprs?: readonly (1 | 2)[]; masks: readonly MaskId[]; brokenControls: readonly BrokenControlId[];
//   strip?: StripSpec; primaryCriterion: string; primaryRegion: RegionId; qrFlags?: readonly string[]
export interface RegistryEntry { readonly id: string; readonly spec: unknown /* SceneSpec */; readonly admittedAsReference: boolean; readonly status: "active" | "quarantined" | "retired"; }
export const REGISTRY: readonly RegistryEntry[] = [];
export interface ShadowReport { readonly mapRendered: boolean; readonly mapSampled: boolean; readonly mapSize: number | null; readonly strength: number | null; readonly casterName: string | null; }
export interface FrameTimingSample { readonly source: "rAF" | "gpu-timer-query"; readonly frames: number; readonly cpuMsP50: number; readonly cpuMsP95: number; readonly gpuMsP50: number | null; readonly gpuMsP95: number | null; readonly rafFps: number; }
export interface ReadyPayloadV2 { readonly variant: "default" | "aura3d-tuned" | BrokenControlId; readonly dpr: 1 | 2; readonly appliedExposure: number | null; readonly appliedToneMapping: string | null; readonly lightUnits: "three-physical" | "aura-internal" | "unknown"; readonly shadows: ShadowReport | null; readonly fallbackLightsActive: boolean | null; readonly frameTiming?: FrameTimingSample; readonly assetHashes: Readonly<Record<string, string>>; readonly qrFlags: readonly string[]; }
