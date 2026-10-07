import { describe, expect, it } from "vitest";
import {
  mipCountForFaceSize,
  roughnessToLod,
  lodToRoughness,
  mipRoughness,
  prefilterCubeGGX,
  sampleCube,
  PREFILTER_MIP_FLOOR
} from "@aura3d/rendering/lanes";

function gradientCube(faceSize: number, top: number, bottom: number) {
  // +Y face bright, -Y face dark, sides mid.
  const mk = (l: number) => {
    const f = new Float32Array(faceSize * faceSize * 4);
    for (let i = 0; i < f.length; i += 4) { f[i] = l; f[i + 1] = l; f[i + 2] = l; f[i + 3] = 1; }
    return f;
  };
  const mid = (top + bottom) / 2;
  return { faceSize, faces: [mk(mid), mk(mid), mk(top), mk(bottom), mk(mid), mk(mid)] };
}

describe("prd02 cpu GGX prefilter (PRD-02 §7.2)", () => {
  it("roughnessToLod / lodToRoughness round-trip within 1e-6", () => {
    for (const n of [5, 6, 7]) {
      for (const r of [0, 0.1, 0.33, 0.5, 0.78, 0.95, 1]) {
        const back = lodToRoughness(roughnessToLod(r, n), n);
        expect(Math.abs(back - r)).toBeLessThan(1e-6);
      }
    }
  });

  it("mip chain respects the 16px floor (F=256 → 5 levels)", () => {
    expect(mipCountForFaceSize(256)).toBe(5);
    expect(mipCountForFaceSize(128)).toBe(4);
    expect(mipCountForFaceSize(512)).toBe(6);
    const result = prefilterCubeGGX(gradientCube(64, 4, 0.25), { samples: 8 });
    for (const level of result.levels) {
      expect(level.faceSize).toBeGreaterThanOrEqual(PREFILTER_MIP_FLOOR);
    }
    expect(result.mipCount).toBe(3); // 64, 32, 16
  });

  it("bright-top contrast survives prefiltering (no average blend)", () => {
    const src = gradientCube(32, 4, 0.25);
    const result = prefilterCubeGGX(src, { samples: 32 });
    const last = result.levels[result.levels.length - 1]!;
    const up = sampleCube({ faceSize: last.faceSize, faces: last.faces }, [0, 1, 0])[0];
    const down = sampleCube({ faceSize: last.faceSize, faces: last.faces }, [0, -1, 0])[0];
    expect(up / down).toBeGreaterThan(1.5);
  });

  it("mip 0 is a copy of the source (no filtering at roughness 0)", () => {
    const src = gradientCube(16, 3, 1);
    const result = prefilterCubeGGX(src, { samples: 8 });
    expect(result.levels[0]!.faces[0]).toEqual(src.faces[0]);
  });
});
