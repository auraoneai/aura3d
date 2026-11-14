/**
 * ProceduralMaterialTextures (PRD-04 §7.3, P1-5): four deterministic kinds —
 * SHA-256 byte identity for identical (kind, params, seed), seam-free wrap
 * (edge columns/rows ≤1/255), linear color space, correct target slot.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateProceduralMaterialTexture,
  proceduralBrushedMetalNormalMap,
  proceduralBrushedMetalRoughnessMap,
  PROCEDURAL_BRUSHED_ROUGHNESS_CENTER,
  proceduralScalarFieldToNormalMap,
  PROCEDURAL_BRUSHED_NORMAL_MAX_SLOPE,
  PROCEDURAL_SCALAR_NORMAL_MAX_SLOPE,
  type ProceduralMaterialKind
} from "../../../../packages/rendering/src/ProceduralMaterialTextures";

const KINDS: ProceduralMaterialKind[] = [
  "fabric-normal",
  "rubber-roughness",
  "brushed-metal-anisotropy",
  "plastic-micro-scratch"
];

const SLOT: Record<ProceduralMaterialKind, string> = {
  "fabric-normal": "normal",
  "rubber-roughness": "roughness",
  "brushed-metal-anisotropy": "anisotropy",
  "plastic-micro-scratch": "roughness"
};

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("generateProceduralMaterialTexture", () => {
  for (const kind of KINDS) {
    it(`${kind}: deterministic bytes for identical (kind, params, seed)`, () => {
      const params = { scale: 8, strength: 0.8, seed: 1337, size: 256 as const };
      const a = generateProceduralMaterialTexture(kind, params);
      const b = generateProceduralMaterialTexture(kind, params);
      expect(sha256(a.data)).toBe(sha256(b.data));
      expect(a.width).toBe(256);
      expect(a.colorSpace).toBe("linear");
      expect(a.slot).toBe(SLOT[kind]);
      expect(a.data.length).toBe(256 * 256 * 4);
    });
  }

  it("cache key includes contrast: specs differing only in contrast get distinct textures (S2)", () => {
    const base = { scale: 8, strength: 1, seed: 3, size: 256 as const };
    const low = generateProceduralMaterialTexture("rubber-roughness", { ...base, contrast: 0.4 });
    const high = generateProceduralMaterialTexture("rubber-roughness", { ...base, contrast: 1.6 });
    expect(sha256(low.data)).not.toBe(sha256(high.data));
    // Cached re-requests still return the matching texture for each contrast.
    expect(sha256(generateProceduralMaterialTexture("rubber-roughness", { ...base, contrast: 0.4 }).data)).toBe(sha256(low.data));
    expect(sha256(generateProceduralMaterialTexture("rubber-roughness", { ...base, contrast: 1.6 }).data)).toBe(sha256(high.data));
  });

  it("seeds change output", () => {
    const a = generateProceduralMaterialTexture("rubber-roughness", { scale: 8, strength: 1, seed: 1, size: 256 });
    const b = generateProceduralMaterialTexture("rubber-roughness", { scale: 8, strength: 1, seed: 2, size: 256 });
    expect(sha256(a.data)).not.toBe(sha256(b.data));
  });

  for (const kind of KINDS) {
    it(`${kind}: wrap continuity — column 0 vs N−1 and row 0 vs N−1 within 1/255`, () => {
      const { data, width, height } = generateProceduralMaterialTexture(kind, {
        scale: 6,
        strength: 1,
        seed: 7,
        size: 256
      });
      const maxChannelDiff = (i: number, j: number) =>
        Math.max(
          Math.abs(data[i] - data[j]),
          Math.abs(data[i + 1] - data[j + 1]),
          Math.abs(data[i + 2] - data[j + 2])
        );
      for (let y = 0; y < height; y++) {
        const first = (y * width) * 4;
        const last = (y * width + width - 1) * 4;
        expect(maxChannelDiff(first, last)).toBeLessThanOrEqual(1);
      }
      for (let x = 0; x < width; x++) {
        const first = x * 4;
        const last = ((height - 1) * width + x) * 4;
        expect(maxChannelDiff(first, last)).toBeLessThanOrEqual(1);
      }
    });
  }
});

/** Decodes texel `i` the way both shaders do: xyz * 2 - 1, z floored at 0.001. Returns tilt in degrees. */
function decodedTiltDeg(data: Uint8Array, i: number): { tilt: number; rawZ: number } {
  const x = data[i * 4] / 255 * 2 - 1;
  const y = data[i * 4 + 1] / 255 * 2 - 1;
  const rawZ = data[i * 4 + 2] / 255 * 2 - 1;
  const z = Math.max(rawZ, 0.001);
  return { tilt: Math.acos(z / Math.hypot(x, y, z)) * 180 / Math.PI, rawZ };
}

