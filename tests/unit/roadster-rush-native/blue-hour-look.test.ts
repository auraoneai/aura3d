import { describe, expect, it } from "vitest";
import { APEX_FOG_RANGE, APEX_LOOK, apexLookAt, parseTodParam } from "../../../apps/showcase-roadster-rush/src/art/look";
import { skyLook, skySpec } from "../../../apps/showcase-roadster-rush/src/art/sky";

const to255 = (c: readonly number[]): number[] => c.map((v) => Math.round(v * 255));

describe("Apex Overdrive time-of-day light and fog (GU47 AO-L2, AO-E3)", () => {
  it("dims key, fill and IBL from sunset through dusk to night (spread target >= 30 luma)", () => {
    const [sunset, dusk, night] = [apexLookAt(0), apexLookAt(0.5), apexLookAt(1)];
    expect([sunset.environmentIntensity, dusk.environmentIntensity, night.environmentIntensity]).toEqual([1, 0.55, 0.18]);
    expect(sunset.sun.intensity).toBeGreaterThan(dusk.sun.intensity);
    expect(dusk.sun.intensity).toBeGreaterThan(night.sun.intensity);
    expect(sunset.fill.intensity).toBe(0.6);
    expect(night.fill.intensity).toBeLessThan(dusk.fill.intensity);
    // the key always points from the disc toward the camera side (+z): backlit traffic
    for (const f of [sunset, dusk, night]) expect(-f.sunDir[2]).toBeGreaterThan(0.98);
  });

  it("keeps the 43/257 fog range and walks the fog colour with the sky", () => {
    for (const tod of [0, 0.5, 1]) {
      const f = apexLookAt(tod);
      expect(f.fog.near).toBeCloseTo(APEX_FOG_RANGE.near, 6);
      expect(f.fog.far).toBeCloseTo(APEX_FOG_RANGE.far, 6);
    }
    expect(apexLookAt(0).fog.color).toBe(APEX_LOOK[0].fog.color);
    expect(apexLookAt(1).fog.color).toBe(APEX_LOOK[2].fog.color);
  });

  it("parses ?tod= into a presented time of day (presentation only)", () => {
    expect(parseTodParam("sunset")).toBe(0);
    expect(parseTodParam("Dusk")).toBe(0.5);
    expect(parseTodParam("night")).toBe(1);
    expect(parseTodParam("0.25")).toBe(0.25);
    expect(parseTodParam("7")).toBe(1);
    expect(parseTodParam("")).toBeNull();
    expect(parseTodParam(null)).toBeNull();
    expect(parseTodParam("noon")).toBeNull();
  });
});

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
