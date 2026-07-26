import type { LinearHdrEnvironmentMapSource } from "./EnvironmentMapResources";

const A3D_PREFILTER_EPSILON = 0.00001;

export interface GgxPrefilteredEnvironmentLevel {
  readonly width: number;
  readonly height: number;
  /** Roughness this level was genuinely GGX-filtered for, not a post-hoc label. */
  readonly roughness: number;
  readonly data: Float32Array;
}

export interface GgxSpecularPrefilterOptions {
  readonly levels?: number;
  readonly sampleCount?: number;
}

export interface ShIrradianceCoefficients {
  /** Nine RGB spherical-harmonic bands (L00, L1-1, L10, L11, L2-2, L2-1, L20, L21, L22). */
  readonly bands: readonly (readonly [number, number, number])[];
}

/** Linear HDR equirect map this module produced, so `data` is always concrete. */
export interface LinearHdrEnvironmentMapOutput {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/**
 * Equirectangular mip pyramid used only for solid-angle-based source LOD
 * selection. A single wide GGX lobe covers far more than one source texel, so
 * sampling level 0 for every tap turns a small very bright texel into
 * high-variance "firefly" noise. Selecting a coarser source level whose texel
 * solid angle matches the sample's footprint is what removes that noise.
 */
interface EnvironmentPyramid {
  readonly levels: readonly LinearHdrEnvironmentMapOutput[];
  /** Materialises (and caches) the requested level, clamped to `depth`. */
  level(index: number): LinearHdrEnvironmentMapOutput;
  readonly depth: number;
  readonly baseTexelSolidAngle: number;
}

/**
 * Roughness assigned to each prefiltered level, exposed so diagnostics and
 * shader LOD math agree on the mapping instead of each re-deriving it.
 */
export function specularPrefilterLevelRoughness(levelCount: number): readonly number[] {
  if (!Number.isInteger(levelCount) || levelCount < 1) {
    throw new RangeError("Environment specular prefilter level count must be a positive integer");
  }
  return Array.from({ length: levelCount }, (_unused, levelIndex) => (
    levelCount <= 1 ? 0 : levelIndex / (levelCount - 1)
  ));
}

export function prefilterGgxEnvironmentLevels(
  source: LinearHdrEnvironmentMapSource,
  options: GgxSpecularPrefilterOptions = {}
): readonly GgxPrefilteredEnvironmentLevel[] {
  validateLinearHdrSource(source);
  const maxLevels = Math.floor(Math.log2(Math.max(source.width, source.height))) + 1;
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("GGX specular prefilter levels must be a positive integer");
  }
  const sampleCount = options.sampleCount ?? 64;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError("GGX specular prefilter sampleCount must be a positive integer");
  }

  const levelCount = Math.min(requestedLevels, maxLevels);
  const levelRoughness = specularPrefilterLevelRoughness(levelCount);
  const pyramid = buildEnvironmentPyramid(source);
  const levels: GgxPrefilteredEnvironmentLevel[] = [];

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    const roughness = levelRoughness[levelIndex]!;
    const width = Math.max(1, Math.floor(source.width / 2 ** levelIndex));
    const height = Math.max(1, Math.floor(source.height / 2 ** levelIndex));
    if (roughness <= A3D_PREFILTER_EPSILON && width === source.width && height === source.height) {
      // Roughness 0 is a mirror reflection at the source resolution, so the
      // filtered result is exactly the source. Resampling it through the
      // bilinear/trig path would cost a full-resolution pass to reproduce data
      // we already have (and would not even be bit-exact).
      levels.push({ width, height, roughness, data: copyRgbOpaque(source) });
      continue;
    }
    levels.push({
      width,
      height,
      roughness,
      data: prefilterLevelData(pyramid, width, height, roughness, sampleCount)
    });
  }
  return levels;
}

function copyRgbOpaque(source: LinearHdrEnvironmentMapSource): Float32Array {
  const data = new Float32Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    data[offset] = Math.max(0, source.data[offset] ?? 0);
    data[offset + 1] = Math.max(0, source.data[offset + 1] ?? 0);
    data[offset + 2] = Math.max(0, source.data[offset + 2] ?? 0);
    data[offset + 3] = 1;
  }
  return data;
}