describe("proceduralScalarFieldToNormalMap (blackRubber normal-slot shimmer)", () => {
  // material.blackRubber / sneakerRubber bind `rubber-roughness` (a greyscale scalar field) to `normal`.
  const RUBBER_NORMAL_PARAMS = [
    { scale: 28, strength: 0.34, contrast: 0.76 },
    { scale: 24, strength: 0.42, contrast: 0.7 }
  ];

  it("the raw rubber field decoded as a normal is degenerate (documents the root cause)", () => {
    const raw = generateProceduralMaterialTexture("rubber-roughness", RUBBER_NORMAL_PARAMS[0]);
    const n = raw.width * raw.height;
    let nonPositiveZ = 0;
    let tiltSum = 0;
    for (let i = 0; i < n; i++) {
      const { tilt, rawZ } = decodedTiltDeg(raw.data, i);
      if (rawZ <= 0) nonPositiveZ++;
      tiltSum += tilt;
    }
    expect(nonPositiveZ / n).toBeGreaterThan(0.3);
    expect(tiltSum / n).toBeGreaterThan(50);
  });

  for (const params of RUBBER_NORMAL_PARAMS) {
    it(`rubber ${JSON.stringify(params)}: upward, bounded, gentle tangent-space normals`, () => {
      const raw = generateProceduralMaterialTexture("rubber-roughness", params);
      const normal = proceduralScalarFieldToNormalMap(raw);
      expect(normal.slot).toBe("normal");
      expect(normal.colorSpace).toBe("linear");
      expect(normal.width).toBe(raw.width);
      expect(normal.data.length).toBe(raw.data.length);
      const n = normal.width * normal.height;
      const maxTilt = Math.atan(PROCEDURAL_SCALAR_NORMAL_MAX_SLOPE) * 180 / Math.PI + 1;
      let tiltSum = 0;
      let maxSeen = 0;
      for (let i = 0; i < n; i++) {
        const { tilt, rawZ } = decodedTiltDeg(normal.data, i);
        expect(rawZ).toBeGreaterThan(0.85);
        tiltSum += tilt;
        maxSeen = Math.max(maxSeen, tilt);
      }
      expect(maxSeen).toBeLessThanOrEqual(maxTilt);
      // Still visibly grained up close: a few degrees of mean micro-relief, not flat.
      expect(tiltSum / n).toBeGreaterThan(2);
      expect(tiltSum / n).toBeLessThan(12);
    });
  }

  it("a constant field yields the flat normal (128,128,255) everywhere", () => {
    const size = 8;
    const data = new Uint8Array(size * size * 4).fill(173);
    const normal = proceduralScalarFieldToNormalMap({ data, width: size, height: size, colorSpace: "linear", slot: "roughness" });
    for (let i = 0; i < size * size; i++) {
      expect([normal.data[i * 4], normal.data[i * 4 + 1], normal.data[i * 4 + 2], normal.data[i * 4 + 3]]).toEqual([128, 128, 255, 255]);
    }
  });

  it("is deterministic and seam-free (edge columns/rows within 1/255)", () => {
    const raw = generateProceduralMaterialTexture("plastic-micro-scratch", { scale: 24, strength: 0.24, contrast: 0.5, size: 256 });
    const a = proceduralScalarFieldToNormalMap(raw);
    const b = proceduralScalarFieldToNormalMap(raw);
    expect(sha256(a.data)).toBe(sha256(b.data));
    const { data, width, height } = a;
    for (let y = 0; y < height; y++) {
      const first = (y * width) * 4;
      const last = (y * width + width - 1) * 4;
      for (let c = 0; c < 3; c++) expect(Math.abs(data[first + c] - data[last + c])).toBeLessThanOrEqual(1);
    }
    for (let x = 0; x < width; x++) {
      const first = x * 4;
      const last = ((height - 1) * width + x) * 4;
      for (let c = 0; c < 3; c++) expect(Math.abs(data[first + c] - data[last + c])).toBeLessThanOrEqual(1);
    }
  });
});

