/**
 * Bounded CPU-side probe construction from linear RGB radiance.
 *
 * This module owns its sampling and projection math and has no renderer or
 * environment-bake imports. It returns in-memory floats; container encoding,
 * image decoding, production assets and device validation are separate work.
 */

export interface LinearEquirectangularImage {
  readonly width: number;
  readonly height: number;
  /** Row-major, tightly interleaved linear RGB samples, top row at +Y. */
  readonly data: Float32Array;
}

export interface EnvironmentProbeBakeOptions {
  readonly cubeSize: number;
  readonly mipCount: number;
  readonly samplesPerTexel: number;
  /** Maximum deterministic work units; cannot exceed the module's hard cap. */
  readonly maxWork?: number;
}

export type ProbeCubeFaces = readonly [
  Float32Array, Float32Array, Float32Array,
  Float32Array, Float32Array, Float32Array,
];

export interface EnvironmentProbeMip {
  readonly size: number;
  /** Perceptual roughness chosen to invert the consumer's LOD mapping. */
  readonly roughness: number;
  /** Row-major, interleaved linear RGB; +X, -X, +Y, -Y, +Z, -Z. */
  readonly faces: ProbeCubeFaces;
}

export interface BakedEnvironmentProbe {
  readonly mips: readonly EnvironmentProbeMip[];
  /** Raw orthonormal real-SH radiance coefficients, coefficient-major RGB. */
  readonly sh9: Float32Array;
}

type Vector3 = readonly [number, number, number];
type RGB = readonly [number, number, number];

const MAX_SOURCE_PIXELS = 4_194_304;
const MAX_CUBE_SIZE = 512;
const MAX_SAMPLES = 4_096;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_WORK = 100_000_000;
const DEFAULT_MAX_WORK = 80_000_000;
const TAU = 2 * Math.PI;
const SH0 = 1 / (2 * Math.sqrt(Math.PI));
const SH1 = Math.sqrt(3 / (4 * Math.PI));
const SH2 = Math.sqrt(15 / (4 * Math.PI));
const SH20 = Math.sqrt(5 / (16 * Math.PI));
const SH22 = Math.sqrt(15 / (16 * Math.PI));