/**
 * Projects an equirectangular radiance map onto nine irradiance SH bands using
 * per-texel solid angle weights. This is a real cosine convolution (evaluated
 * through the Ramamoorthi/Hanrahan irradiance kernel), not a box blur.
 */
export function projectEnvironmentIrradianceSh(source: LinearHdrEnvironmentMapSource): ShIrradianceCoefficients {
  validateLinearHdrSource(source);
  const bands: [number, number, number][] = Array.from({ length: 9 }, () => [0, 0, 0]);
  const deltaPhi = (Math.PI * 2) / source.width;
  const deltaTheta = Math.PI / source.height;

  for (let y = 0; y < source.height; y += 1) {
    const theta = ((y + 0.5) / source.height) * Math.PI;
    const solidAngle = deltaPhi * deltaTheta * Math.sin(theta);
    for (let x = 0; x < source.width; x += 1) {
      const direction = equirectDirection(x, y, source.width, source.height);
      const offset = (y * source.width + x) * 4;
      const red = Math.max(0, source.data[offset] ?? 0);
      const green = Math.max(0, source.data[offset + 1] ?? 0);
      const blue = Math.max(0, source.data[offset + 2] ?? 0);
      const basis = shBasis9(direction);
      for (let band = 0; band < 9; band += 1) {
        const weight = basis[band]! * solidAngle;
        bands[band]![0] += red * weight;
        bands[band]![1] += green * weight;
        bands[band]![2] += blue * weight;
      }
    }
  }
  return { bands: bands.map((band) => [band[0], band[1], band[2]] as const) };
}

/**
 * Evaluates cosine-convolved irradiance divided by PI, so the result is the
 * radiance-equivalent value a shader multiplies directly by albedo. A uniform
 * environment of radiance 1 evaluates back to 1.
 */
export function evaluateShIrradiance(
  coefficients: ShIrradianceCoefficients,
  normal: readonly [number, number, number]
): readonly [number, number, number] {
  const n = normalizeVector(normal);
  const x = n[0];
  const y = n[1];
  const z = n[2];
  // Ramamoorthi & Hanrahan irradiance kernel constants; these already fold in
  // the cosine-lobe convolution weights (PI, 2PI/3, PI/4).
  const c1 = 0.429043;
  const c2 = 0.511664;
  const c3 = 0.743125;
  const c4 = 0.886227;
  const c5 = 0.247708;
  const bands = coefficients.bands;
  const result: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel += 1) {
    const l00 = bands[0]?.[channel] ?? 0;
    const l1m1 = bands[1]?.[channel] ?? 0;
    const l10 = bands[2]?.[channel] ?? 0;
    const l11 = bands[3]?.[channel] ?? 0;
    const l2m2 = bands[4]?.[channel] ?? 0;
    const l2m1 = bands[5]?.[channel] ?? 0;
    const l20 = bands[6]?.[channel] ?? 0;
    const l21 = bands[7]?.[channel] ?? 0;
    const l22 = bands[8]?.[channel] ?? 0;
    const irradiance = c1 * l22 * (x * x - y * y)
      + c3 * l20 * z * z
      + c4 * l00
      - c5 * l20
      + 2 * c1 * (l2m2 * x * y + l21 * x * z + l2m1 * y * z)
      + 2 * c2 * (l11 * x + l1m1 * y + l10 * z);
    result[channel] = Math.max(0, irradiance / Math.PI);
  }
  return result;
}

export function convolveEnvironmentIrradiance(
  source: LinearHdrEnvironmentMapSource,
  width: number,
  height: number
): LinearHdrEnvironmentMapOutput {
  validateLinearHdrSource(source);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Environment irradiance dimensions must be positive integers");
  }
  const coefficients = projectEnvironmentIrradianceSh(source);
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const irradiance = evaluateShIrradiance(coefficients, equirectDirection(x, y, width, height));
      const offset = (y * width + x) * 4;
      data[offset] = irradiance[0];
      data[offset + 1] = irradiance[1];
      data[offset + 2] = irradiance[2];
      data[offset + 3] = 1;
    }
  }
  return { width, height, data };
}

