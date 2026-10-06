/**
 * C-09 — EnvironmentSource / EnvironmentProbe (CONTRACTS.md). Provider: PRD 02.
 * Flag: A3D_QR_LIGHTING.
 */

import type { Texture } from "../Texture";
import type { RenderTarget } from "../RenderDevice";
import type { RenderDevice } from "../RenderDevice";
import { defineContractSlot, type ContractSlot } from "./core";
import type { AuraQualityTier } from "./quality";

export interface EnvironmentProbe {
  readonly kind: "environment-probe";
  readonly specularCube: Texture;   // PMREM, linear HDR
  readonly mipCount: number;
  readonly faceSize: 128 | 256 | 512 | 1024;
  readonly sh9: Float32Array;                            // length 27, linear radiance SH (RGB x 9)
  readonly shTexture: Texture | null;
  readonly background: Texture | null;
  readonly source: "neutral" | "preset" | "hdri" | "capture" | "sky" | "space-bake" | "legacy";
  dispose(): void;
}
export interface EnvironmentCaptureRequest { renderFace(face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array): void; readonly resolution: 64 | 128 | 256; }
export interface EnvironmentProbeFactory {
  fromEquirect(src: Texture, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe;
  fromCube(src: Texture, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe;
  fromScene(req: EnvironmentCaptureRequest, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe;
  neutral(tier: AuraQualityTier): EnvironmentProbe;
}

/**
 * PR 0a placeholder: the documented stub arrives in PR 0b wrapping the existing
 * PMREM path (production-runtime/environment/PMREMGenerator.ts). Until then the
 * factory reports pending so no consumer can mistake it for the real one.
 */
const probeFactoryPending: EnvironmentProbeFactory = {
  fromEquirect() { throw new Error("ENVIRONMENT_PROBE_PENDING:fromEquirect"); },
  fromCube() { throw new Error("ENVIRONMENT_PROBE_PENDING:fromCube"); },
  fromScene() { throw new Error("ENVIRONMENT_PROBE_PENDING:fromScene"); },
  neutral() { throw new Error("ENVIRONMENT_PROBE_PENDING:neutral"); }
};

export const environmentProbeFactorySlot: ContractSlot<(device: RenderDevice) => EnvironmentProbeFactory> =
  defineContractSlot("C-09", "prd02", "A3D_QR_LIGHTING", () => probeFactoryPending);

/** Real SH2 projection of six cube faces (row-major RGBA texels per face). */
export function projectCubeToSH9(faces: readonly Float32Array[], faceSize: number): Float32Array {
  const result = new Float32Array(27);
  const faceDirs = [
    [[1, 0, 0], [0, -1, 0], [0, 0, -1]],   // +x: u=-z? canonical cubemap basis
    [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]]
  ] as const;
  const step = 2 / faceSize;
  for (let f = 0; f < 6; f++) {
    const face = faces[f];
    if (!face) continue;
    const [n, u, v] = faceDirs[f];
    for (let y = 0; y < faceSize; y++) {
      const fv = (y + 0.5) * step - 1;
      for (let x = 0; x < faceSize; x++) {
        const fu = (x + 0.5) * step - 1;
        const dx = n[0] + u[0] * fu + v[0] * fv;
        const dy = n[1] + u[1] * fu + v[1] * fv;
        const dz = n[2] + u[2] * fu + v[2] * fv;
        const len = Math.hypot(dx, dy, dz);
        const nx = dx / len, ny = dy / len, nz = dz / len;
        const weight = 4 / (len * len * faceSize * faceSize * Math.PI) * Math.PI; // solid angle approx
        const i = (y * faceSize + x) * 4;
        const r = face[i], g = face[i + 1], b = face[i + 2];
        accumulateSH9(result, nx, ny, nz, r, g, b, weight);
      }
    }
  }
  return result;
}

function accumulateSH9(out: Float32Array, x: number, y: number, z: number, r: number, g: number, b: number, w: number): void {
  const c0 = 0.282095;
  const c1 = 0.488603;
  const c2 = 1.092548;
  const c3 = 0.315392;
  const c4 = 0.546274;
  const basis = [
    c0,
    -c1 * y,
    c1 * z,
    -c1 * x,
    c2 * x * y,
    c2 * y * z,
    c3 * (3 * z * z - 1),
    c2 * x * z,
    c4 * (x * x - y * y)
  ];
  for (let i = 0; i < 9; i++) {
    out[i * 3] += basis[i] * r * w;
    out[i * 3 + 1] += basis[i] * g * w;
    out[i * 3 + 2] += basis[i] * b * w;
  }
}

export function evaluateSH9Irradiance(sh9: Float32Array, normal: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = normal;
  const basis = [
    0.886227,                       // sqrt(pi)/2 * c0 scaled for irradiance convolution
    -1.023328 * y,
    1.023328 * z,
    -1.023328 * x,
    0.858086 * x * y,
    0.858086 * y * z,
    0.247708 * (3 * z * z - 1),
    0.858086 * x * z,
    0.429043 * (x * x - y * y)
  ];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 9; i++) {
    out[0] += basis[i] * sh9[i * 3];
    out[1] += basis[i] * sh9[i * 3 + 1];
    out[2] += basis[i] * sh9[i * 3 + 2];
  }
  return out;
}

/** GLSL entry points every consumer may call (chunk "a3d_prd02_sh9"): vec3 a3dSampleIrradianceSH(vec3 N); uniform block A3DSH9 { vec4 u_sh9[9]; } */
export const SH9_CHUNK: "a3d_prd02_sh9" = "a3d_prd02_sh9";
