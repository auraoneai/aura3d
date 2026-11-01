import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESHY_MODELS } from "../../../examples/roadster-hours-port/meshy.baked";
import { MESHY_LODS } from "../../../examples/roadster-hours-port/meshy.lod.baked";
import { meshyLodGeometry, registerMeshyForTest, registerMeshyLodForTest } from "../../../examples/roadster-hours-port/meshy";
import { LOD_NEAR_M, buildWorld } from "../../../examples/roadster-hours-port/world";

const read = (file: string): ArrayBuffer => {
  const b = readFileSync(resolve("examples/roadster-hours-port/assets/meshy", file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
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
  for (const key of Object.keys(MESHY_MODELS)) registerMeshyForTest(key, read(`${key}.bin`));
  for (const key of Object.keys(MESHY_LODS)) registerMeshyLodForTest(key, read(`lod/${key}.bin`));

  it("every baked LOD is smaller than its model and stays inside the 4% error bound", () => {
    for (const [key, lod] of Object.entries(MESHY_LODS)) {
      expect(lod.fullTriangles).toBe(MESHY_MODELS[key]!.triangles);
      expect(lod.triangles).toBeLessThan(lod.fullTriangles);
      expect(lod.error).toBeLessThanOrEqual(0.04);
      const g = meshyLodGeometry(key)!;
      expect(g.indices.length).toBe(lod.triangles * 3);
      expect(Math.max(...g.indices)).toBeLessThan(g.positions.length / 3);
    }
    const total = Object.values(MESHY_LODS).reduce((n, l) => n + l.triangles, 0), full = Object.values(MESHY_LODS).reduce((n, l) => n + l.fullTriangles, 0);
    expect(total / full).toBeLessThan(0.35);
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