/**
 * Per-level GGX sample table.
 *
 * With the standard PMREM assumption N = V = R, several per-sample quantities
 * are independent of the pixel being filtered: the local half vector, and
 * therefore `vDotH` (= localZ), `nDotL` (= 2 * vDotH^2 - 1), the sampling pdf
 * and the source LOD. Only the rotation of the sample into world space and the
 * environment fetch depend on the pixel, so everything else is computed once
 * per level instead of once per pixel-sample.
 */
interface GgxSampleTable {
  /** Local-space half vectors, packed as x,y,z per accepted sample. */
  readonly local: Float64Array;
  /** NdotL weight per accepted sample. */
  readonly weight: Float64Array;
  /** Source pyramid LOD per accepted sample. */
  readonly lod: Float64Array;
  readonly count: number;
}

function buildGgxSampleTable(
  roughness: number,
  sampleCount: number,
  baseTexelSolidAngle: number,
  maxLod: number
): GgxSampleTable {
  const alpha = Math.max(roughness * roughness, A3D_PREFILTER_EPSILON);
  const local = new Float64Array(sampleCount * 3);
  const weight = new Float64Array(sampleCount);
  const lod = new Float64Array(sampleCount);
  let count = 0;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const xi = hammersley2d(sampleIndex, sampleCount);
    const half = importanceSampleGgxLocal(xi, roughness);
    // N = V = +Z in local space, so vDotH is the half vector's Z component.
    const vDotH = half[2];
    if (vDotH <= 0) continue;
    // light = 2 * (V.H) * H - V, so N.L = 2 * (V.H)^2 - 1 when N = V.
    const nDotL = 2 * vDotH * vDotH - 1;
    if (nDotL <= 0) continue;

    const nDotH = Math.max(vDotH, A3D_PREFILTER_EPSILON);
    const distribution = ggxDistribution(nDotH, alpha);
    const pdf = (distribution * nDotH) / (4 * vDotH) + A3D_PREFILTER_EPSILON;
    const sampleSolidAngle = 1 / (sampleCount * pdf);

    const offset = count * 3;
    local[offset] = half[0];
    local[offset + 1] = half[1];
    local[offset + 2] = half[2];
    weight[count] = nDotL;
    lod[count] = clampNumber(0.5 * Math.log2(sampleSolidAngle / baseTexelSolidAngle), 0, maxLod);
    count += 1;
  }
  return { local, weight, lod, count };
}

