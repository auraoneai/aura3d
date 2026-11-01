import { describe, expect, it } from "vitest";
import { buildSheet } from "../../../examples/ninja-runner-port/meshes";
import { fallsSpec } from "../../../examples/ninja-runner-port/materials";
import { lookMode } from "../../../examples/ninja-runner-port/districtLook";
import { fallsCliff } from "../../../examples/ninja-runner-port/world";
import { COURSE_LENGTH, groundFrame } from "../../../examples/ninja-runner-port/course";

describe("GU47 phase 6 gate view", () => {
  it("opens the gate band in the evening; ?look=original keeps 4.6.2", () => {
    expect(lookMode("?at=2500")).toBe("evening");
    expect(lookMode("?at=2500&look=original")).toBe("original");
  });

  it("bends the evening falls without changing the flat 4.6.2 sheet or the triangle count", () => {
    const flat = buildSheet(56, 63);
    const bent = buildSheet(56, 63, 24, 12, 9);
    expect(bent.indices.length).toBe(flat.indices.length);
    expect(Math.max(...flat.positions.filter((_, i) => i % 3 === 2).map(Math.abs))).toBe(0);
    const z = bent.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...z)).toBeCloseTo(9, 5);
    expect(Math.min(...z)).toBe(0);
  });

  it("softens the falls only on request", () => {
    expect(fallsSpec().uniforms?.fallsSoft?.value).toBe(0);
    expect(fallsSpec(1).uniforms?.fallsSoft?.value).toBe(1);
  });

  it("keeps the falls cliff off the run", () => {
    const end = groundFrame(COURSE_LENGTH - 90, 0, 0);
    const rocks = fallsCliff(end);
    expect(rocks).toHaveLength(2);
    for (const r of rocks) {
      // half the footprint diagonal of a cliffB rock at this scale
      const reach = (Math.hypot(1.778 * r.scale[0], 1.896 * r.scale[2])) / 2;
      for (let d = 2300; d <= COURSE_LENGTH; d += 2) {
        const f = groundFrame(d, 0, 0);
        expect(Math.hypot(f.x - r.position[0], f.z - r.position[2])).toBeGreaterThan(reach + 5);
      }
      expect(r.position[1] + (1.393 * r.scale[1]) / 2).toBeCloseTo(end.y + 22, 5);
    }
  });
});
