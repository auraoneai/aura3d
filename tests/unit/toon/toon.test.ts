import { describe, expect, it } from "vitest";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite.js";
import { TOON_FRAGMENT, toonTexel } from "../../../packages/engine/src/agent-api/nodes/effects.toon.js";

describe("effects.toon", () => {
  it("builds an after-tonemap post pass with the Silt defaults", () => {
    const pass = effects.toon({ size: [640, 360] });
    expect(pass.name).toBe("toon");
    expect(pass.insertAt).toBe("after-tonemap");
    expect(pass.fragment.glsl).toBe(TOON_FRAGMENT);
    expect(pass.uniforms).toMatchObject({ u_bands: 5, u_band_mix: 0.75, u_outline: 0.75, u_edge: [0.26, 0.6] });
    expect(pass.uniforms?.u_texel).toEqual([1 / 640, 1 / 360]);
  });

  it("passes authored values through", () => {
    const pass = effects.toon({ name: "cel", bands: 3, bandMix: 1, outline: 0, ink: [0, 0, 0] });
    expect(pass.name).toBe("cel");
    expect(pass.uniforms).toMatchObject({ u_bands: 3, u_band_mix: 1, u_outline: 0, u_ink: [0, 0, 0] });
  });

  it("rejects out-of-range or non-finite options loudly", () => {
    expect(() => effects.toon({ bands: 1 })).toThrow(/bands/);
    expect(() => effects.toon({ bands: Number.NaN })).toThrow(/bands/);
    expect(() => effects.toon({ outline: 2 })).toThrow(/outline/);
    expect(() => effects.toon({ edgeStart: 0.6, edgeEnd: 0.3 })).toThrow(/edgeEnd/);
    expect(() => effects.toon({ ink: [0, 2, 0] })).toThrow(/ink/);
  });

  it("guards the texel size against zero", () => {
    expect(toonTexel(0, 0)).toEqual([1, 1]);
  });
});
