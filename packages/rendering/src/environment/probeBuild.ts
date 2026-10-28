/**
 * Shared probe construction (PRD-02 §6.2): float RGBA faces → PMREM levels →
 * rgba16f cube `Texture` + SH9 (+ packed `shTexture`). Pure CPU, no device
 * dependency — used by `GPUPMREMGenerator`, `Prd02EnvironmentProbeFactory`,
 * and `EnvironmentCache` without creating import cycles.
 */

import { Texture, type TextureCubeFace } from "../Texture.js";
import type { EnvironmentProbe } from "../contracts/environment.js";
import { sampleRoomEnvironment } from "./RoomEnvironmentScene.js";
import { evaluateSH9Irradiance, projectCubeToSH9 } from "./SphericalHarmonics.js";
import { CUBE_FACE_BASIS, faceUvToDir, prefilterCubeGGX, sampleCube, type PrefilterCubeSource, type PrefilterResult } from "./workers/cpuPrefilter.js";

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
  /**
   * Set only on a probe whose every texel (all faces, all mips) is this one linear radiance: the analytic neutral floor.
   * `probeToEquirectTexture` then fills its output directly instead of sampling the cube per equirect texel. The value is
   * the float32 radiance the cube was encoded from, so the fill is bit-identical to the sampled result.
   */
  public readonly uniformRadiance: number | undefined;
  private disposed = false;

  constructor(args: {
    readonly specularCube: Texture;
    readonly mipCount: number;
    readonly faceSize: EnvironmentProbe["faceSize"];
    readonly sh9: Float32Array;
    readonly shTexture: Texture | null;
    readonly background: Texture | null;
    readonly source: ProbeSource;
    readonly uniformRadiance?: number;
  }) {
    this.specularCube = args.specularCube;
    this.mipCount = args.mipCount;
    this.faceSize = args.faceSize;
    this.sh9 = args.sh9;
    this.shTexture = args.shTexture;
    this.background = args.background;
    this.source = args.source;
    this.uniformRadiance = args.uniformRadiance;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.specularCube.dispose();
    this.shTexture?.dispose();
    this.background?.dispose();
  }
}

const halfScratch = new Float32Array(1);
const halfScratchBits = new Uint32Array(halfScratch.buffer);

/**
 * IEEE-754 binary16 encode for rgba16f upload (clamps negatives/∞ to the HDR range).
 *
 * Bit-for-bit the same result as the earlier `Math.log2` / `Math.round` version (including its rounding of a
 * mantissa that carries into the next binade down rather than up), but reads the exponent and mantissa from
 * the float32 bits: that version dominated the first frame (about 250 ms of CPU for the default room probe).
 * Inputs are always float32 face data, so the double → float32 store below is exact.
 */
export function floatToHalf(value: number): number {
  if (value !== value) return 0x7e00;
  if (value <= 0) return 0;
  if (value >= 65504) return 0x7bff;
  if (value < 6.103515625e-5) return Math.round(value / 5.960464477539063e-8);
  halfScratch[0] = value;
  const bits = halfScratchBits[0]!;
  const exponent = (bits >>> 23) - 127;
  const mantissa = ((bits & 0x7fffff) + 4096) >>> 13;
  return ((exponent + 15) << 10) | (mantissa & 0x03ff);
}

/** Float32 RGBA face → Uint16 half-float bytes (the rgba16f upload format). */
function faceToHalf(face: Float32Array): Uint16Array {
  const out = new Uint16Array(face.length);
  for (let i = 0; i < face.length; i += 1) out[i] = floatToHalf(face[i] ?? 0);
  return out;
}

/**
 * `texels` RGBA half-float texels of one linear radiance (alpha 1). Same bits as `faceToHalf` of a face filled with
 * `radiance` and alpha 1, without encoding every channel of every texel.
 */
export function uniformRadianceHalf(texels: number, radiance: number): Uint16Array {
  const out = new Uint16Array(texels * 4);
  const rgb = floatToHalf(radiance);
  const alpha = floatToHalf(1);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rgb;
    out[i + 1] = rgb;
    out[i + 2] = rgb;
    out[i + 3] = alpha;
  }
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
 * probe's SH9 DC equals the baked `neutral` preset's (3.7560 ≈ c·3.5483; the
 * point-lit r185 room, re-baked with the RoomEnvironmentScene fix).
 */
