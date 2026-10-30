import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CELL, FLOORS, KILL_HOUSE, isSolid } from "../../../apps/showcase-bunker-zero/src/maps";
import {
  BZ_BULLET_HOLES, BZ_BULLET_HOLE_SECONDS, BZ_DECAL_FILES, BZ_DECAL_NODES, BZ_FLOOR_DECAL_COUNT, bulletHolePose, decalPixel,
  decalsForTier, floorDecals, holeExpired, nextHoleSlot
} from "../../../apps/showcase-bunker-zero/src/art/decals";

const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
const DIR = path.resolve("apps/showcase-bunker-zero/public/aura-assets/decals");

describe("Bunker Zero wear decals (BZ-10)", () => {
  it("stays inside the 32-decal forward budget with one shared floor pool and a 12-hole ring", () => {
    expect(BZ_DECAL_NODES).toBeLessThanOrEqual(32);
    expect((MAIN.match(/decals\.project\(/g) ?? []).length).toBe(2); // two pool loops, no per-floor copies
    expect(decalsForTier("low")).toEqual({ floor: 6, holes: 6 });
  });

  it("seeds 12 distinct floor decals per floor on plain floor cells, identical every run", () => {
    for (const def of [...FLOORS, KILL_HOUSE]) {
      const a = floorDecals(def), b = floorDecals(def);
      expect(a, def.name).toEqual(b);
      expect(a, def.name).toHaveLength(BZ_FLOOR_DECAL_COUNT);
      const cells = new Set(a.map((d) => `${Math.floor(d.position[0] / CELL)},${Math.floor(d.position[2] / CELL)}`));
      expect(cells.size, def.name).toBe(BZ_FLOOR_DECAL_COUNT);
      for (const d of a) {
        const ch = def.rows[Math.floor(d.position[2] / CELL)]![Math.floor(d.position[0] / CELL)]!;
        expect([".", "S"]).toContain(ch);
      }
    }
    expect(floorDecals(FLOORS[0]!)).not.toEqual(floorDecals(FLOORS[1]!));
  });

  it("puts a bullet hole on the wall face the shot hit, facing the open side, and none in open space", () => {
    // 3x3: wall ring around one open centre cell
    const grid = "####.####".split("");
    const east = bulletHolePose(grid, 3, 3, 2 * CELL + 0.1, 1.5 * CELL);
    expect(east?.normal).toEqual([-1, 0, 0]);
    expect(east!.position[0]).toBeCloseTo(2 * CELL - 0.01);
    const north = bulletHolePose(grid, 3, 3, 1.5 * CELL, CELL + 0.2);
    expect(north?.normal).toEqual([0, 0, 1]);
    expect(bulletHolePose(grid, 3, 3, 1.5 * CELL, 1.5 * CELL)).toBeNull();
    const f1 = FLOORS[0]!, g = f1.rows.join("").split(""), w = f1.rows[0]!.length;
    for (let i = 0; i < 40; i++) {
      const pose = bulletHolePose(g, w, f1.rows.length, (i % w) * CELL + 1.3, Math.floor(i / 3) % f1.rows.length * CELL + 0.2);
      if (!pose) continue;
      const ox = Math.floor((pose.position[0] + pose.normal[0] * 0.5) / CELL), oz = Math.floor((pose.position[2] + pose.normal[2] * 0.5) / CELL);
      expect(isSolid(g[oz * w + ox] ?? "#")).toBe(false);
    }
  });

  it("recycles the oldest hole and expires holes after 20 s", () => {
    expect(nextHoleSlot([5, 2, 9])).toBe(1);
    expect(holeExpired(0, BZ_BULLET_HOLE_SECONDS - 0.01)).toBe(false);
    expect(holeExpired(0, BZ_BULLET_HOLE_SECONDS)).toBe(true);
    expect(BZ_BULLET_HOLES).toBe(12);
    expect(MAIN).toContain("addBulletHole(s.x, s.z)");
  });

  it("ships the three generated RGBA textures with transparent corners", () => {
    for (const file of Object.values(BZ_DECAL_FILES)) {
      const buf = readFileSync(path.join(DIR, file));
      expect(buf.subarray(1, 4).toString("ascii"), file).toBe("PNG");
      expect(buf[25], `${file} colour type RGBA`).toBe(6);
    }
    for (const kind of ["scorch", "crack", "bullet"] as const) expect(decalPixel(kind, 0.01, 0.01)[3], kind).toBe(0);
  });
});
