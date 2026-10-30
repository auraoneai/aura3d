import { describe, expect, it } from "vitest";
import { DECAL_CAPACITY, DECAL_KINDS, DECAL_KIND_CODE, decalLayout, decalSpec } from "../../../apps/showcase-roadster-rush/src/render/decals";

describe("Apex Overdrive road decals (GU47 AO-W2)", () => {
  it("never exceeds 32 live decals and stays on the five-lane deck", () => {
    for (const pz of [0, -333, -4200.5, -18000]) {
      const decals = decalLayout(pz);
      expect(decals.length).toBeLessThanOrEqual(DECAL_CAPACITY);
      for (const d of decals) expect(Math.abs(d.x)).toBeLessThan(9);
    }
  });

  it("draws all three kinds over a run and is world-anchored", () => {
    const seen = new Set<string>();
    for (let pz = 0; pz > -3000; pz -= 250) for (const d of decalLayout(pz)) seen.add(d.kind);
    expect([...seen].sort()).toEqual([...DECAL_KINDS].sort());
    const key = (d: { x: number; z: number; kind: string }) => `${d.kind}:${d.x.toFixed(3)}:${d.z.toFixed(3)}`;
    const a = new Set(decalLayout(-1000).map(key));
    const b = decalLayout(-1018).map(key);
    expect(b.filter((k) => a.has(k)).length).toBeGreaterThanOrEqual(b.length - 2);
  });

  it("decodes the kind from the instance y scale and takes the scene fog", () => {
    expect(new Set(Object.values(DECAL_KIND_CODE)).size).toBe(3);
    const spec = decalSpec();
    expect(spec.fog).toBe(true);
    expect(spec.depthWrite).toBe(false);
    expect(spec.glsl.vertex).toContain("instanceMatrix[1]");
  });
});
