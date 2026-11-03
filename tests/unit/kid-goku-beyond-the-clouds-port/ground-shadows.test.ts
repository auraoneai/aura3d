import { describe, expect, it } from "vitest";
import { appendGroundShadows, SHADE_GRID, shadowGroundDir, TREE_SHADOW } from "../../../examples/kid-goku-beyond-the-clouds-port/groundShadows";
import { Mesh } from "../../../examples/kid-goku-beyond-the-clouds-port/mesh";
import { ACTIVE_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";

describe("storm-row ground shadows (GU47 phase 4)", () => {
  it("fall away from the sun, flat on the ground", () => {
    const [dx, dz] = shadowGroundDir(ACTIVE_LOOK.scenery.sunDir);
    const s = ACTIVE_LOOK.scenery.sunDir;
    expect(dx * s[0] + dz * s[2]).toBeLessThan(0);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1, 6);
  });
  it("one draped grid per placement with a track position, on the ground, centred downwind of the foot", () => {
    const m = new Mesh();
    const g = { forwardXZ: (): [number, number] => [0, 1], groundAt: (s: number, lat: number): readonly [number, number, number] => [-lat, 2.06, s] };
    appendGroundShadows(m, [{ pos: [0, 2, 10], scale: 6, s: 10, lat: 0 }, { pos: [0, 0, 0], scale: 3 }], ACTIVE_LOOK.scenery.sunDir, TREE_SHADOW, g);
    expect(m.vertexCount).toBe(SHADE_GRID * SHADE_GRID);
    expect(m.indices.length).toBe((SHADE_GRID - 1) * (SHADE_GRID - 1) * 6);
    for (let i = 0; i < m.vertexCount; i++) expect(m.positions[i * 3 + 1]).toBeCloseTo(2.06, 6);
    const [dx, dz] = shadowGroundDir(ACTIVE_LOOK.scenery.sunDir);
    let cx = 0, cz = 0;
    for (let i = 0; i < m.vertexCount; i++) { cx += m.positions[i * 3]! / m.vertexCount; cz += m.positions[i * 3 + 2]! / m.vertexCount; }
    expect(cx * dx + (cz - 10) * dz).toBeGreaterThan(0);
  });
});
