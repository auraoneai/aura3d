import { describe, expect, it } from "vitest";
import { createProductLightingPreset } from "@aura3d/product-studio";

describe("product lighting presets", () => {
  it("creates environment, direct lights, shadows, and postprocess for every preset", () => {
    for (const preset of ["catalog-softbox", "inspection-bay", "hero-contrast"] as const) {
      const lighting = createProductLightingPreset(preset);
      expect(lighting.preset).toBe(preset);
      expect(lighting.environmentLighting.intensity).toBeGreaterThan(0);
      expect(lighting.lights.length).toBeGreaterThanOrEqual(2);
      expect(lighting.lights.some((light) => light.castsShadow)).toBe(true);
      expect(lighting.shadow.enabled).toBe(true);
      expect(lighting.postprocess.toneMapping).toBeTruthy();
    }
  });
});
