import { describe, expect, it } from "vitest";
import { FEATURE_UNITS, resolveLightingSamplerBudgetReal } from "@aura3d/rendering/lanes";

const HIGH_DEFINES = {
  A3D_CASCADE_COUNT: 3,
  A3D_SHADOW_PCSS: 1,
  A3D_LOCAL_SHADOW_ATLAS: 1,
  A3D_CONTACT_SHADOW: 1,
  A3D_REFLECTION_PROBE_2: 1,
  A3D_IRRADIANCE_VOLUME: 1,
  A3D_LTC: 1,
  A3D_SH_TEXTURE: 1
};

describe("prd02 lighting sampler budget (PRD-02 §6.10)", () => {
  it("High + 7 material samplers: pcss→vogel, ltc→GL4, then drop order, ≤16 units", () => {
    const r = resolveLightingSamplerBudgetReal(HIGH_DEFINES, 7, { maxTextureImageUnits: 16 });
    // base: env1 + dfg1 + cascade-compare1 + cascade-3 1 + atlas1 + contact1 + probe2 2 + irrvol3 + ltc2 + sh1 = here
    const order = [...r.droppedFeatures];
    expect(order[0]).toBe("pcss-raw");
    expect(order[1]).toBe("ltc");
    expect(r.lightingUnits + r.materialSamplers).toBeLessThanOrEqual(16);
    // drop order then prunes contact-shadow before irradiance-volume
    const di = order.indexOf("contact-shadow");
    const iv = order.indexOf("irradiance-volume");
    expect(di).toBeGreaterThanOrEqual(0);
    expect(iv).toBeGreaterThanOrEqual(0);
    expect(di).toBeLessThan(iv);
  });

  it("is deterministic — same inputs, same plan", () => {
    const a = resolveLightingSamplerBudgetReal(HIGH_DEFINES, 7);
    const b = resolveLightingSamplerBudgetReal(HIGH_DEFINES, 7);
    expect(a.droppedFeatures).toEqual(b.droppedFeatures);
    expect(a.activeFeatures).toEqual(b.activeFeatures);
    expect(a.lightingUnits).toBe(b.lightingUnits);
  });

  it("no downgrade when it fits (Low profile)", () => {
    const r = resolveLightingSamplerBudgetReal({ A3D_CASCADE_COUNT: 1 }, 2);
    expect(r.droppedFeatures).toEqual([]);
    expect(r.activeFeatures).toContain("env-cube");
    expect(r.lightingUnits).toBe(3); // env-cube + dfg-lut + cascade-compare
  });

  it("frozen drop order reaches lobe lobes last", () => {
    const defines = { A3D_CONTACT_SHADOW: 1, A3D_IRIDESCENCE: 1, A3D_CLEARCOAT: 1, A3D_IRRADIANCE_VOLUME: 1 };
    const r = resolveLightingSamplerBudgetReal(defines, 10, { maxTextureImageUnits: 16 });
    // units: env1 dfg1 contact1 irid1 clear1 irrvol3 = 8 + 10 = 18 → drop contact(1) + irrvol(3) = 14 ≤16
    expect(r.droppedFeatures.slice(0, 2)).toEqual(["contact-shadow", "irradiance-volume"]);
    expect(r.activeFeatures).toContain("lobe:iridescence");
  });

  it("feature unit table covers every drop-order name", () => {
    for (const name of ["env-cube", "dfg-lut", "pcss-raw", "ltc", "irradiance-volume", "contact-shadow"]) {
      expect(FEATURE_UNITS[name]).toBeGreaterThan(0);
    }
  });
});
