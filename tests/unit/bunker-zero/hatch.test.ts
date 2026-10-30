import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CELL, FLOORS, SILO_H, isSolid } from "../../../apps/showcase-bunker-zero/src/maps";
import { BZ_HATCH_CELLS, fixtureCells, underHatch } from "../../../apps/showcase-bunker-zero/src/art/look";
import { BZ_HATCH, BZ_MOON, hatchCentre } from "../../../apps/showcase-bunker-zero/src/art/lightRig";
import { hatchBackdrop, hatchCeiling, hatchCollar, hatchRect, hatchShaftSpec, shaftOnSlot } from "../../../apps/showcase-bunker-zero/src/art/hatch";

const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
const F6 = FLOORS[5]!;

describe("Bunker Zero F6 hatch set piece (BZ-07)", () => {
  it("opens 3x3 open cells over the Warden arena on F6 only", () => {
    const { min, max } = BZ_HATCH_CELLS;
    expect(max[0] - min[0] + 1).toBe(3);
    expect(max[1] - min[1] + 1).toBe(3);
    expect(BZ_HATCH.cells).toBe(BZ_HATCH_CELLS);
    let boss = false;
    for (let z = min[1]; z <= max[1]; z++) for (let x = min[0]; x <= max[0]; x++) {
      const ch = F6.rows[z]![x]!;
      expect(isSolid(ch), `${x},${z}`).toBe(false);
      if (ch === "B") boss = true;
    }
    expect(boss).toBe(true);
    expect(underHatch(FLOORS[0]!, 11, 9)).toBe(false);
    expect(fixtureCells(F6).some(([x, z]) => underHatch(F6, x, z))).toBe(false);
  });

  it("tiles the ceiling around the opening exactly: slab area = floor area - hatch area, nothing over the hole", () => {
    const w = F6.rows[0]!.length, h = F6.rows.length;
    const slabs = hatchCeiling(w, h, SILO_H);
    expect(slabs).toHaveLength(4);
    const area = slabs.reduce((a, s) => a + s.scale[0] * s.scale[2], 0);
    const r = hatchRect();
    expect(area).toBeCloseTo(w * CELL * h * CELL - (r.x1 - r.x0) * (r.z1 - r.z0), 6);
    const [cx, , cz] = hatchCentre(0);
    for (const s of slabs) {
      const inX = Math.abs(cx - s.position[0]) < s.scale[0] / 2, inZ = Math.abs(cz - s.position[2]) < s.scale[2] / 2;
      expect(inX && inZ).toBe(false);
    }
    expect(hatchCollar(SILO_H)).toHaveLength(4);
    expect(hatchBackdrop(SILO_H).position[1]).toBeGreaterThan(SILO_H);
  });

  it("lights the shaft in the moon's colour and turns it on for F6 only", () => {
    const spec = hatchShaftSpec(0.05);
    expect(spec.color).toBe(BZ_MOON.color);
    expect("lightPosition" in spec).toBe(false);
    expect(spec.godRayDensity).toBeGreaterThanOrEqual(0.05);
    expect(spec.godRayDensity).toBeLessThanOrEqual(1);
    expect([0, 1, 2, 3, 4, 5, 6].filter(shaftOnSlot)).toEqual([5]);
    expect(MAIN).toContain("effects.volumetricFog(hatchShaftSpec(");
    expect(MAIN).toContain('setEffectEnabled("volumetricFog", shaftOnSlot(slot))');
  });
});
