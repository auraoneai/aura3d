// PRD-07 P4-T1 — the §8.4 legacy-parity mode (u_fogMode == 6) evaluates
// a3dEnvironmentFogFactor verbatim over the aliased packV2 slots. The CPU
// mirror `legacyParityFogAmount` must equal `legacyEnvironmentFogFactor`
// (the verbatim ShaderChunks.ts port) within 1e-6 on 1,000 sample points,
// across every legacy mode and the height→exp map.

import { describe, expect, it } from "vitest";
import {
  legacyEnvironmentFogFactor,
  legacyParityFogAmount,
  legacyUniformsFromPacked,
  packLegacy,
  packV2,
  type LegacyFogUniforms,
  type Prd07FogSpec,
  type Vec3
} from "../../../../packages/rendering/src/atmosphere/HeightFog";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("P4-T1 §8.4 legacy-parity mode", () => {
  it("mode-6 packed slots reproduce legacyEnvironmentFogFactor within 1e-6 (1,000 points)", () => {
    const specs: Prd07FogSpec[] = [
      { mode: "exp", density: 0.05 },
      { mode: "exp2", density: 0.03 },
      { mode: "linear", near: 5, far: 80 },
      { mode: "height" },                                   // C-21 defaults → exp map
      { mode: "height", heightDensity: 0.05, heightFalloff: 0.5, heightReference: -2, density: 0.001 },
      { mode: "absorption", absorption: [0.4, 0.1, 0.07] }  // → luminance-weighted exp
    ];
    const rand = lcg(0xc07f0);
    for (const spec of specs) {
      const camY = 1.6;
      const packed = packV2(spec, { fogColor: [0.5, 0.5, 0.5], cameraY: camY, parity: true });
      const oracle = legacyUniformsFromPacked(packLegacy(spec, camY));
      for (let i = 0; i < 1000; i++) {
        const world: Vec3 = [rand() * 200 - 100, rand() * 60 - 10, rand() * 200 - 100];
        const cam: Vec3 = [1.5, camY, 2.5];
        const mine = legacyParityFogAmount(cam, world, packed);
        const ref = legacyEnvironmentFogFactor(cam, world, oracle);
        expect(Math.abs(mine - ref), `spec=${JSON.stringify(spec)} world=${world}`).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it("verbatim port matches the GLSL source semantics (ShaderChunks.ts:472-514)", () => {
    const u: LegacyFogUniforms = { enabled: 1, mode: 1, density: 0, near: 10, far: 100, heightFalloff: 0, heightReference: 0, maxOpacity: 1 };
    // linear: (d-near)/(far-near)
    expect(legacyEnvironmentFogFactor([0, 0, 0], [0, 0, -55], u)).toBeCloseTo(0.5, 6);
    // exp: 1-exp(-σd)
    const expU: LegacyFogUniforms = { ...u, mode: 2, density: 0.1 };
    expect(legacyEnvironmentFogFactor([0, 0, 0], [0, 0, -10], expU)).toBeCloseTo(1 - Math.exp(-1), 6);
    // exp2: 1-exp(-(σd)²)
    const exp2U: LegacyFogUniforms = { ...u, mode: 3, density: 0.1 };
    expect(legacyEnvironmentFogFactor([0, 0, 0], [0, 0, -10], exp2U)).toBeCloseTo(1 - Math.exp(-1), 6);
    // height multiplier: exp(-max(0, y-hRef)·falloff)
    const hU: LegacyFogUniforms = { ...expU, heightFalloff: 0.5, heightReference: 0 };
    const raised = legacyEnvironmentFogFactor([0, 0, 0], [0, 4, -10], hU);
    const d = Math.hypot(4, 10);
    expect(raised).toBeCloseTo((1 - Math.exp(-expU.density * d)) * Math.exp(-2), 6);
    // disabled → 0; maxOpacity multiplies.
    expect(legacyEnvironmentFogFactor([0, 0, 0], [0, 0, -55], { ...u, enabled: 0 })).toBe(0);
    expect(legacyEnvironmentFogFactor([0, 0, 0], [0, 0, -55], { ...u, maxOpacity: 0.5 })).toBeCloseTo(0.25, 6);
  });
});
