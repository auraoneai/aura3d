/**
 * Independently derived, bounded depth-of-field shader stages.
 *
 * Input and output are finite linear-HDR, associated (premultiplied) RGBA.
 * Alpha must be in [0, 1], zero alpha must have zero RGB, and RGB must be
 * representable as finite f32. A matching-size texture stores non-negative
 * linear view depth in metres in red. Geometry depths must be positive normal f32 values (at
 * least 1.1754943508222875e-38 metres); subnormal depths may flush to the
 * zero/no-depth sentinel. Depths at or beyond the sky threshold are background.
 * The host validates finite optical controls and matching dimensions. Callers
 * guarantee the depth values and associated-alpha pixel data; straight-alpha
 * images require conversion before this path.
 *
 * Premultiplied RGBA uses rgba32float half-size targets; signed CoC, tile data
 * and influence use separate rgba16float targets. Both color and opacity are
 * filtered and composited together. Target-format rounding and permitted f32
 * subnormal flushing limit extremely small values. A single depth per pixel
 * cannot correctly resolve multiple overlapping transparent surfaces.
 * Tilt/shift and a full-resolution gather are outside this path. Its bounded
 * disk sampling is an approximation, not a claim of camera-model parity.
 */

export interface IndependentDofOptics {
  /** Focus plane distance from the lens, in metres. */
  readonly focusDistance: number;
  readonly focalLengthMm: number;
  readonly fStop: number;
  readonly sensorHeightMm: number;
  /** Maximum signed blur diameter, in full-resolution pixels. */
  readonly maxBlurPx: number;
  readonly skyDepthMeters: number;
}

/**
 * Signed thin-lens circle-of-confusion diameter in full-resolution pixels.
 * Positive values lie behind the focus plane; negative values lie in front.
 * Zero depth and declared sky depths intentionally receive no blur.
 */
export function independentDofCircleOfConfusionPx(
  depthMetres: number,
  optics: IndependentDofOptics,
  fullHeightPixels: number
): number {
  const values = [
    depthMetres, optics.focusDistance, optics.focalLengthMm, optics.fStop,
    optics.sensorHeightMm, optics.maxBlurPx, optics.skyDepthMeters
  ];
  if (!values.every(Number.isFinite) || depthMetres < 0 || !Number.isSafeInteger(fullHeightPixels) || fullHeightPixels <= 0 ||
      optics.focalLengthMm <= 0 || optics.fStop <= 0 || optics.sensorHeightMm <= 0 ||
      optics.maxBlurPx < 0 || optics.skyDepthMeters <= 0) {
    throw new RangeError("Depth of field requires finite, positive optical controls and non-negative depth");
  }
  const focalLengthMetres = optics.focalLengthMm / 1000;
  const sensorHeightMetres = optics.sensorHeightMm / 1000;
  if (!(focalLengthMetres > 0) || !(sensorHeightMetres > 0) || !(optics.focusDistance > focalLengthMetres)) {
    throw new RangeError("Depth of field focus distance must exceed its focal length");
  }
  if (depthMetres === 0 || depthMetres >= optics.skyDepthMeters || depthMetres === optics.focusDistance || optics.maxBlurPx === 0) return 0;
  // Lens aperture times the change in image distance, scaled from sensor
  // length to pixels. Saturate before dividing by depth so a tiny positive
  // distance cannot overflow an intermediate division.
  const scale = (focalLengthMetres / optics.fStop) *
    (focalLengthMetres / (optics.focusDistance - focalLengthMetres)) *
    (fullHeightPixels / sensorHeightMetres);
  const difference = depthMetres - optics.focusDistance;
  const numerator = scale * difference;
  if (Number.isFinite(scale) && scale > 0 && Number.isFinite(numerator) && numerator !== 0) {
    if (Math.abs(numerator) >= optics.maxBlurPx * depthMetres) {
      return Math.sign(difference) * optics.maxBlurPx;
    }
    return numerator / depthMetres;
  }
  // Keep the CPU reference well-defined for finite, physically valid inputs
  // beyond the narrower GPU host limits, even if an intermediate overflows or
  // underflows JavaScript's floating-point range.
  const logMagnitude = 2 * Math.log(focalLengthMetres) - Math.log(optics.fStop) -
    Math.log(optics.focusDistance - focalLengthMetres) + Math.log(fullHeightPixels) -
    Math.log(sensorHeightMetres) + Math.log(Math.abs(difference)) - Math.log(depthMetres);
  if (logMagnitude >= Math.log(optics.maxBlurPx)) return Math.sign(difference) * optics.maxBlurPx;
  return Math.sign(difference) * Math.exp(logMagnitude);
}

