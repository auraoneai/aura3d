import { describe, expect, it } from "vitest";
import { APEX_LOOK, apexLookAt } from "../../../apps/showcase-roadster-rush/src/art/look";
import { skyLook, skySpec } from "../../../apps/showcase-roadster-rush/src/art/sky";

const to255 = (c: readonly number[]): number[] => c.map((v) => Math.round(v * 255));

describe("Apex Overdrive blue-hour dome (GU47 AO-E1)", () => {
  it("keeps a cobalt zenith (B > R by >= 15) and a warm horizon (R > B) at every time of day", () => {
    for (const tod of [0, 0.25, 0.5, 0.75, 1]) {
      const look = skyLook(tod);
      const [tr, , tb] = to255(look.skyTop);
      expect(tb - tr, `zenith at tod ${tod}`).toBeGreaterThanOrEqual(15);
      const [hr, , hb] = to255(look.skyHorizon);
      expect(hr, `horizon at tod ${tod}`).toBeGreaterThan(hb);
      const [gr, , gb] = to255(look.cityGlow);
      expect(gr, `city glow at tod ${tod}`).toBeGreaterThan(gb);
    }
  });

  it("draws the disc on the key light's direction (key, disc and shadows agree)", () => {
    for (const tod of [0, 0.5, 1]) {
      const look = skyLook(tod);
      const key = apexLookAt(tod).sunDir;
      expect(look.sunDir).toEqual(key);
      expect(look.sunDirXZ).toEqual([key[0], key[2]]);
    }
    const el0 = (Math.asin(skyLook(0).sunDir[1]) * 180) / Math.PI;
    expect(el0).toBeCloseTo(APEX_LOOK[0].sun.elevationDeg, 6);
  });

  it("boots the dome on the sunset row and fades to night", () => {
    const spec = skySpec();
    const uniforms = spec.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.skyTop!.value).toEqual(skyLook(0).skyTop);
    expect(uniforms.nightAmount!.value).toBe(0);
    expect(skyLook(0).nightAmount).toBe(0);
    expect(skyLook(1).nightAmount).toBe(1);
    expect(spec.glsl.fragment).not.toMatch(/smoothstep\(0\.0,\s*-/); // no reversed smoothstep edges (undefined in GLSL)
  });
});
