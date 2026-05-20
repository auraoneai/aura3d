import type { Vec3 } from "./math";

export type GalleryGeometryKey = "cube" | "sphere" | "cylinder" | "capsule" | "lineX";

export interface EvidenceInstanceBatch {
  readonly geometry: GalleryGeometryKey;
  readonly material: string;
  readonly label: string;
  readonly transforms: Float32Array;
  readonly count: number;
}

export interface EvidenceSingleItem {
  readonly geometry: GalleryGeometryKey;
  readonly material: string;
  readonly label: string;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotation: Vec3;
}

export interface RouteEvidencePlan {
  readonly routeId: "fog-cathedral" | "data-galaxy" | "robotics-lab";
  readonly animatedSystems: readonly string[];
  readonly labels: readonly string[];
  readonly approximations: readonly string[];
  readonly unsupportedGaps: readonly string[];
  readonly integrationSteps: readonly string[];
}

export interface RouteEvidencePayload extends RouteEvidencePlan {
  readonly singles: readonly EvidenceSingleItem[];
  readonly batches: readonly EvidenceInstanceBatch[];
  readonly metrics: readonly string[];
}

export function activeSlice(batch: EvidenceInstanceBatch): Float32Array {
  return batch.transforms.subarray(0, batch.count * 16);
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

