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

describe("E3 parity gap: footprint sampling kills high-roughness speckle", () => {
  // One bright panel (100x the base radiance, like the RoomEnvironment
  // panels) per face — symmetric, so the roughest level's mean must stay
  // at the source mean (a one-sided panel legitimately biases a
  // kernel-weighted average). Pointwise mip-0 nearest sampling measured a
  // roughest-level mean texel-to-texel delta of 43% of mean radiance on
  // the analytic room (L4 speckle); pyramid footprint sampling must keep
  // it a small fraction of the mean while preserving that mean.
  const panelCube = (faceSize: number) => {
    const mk = (panel: boolean) => {
      const f = new Float32Array(faceSize * faceSize * 4);
      for (let y = 0; y < faceSize; y++) for (let x = 0; x < faceSize; x++) {
        const inPanel = panel && x >= faceSize / 4 && x < (3 * faceSize) / 4 && y >= faceSize / 4 && y < (3 * faceSize) / 4;
        const v = inPanel ? 50 : 0.5;
        const i = (y * faceSize + x) * 4;
        f[i] = v; f[i + 1] = v; f[i + 2] = v; f[i + 3] = 1;
      }
      return f;
    };
    return { faceSize, faces: [mk(true), mk(true), mk(true), mk(true), mk(true), mk(true)] };
  };
  const stats = (faces: readonly Float32Array[], size: number) => {
    let mean = 0, wSum = 0, delta = 0, n = 0;
    const step = 2 / size;
    for (const f of faces) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + 0.5) * step - 1;
        const v = (y + 0.5) * step - 1;
        const w = (1 + u * u + v * v) ** -1.5;
        mean += f[(y * size + x) * 4]! * w;
        wSum += w;
      }
      for (let y = 0; y < size; y++) for (let x = 0; x + 1 < size; x++) {
        delta += Math.abs(f[(y * size + x) * 4]! - f[(y * size + x + 1) * 4]!); n++;
      }
    }
    mean /= wSum;
    return { mean, deltaRatio: (delta / n) / mean };
  };

  it("roughest level is smooth (neighbor delta << mean) and energy-preserving", () => {
    const src = panelCube(64);
    const srcStats = stats(src.faces, 64);
    const result = prefilterCubeGGX(src, { samples: 64 });
    const last = result.levels[result.levels.length - 1]!;
    const s = stats(last.faces, last.faceSize);
    expect(s.deltaRatio).toBeLessThan(0.25);
    // Box pyramid + ndl-weighted FIS preserve the spherical (solid-angle) mean within MC error.
    expect(Math.abs(s.mean / srcStats.mean - 1)).toBeLessThan(0.25);
  });
});
