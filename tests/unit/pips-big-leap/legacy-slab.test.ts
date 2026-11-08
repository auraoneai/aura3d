// Lane 521: the 4.7.18 slab normals for Whispering Forest and Starfall Garden (legacySlab.ts).
import { describe, expect, it } from "vitest";
import { legacyRoundedBoxMesh, legacySlabGeometry } from "../../../apps/showcase-pips-big-leap/src/game/legacySlab";
import { LEGACY_SLAB_NORMAL_WORLDS } from "../../../apps/showcase-pips-big-leap/src/game/world";

describe("Pip's Big Leap legacy slab normals (lane 521)", () => {
  it("builds the unit rounded box: 6 faces x 5x5 cells x 2 triangles, unit bounds, unit normals", () => {
    const mesh = legacyRoundedBoxMesh(0.3);
    expect(mesh.positions.length / 3).toBe(6 * 25 * 6);
    for (let i = 0; i < mesh.positions.length; i += 1) expect(Math.abs(mesh.positions[i]!)).toBeLessThanOrEqual(0.5 + 1e-9);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!)).toBeCloseTo(1, 6);
    }
  });

  it("places each slab by its transform and writes the 4.7.18 world normal normalize(scale * n)", () => {
    const unit = legacyRoundedBoxMesh(0.3);
    const scale = [8.82, 0.12, 7.84] as const;
    const geo = legacySlabGeometry([{ position: [1, 2, 3], scale }], 0.3);
    const positions = geo.positions as Float32Array;
    const normals = geo.normals as Float32Array;
    let tilted = 0;
    for (let v = 0; v < unit.positions.length / 3; v += 1) {
      for (let a = 0; a < 3; a += 1) expect(positions[v * 3 + a]).toBeCloseTo([1, 2, 3][a]! + scale[a]! * unit.positions[v * 3 + a]!, 4);
      const n = [0, 1, 2].map((a) => scale[a]! * unit.normals[v * 3 + a]!);
      const l = Math.hypot(n[0]!, n[1]!, n[2]!);
      for (let a = 0; a < 3; a += 1) expect(normals[v * 3 + a]).toBeCloseTo(n[a]! / l, 5);
      // A rounded-edge normal on the top face (unit n.y between 0.2 and 0.9) lands near the horizontal.
      const uy = unit.normals[v * 3 + 1]!;
      if (uy > 0.2 && uy < 0.9) {
        expect(Math.abs(normals[v * 3 + 1]!)).toBeLessThan(0.2);
        tilted += 1;
      }
    }
    expect(tilted).toBeGreaterThan(0);
    expect(geo.indices?.length).toBe(positions.length / 3);
  });

  it("applies only to Whispering Forest and Starfall Garden", () => {
    expect([...LEGACY_SLAB_NORMAL_WORLDS].sort()).toEqual(["w1", "w6"]);
  });
});