export const NEUTRAL_FLOOR_RADIANCE = 1.0585341933512515;

/**
 * The baked `neutral` preset's SH9 verbatim (`neutral.sh9.f32`, CC0 bake) —
 * the floor carries it so diffuse IBL is identical before and after the baked
 * specular cube lands via `acquire`.
 */
export const NEUTRAL_FLOOR_SH9 = new Float32Array([
  3.7560017, 3.7560017, 3.7560017,
  -1.7286245, -1.7286245, -1.7286245,
  1.5881586, 1.5881586, 1.5881586,
  -0.25784275, -0.25784275, -0.25784275,
  0.19389074, 0.19389074, 0.19389074,
  1.0348382, 1.0348382, 1.0348382,
  1.1923468, 1.1923468, 1.1923468,
  -0.33930653, -0.33930653, -0.33930653,
  -0.62652594, -0.62652594, -0.62652594
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
  // The floor is one constant radiance, so one encoded face is shared by all six (`Texture` copies what it is given).
  // Same bits as encoding six identical float faces through `buildProbeFromLevels`, at a sixth of the work and without
  // the 6 x faceSize^2 x 4 float allocation: this runs synchronously before the first frame.
  const data = uniformRadianceHalf(faceSize * faceSize, NEUTRAL_FLOOR_RADIANCE);
  const specularCube = new Texture({
    width: faceSize,
    height: faceSize,
    format: "rgba16f",
    label: options.label ?? "env-neutral-floor",
    cubeFaces: CUBE_FACE_ORDER.map((face) => ({
      face: face as TextureCubeFace,
      mipLevels: [{ width: faceSize, height: faceSize, data }]
    }))
  });
  const sh9 = options.sh9 ?? new Float32Array(NEUTRAL_FLOOR_SH9);
  return new Prd02EnvironmentProbe({
    specularCube,
    mipCount: 1,
    faceSize,
    sh9,
    shTexture: sh9ToTexture(sh9),
    background: options.background ?? null,
    source: options.source ?? "neutral",
    uniformRadiance: Math.fround(NEUTRAL_FLOOR_RADIANCE)
  });
}

/** Nearest 2× upsample of one square float RGBA face. */
function upsampleFace(face: Float32Array, size: number): Float32Array {
  const out = new Float32Array(size * size * 16);
  for (let y = 0; y < size * 2; y += 1) {
    for (let x = 0; x < size * 2; x += 1) {
      const src = ((y >> 1) * size + (x >> 1)) * 4;
      const dst = (y * size * 2 + x) * 4;
      out[dst] = face[src]!; out[dst + 1] = face[src + 1]!; out[dst + 2] = face[src + 2]!; out[dst + 3] = face[src + 3]!;
    }
  }
  return out;
}

/** 2×2 box downsample of one square float RGBA face. */
function downsampleFace(face: Float32Array, size: number): Float32Array {
  const half = size / 2;
  const out = new Float32Array(half * half * 4);
  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const at = (yy: number, xx: number) => face[(yy * size + xx) * 4 + c]!;
        out[(y * half + x) * 4 + c] = 0.25 * (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1));
      }
    }
  }
  return out;
}

/**
 * Directional neutral room for the legacy forward path (#1141 / 02-S2).
 * The legacy shader reads diffuse from the *last* level of the bound cube
 * (lod = mipCount − 1, clamped), so the constant `buildNeutralFloorProbe`
 * gives every normal the same light. This probe is the analytic r185 room at
 * 64 px (no GGX prefilter: ~24k analytic samples, once; nearest-upsampled
 * to the 128 px mip 0), a 2×2 box mip at 32 px for glossy reflections, and a 16 px last level
 * holding the SH9 cosine irradiance ÷ π (Lambert-equivalent radiance), so
 * diffuse is directional and cosine-weighted like three's PMREM.
 */
