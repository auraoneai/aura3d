/**
 * ProceduralMaterialTextures (PRD-04 §7.3, P1-5): four deterministic kinds —
 * SHA-256 byte identity for identical (kind, params, seed), seam-free wrap
 * (edge columns/rows ≤1/255), linear color space, correct target slot.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateProceduralMaterialTexture,
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
