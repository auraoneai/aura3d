import { describe, expect, it } from "vitest";
import { MOUNT_PAOZU as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { buildClouds, buildMesas, buildObstacles } from "../../../examples/kid-goku-beyond-the-clouds-port/props";
import { buildGround, buildScatter, buildValleyForest, groundHeight, isVoid, openMode, profile } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

const finite = (xs: readonly number[]): boolean => xs.every(Number.isFinite);
const tris = (ms: readonly { indices: number[] }[]): number => ms.reduce((s, m) => s + m.indices.length / 3, 0);

describe("cloud runner: procedural scenery", () => {
  it("is deterministic and finite", () => {
    const a = buildGround(CH, 0, 400), b = buildGround(CH, 0, 400);
    expect(a.slope.length).toBe(b.slope.length);
    expect(a.slope[0]!.positions).toEqual(b.slope[0]!.positions);
    for (const m of [...a.road, ...a.grass, ...a.slope]) {
      expect(finite(m.positions) && finite(m.normals) && finite(m.uvs) && finite(m.colors)).toBe(true);
      expect(Math.max(...m.indices)).toBeLessThan(m.vertexCount);
    }
  });
  it("cuts the road out of gaps and gorges only", () => {
    expect(isVoid(CH, 155)).toBe(true);
    expect(isVoid(CH, 460)).toBe(true);
    expect(isVoid(CH, 100)).toBe(false);
    expect(groundHeight(CH, 100, 0)).toBe(0);
  });
  it("opens onto meadows mid-run and keeps a rising wall on the left at the start", () => {
    expect(openMode(100)).toBe(0);
    expect(openMode(1000)).toBe(1);
    const left = profile(CH, 30, -1), right = profile(CH, 30, 1);
    expect(left[left.length - 1]!.h).toBeGreaterThan(10);
    expect(right[right.length - 1]!.h).toBeLessThan(0);
  });
  it("stays inside a sane triangle budget", () => {
    const g = buildGround(CH);
    const sc = buildScatter(CH);
    const total = tris(g.road) + tris(g.grass) + tris(g.slope) + tris(sc.trees) + tris(sc.bushes) + tris(sc.rocks) + tris(sc.flowers) + tris(buildValleyForest(CH)) + tris(buildMesas(CH)) + tris(buildClouds(CH)) + tris(buildObstacles(CH));
    expect(total).toBeGreaterThan(100_000);
    expect(total).toBeLessThan(1_800_000);
  });
});
