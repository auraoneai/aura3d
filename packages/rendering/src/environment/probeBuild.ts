/**
 * Shared probe construction (PRD-02 §6.2): float RGBA faces → PMREM levels →
 * rgba16f cube `Texture` + SH9 (+ packed `shTexture`). Pure CPU, no device
 * dependency — used by `GPUPMREMGenerator`, `Prd02EnvironmentProbeFactory`,
 * and `EnvironmentCache` without creating import cycles.
 */

import { Texture, type TextureCubeFace } from "../Texture.js";
import type { EnvironmentProbe } from "../contracts/environment.js";
import { sampleRoomEnvironment } from "./RoomEnvironmentScene.js";
import { projectCubeToSH9 } from "./SphericalHarmonics.js";
import { faceUvToDir, prefilterCubeGGX, type PrefilterCubeSource, type PrefilterResult } from "./workers/cpuPrefilter.js";

export const CUBE_FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"] as const;

export type ProbeSource = EnvironmentProbe["source"];

export interface Prd02ProbeBuildOptions {
  readonly faceSize?: EnvironmentProbe["faceSize"];
  /** Override prefilter executor (Worker/GPU). Defaults to `prefilterCubeGGX`. */
  readonly prefilter?: (source: PrefilterCubeSource, samples?: number) => PrefilterResult;
  readonly samples?: number;
  readonly source?: ProbeSource;
  /** Extra `Texture` bound as the scene background (equirect/preset only). */
  readonly background?: Texture | null;
  readonly label?: string;
  /** Pre-computed SH9 (baked presets ship `<name>.sh9.f32` at 128-sample quality). */
  readonly sh9?: Float32Array;
}

export class Prd02EnvironmentProbe implements EnvironmentProbe {
  public readonly kind = "environment-probe" as const;
  public readonly specularCube: Texture;
  public readonly mipCount: number;
  public readonly faceSize: EnvironmentProbe["faceSize"];
  public readonly sh9: Float32Array;
  public readonly shTexture: Texture | null;
  public readonly background: Texture | null;
  public readonly source: ProbeSource;
  private disposed = false;

  constructor(args: {
    readonly specularCube: Texture;
    readonly mipCount: number;
    readonly faceSize: EnvironmentProbe["faceSize"];
    readonly sh9: Float32Array;
    readonly shTexture: Texture | null;
    readonly background: Texture | null;
    readonly source: ProbeSource;
  }) {
    this.specularCube = args.specularCube;
    this.mipCount = args.mipCount;
    this.faceSize = args.faceSize;
    this.sh9 = args.sh9;
    this.shTexture = args.shTexture;
    this.background = args.background;
    this.source = args.source;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.specularCube.dispose();
    this.shTexture?.dispose();
    this.background?.dispose();
  }
}

/** IEEE-754 binary16 encode for rgba16f upload (clamps negatives/∞ to the HDR range). */
function floatToHalf(value: number): number {
  const v = Math.max(0, value);
  if (Number.isNaN(v)) return 0x7e00;
  if (!Number.isFinite(v) || v >= 65504) return 0x7bff;
  if (v === 0) return 0;
  if (v < 2 ** -14) return Math.round(v / 2 ** -24);
  const exponent = Math.floor(Math.log2(v));
  const mantissa = Math.round((v / 2 ** exponent - 1) * 1024);
  return ((exponent + 15) << 10) | (mantissa & 0x03ff);
}

/** Float32 RGBA face → Uint16 half-float bytes (the rgba16f upload format). */
function faceToHalf(face: Float32Array): Uint16Array {
  const out = new Uint16Array(face.length);
  for (let i = 0; i < face.length; i += 1) out[i] = floatToHalf(face[i] ?? 0);
  return out;
}

/** Pack the 27-float SH into a 9×1 rgba32f texture (w lane unused). */
export function sh9ToTexture(sh9: Float32Array): Texture {
  const data = new Float32Array(36);
  for (let i = 0; i < 9; i += 1) {
    data[i * 4] = sh9[i * 3] ?? 0;
    data[i * 4 + 1] = sh9[i * 3 + 1] ?? 0;
    data[i * 4 + 2] = sh9[i * 3 + 2] ?? 0;
  }
  return new Texture({ width: 9, height: 1, format: "rgba32f", label: "env-sh9", data });
}

