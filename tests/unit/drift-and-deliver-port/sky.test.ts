import { describe, expect, it } from "vitest";
import { FAR_FRAGMENT, SKY_VERTEX, SUN_DIR, daySkyOptions, farCitySpec } from "../../../examples/drift-and-deliver-port/sky";

describe("sky and far-city shaders", () => {
  it("the sun direction is a unit vector pointing up and toward the sun side of the light rig", () => {
    expect(Math.hypot(...SUN_DIR)).toBeCloseTo(1, 9);
    expect(SUN_DIR[1]).toBeGreaterThan(0.3);
    expect(SUN_DIR[0]).toBeGreaterThan(0.5);
  });

  it("the day sky is the engine sky.gradient towards SUN_DIR, without environment capture or fog colour", () => {
    const sky = daySkyOptions();
    expect(sky.style).toBe("stylized");
    expect(sky.captureEnvironment).toBe(false);
    expect(sky.affectsFog).toBe(false);
    const el = (sky.sun!.elevationDeg * Math.PI) / 180, az = (sky.sun!.azimuthDeg * Math.PI) / 180;
    const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    dir.forEach((v, i) => expect(v).toBeCloseTo(SUN_DIR[i]!, 12));
  });

  it("uses only declared uniforms and the engine's lowered built-ins", () => {
    expect(SKY_VERTEX).toContain("modelMatrix");
    const far = farCitySpec({});
    expect(Object.keys(far.uniforms ?? {})).toEqual(["farPalette"]);
    expect(FAR_FRAGMENT).toContain("farPalette");
  });
});
