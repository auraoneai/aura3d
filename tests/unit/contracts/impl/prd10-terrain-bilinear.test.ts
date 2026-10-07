import { describe, expect, it } from "vitest";
import {
  sampleTerrainHeightfield,
  toHeightTexture,
  type TerrainHeightfieldFixture
} from "../../../../packages/rendering/src/TerrainHeightfield";

/**
 * PRD-10 T1.1: `sampleTerrainHeightfield` is the C-26 `AuraHeightQuery` backing
 * sampler and must be bilinear — the old `Math.round` texel pick stepped ~0.5 m
 * between adjacent texels and broke the "rendered ground == physics ground"
 * invariant for raycasts, colliders, and scatter placement.
 */
function rampFixture(): TerrainHeightfieldFixture {
  // 2x2 ramp: (0,0)=0, (1,0)=1, (0,1)=2, (1,1)=3 — bilinear midpoint is the mean.
  return {
    id: "external-parity-old-branch-terrain-heightfield",
    width: 2,
    height: 2,
    seed: 7,
    minHeight: 0,
    maxHeight: 3,
    data: new Float32Array([0, 1, 2, 3]),
    samples: [],
    biomeCounts: { water: 0, beach: 0, grassland: 4, forest: 0, rock: 0, snow: 0 },
    meanHeight: 1.5,
    roughness: 0,
    riverCellCount: 0,
    hash: "ramp",
    source: "origin-master-terrain-generator-adapted",
    claimBoundary: "test fixture"
  };
}

describe("prd10 terrain bilinear sampling", () => {
  it("midpoint of a 2x2 ramp equals the texel mean", () => {
    const sample = sampleTerrainHeightfield(rampFixture(), 0.5, 0.5);
    expect(Math.abs(sample.height - 1.5)).toBeLessThanOrEqual(1e-6);
  });

  it("is exact on texels and linear on edges", () => {
    const fixture = rampFixture();
    expect(sampleTerrainHeightfield(fixture, 0, 0).height).toBeCloseTo(0, 6);
    expect(sampleTerrainHeightfield(fixture, 1, 0).height).toBeCloseTo(1, 6);
    expect(sampleTerrainHeightfield(fixture, 0, 1).height).toBeCloseTo(2, 6);
    expect(sampleTerrainHeightfield(fixture, 1, 1).height).toBeCloseTo(3, 6);
    expect(sampleTerrainHeightfield(fixture, 0.5, 0).height).toBeCloseTo(0.5, 6);
    expect(sampleTerrainHeightfield(fixture, 0, 0.5).height).toBeCloseTo(1, 6);
  });

  it("clamps out-of-range u/v to the border texels", () => {
    const fixture = rampFixture();
    expect(sampleTerrainHeightfield(fixture, -1, -1).height).toBeCloseTo(0, 6);
    expect(sampleTerrainHeightfield(fixture, 2, 2).height).toBeCloseTo(3, 6);
  });

  it("toHeightTexture exposes the R32F payload as an owned copy", () => {
    const fixture = rampFixture();
    const tex = toHeightTexture(fixture);
    expect(tex.width).toBe(2);
    expect(tex.height).toBe(2);
    expect(Array.from(tex.data)).toEqual([0, 1, 2, 3]);
    tex.data[0] = 99;
    expect(fixture.data[0]).toBe(0);
  });
});