function prefilterLevelData(
  pyramid: EnvironmentPyramid,
  width: number,
  height: number,
  roughness: number,
  sampleCount: number
): Float32Array {
  const data = new Float32Array(width * height * 4);
  if (roughness <= A3D_PREFILTER_EPSILON) {
    // Mirror reflection: the GGX lobe collapses to a delta, so the filtered
    // value is just the environment radiance along the reflection direction.
    const base = pyramid.level(0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        equirectDirectionInto(x, y, width, height, scratchDirection);
        sampleEquirectBilinearInto(
          base,
          scratchDirection[0]!,
          scratchDirection[1]!,
          scratchDirection[2]!,
          scratchSample
        );
        const offset = (y * width + x) * 4;
        data[offset] = scratchSample[0]!;
        data[offset + 1] = scratchSample[1]!;
        data[offset + 2] = scratchSample[2]!;
        data[offset + 3] = 1;
      }
    }
    return data;
  }

  const table = buildGgxSampleTable(roughness, sampleCount, pyramid.baseTexelSolidAngle, pyramid.depth - 1);
  // Materialise every pyramid level the table can reach before the pixel loop,
  // so the loop never mixes lazy construction into its inner work.
  for (let sampleIndex = 0; sampleIndex < table.count; sampleIndex += 1) {
    pyramid.level(Math.ceil(table.lod[sampleIndex]!));
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      equirectDirectionInto(x, y, width, height, scratchDirection);
      const nx = scratchDirection[0]!;
      const ny = scratchDirection[1]!;
      const nz = scratchDirection[2]!;
      const offset = (y * width + x) * 4;

      // Tangent frame is per pixel, not per sample.
      const upX = Math.abs(ny) < 0.999 ? 0 : 1;
      const upY = Math.abs(ny) < 0.999 ? 1 : 0;
      let tx = upY * nz - 0 * ny;
      let ty = 0 * nx - upX * nz;
      let tz = upX * ny - upY * nx;
      const tangentLength = Math.hypot(tx, ty, tz) || 1;
      tx /= tangentLength;
      ty /= tangentLength;
      tz /= tangentLength;
      const bx = ny * tz - nz * ty;
      const by = nz * tx - nx * tz;
      const bz = nx * ty - ny * tx;

      let red = 0;
      let green = 0;
      let blue = 0;
      let totalWeight = 0;

      for (let sampleIndex = 0; sampleIndex < table.count; sampleIndex += 1) {
        const localOffset = sampleIndex * 3;
        const lx = table.local[localOffset]!;
        const ly = table.local[localOffset + 1]!;
        const vDotH = table.local[localOffset + 2]!;
        const hx = tx * lx + bx * ly + nx * vDotH;
        const hy = ty * lx + by * ly + ny * vDotH;
        const hz = tz * lx + bz * ly + nz * vDotH;
        // light = 2 * (V.H) * H - V, already unit length for unit H and V.
        const lightX = 2 * vDotH * hx - nx;
        const lightY = 2 * vDotH * hy - ny;
        const lightZ = 2 * vDotH * hz - nz;

        samplePyramidTrilinearInto(pyramid, lightX, lightY, lightZ, table.lod[sampleIndex]!, scratchSample);
        const weight = table.weight[sampleIndex]!;
        red += scratchSample[0]! * weight;
        green += scratchSample[1]! * weight;
        blue += scratchSample[2]! * weight;
        totalWeight += weight;
      }

      if (totalWeight <= A3D_PREFILTER_EPSILON) {
        sampleEquirectBilinearInto(pyramid.level(0), nx, ny, nz, scratchSample);
        data[offset] = scratchSample[0]!;
        data[offset + 1] = scratchSample[1]!;
        data[offset + 2] = scratchSample[2]!;
        data[offset + 3] = 1;
        continue;
      }
      data[offset] = red / totalWeight;
      data[offset + 1] = green / totalWeight;
      data[offset + 2] = blue / totalWeight;
      data[offset + 3] = 1;
    }
  }
  return data;
}

function buildEnvironmentPyramid(source: LinearHdrEnvironmentMapSource): EnvironmentPyramid {
  // Built lazily: a request for only low-roughness levels never needs the deep
  // coarse levels, and halving a 1k equirect map eight times is not free.
  const levels: LinearHdrEnvironmentMapOutput[] = [{
    width: source.width,
    height: source.height,
    data: new Float32Array(source.data)
  }];
  const maxDepth = Math.floor(Math.log2(Math.max(source.width, source.height))) + 1;
  return {
    get levels() {
      return levels;
    },
    level(index: number): LinearHdrEnvironmentMapOutput {
      const target = clampNumber(Math.floor(index), 0, maxDepth - 1);
      while (levels.length <= target) {
        levels.push(halveEnvironmentLevel(levels.at(-1)!));
      }
      return levels[target]!;
    },
    depth: maxDepth,
    baseTexelSolidAngle: (4 * Math.PI) / (source.width * source.height)
  };
}

function halveEnvironmentLevel(level: LinearHdrEnvironmentMapSource): LinearHdrEnvironmentMapOutput {
  const width = Math.max(1, Math.floor(level.width / 2));
  const height = Math.max(1, Math.floor(level.height / 2));
  const data = new Float32Array(width * height * 4);
  const xStep = level.width > 1 ? 2 : 1;
  const yStep = level.height > 1 ? 2 : 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let sampleY = 0; sampleY < yStep; sampleY += 1) {
        for (let sampleX = 0; sampleX < xStep; sampleX += 1) {
          const offset = (Math.min(level.height - 1, y * yStep + sampleY) * level.width
            + Math.min(level.width - 1, x * xStep + sampleX)) * 4;
          red += Math.max(0, level.data[offset] ?? 0);
          green += Math.max(0, level.data[offset + 1] ?? 0);
          blue += Math.max(0, level.data[offset + 2] ?? 0);
          count += 1;
        }
      }
      const offset = (y * width + x) * 4;
      data[offset] = red / count;
      data[offset + 1] = green / count;
      data[offset + 2] = blue / count;
      data[offset + 3] = 1;
    }
  }
  return { width, height, data };
}