function positiveInteger(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be an integer from 1 through ${maximum}`);
  }
}

function validate(
  image: LinearEquirectangularImage,
  options: EnvironmentProbeBakeOptions,
): { readonly sizes: number[]; readonly source: Float32Array } {
  positiveInteger(image.width, "image width", MAX_SOURCE_PIXELS);
  positiveInteger(image.height, "image height", MAX_SOURCE_PIXELS);
  const pixels = image.width * image.height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_SOURCE_PIXELS || image.width !== image.height * 2) {
    throw new RangeError("the source must be a bounded 2:1 equirectangular image");
  }
  if (!(image.data instanceof Float32Array) || image.data.length !== pixels * 3) {
    throw new RangeError("the source must contain one interleaved float RGB value per pixel");
  }
  positiveInteger(options.cubeSize, "cube size", MAX_CUBE_SIZE);
  positiveInteger(options.mipCount, "mip count", Math.floor(Math.log2(options.cubeSize)) + 1);
  positiveInteger(options.samplesPerTexel, "samples per texel", MAX_SAMPLES);
  const workLimit = options.maxWork ?? DEFAULT_MAX_WORK;
  positiveInteger(workLimit, "work limit", MAX_WORK);

  const sizes: number[] = [];
  let size = options.cubeSize;
  let outputBytes = 0;
  let work = pixels * 9;
  for (let level = 0; level < options.mipCount; level += 1) {
    sizes.push(size);
    const count = 6 * size * size;
    outputBytes += count * 3 * Float32Array.BYTES_PER_ELEMENT;
    work += count * (level === 0 ? 1 : options.samplesPerTexel);
    size = Math.max(1, Math.floor(size / 2));
  }
  if (!Number.isSafeInteger(work) || work > workLimit || outputBytes > MAX_OUTPUT_BYTES) {
    throw new RangeError("environment probe bake exceeds its work or output allocation limit");
  }

  // The source belongs to the caller. Sampling one copy also prevents later
  // mutation from changing which values the SH and cube calculations observe.
  const source = image.data.slice();
  for (const sample of source) {
    if (!Number.isFinite(sample) || sample < 0) {
      throw new RangeError("linear radiance samples must be finite and non-negative");
    }
  }
  return { sizes, source };
}

function normalized(x: number, y: number, z: number): Vector3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** Cubemap face directions follow the rendering contract's texel axes. */
function cubeDirection(face: number, u: number, v: number): Vector3 {
  switch (face) {
    case 0: return normalized(1, -v, -u);
    case 1: return normalized(-1, -v, u);
    case 2: return normalized(u, 1, v);
    case 3: return normalized(u, -1, -v);
    case 4: return normalized(u, -v, 1);
    case 5: return normalized(-u, -v, -1);
    default: throw new RangeError("invalid cubemap face");
  }
}

function wrap(index: number, width: number): number {
  return ((index % width) + width) % width;
}

/** Bilinear interpolation wraps longitude and clamps at the polar rows. */
function sampleEquirectangular(source: Float32Array, width: number, height: number, direction: Vector3): RGB {
  const longitude = Math.atan2(direction[2], direction[0]) / TAU + 0.5;
  const latitude = Math.acos(Math.max(-1, Math.min(1, direction[1]))) / Math.PI;
  const px = longitude * width - 0.5;
  const py = latitude * height - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const dx = px - x0, dy = py - y0;
  const xs = [wrap(x0, width), wrap(x0 + 1, width)];
  const ys = [Math.max(0, Math.min(height - 1, y0)), Math.max(0, Math.min(height - 1, y0 + 1))];
  const out = [0, 0, 0];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const weight = (row === 0 ? 1 - dy : dy) * (col === 0 ? 1 - dx : dx);
      const offset = (ys[row]! * width + xs[col]!) * 3;
      for (let channel = 0; channel < 3; channel += 1) out[channel]! += source[offset + channel]! * weight;
    }
  }
  return [out[0]!, out[1]!, out[2]!];
}

/** A base-two radical inverse supplies a deterministic low-discrepancy angle. */
function radicalInverse(index: number): number {
  let fraction = 0;
  let place = 0.5;
  while (index > 0) {
    fraction += (index % 2) * place;
    index = Math.floor(index / 2);
    place *= 0.5;
  }
  return fraction;
}

function filteredRadiance(
  source: Float32Array,
  width: number,
  height: number,
  normal: Vector3,
  roughness: number,
  count: number,
): RGB {
  if (roughness === 0) return sampleEquirectangular(source, width, height, normal);
  const [nx, ny, nz] = normal;
  const tangent = Math.abs(ny) < 0.999
    ? normalized(nz, 0, -nx)
    : normalized(0, -nz, ny);
  const bitangent: Vector3 = [
    ny * tangent[2] - nz * tangent[1],
    nz * tangent[0] - nx * tangent[2],
    nx * tangent[1] - ny * tangent[0],
  ];
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  const total = [0, 0, 0];
  let weightSum = 0;

  // Draw half vectors from the isotropic GGX normal distribution. With the
  // view aligned to the output direction, reflect it about each half vector;
  // integrate the incident environment with non-negative cosine weights.
  for (let i = 0; i < count; i += 1) {
    const q = (i + 0.5) / count;
    const cosine = Math.sqrt((1 - q) / (1 + (alphaSquared - 1) * q));
    const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    const azimuth = TAU * radicalInverse(i);
    const x = sine * Math.cos(azimuth), y = sine * Math.sin(azimuth);
    const hx = tangent[0] * x + bitangent[0] * y + nx * cosine;
    const hy = tangent[1] * x + bitangent[1] * y + ny * cosine;
    const hz = tangent[2] * x + bitangent[2] * y + nz * cosine;
    const light: Vector3 = [2 * cosine * hx - nx, 2 * cosine * hy - ny, 2 * cosine * hz - nz];
    const weight = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
    if (weight === 0) continue;
    const radiance = sampleEquirectangular(source, width, height, light);
    for (let channel = 0; channel < 3; channel += 1) total[channel]! += radiance[channel]! * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return sampleEquirectangular(source, width, height, normal);
  return [total[0]! / weightSum, total[1]! / weightSum, total[2]! / weightSum];
}

/**
 * Integrate each real SH basis function exactly over each latitude/longitude
 * pixel cell, treating its RGB sample as constant within the cell. This uses
 * spherical area rather than assigning equal weight to polar and equatorial
 * pixels and avoids an artificial l=2 contribution for a constant source.
 */
function projectSH9(source: Float32Array, width: number, height: number): Float32Array {
  const coefficients = new Float64Array(27);
  const phiStep = TAU / width;
  const thetaStep = Math.PI / height;
  for (let row = 0; row < height; row += 1) {
    const t0 = row * thetaStep, t1 = (row + 1) * thetaStep;
    const c0 = Math.cos(t0), c1 = Math.cos(t1);
    const s0 = Math.sin(t0), s1 = Math.sin(t1);
    const sinTheta = c0 - c1;
    const sinCosTheta = (s1 * s1 - s0 * s0) / 2;
    const sinSquaredTheta = thetaStep / 2 - (Math.sin(2 * t1) - Math.sin(2 * t0)) / 4;
    const sinSquaredCosTheta = (s1 ** 3 - s0 ** 3) / 3;
    const cosSquaredSinTheta = (c0 ** 3 - c1 ** 3) / 3;
    const sinCubedTheta = sinTheta - cosSquaredSinTheta;
    for (let col = 0; col < width; col += 1) {
      const p0 = col * phiStep - Math.PI, p1 = (col + 1) * phiStep - Math.PI;
      const cosPhi = Math.sin(p1) - Math.sin(p0);
      const sinPhi = Math.cos(p0) - Math.cos(p1);
      const sinTwoDelta = (Math.sin(2 * p1) - Math.sin(2 * p0)) / 4;
      const cosSquaredPhi = phiStep / 2 + sinTwoDelta;
      const sinSquaredPhi = phiStep / 2 - sinTwoDelta;
      const sinCosPhi = (Math.sin(p1) ** 2 - Math.sin(p0) ** 2) / 2;
      const weights = [
        SH0 * sinTheta * phiStep,
        -SH1 * sinCosTheta * phiStep,
        SH1 * sinSquaredTheta * sinPhi,
        -SH1 * sinSquaredTheta * cosPhi,
        SH2 * sinSquaredCosTheta * cosPhi,
        SH2 * sinSquaredCosTheta * sinPhi,
        SH20 * (3 * sinCubedTheta * sinSquaredPhi - sinTheta * phiStep),
        SH2 * sinCubedTheta * sinCosPhi,
        SH22 * (sinCubedTheta * cosSquaredPhi - cosSquaredSinTheta * phiStep),
      ];
      const pixel = (row * width + col) * 3;
      for (let coefficient = 0; coefficient < 9; coefficient += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          coefficients[coefficient * 3 + channel]! += weights[coefficient]! * source[pixel + channel]!;
        }
      }
    }
  }
  const result = new Float32Array(coefficients);
  if (!result.every(Number.isFinite)) throw new RangeError("environment SH coefficients exceed float32 range");
  return result;
}

/**
 * Build a bounded cubemap mip chain and raw SH9 from a linear RGB image.
 * The roughness filter is a finite-sample approximation; it does not claim a
 * particular renderer's pixel output or device compatibility.
 */
export function bakeEnvironmentProbe(
  image: LinearEquirectangularImage,
  options: EnvironmentProbeBakeOptions,
): BakedEnvironmentProbe {
  const { sizes, source } = validate(image, options);
  const sh9 = projectSH9(source, image.width, image.height);
  const mips: EnvironmentProbeMip[] = [];
  for (const [level, size] of sizes.entries()) {
    // Invert LOD=(mipCount-1)*r*(2-r), so each recorded mip corresponds
    // to the same roughness selected by the consumer's continuous LOD curve.
    const roughness = options.mipCount === 1 ? 0 : 1 - Math.sqrt(1 - level / (options.mipCount - 1));
    const faces: [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array] = [
      new Float32Array(size * size * 3), new Float32Array(size * size * 3),
      new Float32Array(size * size * 3), new Float32Array(size * size * 3),
      new Float32Array(size * size * 3), new Float32Array(size * size * 3),
    ];
    for (let face = 0; face < 6; face += 1) {
      const pixels = faces[face]!;
      for (let y = 0; y < size; y += 1) {
        const v = 2 * (y + 0.5) / size - 1;
        for (let x = 0; x < size; x += 1) {
          const u = 2 * (x + 0.5) / size - 1;
          const direction = cubeDirection(face, u, v);
          const rgb = filteredRadiance(source, image.width, image.height, direction, roughness, options.samplesPerTexel);
          pixels.set(rgb, (y * size + x) * 3);
        }
      }
    }
    mips.push({ size, roughness, faces });
  }
  return { mips, sh9 };
}
