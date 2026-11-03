// PRD-02 Phase 2 — reflection probe + irradiance volume builders (§6.6, C-10).
// `AuraProbeNode` is an additive kind (CCR-02-2 → qr-request to:prd15 for the
// `AuraSceneNode` union member); emitted via builder casts until the union
// ships so downstream C-36 handlers still see `kind: "probe"`.

import type { AuraSceneNode, AuraVec3 } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";

export interface AuraReflectionProbeOptions {
  readonly name: string;
  readonly position: AuraVec3;
  /** Parallax box (world AABB). Omit = infinite (no box projection). */
  readonly box?: { readonly min: AuraVec3; readonly max: AuraVec3 };
  readonly resolution?: 64 | 128 | 256; // default 128
  readonly update?: "once" | "on-demand" | { readonly everyNFrames: number }; // default "once"
  readonly blendDistance?: number; // default 1 m
  readonly priority?: number; // default 0
  readonly intensity?: number; // default 1
}

export interface AuraIrradianceVolumeOptions {
  readonly name: string;
  readonly bounds: { readonly min: AuraVec3; readonly max: AuraVec3 };
  readonly resolution: readonly [number, number, number]; // each 2..16
  readonly update?: "once" | "on-demand";
  readonly intensity?: number;
  /** Maximum captured grid cells per frame, 1..64; the renderer also applies a shared scene budget. */
  readonly maxUpdatesPerFrame?: number;
}

export interface AuraProbeNode {
  readonly kind: "probe";
  readonly probe: "reflection" | "irradiance-volume";
  readonly name: string;
  readonly options: AuraReflectionProbeOptions | AuraIrradianceVolumeOptions;
}

export function isAuraProbeNode(node: { readonly kind: string }): node is AuraProbeNode & { readonly kind: "probe" } {
  return node.kind === "probe";
}

function validateVector(value: AuraVec3, label: string): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`${label} must contain three finite numbers`);
  }
}

function validateBounds(bounds: { readonly min: AuraVec3; readonly max: AuraVec3 }, label: string): void {
  if (!bounds || typeof bounds !== "object") throw new RangeError(`${label} must contain min and max`);
  validateVector(bounds.min, `${label}.min`);
  validateVector(bounds.max, `${label}.max`);
  if (bounds.min.some((value, axis) => bounds.max[axis] <= value || !Number.isFinite(bounds.max[axis] - value))) {
    throw new RangeError(`${label} must have positive finite extents`);
  }
}

function validateName(name: string): void {
  if (typeof name !== "string" || !name.trim()) throw new RangeError("probe name must be nonempty");
}

function validateReflection(options: AuraReflectionProbeOptions): void {
  validateName(options.name);
  validateVector(options.position, "probe position");
  if (options.box !== undefined) validateBounds(options.box, "probe box");
  if (options.resolution !== undefined && options.resolution !== 64 && options.resolution !== 128 && options.resolution !== 256) throw new RangeError("reflection probe resolution must be 64, 128 or 256");
  if (typeof options.update === "object" && (!options.update || !Number.isSafeInteger(options.update.everyNFrames) || options.update.everyNFrames < 1 || options.update.everyNFrames > 1_000_000)) {
    throw new RangeError("reflection probe interval must be an integer in 1..1000000");
  }
  if (options.update !== undefined && typeof options.update !== "object" && options.update !== "once" && options.update !== "on-demand") throw new RangeError("unsupported reflection probe update mode");
  if (options.blendDistance !== undefined && (!Number.isFinite(options.blendDistance) || options.blendDistance < 0)) throw new RangeError("blendDistance must be finite and nonnegative");
  if (options.intensity !== undefined && (!Number.isFinite(options.intensity) || options.intensity < 0)) throw new RangeError("probe intensity must be finite and nonnegative");
  if (options.priority !== undefined && !Number.isFinite(options.priority)) throw new RangeError("probe priority must be finite");
}

function validateIrradiance(options: AuraIrradianceVolumeOptions): void {
  validateName(options.name);
  validateBounds(options.bounds, "irradiance bounds");
  if (!Array.isArray(options.resolution) || options.resolution.length !== 3 || options.resolution.some((value) => !Number.isInteger(value) || value < 2 || value > 16)) {
    throw new RangeError("irradiance resolution must contain three integers in 2..16");
  }
  if (options.update !== undefined && options.update !== "once" && options.update !== "on-demand") throw new RangeError("unsupported irradiance update mode");
  if (options.intensity !== undefined && (!Number.isFinite(options.intensity) || options.intensity < 0)) throw new RangeError("probe intensity must be finite and nonnegative");
  if (options.maxUpdatesPerFrame !== undefined && (!Number.isInteger(options.maxUpdatesPerFrame) || options.maxUpdatesPerFrame < 1 || options.maxUpdatesPerFrame > 64)) {
    throw new RangeError("maxUpdatesPerFrame must be an integer in 1..64");
  }
}

/** Probe builders are typed as `AuraNodeBuilder<AuraSceneNode>` via an
 *  internal cast: `AuraProbeNode` is an additive kind (CCR-02-2) and does not
 *  satisfy the builder's `TNode extends AuraSceneNode` constraint until the
 *  union member lands (qr-request to:prd15). Runtime value is verbatim. */
export const probes = {
  reflection: (options: AuraReflectionProbeOptions) => {
    validateReflection(options);
    return new AuraNodeBuilder<AuraSceneNode>({
      kind: "probe",
      probe: "reflection",
      name: options.name,
      options: {
        ...options,
        resolution: options.resolution ?? 128,
        update: options.update ?? "once",
        blendDistance: options.blendDistance ?? 1,
        priority: options.priority ?? 0,
        intensity: options.intensity ?? 1
      }
    } as unknown as AuraSceneNode);
  },
  irradianceVolume: (options: AuraIrradianceVolumeOptions) => {
    validateIrradiance(options);
    return new AuraNodeBuilder<AuraSceneNode>({
      kind: "probe",
      probe: "irradiance-volume",
      name: options.name,
      options: { ...options, update: options.update ?? "once", intensity: options.intensity ?? 1 }
    } as unknown as AuraSceneNode);
  }
} as const;
