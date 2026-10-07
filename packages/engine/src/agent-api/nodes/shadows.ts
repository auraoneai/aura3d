// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraPrimitiveNode, AuraVec3 } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { primitives } from "./primitives.js";
import { material } from "./material.js";

export const shadows = {
  /** @deprecated use `decals.blobShadow` (Q-07-1 pending) / `shadows.blobShadow`. */
  contact: (options: {
    readonly name?: string;
    readonly position?: AuraVec3;
    readonly footprint?: readonly [number, number];
    readonly opacity?: number;
    readonly color?: AuraColor;
  } = {}): AuraNodeBuilder<AuraPrimitiveNode> => {
    const footprint = options.footprint ?? [1.2, 0.72];
    return primitives.cylinder({
      name: options.name ?? "soft footprint contact shadow",
      material: material.pbr({
        color: options.color ?? "#030712",
        roughness: 0.94,
        opacity: options.opacity ?? 0.34
      })
    })
      .position(...(options.position ?? [0, 0.018, 0] as const))
      .scale([footprint[0], 0.012, footprint[1]]);
  },
  /** Blob footprint shadow — the PRD-02 name for `contact` (C-10). */
  blobShadow: (options: {
    readonly name?: string;
    readonly position?: AuraVec3;
    readonly footprint?: readonly [number, number];
    readonly opacity?: number;
    readonly color?: AuraColor;
  } = {}): AuraNodeBuilder<AuraPrimitiveNode> => {
    const footprint = options.footprint ?? [1.2, 0.72];
    return primitives.cylinder({
      name: options.name ?? "soft footprint blob shadow",
      material: material.pbr({
        color: options.color ?? "#030712",
        roughness: 0.94,
        opacity: options.opacity ?? 0.34
      })
    })
      .position(...(options.position ?? [0, 0.018, 0] as const))
      .scale([footprint[0], 0.012, footprint[1]]);
  }
} as const;