export function buildNeutralRoomLegacyProbe(options: Prd02ProbeBuildOptions = {}): Prd02EnvironmentProbe {
  const base = 128;
  const sh9 = options.sh9 ?? new Float32Array(NEUTRAL_FLOOR_SH9);
  // Sample the room at 64 px (24k analytic rays) and nearest-upsample to the
  // 128 px base the probe contract requires: keeps the one-off main-thread
  // cost lower than sampling the full 128 px base; timing is device-dependent.
  const sampled = buildRoomFaces(base / 2);
  const levels: { faceSize: number; faces: Float32Array[] }[] = [
    { faceSize: base, faces: sampled.map((face) => upsampleFace(face, base / 2)) },
    { faceSize: base / 2, faces: sampled }
  ];
  levels.push({ faceSize: base / 4, faces: sampled.map((face) => downsampleFace(face, base / 2)) });
  const last = 16;
  const irradiance: Float32Array[] = [];
  for (let f = 0; f < 6; f += 1) {
    const face = new Float32Array(last * last * 4);
    for (let y = 0; y < last; y += 1) {
      for (let x = 0; x < last; x += 1) {
        const d = faceUvToDir(f, ((x + 0.5) / last) * 2 - 1, ((y + 0.5) / last) * 2 - 1);
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const [r, g, b] = evaluateSH9Irradiance(sh9, [d[0] / len, d[1] / len, d[2] / len]);
        const i = (y * last + x) * 4;
        face[i] = Math.max(0, r / Math.PI); face[i + 1] = Math.max(0, g / Math.PI); face[i + 2] = Math.max(0, b / Math.PI); face[i + 3] = 1;
      }
    }
    irradiance.push(face);
  }
  levels.push({ faceSize: last, faces: irradiance });
  return buildProbeFromLevels(levels, base, {
    ...options,
    label: options.label ?? "env-neutral-room-legacy",
    source: options.source ?? "neutral",
    sh9
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
  const basis = CUBE_FACE_BASIS; // GL face basis: up = −V, right = U
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


let halfDecodeTable: Float32Array | null = null;

/** IEEE-754 binary16 decode (rgba16f readback → Float32); table-driven, exact (every half is a float32). */
export function halfToFloat(h: number): number {
  if (halfDecodeTable === null) {
    const table = new Float32Array(65536);
    for (let bits = 0; bits < 65536; bits += 1) {
      const sign = bits & 0x8000 ? -1 : 1;
      const exp = (bits >> 10) & 0x1f;
      const mantissa = bits & 0x03ff;
      table[bits] = exp === 0
        ? sign * mantissa * 2 ** -24
        : exp === 0x1f
          ? (mantissa !== 0 ? Number.NaN : sign * Number.POSITIVE_INFINITY)
          : sign * (1 + mantissa / 1024) * 2 ** (exp - 15);
    }
    halfDecodeTable = table;
  }
  return halfDecodeTable[h & 0xffff]!;
}

/** 2× box-filter downsample of an RGBA32F image (mip chain, linear HDR). Sums in the same order as a naive 2×2 loop. */
export function downsampleRgba(src: Float32Array, w: number, h: number): { data: Float32Array; width: number; height: number } {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const out = new Float32Array(nw * nh * 4);
  for (let y = 0; y < nh; y += 1) {
    const sy0 = Math.min(h - 1, y * 2);
    const sy1 = Math.min(h - 1, y * 2 + 1);
    for (let x = 0; x < nw; x += 1) {
      const sx0 = Math.min(w - 1, x * 2);
      const sx1 = Math.min(w - 1, x * 2 + 1);
      const i00 = (sy0 * w + sx0) * 4;
      const i01 = (sy0 * w + sx1) * 4;
      const i10 = (sy1 * w + sx0) * 4;
      const i11 = (sy1 * w + sx1) * 4;
      const o = (y * nw + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        out[o + c] = (src[i00 + c]! + src[i01 + c]! + src[i10 + c]! + src[i11 + c]!) / 4;
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
  const uniform = (probe as { uniformRadiance?: number }).uniformRadiance;
  if (uniform !== undefined) return uniformEquirectTexture(probe, uniform, width, height);
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

/**
 * The equirect of a probe whose cube is one constant radiance. Sampling is nearest-texel and the half encode of a value
 * that is already a half is the identity, and a 2x2 box mean of four equal halves is exact in float32, so every texel of
 * every mip equals the half of the radiance: this is the sampled result, produced without the per-texel cube lookups.
 */
function uniformEquirectTexture(probe: EnvironmentProbe, radiance: number, width: number, height: number): Texture {
  const mipLevels: { width: number; height: number; data: Uint16Array }[] = [];
  let w = width;
  let h = height;
  for (;;) {
    mipLevels.push({ width: w, height: h, data: uniformRadianceHalf(w * h, radiance) });
    if (w <= 1 && h <= 1) break;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
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
