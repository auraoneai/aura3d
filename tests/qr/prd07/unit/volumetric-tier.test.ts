// PRD-07 P5-T6/T7 — §6.7 tier mapping + the QR volumetric resolver.
// froxelGridFor follows C-27 (`volumetricFog` tier field): analytic tiers get
// no grid, high → 160×90×64, ultra → 240×135×128 (240×135×96 + note when the
// memory check fails). resolveQrVolumetricFog honours `color`.

import { describe, expect, it } from "vitest";
import { froxelGridFor, invertRigid } from "../../../../packages/rendering/src/atmosphere/VolumetricFogPass";
import {
  qrVolumetricColor,
  qrVolumetricModeForTier,
  resolveQrVolumetricFog
} from "../../../../packages/rendering/src/VolumetricFog";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { AuraQualityTier } from "../../../../packages/rendering/src/contracts/quality";

const tiers: readonly AuraQualityTier[] = ["low", "medium", "high", "ultra"];

describe("P5-T6/T7 volumetric tier mapping", () => {
  it("C-27 mode per tier: analytic on low/medium, froxel on high/ultra", () => {
    expect(froxelGridFor("analytic", true)).toBeNull();
    expect(qrVolumetricModeForTier(QUALITY_TIERS.low)).toBe("analytic");
    expect(qrVolumetricModeForTier(QUALITY_TIERS.medium)).toBe("analytic");
    expect(qrVolumetricModeForTier(QUALITY_TIERS.high)).toBe("froxel-medium");
    expect(qrVolumetricModeForTier(QUALITY_TIERS.ultra)).toBe("froxel-high");
    for (const t of tiers) {
      expect(qrVolumetricModeForTier(QUALITY_TIERS[t])).toBe(QUALITY_TIERS[t].volumetricFog);
    }
  });

  it("grid dims follow §6.7: high 160×90×64, ultra 240×135×128", () => {
    const high = froxelGridFor(QUALITY_TIERS.high.volumetricFog, true)!;
    expect([high.tileWidth, high.tileHeight, high.slices]).toEqual([160, 90, 64]);
    expect(high.atlasWidth).toBe(1280); expect(high.atlasHeight).toBe(720);
    const ultra = froxelGridFor(QUALITY_TIERS.ultra.volumetricFog, true)!;
    expect([ultra.tileWidth, ultra.tileHeight, ultra.slices]).toEqual([240, 135, 128]);
    expect(ultra.temporal).toBe(true);
    expect(high.temporal).toBe(false);
  });

  it("R10 memory-check failure: ultra drops to 240×135×96 + VOLUMETRIC_GRID_REDUCED", () => {
    const reduced = froxelGridFor("froxel-high", false)!;
    expect(reduced.slices).toBe(96);
    expect(reduced.note).toBe("VOLUMETRIC_GRID_REDUCED");
  });

  it("packed uniforms honour fog color and density", () => {
    const params = { mode: "froxel" as const, density: 0.05, color: "#ff0000", intensity: 2, anisotropy: 0.6 };
    const r = resolveQrVolumetricFog(params, { volumetricFog: "froxel-high" } as never);
    expect(r.mode).toBe("froxel-high");
    expect(r.needsSceneDepth).toBe(true);
    const [sr, sg, sb] = r.packed.sunColor;
    expect(sr).toBeGreaterThan(0.99); expect(sg).toBeLessThan(0.02); expect(sb).toBeLessThan(0.02);
    // density × heightFalloff coefficients land in fogDensity[0..1].
    expect(r.packed.fogDensity[0]).toBeCloseTo(0.05, 6);
    const analytic = resolveQrVolumetricFog(params, { volumetricFog: "analytic" } as never);
    expect(analytic.mode).toBe("analytic");
    expect(analytic.needsSceneDepth).toBe(false);
    expect(analytic.needsSceneDepth).toBe(false);
  });

  it("color parsing accepts hex + arrays and falls back to sky blue", () => {
    expect(qrVolumetricColor("#0000ff")[2]).toBeCloseTo(1, 5);
    expect(qrVolumetricColor([0.5, 0.25, 1])[0]).toBeCloseTo(0.5, 5);
    const fallback = qrVolumetricColor(undefined);
    expect(fallback[0]).toBeGreaterThan(0.5); expect(fallback[2]).toBeGreaterThan(0.75);
  });

  it("invertRigid round-trips a rigid transform", () => {
    // R = 90° about Y, t = (2, 3, 4).
    const m = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 2, 3, 4, 1];
    const inv = invertRigid(m);
    // Apply inv then m to a point and expect identity back.
    const p = [0.3, -1.2, 5.5];
    const q = [
      inv[0] * p[0] + inv[4] * p[1] + inv[8] * p[2] + inv[12],
      inv[1] * p[0] + inv[5] * p[1] + inv[9] * p[2] + inv[13],
      inv[2] * p[0] + inv[6] * p[1] + inv[10] * p[2] + inv[14]
    ];
    const r = [
      m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12],
      m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13],
      m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]
    ];
    for (let i = 0; i < 3; i += 1) expect(r[i]).toBeCloseTo(p[i], 5);
  });
});
