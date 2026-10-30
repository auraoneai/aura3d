import { describe, expect, it } from "vitest";
import { APEX_PLUMES, APEX_PLUME_SCROLL, plumeScroll, plumeSpec } from "../../../apps/showcase-roadster-rush/src/art/plume";

describe("Apex Overdrive energy plumes (GU47 AO-M4)", () => {
  it("is an additive fresnel cone with scrolling noise and a hot core", () => {
    const spec = plumeSpec(APEX_PLUMES.rear, false);
    expect(spec.blending).toBe("additive");
    expect(spec.depthWrite).toBe(false);
    expect(spec.glsl.vertex).toContain("plumeTip");
    expect(spec.glsl.vertex).toContain("instanceMatrix");
    expect(spec.glsl.fragment).toContain("uTime * plumeScroll");
    expect(spec.glsl.fragment).toContain("plumeCore * core");
    expect(spec.uniforms?.plumeScroll?.value).toBe(APEX_PLUME_SCROLL);
    expect(spec.uniforms?.plumeGain?.value).toBe(1.9);
  });

  it("stops the scroll under reduced motion", () => {
    expect(plumeScroll(true)).toBe(0);
    expect(plumeSpec(APEX_PLUMES.down, true).uniforms?.plumeScroll?.value).toBe(0);
  });

  it("keeps the identity palette: cyan thrusters, tangerine Rocket Send, no magenta", () => {
    expect(APEX_PLUMES.rear.color).toBe("#4df0ff");
    expect(APEX_PLUMES.rocket.color).toBe("#ff8a3d");
    for (const p of Object.values(APEX_PLUMES)) expect(p.color.toLowerCase()).not.toMatch(/#ff00ff|#e879f9|#d946ef/);
  });
});