/** A finite, linear-HDR premultiplied color. */
export type IndependentDofPremultipliedRgba = readonly [number, number, number, number];

export interface IndependentDofInputSample {
  readonly rgba: IndependentDofPremultipliedRgba;
  readonly depthMetres: number;
}

export interface IndependentDofPrefilterResult {
  readonly rgba: IndependentDofPremultipliedRgba;
  readonly cocPx: number;
}

function validatePremultipliedRgba(rgba: IndependentDofPremultipliedRgba): void {
  if (rgba.length !== 4 || !rgba.every(Number.isFinite) || rgba[3] < 0 || rgba[3] > 1 ||
      rgba.slice(0, 3).some((component) => Math.abs(component) > 3.4028234663852886e38) ||
      (rgba[3] === 0 && rgba.slice(0, 3).some((component) => component !== 0))) {
    throw new RangeError("Depth of field requires finite premultiplied RGBA with alpha in [0, 1]");
  }
}

/**
 * CPU reference for one nonempty 2×2 prefilter footprint. Valid edge footprints
 * may contain fewer than four pixels. Transparent samples do not supply CoC.
 */
export function independentDofPrefilterSamples(
  samples: readonly IndependentDofInputSample[],
  optics: IndependentDofOptics,
  fullHeightPixels: number
): IndependentDofPrefilterResult {
  if (samples.length < 1 || samples.length > 4) throw new RangeError("A prefilter footprint requires one to four samples");
  const mean = [0, 0, 0, 0];
  let count = 0;
  let nearCoc = 0;
  let farCoc = 0;
  let farWeight = 0;
  for (const sample of samples) {
    validatePremultipliedRgba(sample.rgba);
    const coc = independentDofCircleOfConfusionPx(sample.depthMetres, optics, fullHeightPixels);
    count++;
    for (let i = 0; i < 4; i++) mean[i] = mean[i] * ((count - 1) / count) + sample.rgba[i] / count;
    const alpha = sample.rgba[3];
    if (alpha > 0) {
      nearCoc = Math.min(nearCoc, coc);
      farCoc += Math.max(coc, 0) * alpha;
      farWeight += alpha;
    }
  }
  const rgba: IndependentDofPremultipliedRgba = [mean[0], mean[1], mean[2], mean[3]];
  return { rgba, cocPx: nearCoc < 0 ? nearCoc : farWeight > 0 ? farCoc / farWeight : 0 };
}

/** CPU reference for the same four-channel convex premultiplied composite. */
export function independentDofMixPremultipliedRgba(
  original: IndependentDofPremultipliedRgba,
  filtered: IndependentDofPremultipliedRgba,
  amount: number
): IndependentDofPremultipliedRgba {
  validatePremultipliedRgba(original);
  validatePremultipliedRgba(filtered);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw new RangeError("Depth of field blend must be in [0, 1]");
  return [
    original[0] * (1 - amount) + filtered[0] * amount,
    original[1] * (1 - amount) + filtered[1] * amount,
    original[2] * (1 - amount) + filtered[2] * amount,
    original[3] * (1 - amount) + filtered[3] * amount
  ];
}

/**
 * Bounded interpolation avoids both an overflowing same-sign sum and the
 * opposite-sign subtraction of values near the f32 limit. This helper is used
 * for all premultiplied RGBA averaging and bilinear color reconstruction.
 */
const INDEPENDENT_DOF_STABLE_MIX_WGSL = /* wgsl */ `
fn independentStableMixChannel(a: f32, b: f32, amount: f32) -> f32 {
  if ((a < 0.0) == (b < 0.0)) {
    return a + (b - a) * amount;
  }
  return a * (1.0 - amount) + b * amount;
}

fn independentStableMix(a: vec4<f32>, b: vec4<f32>, amount: f32) -> vec4<f32> {
  return vec4<f32>(
    independentStableMixChannel(a.r, b.r, amount),
    independentStableMixChannel(a.g, b.g, amount),
    independentStableMixChannel(a.b, b.b, amount),
    independentStableMixChannel(a.a, b.a, amount)
  );
}
`;

