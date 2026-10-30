import { describe, expect, it } from "vitest";
import { EVENING_SURFACES, LANTERN_GLOW, lanternGlowAt } from "../../../examples/ninja-runner-port/districtLook";
import { LAYERS } from "../../../examples/ninja-runner-port/scenery";

describe("ninja-runner-port evening surfaces (GU47 NR-11)", () => {
  it("lacquers the tiled roof layers and dampens the rocks, only on real layers", () => {
    const ids = new Set(LAYERS.map((l) => l.id));
    for (const id of Object.keys(EVENING_SURFACES)) expect(ids.has(id)).toBe(true);
    for (const id of ["roofs", "hips", "capcones"]) {
      const coat = EVENING_SURFACES[id]!;
      expect(coat.clearcoat).toBeGreaterThanOrEqual(0.5);
      expect(coat.roughness).toBeLessThan(LAYERS.find((l) => l.id === id)!.roughness);
    }
    expect(EVENING_SURFACES.rocks!.roughness).toBeLessThan(LAYERS.find((l) => l.id === "rocks")!.roughness);
    expect(EVENING_SURFACES.lanterns).toBeUndefined();
  });

  it("splits the lanterns into three glow groups that brighten with the evening", () => {
    expect(lanternGlowAt(100)).toBe("day");
    expect(lanternGlowAt(700)).toBe("day");
    expect(lanternGlowAt(1300)).toBe("dusk");
    expect(lanternGlowAt(1900)).toBe("night");
    expect(lanternGlowAt(2500)).toBe("night");
    expect(LANTERN_GLOW.day.intensity).toBeLessThan(LANTERN_GLOW.dusk.intensity);
    expect(LANTERN_GLOW.dusk.intensity).toBeLessThan(LANTERN_GLOW.night.intensity);
    expect(Object.keys(LANTERN_GLOW)).toHaveLength(3); // +2 draws over the single original lantern layer
  });
});
