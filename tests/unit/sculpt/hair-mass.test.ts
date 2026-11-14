import { describe, expect, it } from "vitest";
import {
  sculptHairMassMesh,
  smaxCubic,
  sminCubic,
  type RawMesh,
  type SculptHairMassOptions
} from "@aura3d/engine/sculpt";

const HEAD: Pick<SculptHairMassOptions, "headCenter" | "headRadius"> = { headCenter: [0, 1.6, 0], headRadius: 0.1 };

const STYLE: SculptHairMassOptions = {
  ...HEAD,
  hairlineFront: 1.64,
  hairlineBack: 1.55,
  undercut: { side: -1, lift: 0.04 },
  clumps: [
    { a: [0, 1.7, 0.03], b: [0.01, 1.73, -0.1], ra: 0.042, rb: 0.02 },
    { a: [0.04, 1.68, 0], b: [0.09, 1.66, -0.12], ra: 0.034, rb: 0.016 },
    { a: [0, 1.66, -0.07], b: [0.01, 1.6, -0.17], ra: 0.036, rb: 0.016 }
  ]
};

function edgeUseCounts(mesh: RawMesh): Map<string, number> {
  const counts = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = mesh.indices[t + e]!;
      const b = mesh.indices[t + ((e + 1) % 3)]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function bounds(mesh: RawMesh): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a]!, mesh.positions[i + a]!);
      max[a] = Math.max(max[a]!, mesh.positions[i + a]!);
    }
  }
  return { min, max };
}

describe("sculptHairMassMesh", () => {
  it("produces a finite, watertight, closed one-piece mesh with unit normals", () => {
    const mesh = sculptHairMassMesh(STYLE);
    const vCount = mesh.positions.length / 3;
    expect(vCount).toBeGreaterThan(300);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.uvs.length).toBe(vCount * 2);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.normals.every(Number.isFinite)).toBe(true);
    expect(mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < vCount)).toBe(true);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!)).toBeCloseTo(1, 3);
    }
    // Closed 2-manifold: every edge is shared by exactly two triangles (no holes, no fins).
    const counts = edgeUseCounts(mesh);
    const open = [...counts.values()].filter((n) => n !== 2).length;
    expect(open).toBe(0);
  });

  it("is deterministic for identical options", () => {
    const a = sculptHairMassMesh(STYLE);
    const b = sculptHairMassMesh(STYLE);
    expect(b.positions).toEqual(a.positions);
    expect(b.normals).toEqual(a.normals);
    expect(b.indices).toEqual(a.indices);
  });

  it("stays inside explicit bounds (within the surface-nets padding) and above the hairline without clumps", () => {
    const boundsMin = [-0.18, 1.5, -0.2] as const;
    const boundsMax = [0.18, 1.8, 0.16] as const;
    const resolution = [28, 28, 30] as const;
    const mesh = sculptHairMassMesh({ ...STYLE, boundsMin, boundsMax, resolution });
    const b = bounds(mesh);
    for (let a = 0; a < 3; a += 1) {
      const cell = (boundsMax[a] - boundsMin[a]) / (resolution[a] - 4);
      expect(b.min[a]!).toBeGreaterThanOrEqual(boundsMin[a] - 2 * cell);
      expect(b.max[a]!).toBeLessThanOrEqual(boundsMax[a] + 2 * cell);
    }

    const shellOnly = sculptHairMassMesh({ ...HEAD, hairlineFront: 1.64, hairlineBack: 1.58 });
    const s = bounds(shellOnly);
    // Default scalp radii are headRadius * (1.05, 1.15, 1.15); grooves and fairing add a little slack.
    const slack = 0.012;
    expect(s.min[1]!).toBeGreaterThanOrEqual(1.58 - slack);
    expect(s.max[1]!).toBeLessThanOrEqual(1.6 + 0.115 + slack);
    expect(s.max[0]!).toBeLessThanOrEqual(0.105 + slack);
    expect(s.min[0]!).toBeGreaterThanOrEqual(-0.105 - slack);
  });

  it("clumps extend the mass and the undercut raises the hairline on its side", () => {
    const base = bounds(sculptHairMassMesh({ ...HEAD, hairlineFront: 1.62, hairlineBack: 1.56 }));
    const withTail = bounds(
      sculptHairMassMesh({
        ...HEAD,
        hairlineFront: 1.62,
        hairlineBack: 1.56,
        clumps: [{ a: [0, 1.62, -0.08], b: [0, 1.5, -0.2], ra: 0.03, rb: 0.015 }]
      })
    );
    expect(withTail.min[2]!).toBeLessThan(base.min[2]! - 0.05);
    expect(withTail.min[1]!).toBeLessThan(base.min[1]! - 0.03);

    // Undercut on -X: the lowest hair vertex on that side sits higher than on the +X side.
    const cut = sculptHairMassMesh({ ...HEAD, hairlineFront: 1.6, hairlineBack: 1.6, undercut: { side: -1, lift: 0.05 } });
    let lowNeg = Infinity;
    let lowPos = Infinity;
    for (let i = 0; i < cut.positions.length; i += 3) {
      const x = cut.positions[i]!;
      const y = cut.positions[i + 1]!;
      if (x < -0.06) lowNeg = Math.min(lowNeg, y);
      if (x > 0.06) lowPos = Math.min(lowPos, y);
    }
    expect(lowNeg - lowPos).toBeGreaterThan(0.02);
  });

  it("exposes the cubic smooth-min/max blend helpers", () => {
    expect(sminCubic(0.2, 0.5, 0)).toBe(0.2);
    expect(sminCubic(0.1, 0.1, 0.06)).toBeCloseTo(0.1 - 0.01, 12);
    expect(sminCubic(0.1, 0.3, 0.06)).toBe(0.1);
    expect(smaxCubic(0.1, 0.1, 0.06)).toBeCloseTo(0.1 + 0.01, 12);
    expect(smaxCubic(-0.2, 0.4, 0.05)).toBe(0.4);
  });
});
