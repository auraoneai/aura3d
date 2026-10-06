// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneNode } from "../index.js";
import { primitives } from "../index.js";
import { createWaterSurface, sampleOceanFixture, type WaterSurfaceBoat, type WaterSurfacePreset } from "@aura3d/rendering";
import { material } from "./material.js";

export const water = {
  surface: (options: {
    readonly preset?: WaterSurfacePreset;
    readonly seed?: number;
    readonly boat?: WaterSurfaceBoat;
    readonly withBoatHull?: boolean;
  } = {}): {
    readonly nodes: readonly AuraSceneNode[];
    readonly bandCount: number;
    readonly foamCount: number;
    readonly wakeActive: boolean;
    readonly wakeSegmentCount: number;
  } => {
    const state = createWaterSurface({ preset: options.preset, seed: options.seed, boat: options.boat });
    const nodes: AuraSceneNode[] = [];
    const bandSpan = 4 / state.bands.length;
    state.bands.forEach((band, index) => {
      nodes.push(primitives.box({ name: `d3 water depth band ${index}`, material: material.pbr({ color: band.color, roughness: 0.12, metallic: 0.05 }) })
        .position(0, 0.02 + index * 0.0012, -4.5 + bandSpan * (index + 0.5)).scale([9, 0.024, bandSpan + 0.01]).toJSON());
    });
    nodes.push(primitives.box({ name: "d3 shoreline sand", material: material.pbr({ color: "#cbb37f", roughness: 0.95, metallic: 0 }) })
      .position(0, 0, 0.9).scale([9, 0.03, 2.6]).toJSON());
    for (const [index, patch] of state.foam.entries()) {
      nodes.push(primitives.sphere({ name: `d3 shore foam ${index}`, material: material.pbr({ color: "#f4fafd", roughness: 0.55, metallic: 0 }) })
        .position(Math.max(-4.2, Math.min(4.2, patch.x * 3)), 0.045, -0.42 + (index % 3) * 0.12).scale([Math.max(0.08, patch.radius * 6), 0.02, Math.max(0.05, patch.radius * 3)]).toJSON());
    }
    if (options.withBoatHull !== false && options.boat) {
      nodes.push(primitives.box({ name: "d3 wake boat hull", material: material.pbr({ color: "#7c3f21", roughness: 0.7, metallic: 0 }) })
        .position(options.boat.x ?? 0, 0.12, options.boat.z ?? -2).scale([0.34, 0.16, 0.9]).toJSON());
    }
    state.wake.forEach((segment, index) => {
      nodes.push(primitives.box({ name: `d3 boat wake ${index}`, material: material.pbr({ color: "#cfeaf7", roughness: 0.3, metallic: 0 }) })
        .position(segment.x * 2, 0.038, segment.z - 1.2).scale([segment.width, 0.012, 0.3]).toJSON());
    });
    return { nodes, bandCount: state.bands.length, foamCount: state.foam.length, wakeActive: state.wakeActive, wakeSegmentCount: state.wake.length };
  },
  /** Fixture-side buoyancy telemetry passthrough (no physics implemented here). */
  buoyancy: (options: { readonly preset?: WaterSurfacePreset; readonly seed?: number } = {}): ReturnType<typeof sampleOceanFixture>["buoyancy"] =>
    sampleOceanFixture({ preset: options.preset ?? "moderate", seed: options.seed ?? 0xaa7e5 }).buoyancy
} as const;