/**
 * Scratch buffers for the prefilter hot loop. `prefilterLevelData` is
 * synchronous and single-threaded, so reusing them avoids allocating several
 * short-lived arrays per pixel-sample.
 */
const scratchDirection = new Float64Array(3);
const scratchSample = new Float64Array(3);
const scratchLow = new Float64Array(3);
const scratchHigh = new Float64Array(3);

/**
 * Trilinear pyramid fetch for a **unit** direction.
 *
 * The equirect projection (`atan2`/`acos`) depends only on the direction, not
 * the level, so it is evaluated once and the resulting UV is reused for both
 * mip levels. Doing it per level doubled the transcendental cost of the hot
 * loop for no change in result.
 */
function samplePyramidTrilinearInto(
  pyramid: EnvironmentPyramid,
  x: number,
  y: number,
  z: number,
  lod: number,
  out: Float64Array
): void {
  const u = moduloNumber(Math.atan2(z, x) / (Math.PI * 2) + 0.5, 1);
  const v = clampNumber(Math.acos(clampNumber(y, -1, 1)) / Math.PI, 0, 1);
  const lower = Math.floor(lod);
  const upper = Math.min(pyramid.depth - 1, lower + 1);
  const fraction = lod - lower;
  sampleEquirectUvInto(pyramid.level(lower), u, v, scratchLow);
  if (upper === lower || fraction <= 0) {
    out[0] = scratchLow[0]!;
    out[1] = scratchLow[1]!;
    out[2] = scratchLow[2]!;
    return;
  }
  sampleEquirectUvInto(pyramid.level(upper), u, v, scratchHigh);
  out[0] = scratchLow[0]! + (scratchHigh[0]! - scratchLow[0]!) * fraction;
  out[1] = scratchLow[1]! + (scratchHigh[1]! - scratchLow[1]!) * fraction;
  out[2] = scratchLow[2]! + (scratchHigh[2]! - scratchLow[2]!) * fraction;
}

/** Bilinear equirect fetch with wrapped U and clamped V. */
function sampleEquirectUvInto(
  level: LinearHdrEnvironmentMapSource,
  u: number,
  v: number,
  out: Float64Array
): void {
  const width = level.width;
  const height = level.height;
  const fx = u * width - 0.5;
  const fy = v * height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  const xa = moduloNumber(x0, width);
  const xb = moduloNumber(x0 + 1, width);
  const ya = clampNumber(y0, 0, height - 1);
  const yb = clampNumber(y0 + 1, 0, height - 1);
  const offsetA = (ya * width + xa) * 4;
  const offsetB = (ya * width + xb) * 4;
  const offsetC = (yb * width + xa) * 4;
  const offsetD = (yb * width + xb) * 4;
  const data = level.data;

  for (let channel = 0; channel < 3; channel += 1) {
    // Clamp per texel, before interpolation, so a negative input value cannot
    // pull a neighbouring positive texel down.
    const c00 = Math.max(0, data[offsetA + channel] ?? 0);
    const c10 = Math.max(0, data[offsetB + channel] ?? 0);
    const c01 = Math.max(0, data[offsetC + channel] ?? 0);
    const c11 = Math.max(0, data[offsetD + channel] ?? 0);
    const top = c00 + (c10 - c00) * tx;
    const bottom = c01 + (c11 - c01) * tx;
    out[channel] = top + (bottom - top) * ty;
  }
}

