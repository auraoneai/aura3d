import { describe, expect, it } from "vitest";
import { HAZE_FLOOR_Y, groundSpec } from "../../../apps/showcase-roadster-rush/src/art/ground";
import { PYLON_KIT, PYLON_ROWS, PYLON_STRIDE_Z, PYLON_X, pylonLayout } from "../../../apps/showcase-roadster-rush/src/render/pylons";

describe("Apex Overdrive skyway dressing (GU47 AO-E2)", () => {
  it("drops the city floor 28 m below the deck and scrolls its plan with the run", () => {
    expect(HAZE_FLOOR_Y).toBe(-28);
    const spec = groundSpec();
    const uniforms = spec.uniforms as Record<string, { type: string; value: unknown }>;
    expect(uniforms.scroll!.type).toBe("vec2");
    expect(uniforms.windowSpecks!.type).toBe("f32");
    expect(spec.glsl.fragment).toContain("speck");
  });

  it("lays world-anchored piers every 40 m outside the deck, reaching the haze floor", () => {
    const a = pylonLayout(-1005);
    expect(a.columns).toHaveLength(PYLON_ROWS * 2);
    expect(a.caps).toHaveLength(PYLON_ROWS);
    for (const c of a.columns) {
      expect(Math.abs(c.x)).toBe(PYLON_X);
      expect(Math.abs(c.x) - PYLON_KIT.column.size[0] / 2).toBeGreaterThan(12); // clear of the 24 m deck
      expect(c.z % PYLON_STRIDE_Z).toBe(-0);
    }
    const bottom = a.columns[0]!.y - PYLON_KIT.column.size[1] / 2;
    expect(bottom).toBeCloseTo(HAZE_FLOOR_Y, 6);
    // the same world rows stay put while the player moves within a stride
    const b = pylonLayout(-1015);
    expect(b.caps.map((c) => c.z)).toEqual(a.caps.map((c) => c.z));
    // rows cover from just behind the camera to ~400 m ahead
    expect(Math.max(...a.caps.map((c) => c.z))).toBeGreaterThan(-1005);
    expect(Math.min(...a.caps.map((c) => c.z))).toBeLessThan(-1005 - 350);
  });
});
