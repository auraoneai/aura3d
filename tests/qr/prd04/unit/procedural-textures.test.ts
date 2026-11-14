/**
 * ProceduralMaterialTextures (PRD-04 §7.3, P1-5): four deterministic kinds —
 * SHA-256 byte identity for identical (kind, params, seed), seam-free wrap
 * (edge columns/rows ≤1/255), linear color space, correct target slot.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateProceduralMaterialTexture,
  proceduralScalarFieldToNormalMap,
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
