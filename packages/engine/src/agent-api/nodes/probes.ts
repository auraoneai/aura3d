// PRD-02 Phase 2 — reflection probe + irradiance volume builders (§6.6, C-10).
// `AuraProbeNode` is an additive kind (CCR-02-2 → qr-request to:prd15 for the
// `AuraSceneNode` union member); emitted via builder casts until the union
// ships so downstream C-36 handlers still see `kind: "probe"`.

import type { AuraSceneNode, AuraVec3 } from "../index.js";
import { AuraNodeBuilder } from "../index.js";

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

/** Probe builders are typed as `AuraNodeBuilder<AuraSceneNode>` via an
 *  internal cast: `AuraProbeNode` is an additive kind (CCR-02-2) and does not
 *  satisfy the builder's `TNode extends AuraSceneNode` constraint until the
 *  union member lands (qr-request to:prd15). Runtime value is verbatim. */
export const probes = {
  reflection: (options: AuraReflectionProbeOptions) =>
    new AuraNodeBuilder<AuraSceneNode>({
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
    } as unknown as AuraSceneNode),
  irradianceVolume: (options: AuraIrradianceVolumeOptions) =>
    new AuraNodeBuilder<AuraSceneNode>({
      kind: "probe",
      probe: "irradiance-volume",
      name: options.name,
      options: { ...options, update: options.update ?? "once", intensity: options.intensity ?? 1 }
    } as unknown as AuraSceneNode)
} as const;
