// PRD-07 P4-T1 — `heightFogTau` must equal the numeric integral of
// σ(h) = σ_d + σ_h·exp(-b·(h - h0)) along the ray within 1%.
// Covers the k→0 limit (v.y ≈ 0), b = 0 (uniform σ_h), start < d, and
// downward rays into denser fog (the case the legacy height-multiplier
// approximates badly).

import { describe, expect, it } from "vitest";
import {
  heightFogTau,
  fogAmount,
  resolvePrd07FogSpec,
  type Prd07FogSpec
} from "../../../../packages/rendering/src/atmosphere/HeightFog";

/** 1000-step midpoint quadrature of the §6.6 density law. */
function numericTau(camY: number, dirY: number, distance: number, spec: Prd07FogSpec): number {
  const s = resolvePrd07FogSpec(spec);
  const dd = Math.max(distance - s.start, 0);
  if (dd <= 0) return 0;
  const steps = 1000;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = ((i + 0.5) / steps) * dd;
    const h = camY + dirY * t;
    sum += s.density + s.heightDensity * Math.exp(-s.heightFalloff * (h - s.heightReference));
  }
  return (sum * dd) / steps;
}

// Deterministic LCG — the 50 random rays must be reproducible.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("P4-T1 heightFogTau vs numeric integral", () => {
  const spec: Prd07FogSpec = { mode: "height" }; // C-21 defaults

  it("matches the 1000-step march within 1% for 50 random rays", () => {
    const rand = lcg(0xfeed07);
    for (let i = 0; i < 50; i++) {
      const camY = rand() * 40 - 10;                 // [-10, 30]
      const dirY = rand() * 2 - 1;                   // [-1, 1]
      const distance = 1 + rand() * 199;             // [1, 200]
      const analytic = heightFogTau(camY, dirY, distance, spec);
      const numeric = numericTau(camY, dirY, distance, spec);
      const denom = Math.max(Math.abs(numeric), 1e-9);
      expect(
        Math.abs(analytic - numeric) / denom,
        `ray ${i}: camY=${camY.toFixed(2)} dirY=${dirY.toFixed(2)} d=${distance.toFixed(1)} analytic=${analytic} numeric=${numeric}`
      ).toBeLessThan(0.01);
    }
  });

  it("k→0 limit: horizontal rays (v.y ≈ 0) stay finite and correct", () => {
    for (const dirY of [0, 1e-9, -1e-9]) {
      const analytic = heightFogTau(1.6, dirY, 100, spec);
      const numeric = numericTau(1.6, dirY, 100, spec);
      expect(Math.abs(analytic - numeric) / Math.max(numeric, 1e-9)).toBeLessThan(0.01);
    }
  });

  it("b = 0 degenerates to uniform σ_d + σ_h", () => {
    const flat: Prd07FogSpec = { mode: "height", heightFalloff: 0, density: 0.01, heightDensity: 0.02, start: 0 };
    // σ = 0.01 + 0.02 → τ(100) = 3 exactly.
    expect(heightFogTau(0, 0.5, 100, flat)).toBeCloseTo(3, 6);
  });

  it("start distance clips the integral (d' = max(d-start, 0))", () => {
    const s: Prd07FogSpec = { mode: "height", start: 50 };
    expect(heightFogTau(0, 0, 40, s)).toBe(0);
    const a = heightFogTau(0, 0.3, 100, s);
    const n = numericTau(0, 0.3, 100, s);
    expect(Math.abs(a - n) / Math.max(n, 1e-9)).toBeLessThan(0.01);
  });
});
