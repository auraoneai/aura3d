// PRD-07 P4-T5 — ray∩volume segment length for `effects.fogVolume` boxes and
// ellipsoids, vs a dense numeric march along the ray; plus the §8.4 packing
// layout (centre.xyz+shape, halfSize.xyz+density).

import { describe, expect, it } from "vitest";
import {
  A3D_MAX_FOG_VOLUMES,
  fogVolumesTau,
  packFogVolumes,
  rayBoxSegment,
  rayEllipsoidSegment,
  rayVolumeSegmentLength,
  type Prd07FogVolume
} from "../../../../packages/rendering/src/atmosphere/FogVolumes";
import type { Vec3 } from "../../../../packages/rendering/src/atmosphere/HeightFog";

/** Numeric march: length of [0,maxT] inside the volume. */
function numericSegment(origin: Vec3, dir: Vec3, maxT: number, volume: Prd07FogVolume): number {
  const inside = (p: Vec3): boolean => {
    const dx = (p[0] - volume.center[0]) / volume.halfSize[0];
    const dy = (p[1] - volume.center[1]) / volume.halfSize[1];
    const dz = (p[2] - volume.center[2]) / volume.halfSize[2];
    if (volume.shape === "ellipsoid") return dx * dx + dy * dy + dz * dz <= 1;
    return Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Math.abs(dz) <= 1;
  };
  const steps = 4000;
  let count = 0;
  for (let i = 0; i < steps; i++) {
    const t = ((i + 0.5) / steps) * maxT;
    if (inside([origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t])) count++;
  }
  return (count / steps) * maxT;
}

describe("P4-T5 fog volume segments", () => {
  const box: Prd07FogVolume = { shape: "box", center: [0, 1, -10], halfSize: [4, 2, 4], density: 0.5 };
  const ellipsoid: Prd07FogVolume = { shape: "ellipsoid", center: [0, 1, -10], halfSize: [6, 2, 3], density: 0.5 };

  it("ray through box centre → segment = 2·halfSize on that axis", () => {
    const seg = rayBoxSegment([0, 1, 0], [0, 0, -1], box.center, box.halfSize);
    expect(seg).not.toBeNull();
    expect(seg![1] - seg![0]).toBeCloseTo(8, 5);
    expect(rayVolumeSegmentLength([0, 1, 0], [0, 0, -1], 100, box)).toBeCloseTo(8, 5);
  });

  it("off-axis + clipped rays match the numeric march within 1%", () => {
    const cases: [Vec3, Vec3, number, Prd07FogVolume][] = [
      [[3, 1, 0], [0, 0, -1], 100, box],
      [[0, 4.5, 0], [0, -0.2, -0.98], 60, box],   // enters through the top
      [[-20, 1, -10], [1, 0, 0], 25, box],        // clipped by maxT mid-volume
      [[0, 1, 0], [0, 0, -1], 5, box],            // ray ends before the volume
      [[0, 1, 0], [0, 0, -1], 100, ellipsoid],
      [[2, 1.5, 0], [0.1, 0.02, -0.995], 80, ellipsoid],
      [[0, 8, 0], [0, -1, 0], 30, ellipsoid]      // down through the flat axis
    ];
    for (const [origin, dir, maxT, volume] of cases) {
      const a = rayVolumeSegmentLength(origin, dir, maxT, volume);
      const n = numericSegment(origin, dir, maxT, volume);
      expect(
        Math.abs(a - n),
        JSON.stringify({ origin, dir, maxT, shape: volume.shape })
      ).toBeLessThan(maxT * 0.01);
    }
  });

  it("misses report 0", () => {
    expect(rayVolumeSegmentLength([0, 30, 0], [0, 0, -1], 100, box)).toBe(0);
    expect(rayVolumeSegmentLength([0, 30, 0], [0, 0, -1], 100, ellipsoid)).toBe(0);
    expect(rayVolumeSegmentLength([0, 1, 0], [0, 0, 1], 100, box)).toBe(0); // behind
    expect(rayEllipsoidSegment([0, 30, 0], [0, 0, -1], ellipsoid.center, ellipsoid.halfSize)).toBeNull();
  });

  it("fogVolumesTau sums density×length and clips segments to the ray", () => {
    const volumes: Prd07FogVolume[] = [box, { shape: "box", center: [0, 1, -30], halfSize: [2, 2, 2], density: 1 }];
    // Ray down -z through both boxes: 8·0.5 + 4·1 = 8.
    expect(fogVolumesTau([0, 1, 0], [0, 0, -1], 100, volumes)).toBeCloseTo(8, 4);
    // Ray clipped at 25 m: first box fully, second never reached.
    expect(fogVolumesTau([0, 1, 0], [0, 0, -1], 25, volumes)).toBeCloseTo(4, 4);
  });

  it("packFogVolumes emits the §8.4 layout (centre.xyz+shape, halfSize.xyz+density)", () => {
    const packed = packFogVolumes([box, ellipsoid]);
    expect(packed.length).toBe(2 * A3D_MAX_FOG_VOLUMES * 4);
    // box → shape slot 0
    expect([...packed.slice(0, 4)]).toEqual([0, 1, -10, 0]);
    expect([...packed.slice(4, 8)]).toEqual([4, 2, 4, 0.5]);
    // ellipsoid → shape slot 1
    expect(packed[11]).toBe(1);
    expect(packed[15]).toBe(0.5);
    // Unused slots zero-filled.
    expect(packed[16]).toBe(0);
  });
});
