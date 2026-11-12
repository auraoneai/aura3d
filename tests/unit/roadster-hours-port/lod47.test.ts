import { describe, expect, it } from "vitest";
import {
  PROCEDURAL_TRAFFIC_KEYS,
  getProceduralSceneryLibrary,
  getProceduralTrafficVehicle
} from "../../../examples/roadster-hours-port/art/proceduralModels";
import { LOD_NEAR_M, buildWorld } from "../../../examples/roadster-hours-port/world";

type Node = Record<string, unknown> & { readonly name?: string; readonly kind?: string };
function nodes(scene: { toJSON(): unknown }): Node[] {
  const out: Node[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Node;
      if (typeof o.kind === "string" && typeof o.name === "string") out.push(o);
      for (const key of Object.keys(o)) if (key !== "geometry" && key !== "material") walk(o[key]);
    }
  };
  walk(scene.toJSON());
  return out;
}

describe("Saltwind Highway far LODs (GU47 phase 6, WP-32 triangle budget)", () => {
  it("every procedural far LOD has fewer triangles than its near assembly and valid indices", () => {
    const scenery = getProceduralSceneryLibrary();
    const sceneryPairs = [
      [scenery.villa.stucco.indices.length + scenery.villa.roofAndArch.indices.length + scenery.villa.shutters.indices.length, scenery.villa.lod],
      [scenery.townhouse.stucco.indices.length + scenery.townhouse.roofAndArch.indices.length + scenery.townhouse.shutters.indices.length, scenery.townhouse.lod],
      [scenery.palm.fronds.indices.length + scenery.palm.trunk.indices.length, scenery.palm.lod],
      [scenery.pine.needles.indices.length + scenery.pine.trunk.indices.length, scenery.pine.lod],
      [scenery.boulder.indices.length, scenery.boulderLod]
    ] as const;
    for (const [nearIndices, far] of sceneryPairs) {
      expect(far.indices.length).toBeGreaterThan(0);
      expect(far.indices.length).toBeLessThan(nearIndices);
      expect(Math.max(...far.indices)).toBeLessThan(far.positions.length / 3);
    }
    for (const key of PROCEDURAL_TRAFFIC_KEYS) {
      const veh = getProceduralTrafficVehicle(key);
      expect(veh.lod.indices.length).toBeGreaterThan(0);
      expect(veh.lod.indices.length).toBeLessThan(veh.paint.indices.length);
      expect(Math.max(...veh.lod.indices)).toBeLessThan(veh.lod.positions.length / 3);
    }
    expect(LOD_NEAR_M).toBeGreaterThanOrEqual(120);
  });

  it("GU47 looks add an unshadowed far node per repeated prop and per traffic model; ?look=original keeps one node each", () => {
    const gu = nodes(buildWorld(0, "gu47").scene);
    for (const name of ["palms", "pines", "boulders", "town-villas", "town-townhouses"]) {
      const near = gu.find((n) => n.name === name), far = gu.find((n) => n.name === `${name}-far`);
      expect(near?.castShadow).not.toBe(false);
      expect(far?.castShadow).toBe(false);
      expect((far?.runtime as { id?: string } | undefined)?.id).toBe(`${name}-far`);
    }
    const farVehicles = gu.filter((n) => n.kind === "batched" && /^vehicles-.*-far$/.test(n.name ?? ""));
    expect(farVehicles.length).toBeGreaterThan(3);
    for (const n of farVehicles) expect(n.castShadow).toBe(false);
    expect(nodes(buildWorld(0, "original").scene).some((n) => (n.name ?? "").endsWith("-far"))).toBe(false);
    expect(nodes(buildWorld(1, "gu47").scene).some((n) => n.name === "boulders-far")).toBe(true);
  });
});
