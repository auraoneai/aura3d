// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraPrimitiveNode, AuraVec3 } from "../index.js";
import { AuraNodeBuilder, primitives } from "../index.js";
import { material } from "./material.js";

export const shadows = {
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
  }
} as const;
