/**
 * 02 IBL fix — GL cube-face convention + SH irradiance constants.
 *
 *  - `faceUvToDir` (CUBE_FACE_BASIS) is the exact inverse of `sampleCube`:
 *    every texel centre round-trips to itself (0 mismatches) on all 6 faces,
 *    and the basis matches the GL major-axis table the GPU samples with.
 *  - `cubeFaceViewProjection` looks along each face with right = U, up = −V.
 *  - SH: a known analytic environment L(n) = 1 + n_y projects to SH9 and,
 *    through `packEnvSH` + the `a3dSH9Irradiance` constants, evaluates to the
 *    analytic irradiance E(n) = π + (2π/3)·n_y (cosine applied exactly once).
 */
import { describe, expect, it } from "vitest";
import {
  CUBE_FACE_BASIS,
  faceUvToDir,
  sampleCube
} from "../../../../packages/rendering/src/environment/workers/cpuPrefilter";
import { projectCubeToSH9 } from "../../../../packages/rendering/src/environment/SphericalHarmonics";
import { packEnvSH } from "../../../../packages/rendering/src/environment/EnvUniforms";
import { cubeFaceViewProjection } from "../../../../packages/rendering/src/environment/probeBuild";
import { LIGHTING_IBL_CHUNK_GLSL } from "../../../../packages/rendering/src/shaders/chunks/lighting_ibl.glsl";

/** GL ES 3.0 major-axis selection: (face, s, t) for a direction. */
function glFaceST(d: readonly [number, number, number]): { face: number; s: number; t: number } {
  const [x, y, z] = d;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) return x > 0 ? { face: 0, s: -z / ax, t: -y / ax } : { face: 1, s: z / ax, t: -y / ax };
  if (ay >= ax && ay >= az) return y > 0 ? { face: 2, s: x / ay, t: z / ay } : { face: 3, s: x / ay, t: -z / ay };
  return z > 0 ? { face: 4, s: x / az, t: -y / az } : { face: 5, s: -x / az, t: -y / az };
}

describe("02 IBL fix: GL cube-face convention", () => {
  it("faceUvToDir ∘ sampleCube round-trips every texel (0 mismatches)", () => {
    const size = 16;
    const faces = Array.from({ length: 6 }, (_, f) => {
      const data = new Float32Array(size * size * 4);
      for (let i = 0; i < size * size; i += 1) {
        data[i * 4] = f;
        data[i * 4 + 1] = i % size;
        data[i * 4 + 2] = Math.floor(i / size);
      }
      return data;
    });
    let mismatches = 0;
    for (let f = 0; f < 6; f += 1) {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dir = faceUvToDir(f, ((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
          const [rf, rx, ry] = sampleCube({ faceSize: size, faces }, dir);
          if (rf !== f || rx !== x || ry !== y) mismatches += 1;
        }
      }
    }
    expect(mismatches).toBe(0);
  });

  it("matches the GL major-axis table the GPU samples with", () => {
    for (let f = 0; f < 6; f += 1) {
      for (const [u, v] of [[0.5, -0.25], [-0.7, 0.6], [0.1, 0.9]] as const) {
        const st = glFaceST(faceUvToDir(f, u, v));
        expect(st.face).toBe(f);
        expect(st.s).toBeCloseTo(u, 9);
        expect(st.t).toBeCloseTo(v, 9);
      }
    }
  });

  it("capture view-projection: face centre forward, right = U, up = −V", () => {
    for (let f = 0 as 0 | 1 | 2 | 3 | 4 | 5; f < 6; f = (f + 1) as typeof f) {
      const vp = cubeFaceViewProjection(f, [0, 0, 0], 0.1, 10);
      const [n, U, V] = CUBE_FACE_BASIS[f]!;
      const project = (p: readonly number[]) => {
        const cx = vp[0]! * p[0]! + vp[4]! * p[1]! + vp[8]! * p[2]! + vp[12]!;
        const cy = vp[1]! * p[0]! + vp[5]! * p[1]! + vp[9]! * p[2]! + vp[13]!;
        const cw = vp[3]! * p[0]! + vp[7]! * p[1]! + vp[11]! * p[2]! + vp[15]!;
        return [cx / cw, cy / cw];
      };
      const centre = project(n);
      expect(centre[0]).toBeCloseTo(0, 6);
      expect(centre[1]).toBeCloseTo(0, 6);
      const right = project([n[0] + 0.5 * U[0], n[1] + 0.5 * U[1], n[2] + 0.5 * U[2]]);
      expect(right[0]).toBeCloseTo(0.5, 6);
      const down = project([n[0] + 0.5 * V[0], n[1] + 0.5 * V[1], n[2] + 0.5 * V[2]]);
      expect(down[1]).toBeCloseTo(-0.5, 6);
    }
  });
});

/** CPU twin of a3dSH9Irradiance: plain real-SH basis over packEnvSH coefficients. */
function chunkIrradiance(packed: Float32Array, n: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = n;
  const basis = [
    0.282095, -0.488603 * y, 0.488603 * z, -0.488603 * x,
    1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)
  ];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 9; i += 1) {
    for (let c = 0; c < 3; c += 1) out[c] += packed[i * 3 + c]! * basis[i]!;
  }
  return out;
}

describe("02 IBL fix: SH irradiance applies the cosine once", () => {
  it("L(n) = 1 + n_y gives E(n) = π + (2π/3)·n_y", () => {
    const size = 64;
    const faces = Array.from({ length: 6 }, (_, f) => {
      const data = new Float32Array(size * size * 4);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const d = faceUvToDir(f, ((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
          const L = 1 + d[1];
          data.set([L, L, L, 1], (y * size + x) * 4);
        }
      }
      return data;
    });
    const packed = packEnvSH(projectCubeToSH9(faces, size));
    for (const n of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, 1], [0.6, 0.8, 0]] as const) {
      const expected = Math.PI + ((2 * Math.PI) / 3) * n[1];
      const [r] = chunkIrradiance(packed, n);
      expect(Math.abs(r - expected) / Math.PI).toBeLessThan(0.01);
    }
  });

  it("the chunk carries the plain basis constants, not the folded ones", () => {
    expect(LIGHTING_IBL_CHUNK_GLSL).toContain("c0 * 0.282095");
    expect(LIGHTING_IBL_CHUNK_GLSL).not.toContain("0.886227");
    expect(LIGHTING_IBL_CHUNK_GLSL).not.toContain("1.023328");
  });
});