/** Bilinear equirect fetch for a direction that need not be unit length. */
function sampleEquirectBilinearInto(
  level: LinearHdrEnvironmentMapSource,
  dx: number,
  dy: number,
  dz: number,
  out: Float64Array
): void {
  // Plain sqrt rather than Math.hypot: hypot's overflow-safe scaling makes it
  // dramatically slower in V8, and these components are bounded direction
  // vectors where the extra range is irrelevant.
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const length = Math.sqrt(lengthSquared);
  const nx = length <= A3D_PREFILTER_EPSILON ? 0 : dx / length;
  const ny = length <= A3D_PREFILTER_EPSILON ? 0 : dy / length;
  const nz = length <= A3D_PREFILTER_EPSILON ? 1 : dz / length;
  const u = moduloNumber(Math.atan2(nz, nx) / (Math.PI * 2) + 0.5, 1);
  const v = clampNumber(Math.acos(clampNumber(ny, -1, 1)) / Math.PI, 0, 1);
  sampleEquirectUvInto(level, u, v, out);
}

function equirectDirectionInto(x: number, y: number, width: number, height: number, out: Float64Array): void {
  const phi = ((x + 0.5) / width - 0.5) * Math.PI * 2;
  const theta = ((y + 0.5) / height) * Math.PI;
  const sinTheta = Math.sin(theta);
  // Already unit length analytically: (cos(phi)sin(theta))^2 + cos(theta)^2 +
  // (sin(phi)sin(theta))^2 = 1, so no normalisation pass is needed.
  out[0] = Math.cos(phi) * sinTheta;
  out[1] = Math.cos(theta);
  out[2] = Math.sin(phi) * sinTheta;
}

function ggxDistribution(nDotH: number, alpha: number): number {
  const alpha2 = alpha * alpha;
  const denominator = nDotH * nDotH * (alpha2 - 1) + 1;
  return alpha2 / Math.max(Math.PI * denominator * denominator, A3D_PREFILTER_EPSILON);
}

function importanceSampleGgxLocal(
  xi: readonly [number, number],
  roughness: number
): readonly [number, number, number] {
  const alpha = Math.max(roughness * roughness, A3D_PREFILTER_EPSILON);
  const alpha2 = alpha * alpha;
  const phi = 2 * Math.PI * xi[0];
  const cosTheta = Math.sqrt((1 - xi[1]) / Math.max(1 + (alpha2 - 1) * xi[1], A3D_PREFILTER_EPSILON));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return [Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta];
}

function hammersley2d(index: number, count: number): readonly [number, number] {
  return [(index + 0.5) / count, radicalInverseVdc(index)];
}

function radicalInverseVdc(bits: number): number {
  let value = bits >>> 0;
  value = ((value << 16) | (value >>> 16)) >>> 0;
  value = (((value & 0x55555555) << 1) | ((value & 0xaaaaaaaa) >>> 1)) >>> 0;
  value = (((value & 0x33333333) << 2) | ((value & 0xcccccccc) >>> 2)) >>> 0;
  value = (((value & 0x0f0f0f0f) << 4) | ((value & 0xf0f0f0f0) >>> 4)) >>> 0;
  value = (((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8)) >>> 0;
  return value * 2.3283064365386963e-10;
}

function shBasis9(direction: readonly [number, number, number]): readonly number[] {
  const x = direction[0];
  const y = direction[1];
  const z = direction[2];
  return [
    0.282095,
    0.488603 * y,
    0.488603 * z,
    0.488603 * x,
    1.092548 * x * y,
    1.092548 * y * z,
    0.315392 * (3 * z * z - 1),
    1.092548 * x * z,
    0.546274 * (x * x - y * y)
  ];
}

function equirectDirection(x: number, y: number, width: number, height: number): readonly [number, number, number] {
  const u = (x + 0.5) / width;
  const v = (y + 0.5) / height;
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = v * Math.PI;
  const sinTheta = Math.sin(theta);
  return normalizeVector([
    Math.cos(phi) * sinTheta,
    Math.cos(theta),
    Math.sin(phi) * sinTheta
  ]);
}

function normalizeVector(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= A3D_PREFILTER_EPSILON) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moduloNumber(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function validateLinearHdrSource(source: LinearHdrEnvironmentMapSource): void {
  if (!Number.isInteger(source.width) || source.width <= 0 || !Number.isInteger(source.height) || source.height <= 0) {
    throw new RangeError("Environment prefilter dimensions must be positive integers");
  }
  if (source.data.length !== source.width * source.height * 4) {
    throw new RangeError("Environment prefilter data must contain exactly width * height * 4 linear RGBA values");
  }
}
