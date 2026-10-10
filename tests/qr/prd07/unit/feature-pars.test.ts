// PRD-07 P4/P5 — the pars library returns sparse per-item feature bits:
// fog model by flag+tier, wetness only while a driver is live (IC-0).

import { afterEach, describe, expect, it } from "vitest";
import { prd07FeatureBits, prd07FogSelect, prd07WetnessSelect } from "../../../../packages/rendering/src/vfx/prd07FeaturePars";
import { setPrd07WetnessState } from "../../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";

const input = (flagNames: string[], volumetricFog: "analytic" | "froxel") =>
  ({
    item: {} as never,
    pass: "forward" as never,
    tier: { volumetricFog } as never,
    flags: { on: (n: string) => flagNames.includes(n) } as never
  });

afterEach(() => {
  setPrd07WetnessState({ wetness: 0, rainRipples: 0, snowCover: 0, puddleNoise: null });
});

describe("P4/P5 prd07 feature pars", () => {
  it("fog selects the tier model only under A3D_QR_VFX_FOG", () => {
    expect(prd07FogSelect(input(["A3D_QR_VFX_FOG"], "analytic"))).toBe("height");
    expect(prd07FogSelect(input(["A3D_QR_VFX_FOG"], "froxel"))).toBe("volumetric");
    expect(prd07FogSelect(input([], "froxel"))).toBeUndefined();
  });

  it("wetness selects only while a wetness driver is live", () => {
    expect(prd07WetnessSelect()).toBeUndefined();
    setPrd07WetnessState({ wetness: 0.5 });
    expect(prd07WetnessSelect()).toBe(true);
    setPrd07WetnessState({ wetness: 0, rainRipples: 0.3 });
    expect(prd07WetnessSelect()).toBe(true);
  });

  it("prd07FeatureBits emits only active bits", () => {
    expect(prd07FeatureBits(input([], "analytic"))).toEqual({});
    const bits = prd07FeatureBits(input(["A3D_QR_VFX_FOG"], "froxel"));
    expect(bits).toEqual({ "prd07.fog": "volumetric" });
    setPrd07WetnessState({ snowCover: 0.4 });
    expect(prd07FeatureBits(input(["A3D_QR_VFX_FOG"], "froxel"))["prd07.wetness"]).toBe(true);
  });
});
