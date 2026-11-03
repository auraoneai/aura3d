import { describe, expect, it, vi } from "vitest";

import { PhotometricProfileAtlas } from "../../../packages/rendering/src/lighting/PhotometricProfileAtlas";

// Synthetic Type-C angular distributions. The values and expected results
// below are derived directly from linear interpolation in degrees.
const rotational = {
  verticalAngles: [0, 30, 120, 180],
  horizontalAngles: [0],
  candela: [100, 70, 25, 0],
  symmetry: "rotational" as const,
};

const quadrant = {
  verticalAngles: [0, 60, 180],
  horizontalAngles: [0, 45, 90],
  candela: [120, 60, 0, 120, 100, 0, 120, 140, 0],
  symmetry: "quadrant" as const,
};

const bilateral = {
  verticalAngles: [0, 60, 180],
  horizontalAngles: [0, 45, 180],
  candela: [120, 60, 0, 120, 100, 0, 120, 20, 0],
  symmetry: "bilateral" as const,
};

const fullCircle = {
  verticalAngles: [0, 90, 180],
  horizontalAngles: [0, 90, 180, 270, 360],
  candela: [10, 20, 30, 10, 40, 30, 10, 100, 30, 10, 60, 30, 10, 20, 30],
  symmetry: "none" as const,
};