/**
 * Shared prefilter code. Binding 0 is the eight-f32 optics uniform; bindings
 * 1 and 2 are matching full-size premultiplied color and linear-depth images.
 * Both single-target entrypoints execute the same bounded 2×2 footprint.
 */
const INDEPENDENT_DOF_PREFILTER_COMMON_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_STABLE_MIX_WGSL}
struct IndependentDofParams {
  focusDistance: f32,
  focalLengthMm: f32,
  fStop: f32,
  sensorHeightMm: f32,
  fullHeightPx: f32,
  maxBlurPx: f32,
  skyDepthMeters: f32,
  padding: f32,
  // GU47 EC-8 tilt-shift band: x centre (0 top, 1 bottom), y width, z angle (rad), w 1 = band mode (CoC from position).
  tiltShift: vec4<f32>,
}

@group(0) @binding(0) var<uniform> dof: IndependentDofParams;
@group(0) @binding(1) var sourceColor: texture_2d<f32>;
@group(0) @binding(2) var sourceDepth: texture_2d<f32>;

fn independentSignedCoc(depth: f32) -> f32 {
  let focalMetres = dof.focalLengthMm * 0.001;
  let sensorMetres = dof.sensorHeightMm * 0.001;
  if (!(depth > 0.0) || depth >= dof.skyDepthMeters ||
      !(focalMetres > 0.0) || !(sensorMetres > 0.0) || !(dof.fStop > 0.0) ||
      !(dof.focusDistance > focalMetres) || !(dof.fullHeightPx > 0.0) || !(dof.maxBlurPx > 0.0)) {
    return 0.0;
  }
  let pixelScale = (focalMetres / dof.fStop) *
    (focalMetres / (dof.focusDistance - focalMetres)) * (dof.fullHeightPx / sensorMetres);
  let maximum = min(dof.maxBlurPx, 64.0);
  let numerator = pixelScale * (depth - dof.focusDistance);
  if (numerator == 0.0) { return 0.0; }
  if (abs(numerator) >= maximum * depth) {
    return select(-maximum, maximum, numerator > 0.0);
  }
  return numerator / depth;
}

// The WebGL2 S6 band: sharp within bandWidth/2 of the centre, ramping to maxBlurPx; far-field (positive) on both
// sides, so the sky blurs like everything else.
fn independentTiltShiftCoc(p: vec2<i32>, size: vec2<i32>) -> f32 {
  let uv = (vec2<f32>(p) + 1.0) / vec2<f32>(size);
  let aspect = f32(size.x) / f32(max(size.y, 1));
  // WebGPU fragment y runs top-down, so uv.y is already the GLSL (1 - uv.y) distance from the top edge.
  let q = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);
  let t = dot(q, vec2<f32>(-sin(dof.tiltShift.z), cos(dof.tiltShift.z))) + 0.5;
  let halfBand = 0.5 * clamp(dof.tiltShift.y, 0.0, 1.0);
  let ramp = max(0.05, 0.5 - halfBand);
  return clamp((abs(t - dof.tiltShift.x) - halfBand) / ramp, 0.0, 1.0) * min(dof.maxBlurPx, 64.0);
}

fn independentPixelCoc(p: vec2<i32>, size: vec2<i32>) -> f32 {
  // WebGL2 evaluates the band at the 2x2 block origin.
  if (dof.tiltShift.w > 0.5) { return independentTiltShiftCoc((p / 2) * 2, size); }
  return independentSignedCoc(textureLoad(sourceDepth, p, 0).r);
}

struct IndependentDofPrefilter {
  rgba: vec4<f32>,
  coc: f32,
}