/** Max/mean per-channel step between neighbours, split into wrap pairs (N−1 → 0) and interior pairs. */
function wrapSteps(data: Uint8Array, width: number, height: number): { wrapMax: number; interiorMax: number; wrapMean: number; interiorMean: number } {
  let wrapMax = 0, interiorMax = 0, wrapSum = 0, interiorSum = 0, wrapN = 0, interiorN = 0;
  const step = (i: number, j: number) => Math.max(Math.abs(data[i] - data[j]), Math.abs(data[i + 1] - data[j + 1]), Math.abs(data[i + 2] - data[j + 2]));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const right = (y * width + (x + 1) % width) * 4;
      const down = (((y + 1) % height) * width + x) * 4;
      for (const [j, wrap] of [[right, x === width - 1], [down, y === height - 1]] as Array<[number, boolean]>) {
        const s = step(i, j);
        if (wrap) { wrapMax = Math.max(wrapMax, s); wrapSum += s; wrapN++; } else { interiorMax = Math.max(interiorMax, s); interiorSum += s; interiorN++; }
      }
    }
  }
  return { wrapMax, interiorMax, wrapMean: wrapSum / wrapN, interiorMean: interiorSum / interiorN };
}

describe("proceduralBrushedMetalNormalMap (S1: brushedMetal direction field in the normal slot)", () => {
  // material.brushedMetal binds `brushed-metal-anisotropy` (a direction field) to `normal`.
  const BRUSHED_NORMAL = { scale: 36, strength: 0.38, contrast: 0.7, direction: [1, 0, 0] as [number, number, number] };

  it("the raw direction field decoded as a normal is near-tangent (documents the root cause)", () => {
    const raw = generateProceduralMaterialTexture("brushed-metal-anisotropy", BRUSHED_NORMAL);
    const n = raw.width * raw.height;
    let tiltSum = 0;
    for (let i = 0; i < n; i++) tiltSum += decodedTiltDeg(raw.data, i).tilt;
    expect(tiltSum / n).toBeGreaterThan(85);
  });

  for (const params of [BRUSHED_NORMAL, { scale: 42, strength: 0.44, contrast: 0.68, direction: [1, 0, 0] as [number, number, number] }]) {
    it(`brushed ${JSON.stringify(params)}: upward, bounded, gentle normals tilting across the grooves`, () => {
      const normal = proceduralBrushedMetalNormalMap(params);
      expect(normal.slot).toBe("normal");
      expect(normal.colorSpace).toBe("linear");
      expect(normal.width).toBe(512);
      expect(normal.data.length).toBe(512 * 512 * 4);
      const n = normal.width * normal.height;
      const maxTilt = Math.atan(PROCEDURAL_BRUSHED_NORMAL_MAX_SLOPE) * 180 / Math.PI + 1;
      let tiltSum = 0;
      let maxSeen = 0;
      let alongSum = 0;
      let acrossSum = 0;
      for (let i = 0; i < n; i++) {
        const { tilt, rawZ } = decodedTiltDeg(normal.data, i);
        expect(rawZ).toBeGreaterThan(0.9);
        tiltSum += tilt;
        maxSeen = Math.max(maxSeen, tilt);
        alongSum += Math.abs(normal.data[i * 4] / 255 * 2 - 1);
        acrossSum += Math.abs(normal.data[i * 4 + 1] / 255 * 2 - 1);
      }
      expect(maxSeen).toBeLessThanOrEqual(maxTilt);
      expect(tiltSum / n).toBeGreaterThan(2);
      expect(tiltSum / n).toBeLessThan(10);
      // Grooves run along +X (the brush direction): normals tilt across them (Y), barely along.
      expect(acrossSum).toBeGreaterThan(alongSum * 6);
    });
  }

  it("follows the brush direction: [0, 1, 0] grooves tilt in X instead of Y", () => {
    const normal = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, direction: [0, 1, 0], size: 256 });
    let alongSum = 0;
    let acrossSum = 0;
    for (let i = 0; i < normal.width * normal.height; i++) {
      acrossSum += Math.abs(normal.data[i * 4] / 255 * 2 - 1);
      alongSum += Math.abs(normal.data[i * 4 + 1] / 255 * 2 - 1);
    }
    expect(acrossSum).toBeGreaterThan(alongSum * 6);
  });

  it("is deterministic per (params, seed) and seeds change output", () => {
    const a = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, size: 256, seed: 11 });
    const b = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, size: 256, seed: 11 });
    const c = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, size: 256, seed: 12 });
    expect(sha256(a.data)).toBe(sha256(b.data));
    expect(sha256(a.data)).not.toBe(sha256(c.data));
  });

  it("contrast changes the groove relief (and is part of the cache key)", () => {
    const low = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, size: 256, contrast: 0.3 });
    const high = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, size: 256, contrast: 0.9 });
    expect(sha256(low.data)).not.toBe(sha256(high.data));
  });

  for (const direction of [[1, 0, 0], [0, 1, 0], [1, 1, 0], [0.8, -0.35, 0]] as Array<[number, number, number]>) {
    it(`tiles seamlessly under repeat for direction ${JSON.stringify(direction)} (wrap step N-1 -> 0 matches interior steps)`, () => {
      const { data, width, height } = proceduralBrushedMetalNormalMap({ ...BRUSHED_NORMAL, direction, size: 256 });
      const steps = wrapSteps(data, width, height);
      expect(steps.wrapMax).toBeLessThanOrEqual(steps.interiorMax);
      expect(steps.wrapMean).toBeLessThan(steps.interiorMean * 1.5 + 1);
    });
  }
});