/** Build a probe from six RGBA float faces (linear HDR). */
export function buildProbeFromFaces(
  faces: readonly Float32Array[],
  faceSize: EnvironmentProbe["faceSize"],
  options: Prd02ProbeBuildOptions = {}
): Prd02EnvironmentProbe {
  const prefilter = options.prefilter ?? ((src: PrefilterCubeSource) => prefilterCubeGGX(src, { samples: options.samples }));
  const result = prefilter({ faceSize, faces }, options.samples);
  const cubeFaces = CUBE_FACE_ORDER.map((face, f) => ({
    face: face as TextureCubeFace,
    mipLevels: result.levels.map((level) => ({
      width: level.faceSize,
      height: level.faceSize,
      data: faceToHalf(level.faces[f]!),
    }))
  }));
  const specularCube = new Texture({
    width: faceSize,
    height: faceSize,
    format: "rgba16f",
    label: options.label ?? "env-pmrem",
    cubeFaces
  });
  const sh9 = projectCubeToSH9(faces, faceSize);
  return new Prd02EnvironmentProbe({
    specularCube,
    mipCount: result.mipCount,
    faceSize,
    sh9,
    shTexture: sh9ToTexture(sh9),
    background: options.background ?? null,
    source: options.source ?? "hdri"
  });
}

/** Build a probe from already-prefiltered per-level faces (baked KTX2 path). */
export function buildProbeFromLevels(
  levels: readonly { readonly faceSize: number; readonly faces: readonly Float32Array[] }[],
  faceSize: EnvironmentProbe["faceSize"],
  options: Prd02ProbeBuildOptions = {}
): Prd02EnvironmentProbe {
  const cubeFaces = CUBE_FACE_ORDER.map((face, f) => ({
    face: face as TextureCubeFace,
    mipLevels: levels.map((level) => ({
      width: level.faceSize,
      height: level.faceSize,
      data: faceToHalf(level.faces[f]!)
    }))
  }));
  const specularCube = new Texture({
    width: faceSize,
    height: faceSize,
    format: "rgba16f",
    label: options.label ?? "env-pmrem-baked",
    cubeFaces
  });
  const mip0 = levels[0];
  const sh9 = options.sh9 ?? (mip0 ? projectCubeToSH9(mip0.faces, mip0.faceSize) : new Float32Array(27));
  return new Prd02EnvironmentProbe({
    specularCube,
    mipCount: levels.length,
    faceSize,
    sh9,
    shTexture: sh9ToTexture(sh9),
    background: options.background ?? null,
    source: options.source ?? "preset"
  });
}

/** Rasterize the analytic RoomEnvironmentScene into six float faces. */
export function buildRoomFaces(faceSize: number): Float32Array[] {
  const faces: Float32Array[] = [];
  for (let f = 0; f < 6; f += 1) {
    const face = new Float32Array(faceSize * faceSize * 4);
    for (let y = 0; y < faceSize; y += 1) {
      for (let x = 0; x < faceSize; x += 1) {
        const dir = faceUvToDir(f, ((x + 0.5) / faceSize) * 2 - 1, ((y + 0.5) / faceSize) * 2 - 1);
        const [r, g, b] = sampleRoomEnvironment(dir);
        const i = (y * faceSize + x) * 4;
        face[i] = r; face[i + 1] = g; face[i + 2] = b; face[i + 3] = 1;
      }
    }
    faces.push(face);
  }
  return faces;
}

/** 90° perspective view-projection for cube capture at `position`. Row-major, GL clip space. */
export function cubeFaceViewProjection(
  face: 0 | 1 | 2 | 3 | 4 | 5,
  position: readonly [number, number, number] = [0, 0, 0],
  near = 0.05,
  far = 100
): Float32Array {
  const basis = [
    [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
    [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]]
  ] as const;
  const [n, ux, vx] = basis[face]!;
  // view = lookAt along +n with up derived from the face basis (vx is "down" on the face).
  const up: [number, number, number] = [-vx[0], -vx[1], -vx[2]];
  const right: [number, number, number] = [
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0]
  ];
  // Column-major view matrix (GL convention) then 90° perspective.
  const tx = -(right[0] * position[0] + right[1] * position[1] + right[2] * position[2]);
  const ty = -(up[0] * position[0] + up[1] * position[1] + up[2] * position[2]);
  const tz = -(-(n[0] * position[0] + n[1] * position[1] + n[2] * position[2]));
  const view = [
    right[0], up[0], -n[0], 0,
    right[1], up[1], -n[1], 0,
    right[2], up[2], -n[2], 0,
    tx, ty, tz, 1
  ];
  const f = 1 / Math.tan(Math.PI / 4);
  const nf = 1 / (near - far);
  const proj = [
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ];
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += proj[k * 4 + r]! * view[c * 4 + k]!;
      out[c * 4 + r] = s;
    }
  }
  return out;
}