fn independentPrefilter(position: vec4<f32>) -> IndependentDofPrefilter {
  let size = vec2<i32>(textureDimensions(sourceColor, 0));
  let origin = vec2<i32>(position.xy) * 2;
  var rgba = vec4<f32>(0.0);
  var farCoc = 0.0;
  var farWeight = 0.0;
  var nearCoc = 0.0;
  var count = 0.0;
  for (var y = 0; y < 2; y = y + 1) {
    for (var x = 0; x < 2; x = x + 1) {
      let p = origin + vec2<i32>(x, y);
      if (all(p >= vec2<i32>(0)) && all(p < size)) {
        let sourcePixel = textureLoad(sourceColor, p, 0);
        count = count + 1.0;
        rgba = independentStableMix(rgba, sourcePixel, 1.0 / count);
        if (sourcePixel.a > 0.0) {
          let coc = independentPixelCoc(p, size);
          nearCoc = min(nearCoc, coc);
          farCoc = farCoc + max(coc, 0.0) * sourcePixel.a;
          farWeight = farWeight + sourcePixel.a;
        }
      }
    }
  }
  var coc = 0.0;
  if (farWeight > 0.0) { coc = farCoc / farWeight; }
  if (nearCoc < 0.0) { coc = nearCoc; }
  return IndependentDofPrefilter(rgba, coc);
}
`;

/** Half-size rgba32float premultiplied color, from a separate single-target pass. */
export const INDEPENDENT_DOF_PREFILTER_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_PREFILTER_COMMON_WGSL}
@fragment fn fs_dof_prefilter(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return independentPrefilter(position).rgba;
}
`;

/** Half-size rgba16float, with signed full-resolution-pixel CoC in red. */
export const INDEPENDENT_DOF_PREFILTER_COC_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_PREFILTER_COMMON_WGSL}
@fragment fn fs_dof_prefilter_coc(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(independentPrefilter(position).coc, 0.0, 0.0, 1.0);
}
`;

/** Binding 1: half-size CoC texture; output a near-blur maximum per 8×8 tile. */
export const INDEPENDENT_DOF_NEAR_TILE_WGSL = /* wgsl */ `
@group(0) @binding(1) var prefilterCoc: texture_2d<f32>;

@fragment fn fs_dof_near_tile(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<i32>(textureDimensions(prefilterCoc, 0));
  let origin = vec2<i32>(position.xy) * 8;
  var maximumNear = 0.0;
  for (var y = 0; y < 8; y = y + 1) {
    for (var x = 0; x < 8; x = x + 1) {
      let p = origin + vec2<i32>(x, y);
      if (all(p >= vec2<i32>(0)) && all(p < size)) {
        maximumNear = max(maximumNear, -textureLoad(prefilterCoc, p, 0).r);
      }
    }
  }
  return vec4<f32>(maximumNear, 0.0, 0.0, 1.0);
}
`;

/**
 * Shared gather code. Bindings 1, 2, 3 hold premultiplied RGBA, signed CoC,
 * and near tiles respectively. Both output passes use identical samples.
 * DOF_RINGS is clamped to three and gives at most 24 bounded disk samples.
 */
const INDEPENDENT_DOF_GATHER_COMMON_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_STABLE_MIX_WGSL}
override DOF_RINGS: u32 = 3u;
@group(0) @binding(1) var prefilterColor: texture_2d<f32>;
@group(0) @binding(2) var prefilterCoc: texture_2d<f32>;
@group(0) @binding(3) var nearTiles: texture_2d<f32>;

struct IndependentDofGather {
  rgba: vec4<f32>,
  influence: f32,
}

fn independentGather(position: vec4<f32>) -> IndependentDofGather {
  let size = vec2<i32>(textureDimensions(prefilterColor, 0));
  let pixel = clamp(vec2<i32>(position.xy), vec2<i32>(0), size - vec2<i32>(1));
  let center = textureLoad(prefilterColor, pixel, 0);
  let centerCoc = textureLoad(prefilterCoc, pixel, 0).r;
  let nearSize = vec2<i32>(textureDimensions(nearTiles, 0));
  let tile = clamp(pixel / vec2<i32>(8), vec2<i32>(0), nearSize - vec2<i32>(1));
  // A maximum 64 px full-resolution diameter reaches at most 16 half-size
  // pixels, or two 8×8 tiles, including across tile boundaries.
  var tileNear = 0.0;
  for (var y = -2; y <= 2; y = y + 1) {
    for (var x = -2; x <= 2; x = x + 1) {
      let neighbor = clamp(tile + vec2<i32>(x, y), vec2<i32>(0), nearSize - vec2<i32>(1));
      tileNear = max(tileNear, textureLoad(nearTiles, neighbor, 0).r);
    }
  }
  // CoC is a full-resolution diameter; its half-resolution radius is one quarter.
  let radius = min(0.25 * max(abs(centerCoc), tileNear), f32(max(size.x, size.y)));
  let centerRadius = 0.25 * abs(centerCoc);
  let ringCount = min(DOF_RINGS, 3u);
  if (radius < 0.5 || ringCount == 0u) {
    return IndependentDofGather(center, abs(centerCoc));
  }

  var mean = center;
  var count = 1.0;
  var influence = abs(centerCoc);
  let sampleCount = ringCount * 8u;
  for (var i = 0u; i < 24u; i = i + 1u) {
    if (i >= sampleCount) { break; }
    let distance = radius * sqrt((f32(i) + 0.5) / f32(sampleCount));
    let angle = f32(i) * 2.39996323;
    let offset = vec2<f32>(cos(angle), sin(angle)) * distance;
    let at = clamp(vec2<i32>(round(vec2<f32>(pixel) + offset)), vec2<i32>(0), size - vec2<i32>(1));
    let tap = textureLoad(prefilterColor, at, 0);
    let tapCoc = textureLoad(prefilterCoc, at, 0).r;
    let tapRadius = 0.25 * abs(tapCoc);
    // Only a near tap can spread by its own radius over a focused centre.
    let spread = select(centerRadius, max(centerRadius, tapRadius), tapCoc < 0.0);
    let coverage = clamp(spread + 0.5 - distance, 0.0, 1.0);
    // Uncovered samples retain the centre; this keeps all taps normalized and
    // permits both color and opacity to extend across transparent silhouettes.
    let contribution = independentStableMix(center, tap, coverage);
    count = count + 1.0;
    mean = independentStableMix(mean, contribution, 1.0 / count);
    if (tapCoc < 0.0) { influence = max(influence, -tapCoc * coverage); }
  }
  return IndependentDofGather(mean, influence);
}
`;

