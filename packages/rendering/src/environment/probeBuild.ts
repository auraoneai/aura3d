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
import { faceUvToDir, prefilterCubeGGX, sampleCube, type PrefilterCubeSource, type PrefilterResult } from "./workers/cpuPrefilter.js";

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

/**
 * Linear radiance of the analytic neutral floor (T0-25): constant chosen so the
 * probe's SH9 DC equals the baked `neutral` preset's (1.8945 ≈ c·3.5483).
 */
export const NEUTRAL_FLOOR_RADIANCE = 0.5339295346775188;

/**
 * The baked `neutral` preset's SH9 verbatim (`neutral.sh9.f32`, CC0 bake) —
 * the floor carries it so diffuse IBL is identical before and after the baked
 * specular cube lands via `acquire`.
 */
export const NEUTRAL_FLOOR_SH9 = new Float32Array([
  1.8945446, 1.8945446, 1.8945446,
  -1.4085772, -1.4085772, -1.4085772,
  1.1517786, 1.1517786, 1.1517786,
  -0.096516535, -0.096516535, -0.096516535,
  0.12132652, 0.12132652, 0.12132652,
  1.2429792, 1.2429792, 1.2429792,
  0.63450480, 0.63450480, 0.63450480,
  -0.23291537, -0.23291537, -0.23291537,
  -0.50483990, -0.50483990, -0.50483990
]);

/**
 * Instant analytic neutral floor: a constant cube at `NEUTRAL_FLOOR_RADIANCE`
 * plus the baked `NEUTRAL_FLOOR_SH9` — no CPU GGX prefilter. Specular detail
 * arrives through the baked `neutral` preset upgrade.
 */
export function buildNeutralFloorProbe(
  faceSize: EnvironmentProbe["faceSize"],
  options: Prd02ProbeBuildOptions = {}
): Prd02EnvironmentProbe {
  const face = new Float32Array(faceSize * faceSize * 4);
  for (let i = 0; i < faceSize * faceSize; i += 1) {
    face[i * 4] = NEUTRAL_FLOOR_RADIANCE;
    face[i * 4 + 1] = NEUTRAL_FLOOR_RADIANCE;
    face[i * 4 + 2] = NEUTRAL_FLOOR_RADIANCE;
    face[i * 4 + 3] = 1;
  }
  const faces: Float32Array[] = [face, face, face, face, face, face];
  return buildProbeFromLevels(
    [{ faceSize, faces }],
    faceSize,
    {
      ...options,
      label: options.label ?? "env-neutral-floor",
      source: options.source ?? "neutral",
      sh9: options.sh9 ?? new Float32Array(NEUTRAL_FLOOR_SH9)
    }
  );
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


/** IEEE-754 binary16 decode (rgba16f readback → Float32). */
function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mantissa = h & 0x03ff;
  if (exp === 0) return sign * mantissa * 2 ** -24;
  if (exp === 0x1f) return mantissa !== 0 ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * (1 + mantissa / 1024) * 2 ** (exp - 15);
}

/** 2× box-filter downsample of an RGBA32F image (mip chain, linear HDR). */
function downsampleRgba(src: Float32Array, w: number, h: number): { data: Float32Array; width: number; height: number } {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const out = new Float32Array(nw * nh * 4);
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const sx = Math.min(w - 1, x * 2 + dx);
            const sy = Math.min(h - 1, y * 2 + dy);
            sum += src[(sy * w + sx) * 4 + c]!;
            count += 1;
          }
        }
        out[(y * nw + x) * 4 + c] = sum / count;
      }
    }
  }
  return { data: out, width: nw, height: nh };
}

/**
 * Legacy-path bridge (PRD-02 Phase 3): project the probe's mip-0 specular
 * cube to a mipped RGBA16F equirect — linear HDR end to end (no Reinhard,
 * no RGBA8), which fixes the E5 dim/clip problem on the legacy environment
 * path when the flag is on. Mip chain is a CPU box filter.
 */
export function probeToEquirectTexture(
  probe: EnvironmentProbe,
  options: { readonly width?: number; readonly height?: number } = {}
): Texture {
  const width = options.width ?? probe.faceSize * 2;
  const height = options.height ?? probe.faceSize;
  const faceSize = probe.faceSize;
  const level0 = probe.specularCube.cubeFaces.map((face) => {
    const mip = face.mipLevels[0];
    if (!mip) throw new Error("probe specular cube has no mip-0 data");
    if (mip.data instanceof Uint16Array) {
      const out = new Float32Array(mip.data.length);
      for (let i = 0; i < mip.data.length; i += 1) out[i] = halfToFloat(mip.data[i]!);
      return out;
    }
    return new Float32Array(mip.data);
  });
  const source = { faceSize, faces: level0 };
  let equirect: Float32Array = new Float32Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const theta = ((row + 0.5) / height) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let col = 0; col < width; col += 1) {
      const phi = ((col + 0.5) / width) * 2 * Math.PI - Math.PI;
      const dir: readonly [number, number, number] = [-Math.cos(phi) * sinT, cosT, Math.sin(phi) * sinT];
      const [r, g, b] = sampleCube(source, dir);
      const i = (row * width + col) * 4;
      equirect[i] = r; equirect[i + 1] = g; equirect[i + 2] = b; equirect[i + 3] = 1;
    }
  }
  const mipLevels: { width: number; height: number; data: Uint16Array }[] = [
    { width, height, data: faceToHalf(equirect) }
  ];
  let w = width;
  let h = height;
  while (w > 1 || h > 1) {
    const next = downsampleRgba(equirect, w, h);
    mipLevels.push({ width: next.width, height: next.height, data: faceToHalf(next.data) });
    equirect = next.data;
    w = next.width;
    h = next.height;
  }
  return new Texture({
    width,
    height,
    format: "rgba16f",
    colorSpace: "linear",
    label: `prd02-equirect-${probe.source}`,
    mipLevels
  });
}
