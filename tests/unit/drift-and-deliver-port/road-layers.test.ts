import { describe, expect, it } from "vitest";
import { GROUND_HALF, blockDecals, outerGround, outerGroundRectsForTest, roadPlane, waterPlane } from "./road-layers-support";
import { buildBlocks } from "../../../examples/drift-and-deliver-port/world";
import { buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { planProps } from "../../../examples/drift-and-deliver-port/props";
import { buildBuildings } from "../../../examples/drift-and-deliver-port/world";
import type { MeshData } from "../../../examples/drift-and-deliver-port/mesh";

const blocks = buildBlocks();

/** world-space normal of every triangle: the drivable ground must face up and agree with its stored vertex normals (these meshes are authored in world space, so no instance transform can mirror them) */
function normals(m: MeshData): { up: number; wound: number; total: number } {
  let up = 0, wound = 0, total = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t]!, b = m.indices[t + 1]!, c = m.indices[t + 2]!;
    const p = (i: number): number[] => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
    const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-9) continue;
    total++;
    if (n[1]! / len > 0.9) up++;
    if ((n[0]! * m.normals[a * 3]! + n[1]! * m.normals[a * 3 + 1]! + n[2]! * m.normals[a * 3 + 2]!) / len > 0.99) wound++;
  }
  return { up, wound, total };
}

describe("Gridlock Courier ground layers", () => {
  for (const [name, mesh] of [
    ["road plane", roadPlane()],
    ["outer ground", outerGround()],
    ["harbour water", waterPlane()],
    ["park decals", blockDecals(blocks, "park", 21.5)],
    ["plaza decals", blockDecals(blocks, "plaza", 21.5)]
  ] as const) {
    it(`${name}: every triangle faces up, agrees with its normals`, () => {
      const r = normals(mesh);
      expect(r.total).toBeGreaterThan(0);
      expect(r.up, "normal.y > 0.9").toBe(r.total);
      expect(r.wound, "winding agrees with the vertex normals").toBe(r.total);
    });
  }

  it("the road paint lands on the same world position for any cell count (UV is a pure function of x and z)", () => {
    for (const cells of [1, 17, 64]) {
      const m = roadPlane(cells);
      for (let i = 0; i < m.positions.length / 3; i++) {
        const x = m.positions[i * 3]!, z = m.positions[i * 3 + 2]!;
        expect(m.uvs[i * 2]!).toBeCloseTo((x + 30) / 60, 9);
        expect(m.uvs[i * 2 + 1]!).toBeCloseTo((30 - z) / 60, 9);
      }
    }
  });

  it("outer ground is a frame around the road square, never a plane under it", () => {
    for (const [x0, z0, x1, z1] of outerGroundRectsForTest()) {
      const overlapX = Math.min(x1, GROUND_HALF) - Math.max(x0, -GROUND_HALF);
      const overlapZ = Math.min(z1, GROUND_HALF) - Math.max(z0, -GROUND_HALF);
      expect(overlapX > 0 && overlapZ > 0, `rect [${x0},${z0},${x1},${z1}] overlaps the road square`).toBe(false);
    }
  });

  it("no prop instance transform mirrors its model (positive finite scale)", () => {
    const furniture = buildFurniture(blocks);
    const plan = planProps(furniture, blocks, buildBuildings(blocks), { x: 30, z: -300 });
    let count = 0;
    for (const [key, transforms] of plan.placements)
      for (const t of transforms) {
        count++;
        expect(Number.isFinite(t.scale) && t.scale > 0, `${key} scale ${t.scale}`).toBe(true);
      }
    expect(count).toBeGreaterThan(0);
  });
});
