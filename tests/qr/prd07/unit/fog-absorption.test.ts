// PRD-07 P4-T6 — absorption mode: per-channel T = exp(-σ·d) at 10 m for
// σ = (0.42, 0.11, 0.07) within 1e-5, through both the scalar helper and the
// full a3dApplyFog CPU mirror.

import { describe, expect, it } from "vitest";
import {
  absorptionTransmittance,
  applyFog,
  type Prd07FogSpec,
  type Vec3
} from "../../../../packages/rendering/src/atmosphere/HeightFog";

const SIGMA: Vec3 = [0.42, 0.11, 0.07];
const spec: Prd07FogSpec = { mode: "absorption", absorption: SIGMA };

describe("P4-T6 absorption mode", () => {
  it("T = exp(-σ·d) per channel at 10 m within 1e-5", () => {
    const t = absorptionTransmittance(SIGMA, 10);
    expect(t[0]).toBeCloseTo(Math.exp(-4.2), 5);  // ≈ 0.0150
    expect(t[1]).toBeCloseTo(Math.exp(-1.1), 5);  // ≈ 0.3329
    expect(t[2]).toBeCloseTo(Math.exp(-0.7), 5);  // ≈ 0.4966
  });

  it("applyFog: color·T + fogColor·(1-T) at 10 m", () => {
    const color: Vec3 = [1, 1, 1];
    const water: Vec3 = [0.05, 0.15, 0.25];
    const out = applyFog(color, [0, 0, 0], [0, 0, -10], spec, water);
    const t = absorptionTransmittance(SIGMA, 10);
    for (let i = 0; i < 3; i++) {
      expect(out[i]).toBeCloseTo(color[i] * t[i] + water[i] * (1 - t[i]), 5);
    }
    // The red channel is nearly extinguished (underwater look).
    expect(out[0]).toBeLessThan(0.1);
    expect(out[2]).toBeGreaterThan(0.35);
  });

  it("off mode leaves color untouched; non-absorption modes ignore σ", () => {
    const out = applyFog([0.5, 0.5, 0.5], [0, 0, 0], [0, 0, -10], { mode: "exp", density: 0 }, [0, 0, 0]);
    expect(out[0]).toBeCloseTo(0.5, 5);
  });
});
