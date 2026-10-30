import { describe, expect, it } from "vitest";
import { RIM, buildCraterRim, crestHeight, rimScatter } from "../../../examples/strange-orbit-port/art/craterRim";
import { buildWorld } from "../../../examples/strange-orbit-port/world";

/** GU47 SO47-W1 (lane g15): crater rim, >= 300 instanced rocks and spires in a fixed number of nodes. */
describe("strange-orbit-port crater rim", () => {
  it("builds a closed jagged wall between 600 and 900 m", () => {
    const rim = buildCraterRim();
    expect(rim.positions.length / 3).toBe((RIM.segments + 1) * 4);
    expect(rim.indices.length).toBe(RIM.segments * 3 * 6);
    const crests = Array.from({ length: 360 }, (_, i) => crestHeight((i / 360) * Math.PI * 2));
    expect(Math.min(...crests)).toBeGreaterThanOrEqual(RIM.crestMin);
    expect(Math.max(...crests) - Math.min(...crests)).toBeGreaterThan(50);
  });

  it("scatters >= 300 rocks and spires on High, half on Low, clear of the course", () => {
    const high = rimScatter(true);
    expect(high.rocks.length + high.spires.length).toBeGreaterThanOrEqual(300);
    const low = rimScatter(false);
    expect(low.rocks.length + low.spires.length).toBe((high.rocks.length + high.spires.length) / 2);
    for (const s of high.spires) expect(Math.hypot(s.position[0], s.position[2])).toBeGreaterThan(300);
  });

  it("adds the rim as three nodes in the gouache look only", () => {
    const names = (look: "gouache" | "original") => (buildWorld({ vehicle: "bike", rider: 0, quality: "high", look }).scene.toJSON().nodes as readonly { name?: string }[]).map((n) => n.name);
    expect(names("gouache")).toEqual(expect.arrayContaining(["crater-rim", "rim-rocks", "rim-spires"]));
    expect(names("original")).not.toContain("crater-rim");
  });
});