describe("photometric profile atlas", () => {
  it("samples a nonuniform rotational profile and applies the dimmer once", () => {
    const atlas = new PhotometricProfileAtlas([{ id: "spot", profile: rotational, scale: 2 }]);
    try {
      expect(atlas.sample("spot", 0, 0)).toBeCloseTo(200);
      // Halfway between 30°/70 cd and 120°/25 cd is 47.5 cd.
      expect(atlas.sample("spot", 75, 17)).toBeCloseTo(95);
      expect(atlas.sample("spot", 75, -120)).toBeCloseTo(95);
      expect(atlas.sample("spot", 180, 359)).toBe(0);
    } finally {
      atlas.dispose();
    }
  });

  it("preserves the dark area above and below a limited vertical range", () => {
    const atlas = new PhotometricProfileAtlas([{
      id: "limited",
      profile: {
        verticalAngles: [20, 70, 160],
        horizontalAngles: [0],
        candela: [60, 40, 0],
        symmetry: "rotational",
      },
    }]);
    try {
      expect(atlas.sample("limited", 0, 0)).toBe(0);
      expect(atlas.sample("limited", 19, 0)).toBe(0);
      expect(atlas.sample("limited", 20, 0)).toBeCloseTo(60);
      expect(atlas.sample("limited", 45, 0)).toBeCloseTo(50);
      expect(atlas.sample("limited", 160, 0)).toBe(0);
      expect(atlas.sample("limited", 161, 0)).toBe(0);
      expect(atlas.sample("limited", 180, 0)).toBe(0);
    } finally {
      atlas.dispose();
    }
  });

  it("rejects invalid query angles instead of treating them as an unmeasured direction", () => {
    const atlas = new PhotometricProfileAtlas([{ id: "spot", profile: rotational }]);
    try {
      for (const vertical of [-1, 181, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => atlas.sample("spot", vertical, 0)).toThrow();
      }
      for (const azimuth of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => atlas.sample("spot", 90, azimuth)).toThrow();
      }
    } finally {
      atlas.dispose();
    }
  });

  it("interpolates nonuniform quadrant and bilateral tables with their folds", () => {
    const atlas = new PhotometricProfileAtlas([
      { id: "quarter", profile: quadrant },
      { id: "half", profile: bilateral },
    ]);
    try {
      // At 30° vertical the first two quadrant rows are 90 and 110 cd.
      for (const azimuth of [22.5, -22.5, 157.5, 202.5, 337.5]) {
        expect(atlas.sample("quarter", 30, azimuth)).toBeCloseTo(100);
      }
      // 112.5° is halfway between bilateral rows 45°/100 cd and 180°/20 cd.
      expect(atlas.sample("half", 60, 112.5)).toBeCloseTo(60);
      expect(atlas.sample("half", 60, 247.5)).toBeCloseTo(60);
      expect(atlas.sample("half", 60, -112.5)).toBeCloseTo(60);
    } finally {
      atlas.dispose();
    }
  });

  it("wraps the full azimuth seam and subtracts positive or negative rotation", () => {
    const atlas = new PhotometricProfileAtlas([
      { id: "base", profile: fullCircle },
      { id: "plus", profile: fullCircle, scale: 2, rotation: Math.PI / 2 },
      { id: "minus", profile: fullCircle, rotation: -Math.PI / 2 },
    ]);
    try {
      expect(atlas.sample("base", 90, 315)).toBeCloseTo(40);
      expect(atlas.sample("base", 90, -45)).toBeCloseTo(40);
      expect(atlas.sample("base", 90, 360)).toBeCloseTo(20);
      expect(atlas.sample("base", 90, 720)).toBeCloseTo(20);
      expect(atlas.sample("plus", 90, 90)).toBeCloseTo(40);
      expect(atlas.sample("plus", 90, 0)).toBeCloseTo(120);
      expect(atlas.sample("minus", 90, 0)).toBeCloseTo(40);
    } finally {
      atlas.dispose();
    }
  });

  it("packs independent profile tables into a bounded nearest-sampled data texture", () => {
    const atlas = new PhotometricProfileAtlas([
      { id: "first", profile: { verticalAngles: [0, 180], horizontalAngles: [0], candela: [3, 1], symmetry: "rotational" } },
      { id: "second", profile: { verticalAngles: [10, 170], horizontalAngles: [0], candela: [7, 2], symmetry: "rotational" } },
    ], { maxTextureDimension: 4 });
    try {
      const texture = atlas.texture;
      expect(texture.format).toBe("r32f");
      expect(texture.colorSpace).toBe("linear");
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.width).toBeLessThanOrEqual(4);
      expect(texture.height).toBeLessThanOrEqual(4);
      expect(atlas.sampler.minFilter).toBe("nearest");
      expect(atlas.sampler.magFilter).toBe("nearest");
      expect(texture.data).toBeInstanceOf(Float32Array);
      const data = texture.data as Float32Array;
      const [first, second] = atlas.entries;
      expect(first).toMatchObject({ id: "first", verticalCount: 2, horizontalCount: 1 });
      expect(second).toMatchObject({ id: "second", verticalCount: 2, horizontalCount: 1 });
      expect(Array.from(data.slice(first!.verticalOffset, first!.verticalOffset + 2))).toEqual([0, 180]);
      expect(Array.from(data.slice(first!.horizontalOffset, first!.horizontalOffset + 1))).toEqual([0]);
      expect(Array.from(data.slice(first!.candelaOffset, first!.candelaOffset + 2))).toEqual([3, 1]);
      expect(Array.from(data.slice(second!.verticalOffset, second!.verticalOffset + 2))).toEqual([10, 170]);
      expect(Array.from(data.slice(second!.horizontalOffset, second!.horizontalOffset + 1))).toEqual([0]);
      expect(Array.from(data.slice(second!.candelaOffset, second!.candelaOffset + 2))).toEqual([7, 2]);
      expect(new Set([
        first!.verticalOffset, first!.verticalOffset + 1, first!.horizontalOffset,
        first!.candelaOffset, first!.candelaOffset + 1,
        second!.verticalOffset, second!.verticalOffset + 1, second!.horizontalOffset,
        second!.candelaOffset, second!.candelaOffset + 1,
      ]).size).toBe(10);
    } finally {
      atlas.dispose();
    }
  });

  it("snapshots caller-owned profile tables and keeps profiles distinct", () => {
    const angles = [0, 90, 180], values = [80, 40, 0], headings = [0];
    const source = { verticalAngles: angles, horizontalAngles: headings, candela: values, symmetry: "rotational" as const };
    const atlas = new PhotometricProfileAtlas([{ id: "first", profile: source }, { id: "second", profile: quadrant }]);
    try {
      angles[1] = 30;
      headings[0] = 90;
      values[1] = 1000;
      expect(atlas.sample("first", 90, 0)).toBeCloseTo(40);
      expect(atlas.sample("first", 45, 0)).toBeCloseTo(60);
      expect(atlas.sample("second", 30, 22.5)).toBeCloseTo(100);
    } finally {
      atlas.dispose();
    }
  });

  it("detects mutation or disposal of borrowed upload resources without changing the snapshot", () => {
    const atlas = new PhotometricProfileAtlas([{ id: "first", profile: rotational }]);
    try {
      expect(atlas.isCurrent()).toBe(true);
      const texture = atlas.texture;
      const data = texture.data as Float32Array;
      data[atlas.entries[0]!.candelaOffset] = 999;
      expect(atlas.isCurrent()).toBe(false);
      // CPU evaluation reads the immutable snapshot, never mutable GPU bytes.
      expect(atlas.sample("first", 0, 0)).toBeCloseTo(100);
    } finally {
      atlas.dispose();
    }

    const samplerAtlas = new PhotometricProfileAtlas([{ id: "sampler", profile: rotational }]);
    try {
      expect(samplerAtlas.isCurrent()).toBe(true);
      (samplerAtlas.sampler as { minFilter: string }).minFilter = "linear";
      expect(samplerAtlas.isCurrent()).toBe(false);
    } finally {
      samplerAtlas.dispose();
    }

    const disposedTextureAtlas = new PhotometricProfileAtlas([{ id: "disposed", profile: rotational }]);
    disposedTextureAtlas.texture.dispose();
    expect(disposedTextureAtlas.isCurrent()).toBe(false);
    disposedTextureAtlas.dispose();
    expect(disposedTextureAtlas.disposed).toBe(true);
  });

  it("detects changed sampler comparison or anisotropy state", () => {
    const comparison = new PhotometricProfileAtlas([{ id: "compare", profile: rotational }]);
    try {
      expect(comparison.isCurrent()).toBe(true);
      (comparison.sampler as { compare?: string }).compare = "less-equal";
      expect(comparison.isCurrent()).toBe(false);
    } finally {
      comparison.dispose();
    }

    const anisotropic = new PhotometricProfileAtlas([{ id: "anisotropy", profile: rotational }]);
    try {
      expect(anisotropic.isCurrent()).toBe(true);
      (anisotropic.sampler as { maxAnisotropy: number }).maxAnisotropy = 2;
      expect(anisotropic.isCurrent()).toBe(false);
    } finally {
      anisotropic.dispose();
    }
  });

  it("invalidates a borrowed texture after mip replacement or a recorded content change", () => {
    const replacement = new PhotometricProfileAtlas([{ id: "replace", profile: rotational }]);
    try {
      const texture = replacement.texture;
      const changed = new Float32Array(texture.data as Float32Array);
      changed[replacement.entries[0]!.candelaOffset] = 999;
      texture.updateMip(0, changed);
      // The original public data is unchanged; devices upload the override.
      expect((texture.data as Float32Array)[replacement.entries[0]!.candelaOffset]).toBe(100);
      expect(replacement.isCurrent()).toBe(false);
      expect(replacement.sample("replace", 0, 0)).toBeCloseTo(100);
    } finally {
      replacement.dispose();
    }

    const restored = new PhotometricProfileAtlas([{ id: "restored", profile: rotational }]);
    try {
      const texture = restored.texture;
      const data = texture.data as Float32Array;
      const index = restored.entries[0]!.candelaOffset;
      const original = data[index]!;
      data[index] = 999;
      texture.recordContentChange();
      data[index] = original;
      // A device may already hold the edited bytes, despite restored CPU data.
      expect(restored.isCurrent()).toBe(false);
    } finally {
      restored.dispose();
    }
  });

  it("treats zero scale as darkness and rejects scaled values outside float32 range", () => {
    const atlas = new PhotometricProfileAtlas([{ id: "off", profile: rotational, scale: 0 }]);
    try {
      expect(atlas.entries[0]!.scale).toBe(0);
      expect(atlas.sample("off", 0, 0)).toBe(0);
      expect(atlas.sample("off", 75, 77)).toBe(0);
      // Scale is metadata; the uploaded table preserves authored candelas.
      expect((atlas.texture.data as Float32Array)[atlas.entries[0]!.candelaOffset]).toBe(100);
    } finally {
      atlas.dispose();
    }
    // 1e37 is finite and representable, but 100 cd × 1e37 overflows float32.
    expect(() => new PhotometricProfileAtlas([{ id: "overflow", profile: rotational, scale: 1e37 }])).toThrow();
  });

  it("rejects malformed tables, invalid IDs, collapsed float angles and unsafe values", () => {
    const candidate = (profile: typeof rotational) => () => new PhotometricProfileAtlas([{ id: "x", profile }]);
    expect(candidate({ ...rotational, verticalAngles: [] })).toThrow();
    expect(candidate({ ...rotational, verticalAngles: [0, 30, 30, 180] })).toThrow();
    expect(candidate({ ...rotational, verticalAngles: [0, 90, 90 + 1e-8, 180] })).toThrow();
    expect(candidate({ ...rotational, verticalAngles: [0, 30, 120, Number.NaN] })).toThrow();
    expect(candidate({ ...rotational, horizontalAngles: [1] })).toThrow();
    expect(candidate({ ...rotational, candela: [1, 2] })).toThrow();
    expect(candidate({ ...rotational, candela: [100, -1, 25, 0] })).toThrow();
    expect(candidate({ ...rotational, candela: [100, Number.POSITIVE_INFINITY, 25, 0] })).toThrow();
    expect(candidate({ ...rotational, candela: [100, 3.5e38, 25, 0] })).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "", profile: rotational }])).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "same", profile: rotational }, { id: "same", profile: quadrant }])).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational, scale: -1 }])).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational, scale: Number.POSITIVE_INFINITY }])).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational, rotation: Number.NaN }])).toThrow();
  });

  it("enforces profile, memory and texture-dimension budgets", () => {
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational }], { maxTextureDimension: 0 })).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational }], { maxBytes: 3 })).toThrow();
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational }, { id: "y", profile: quadrant }], { maxProfiles: 1 })).toThrow();
    // The table has nine scalar values and cannot fit in a 2×2 texture.
    expect(() => new PhotometricProfileAtlas([{ id: "x", profile: rotational }], { maxTextureDimension: 2 })).toThrow();
  });

  it("disposes its owned texture exactly once and rejects later use", () => {
    const atlas = new PhotometricProfileAtlas([{ id: "x", profile: rotational }]);
    const texture = atlas.texture;
    const dispose = vi.spyOn(texture, "dispose");
    expect(atlas.disposed).toBe(false);
    expect(() => atlas.sample("unknown", 90, 0)).toThrow();
    atlas.dispose();
    atlas.dispose();
    expect(atlas.disposed).toBe(true);
    expect(texture.disposed).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(atlas.isCurrent()).toBe(false);
    expect(() => atlas.sample("x", 90, 0)).toThrow();
    expect(() => atlas.texture).toThrow();
    expect(() => atlas.sampler).toThrow();
    expect(() => atlas.entries).toThrow();
  });
});
