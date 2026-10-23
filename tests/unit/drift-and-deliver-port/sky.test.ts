import { describe, expect, it } from "vitest";
import { FAR_FRAGMENT, SKY_FRAGMENT, SKY_VERTEX, SUN_DIR, farCitySpec, skySpec } from "../../../examples/drift-and-deliver-port/sky";

describe("sky and far-city shaders", () => {
  it("the sun direction is a unit vector pointing up and toward the sun side of the light rig", () => {
    expect(Math.hypot(...SUN_DIR)).toBeCloseTo(1, 9);
    expect(SUN_DIR[1]).toBeGreaterThan(0.3);
    expect(SUN_DIR[0]).toBeGreaterThan(0.5);
  });

  it("uses only declared uniforms and the engine's lowered built-ins", () => {
    const spec = skySpec();
    expect(Object.keys(spec.uniforms ?? {})).toEqual(["sunDirection"]);
    expect(SKY_FRAGMENT).toContain("sunDirection");
    expect(SKY_FRAGMENT).toContain("cameraPosition");
    expect(SKY_VERTEX).toContain("modelMatrix");
    expect(spec.depthWrite).toBe(false);
    const far = farCitySpec({});
    expect(Object.keys(far.uniforms ?? {})).toEqual(["farPalette"]);
    expect(FAR_FRAGMENT).toContain("farPalette");
  });
});