/** Half-size rgba32float gathered premultiplied RGBA. */
export const INDEPENDENT_DOF_GATHER_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_GATHER_COMMON_WGSL}
@fragment fn fs_dof_gather(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return independentGather(position).rgba;
}
`;

/** Half-size rgba16float gathered blur influence in red. */
export const INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_GATHER_COMMON_WGSL}
@fragment fn fs_dof_gather_influence(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(independentGather(position).influence, 0.0, 0.0, 1.0);
}
`;

/**
 * Binding 1: original color; 2: rgba32float gathered color; 3: rgba16float
 * influence; 4: a linear-clamp sampler for influence. Four bounded textureLoad
 * calls reconstruct gathered color without float32-filterable support.
 */
export const INDEPENDENT_DOF_COMPOSITE_WGSL = /* wgsl */ `
${INDEPENDENT_DOF_STABLE_MIX_WGSL}
@group(0) @binding(1) var sourceColor: texture_2d<f32>;
@group(0) @binding(2) var gatheredColor: texture_2d<f32>;
@group(0) @binding(3) var gatheredInfluence: texture_2d<f32>;
@group(0) @binding(4) var linearClamp: sampler;

fn independentBilinearGather(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(gatheredColor, 0));
  let point = uv * vec2<f32>(size) - vec2<f32>(0.5);
  let base = vec2<i32>(floor(point));
  let fraction = fract(point);
  let limit = size - vec2<i32>(1);
  let p00 = clamp(base, vec2<i32>(0), limit);
  let p10 = clamp(base + vec2<i32>(1, 0), vec2<i32>(0), limit);
  let p01 = clamp(base + vec2<i32>(0, 1), vec2<i32>(0), limit);
  let p11 = clamp(base + vec2<i32>(1, 1), vec2<i32>(0), limit);
  let row0 = independentStableMix(textureLoad(gatheredColor, p00, 0), textureLoad(gatheredColor, p10, 0), fraction.x);
  let row1 = independentStableMix(textureLoad(gatheredColor, p01, 0), textureLoad(gatheredColor, p11, 0), fraction.x);
  return independentStableMix(row0, row1, fraction.y);
}

@fragment fn fs_dof_composite(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<i32>(textureDimensions(sourceColor, 0));
  let pixel = clamp(vec2<i32>(position.xy), vec2<i32>(0), size - vec2<i32>(1));
  let original = textureLoad(sourceColor, pixel, 0);
  let uv = (vec2<f32>(pixel) + vec2<f32>(0.5)) / vec2<f32>(size);
  let filtered = independentBilinearGather(uv);
  let influence = textureSampleLevel(gatheredInfluence, linearClamp, uv, 0.0).r;
  let amount = clamp(influence - 0.5, 0.0, 1.0);
  return independentStableMix(original, filtered, amount);
}
`;