describe("proceduralBrushedMetalRoughnessMap (brushedMetal roughnessMap was the flat direction channel)", () => {
  // material.brushedMetal binds `brushed-metal-anisotropy` to `roughnessMap`; the compositor reads G.
  const BRUSHED_ROUGHNESS = { scale: 42, strength: 0.44, contrast: 0.64, direction: [1, 0, 0] as [number, number, number] };

  it("the raw field's G channel is a constant 128 (documents the root cause)", () => {
    const raw = generateProceduralMaterialTexture("brushed-metal-anisotropy", BRUSHED_ROUGHNESS);
    const values = new Set<number>();
    for (let i = 0; i < raw.width * raw.height; i++) values.add(raw.data[i * 4 + 1]);
    expect([...values]).toEqual([128]);
  });

  for (const direction of [[1, 0, 0], [0, 1, 0]] as Array<[number, number, number]>) {
    it(`direction ${JSON.stringify(direction)}: gentle streaks along the grooves, mean held at the old value`, () => {
      const map = proceduralBrushedMetalRoughnessMap({ ...BRUSHED_ROUGHNESS, direction });
      expect(map.slot).toBe("roughness");
      expect(map.colorSpace).toBe("linear");
      const { data, width, height } = map;
      const n = width * height;
      const g = (x: number, y: number) => data[(((y + height) % height) * width + ((x + width) % width)) * 4 + 1] / 255;
      let sum = 0, sumSq = 0, min = 1, max = 0, alongStep = 0, acrossStep = 0;
      const alongX = direction[0] !== 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = g(x, y);
          sum += v; sumSq += v * v; min = Math.min(min, v); max = Math.max(max, v);
          const nextAlong = alongX ? g(x + 1, y) : g(x, y + 1);
          const nextAcross = alongX ? g(x, y + 1) : g(x + 1, y);
          alongStep += Math.abs(nextAlong - v);
          acrossStep += Math.abs(nextAcross - v);
          expect(data[(y * width + x) * 4]).toBe(data[(y * width + x) * 4 + 1]);
        }
      }
      const mean = sum / n;
      const std = Math.sqrt(sumSq / n - mean * mean);
      // Old flat value was 128/255 (≈0.502): the mean stays there so effective roughness does not shift.
      expect(Math.abs(mean - PROCEDURAL_BRUSHED_ROUGHNESS_CENTER)).toBeLessThan(0.005);
      // Visibly streaky but gentle (roughly ±20% of the base roughness at the extremes).
      expect(std).toBeGreaterThan(0.015);
      expect(min).toBeGreaterThan(0.3);
      expect(max).toBeLessThan(0.7);
      // Streaks run along the brush direction: values change far more across the grooves than along them.
      expect(acrossStep).toBeGreaterThan(alongStep * 6);
    });
  }

  it("is deterministic, contrast-sensitive and tiles under repeat", () => {
    const a = proceduralBrushedMetalRoughnessMap({ ...BRUSHED_ROUGHNESS, size: 256 });
    const b = proceduralBrushedMetalRoughnessMap({ ...BRUSHED_ROUGHNESS, size: 256 });
    const c = proceduralBrushedMetalRoughnessMap({ ...BRUSHED_ROUGHNESS, size: 256, contrast: 0.2 });
    expect(sha256(a.data)).toBe(sha256(b.data));
    expect(sha256(a.data)).not.toBe(sha256(c.data));
    const steps = wrapSteps(a.data, a.width, a.height);
    expect(steps.wrapMax).toBeLessThanOrEqual(steps.interiorMax);
  });
});
