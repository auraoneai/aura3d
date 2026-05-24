import type { LinearHdrEnvironmentMapSource } from "../../EnvironmentMapResources";

export type PMREMCubeFace = "px" | "nx" | "py" | "ny" | "pz" | "nz";

export interface PMREMLevel {
  readonly mip: number;
  readonly roughness: number;
  readonly faceSize: number;
}

export interface CubemapPMREMFace {
  readonly face: PMREMCubeFace;
  readonly width: number;
  readonly height: number;
  readonly data: Uint16Array;
}

export interface CubemapPMREMLevel extends PMREMLevel {
  readonly faces: readonly CubemapPMREMFace[];
}

export interface CubemapPMREMResources {
  readonly faceSize: number;
  readonly mipCount: number;
  readonly levels: readonly CubemapPMREMLevel[];
  readonly diagnostics: {
    readonly faceCount: 6;
    readonly sourceProjection: "equirectangular-to-cubemap";
    readonly filterModel: "ggx-importance-sampled-cubemap-prefilter";
    readonly shaderSampling: "webgl2-sampler-cube";
    readonly totalByteLength: number;
    readonly maxLinearValue: number;
  };
}

export interface CubemapPMREMAudit {
  readonly parity: "bounded-pmrem-audit-not-threejs-parity";
  readonly completeMipPyramid: boolean;
  readonly faceCount: number;
  readonly mipCount: number;
  readonly baseFaceSize: number;
  readonly totalByteLength: number;
  readonly maxEdgeMeanDelta: number;
  readonly luminanceVarianceByMip: readonly number[];
  readonly roughnessVarianceNonIncreasing: boolean;
  readonly roughestVarianceReduced: boolean;
}

export interface CubemapPMREMShaderContract {
  readonly sampling: "webgl2-sampler-cube";
  readonly mipSelection: "roughness-scaled-textureLod";
  readonly splitSumBRDF: true;
  readonly bindableTextureDimension: "cube";
  readonly requiredUniforms: readonly string[];
  readonly materialVariantCoverage: readonly string[];
  readonly faceCompleteness: boolean;
  readonly mipCount: number;
  readonly baseFaceSize: number;
  readonly lodRange: readonly [number, number];
  readonly fallback2DEnvironmentSpecularDisabled: true;
}

export interface CubemapPMREMOptions {
  readonly faceSize?: number;
  readonly mipCount?: number;
  readonly sampleCount?: number;
}

export interface PMREMTransmissionProbeOptions {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly viewDirection: readonly [number, number, number];
  readonly ior?: number;
  readonly roughness?: number;
  readonly thickness?: number;
  readonly attenuationDistance?: number;
  readonly attenuationColor?: readonly [number, number, number];
  readonly environmentBoxMin?: readonly [number, number, number];
  readonly environmentBoxMax?: readonly [number, number, number];
  readonly maxBounces?: number;
  readonly mipCount?: number;
}

export interface PMREMTransmissionProbeBounce {
  readonly bounce: number;
  readonly direction: readonly [number, number, number];
  readonly hitPosition: readonly [number, number, number];
  readonly hitNormal: readonly [number, number, number];
  readonly travelDistance: number;
  readonly lod: number;
  readonly attenuation: readonly [number, number, number];
  readonly causticEnergy: number;
}

export interface PMREMTransmissionProbe {
  readonly projection: "box-parallax-corrected-cubemap";
  readonly refractionModel: "ior-refract-with-reflection-fallback";
  readonly multiBounce: boolean;
  readonly bounces: readonly PMREMTransmissionProbeBounce[];
  readonly totalTravelDistance: number;
  readonly averageAttenuation: readonly [number, number, number];
  readonly causticEnergy: number;
  readonly recommendedLod: number;
}

const CUBE_FACES: readonly PMREMCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

export function generatePMREMLevels(faceSize = 256, mipCount = 9): readonly PMREMLevel[] {
  validatePositiveInteger(faceSize, "PMREM faceSize");
  validatePositiveInteger(mipCount, "PMREM mipCount");
  return Array.from({ length: mipCount }, (_, mip) => ({
    mip,
    roughness: mip / Math.max(1, mipCount - 1),
    faceSize: Math.max(1, faceSize >> mip)
  }));
}

export function generateCubemapPMREMResources(
  source: LinearHdrEnvironmentMapSource,
  options: CubemapPMREMOptions = {}
): CubemapPMREMResources {
  validateHdrSource(source);
  const faceSize = options.faceSize ?? 128;
  const mipCount = options.mipCount ?? Math.max(1, Math.floor(Math.log2(faceSize)) + 1);
  const sampleCount = options.sampleCount ?? 32;
  validatePositiveInteger(faceSize, "Cubemap PMREM faceSize");
  validatePositiveInteger(mipCount, "Cubemap PMREM mipCount");
  validatePositiveInteger(sampleCount, "Cubemap PMREM sampleCount");

  const averageRadiance = sourceAverageRadiance(source);
  const levels = generatePMREMLevels(faceSize, mipCount).map((level) => ({
    ...level,
    faces: CUBE_FACES.map((face) => projectPrefilteredFace(source, face, level.faceSize, level.roughness, sampleCount, averageRadiance))
  }));
  const totalByteLength = levels.reduce((total, level) => total + level.faces.reduce((faceTotal, face) => faceTotal + face.data.byteLength, 0), 0);
  return {
    faceSize,
    mipCount,
    levels,
    diagnostics: {
      faceCount: 6,
      sourceProjection: "equirectangular-to-cubemap",
      filterModel: "ggx-importance-sampled-cubemap-prefilter",
      shaderSampling: "webgl2-sampler-cube",
      totalByteLength,
      maxLinearValue: maxLinearValue(source.data)
    }
  };
}

export function auditCubemapPMREMResources(resources: CubemapPMREMResources): CubemapPMREMAudit {
  const expectedLevels = generatePMREMLevels(resources.faceSize, resources.mipCount);
  const completeMipPyramid = expectedLevels.every((expected) => {
    const level = resources.levels.find((candidate) => candidate.mip === expected.mip);
    return Boolean(level)
      && level!.faceSize === expected.faceSize
      && level!.faces.length === 6
      && CUBE_FACES.every((face) => {
        const faceData = level!.faces.find((candidate) => candidate.face === face);
        return Boolean(faceData)
          && faceData!.width === expected.faceSize
          && faceData!.height === expected.faceSize
          && faceData!.data.length === expected.faceSize * expected.faceSize * 4;
      });
  });
  const luminanceVarianceByMip = resources.levels.map((level) => levelLuminanceVariance(level));
  const roughnessVarianceNonIncreasing = luminanceVarianceByMip.every((variance, index) => {
    if (index === 0) return true;
    return variance <= (luminanceVarianceByMip[index - 1] ?? variance) + 0.0001;
  });
  const roughestVarianceReduced = (luminanceVarianceByMip.at(-1) ?? 0) < (luminanceVarianceByMip[0] ?? 0);
  return {
    parity: "bounded-pmrem-audit-not-threejs-parity",
    completeMipPyramid,
    faceCount: CUBE_FACES.length,
    mipCount: resources.levels.length,
    baseFaceSize: resources.faceSize,
    totalByteLength: resources.diagnostics.totalByteLength,
    maxEdgeMeanDelta: maxEdgeMeanDelta(resources.levels[0]),
    luminanceVarianceByMip,
    roughnessVarianceNonIncreasing,
    roughestVarianceReduced
  };
}

export function createCubemapPMREMShaderContract(resources: CubemapPMREMResources): CubemapPMREMShaderContract {
  const audit = auditCubemapPMREMResources(resources);
  return {
    sampling: "webgl2-sampler-cube",
    mipSelection: "roughness-scaled-textureLod",
    splitSumBRDF: true,
    bindableTextureDimension: "cube",
    requiredUniforms: [
      "u_environmentCubeMapTexture",
      "u_environmentCubeMapTextureEnabled",
      "u_environmentMapTextureMipCount",
      "u_environmentBrdfLutTexture",
      "u_environmentBrdfLutEnabled"
    ],
    materialVariantCoverage: [
      "PBRMaterial",
      "TexturedPBRMaterial",
      "SkinnedLitMaterial",
      "NormalMappedPBRMaterial",
      "InstancedPBRMaterial"
    ],
    faceCompleteness: audit.completeMipPyramid,
    mipCount: resources.mipCount,
    baseFaceSize: resources.faceSize,
    lodRange: [0, Math.max(0, resources.mipCount - 1)],
    fallback2DEnvironmentSpecularDisabled: true
  };
}

export function createPMREMTransmissionProbe(options: PMREMTransmissionProbeOptions): PMREMTransmissionProbe {
  const position = finiteVec3(options.position, "PMREM transmission probe position");
  const normal = normalize(finiteVec3(options.normal, "PMREM transmission probe normal"));
  const viewDirection = normalize(finiteVec3(options.viewDirection, "PMREM transmission probe viewDirection"));
  const ior = finitePositive(options.ior ?? 1.5, "PMREM transmission probe ior");
  const roughness = clampFinite(options.roughness ?? 0, 0, 1, "PMREM transmission probe roughness");
  const thickness = Math.max(0, finiteNumber(options.thickness ?? 0, "PMREM transmission probe thickness"));
  const attenuationDistance = finitePositive(options.attenuationDistance ?? 1_000_000, "PMREM transmission probe attenuationDistance");
  const attenuationColor = finiteColor(options.attenuationColor ?? [1, 1, 1], "PMREM transmission probe attenuationColor");
  const boxMin = finiteVec3(options.environmentBoxMin ?? [-1, -1, -1], "PMREM transmission probe environmentBoxMin");
  const boxMax = finiteVec3(options.environmentBoxMax ?? [1, 1, 1], "PMREM transmission probe environmentBoxMax");
  validateBox(boxMin, boxMax);
  const maxBounces = clampInteger(options.maxBounces ?? 2, 1, 4, "PMREM transmission probe maxBounces");
  const mipCount = clampInteger(options.mipCount ?? 9, 1, 16, "PMREM transmission probe mipCount");
  let origin = clampPointToBox(position, boxMin, boxMax);
  let direction = refract(scale(normalize(viewDirection), -1), normal, 1 / ior);
  if (length(direction) <= 1e-6) {
    direction = reflect(scale(normalize(viewDirection), -1), normal);
  }
  direction = normalize(direction);
  const bounces: PMREMTransmissionProbeBounce[] = [];
  let totalTravelDistance = 0;
  let attenuationProduct: readonly [number, number, number] = [1, 1, 1];
  let causticEnergy = 0;

  for (let bounce = 0; bounce < maxBounces; bounce += 1) {
    const hit = intersectBox(origin, direction, boxMin, boxMax);
    if (!hit) break;
    const travelDistance = hit.distance;
    totalTravelDistance += travelDistance;
    const volumeTravel = thickness <= 0 ? 0 : (thickness * (bounce + 1) + travelDistance * 0.08) / attenuationDistance;
    const attenuation: readonly [number, number, number] = [
      attenuationProduct[0] * attenuationColor[0] ** volumeTravel,
      attenuationProduct[1] * attenuationColor[1] ** volumeTravel,
      attenuationProduct[2] * attenuationColor[2] ** volumeTravel
    ];
    attenuationProduct = attenuation;
    const lod = clamp((roughness + bounce * 0.08 + Math.min(0.24, travelDistance * 0.015)) * (mipCount - 1), 0, mipCount - 1);
    const bounceCaustic = (1 - roughness) ** 2 * average3(attenuation) / (1 + travelDistance * 0.35) / (bounce + 1);
    causticEnergy += bounceCaustic;
    bounces.push({
      bounce,
      direction,
      hitPosition: hit.position,
      hitNormal: hit.normal,
      travelDistance,
      lod,
      attenuation,
      causticEnergy: bounceCaustic
    });
    origin = add(hit.position, scale(hit.normal, -0.001));
    direction = normalize(reflect(direction, hit.normal));
  }

  const recommendedLod = bounces.length === 0 ? roughness * (mipCount - 1) : bounces.reduce((total, bounce) => total + bounce.lod, 0) / bounces.length;
  return {
    projection: "box-parallax-corrected-cubemap",
    refractionModel: "ior-refract-with-reflection-fallback",
    multiBounce: bounces.length > 1,
    bounces,
    totalTravelDistance,
    averageAttenuation: attenuationProduct,
    causticEnergy,
    recommendedLod
  };
}

function projectPrefilteredFace(
  source: LinearHdrEnvironmentMapSource,
  face: PMREMCubeFace,
  faceSize: number,
  roughness: number,
  sampleCount: number,
  averageRadiance: readonly [number, number, number]
): CubemapPMREMFace {
  const data = new Uint16Array(faceSize * faceSize * 4);
  for (let y = 0; y < faceSize; y += 1) {
    const v = ((y + 0.5) / faceSize) * 2 - 1;
    for (let x = 0; x < faceSize; x += 1) {
      const u = ((x + 0.5) / faceSize) * 2 - 1;
      const direction = normalize(faceDirection(face, u, v));
      const color = samplePrefilteredDirection(source, direction, roughness, sampleCount, averageRadiance);
      const offset = (y * faceSize + x) * 4;
      data[offset] = numberToHalfFloat(color[0]);
      data[offset + 1] = numberToHalfFloat(color[1]);
      data[offset + 2] = numberToHalfFloat(color[2]);
      data[offset + 3] = numberToHalfFloat(1);
    }
  }
  return { face, width: faceSize, height: faceSize, data };
}

function samplePrefilteredDirection(
  source: LinearHdrEnvironmentMapSource,
  direction: readonly [number, number, number],
  roughness: number,
  sampleCount: number,
  averageRadiance: readonly [number, number, number]
): readonly [number, number, number] {
  if (roughness <= 0.0001 || sampleCount <= 1) {
    return sampleEquirect(source, direction);
  }
  const normal = normalize(direction);
  const view = normal;
  let red = 0;
  let green = 0;
  let blue = 0;
  let weightTotal = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const halfVector = importanceSampleGGX(
      [(sample + 0.5) / sampleCount, radicalInverseVdc(sample)],
      normal,
      roughness
    );
    const viewDotHalf = Math.max(0, dot(view, halfVector));
    const light = normalize([
      2 * viewDotHalf * halfVector[0] - view[0],
      2 * viewDotHalf * halfVector[1] - view[1],
      2 * viewDotHalf * halfVector[2] - view[2]
    ]);
    const weight = Math.max(0, dot(normal, light));
    if (weight <= 0) continue;
    const color = sampleEquirect(source, light);
    red += color[0] * weight;
    green += color[1] * weight;
    blue += color[2] * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return averageRadiance;
  const filtered: readonly [number, number, number] = [red / weightTotal, green / weightTotal, blue / weightTotal];
  const wideLobeBlend = Math.min(0.82, roughness ** 4 * 0.82);
  return [
    filtered[0] * (1 - wideLobeBlend) + averageRadiance[0] * wideLobeBlend,
    filtered[1] * (1 - wideLobeBlend) + averageRadiance[1] * wideLobeBlend,
    filtered[2] * (1 - wideLobeBlend) + averageRadiance[2] * wideLobeBlend
  ];
}

function importanceSampleGGX(
  xi: readonly [number, number],
  normal: readonly [number, number, number],
  roughness: number
): readonly [number, number, number] {
  const alpha = Math.max(0.001, roughness * roughness);
  const alphaSquared = alpha * alpha;
  const phi = 2 * Math.PI * xi[0];
  const cosTheta = Math.sqrt((1 - xi[1]) / Math.max(0.000001, 1 + (alphaSquared - 1) * xi[1]));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const tangent = Math.abs(normal[1]) < 0.95
    ? normalize(cross([0, 1, 0], normal))
    : normalize(cross([1, 0, 0], normal));
  const bitangent = normalize(cross(normal, tangent));
  return normalize([
    tangent[0] * Math.cos(phi) * sinTheta + bitangent[0] * Math.sin(phi) * sinTheta + normal[0] * cosTheta,
    tangent[1] * Math.cos(phi) * sinTheta + bitangent[1] * Math.sin(phi) * sinTheta + normal[1] * cosTheta,
    tangent[2] * Math.cos(phi) * sinTheta + bitangent[2] * Math.sin(phi) * sinTheta + normal[2] * cosTheta
  ]);
}

function radicalInverseVdc(bits: number): number {
  let value = bits >>> 0;
  value = (value << 16) | (value >>> 16);
  value = ((value & 0x55555555) << 1) | ((value & 0xaaaaaaaa) >>> 1);
  value = ((value & 0x33333333) << 2) | ((value & 0xcccccccc) >>> 2);
  value = ((value & 0x0f0f0f0f) << 4) | ((value & 0xf0f0f0f0) >>> 4);
  value = ((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8);
  return value * 2.3283064365386963e-10;
}

function sampleEquirect(
  source: LinearHdrEnvironmentMapSource,
  direction: readonly [number, number, number]
): readonly [number, number, number] {
  const u = 0.5 + Math.atan2(direction[2], direction[0]) / (Math.PI * 2);
  const v = 0.5 - Math.asin(clamp(direction[1], -1, 1)) / Math.PI;
  const sampleX = u * source.width - 0.5;
  const sampleY = v * source.height - 0.5;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  const topLeft = sampleEquirectTexel(source, x0, y0);
  const topRight = sampleEquirectTexel(source, x1, y0);
  const bottomLeft = sampleEquirectTexel(source, x0, y1);
  const bottomRight = sampleEquirectTexel(source, x1, y1);
  const top = mixRgb(topLeft, topRight, tx);
  const bottom = mixRgb(bottomLeft, bottomRight, tx);
  return mixRgb(top, bottom, ty);
}

function sampleEquirectTexel(
  source: LinearHdrEnvironmentMapSource,
  x: number,
  y: number
): readonly [number, number, number] {
  const pixelX = wrap(x, source.width);
  const pixelY = clamp(y, 0, source.height - 1);
  const offset = (pixelY * source.width + pixelX) * 4;
  return [
    Math.max(0, source.data[offset] ?? 0),
    Math.max(0, source.data[offset + 1] ?? 0),
    Math.max(0, source.data[offset + 2] ?? 0)
  ];
}

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): readonly [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function sourceAverageRadiance(source: LinearHdrEnvironmentMapSource): readonly [number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    red += Math.max(0, source.data[offset] ?? 0);
    green += Math.max(0, source.data[offset + 1] ?? 0);
    blue += Math.max(0, source.data[offset + 2] ?? 0);
    count += 1;
  }
  return [red / Math.max(1, count), green / Math.max(1, count), blue / Math.max(1, count)];
}

function faceDirection(face: PMREMCubeFace, u: number, v: number): readonly [number, number, number] {
  switch (face) {
    case "px": return [1, -v, -u];
    case "nx": return [-1, -v, u];
    case "py": return [u, 1, v];
    case "ny": return [u, -1, -v];
    case "pz": return [u, -v, 1];
    case "nz": return [-u, -v, -1];
  }
}

function normalize(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 0) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function maxLinearValue(data: Float32Array | readonly number[]): number {
  let max = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    max = Math.max(max, data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
  }
  return max;
}

function maxEdgeMeanDelta(level: CubemapPMREMLevel | undefined): number {
  if (!level) return 0;
  const edges = level.faces.flatMap((face) => [
    edgeMean(face, "top"),
    edgeMean(face, "right"),
    edgeMean(face, "bottom"),
    edgeMean(face, "left")
  ]);
  let maxDelta = 0;
  for (let a = 0; a < edges.length; a += 1) {
    for (let b = a + 1; b < edges.length; b += 1) {
      maxDelta = Math.max(maxDelta, colorDistance(edges[a]!, edges[b]!));
    }
  }
  return Number(maxDelta.toFixed(6));
}

function edgeMean(face: CubemapPMREMFace, edge: "top" | "right" | "bottom" | "left"): readonly [number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const size = face.width;
  for (let i = 0; i < size; i += 1) {
    const x = edge === "left" ? 0 : edge === "right" ? size - 1 : i;
    const y = edge === "top" ? 0 : edge === "bottom" ? size - 1 : i;
    const offset = (y * size + x) * 4;
    red += halfFloatToNumber(face.data[offset] ?? 0);
    green += halfFloatToNumber(face.data[offset + 1] ?? 0);
    blue += halfFloatToNumber(face.data[offset + 2] ?? 0);
    count += 1;
  }
  return [red / count, green / count, blue / count];
}

function levelLuminanceVariance(level: CubemapPMREMLevel): number {
  const values: number[] = [];
  for (const face of level.faces) {
    for (let offset = 0; offset < face.data.length; offset += 4) {
      values.push(
        halfFloatToNumber(face.data[offset] ?? 0) * 0.2126
        + halfFloatToNumber(face.data[offset + 1] ?? 0) * 0.7152
        + halfFloatToNumber(face.data[offset + 2] ?? 0) * 0.0722
      );
    }
  }
  const mean = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return Number(variance.toFixed(6));
}

function colorDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function halfFloatToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function validateHdrSource(source: LinearHdrEnvironmentMapSource): void {
  validatePositiveInteger(source.width, "Cubemap PMREM source width");
  validatePositiveInteger(source.height, "Cubemap PMREM source height");
  if (source.data.length !== source.width * source.height * 4) {
    throw new RangeError("Cubemap PMREM source data must contain width * height * 4 linear RGBA values");
  }
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function finiteVec3(value: readonly [number, number, number], label: string): readonly [number, number, number] {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`${label} must contain three finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

function finiteColor(value: readonly [number, number, number], label: string): readonly [number, number, number] {
  const color = finiteVec3(value, label);
  if (color.some((component) => component < 0 || component > 1)) {
    throw new RangeError(`${label} must be in the [0, 1] range`);
  }
  return color;
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return value;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
  return value;
}

function clampFinite(value: number, min: number, max: number, label: string): number {
  return clamp(finiteNumber(value, label), min, max);
}

function clampInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer`);
  }
  return Math.max(min, Math.min(max, value));
}

function validateBox(min: readonly [number, number, number], max: readonly [number, number, number]): void {
  if (min.some((component, index) => component >= max[index]!)) {
    throw new RangeError("PMREM transmission probe environment box min values must be lower than max values");
  }
}

function clampPointToBox(point: readonly [number, number, number], min: readonly [number, number, number], max: readonly [number, number, number]): readonly [number, number, number] {
  return [
    clamp(point[0], min[0] + 0.0001, max[0] - 0.0001),
    clamp(point[1], min[1] + 0.0001, max[1] - 0.0001),
    clamp(point[2], min[2] + 0.0001, max[2] - 0.0001)
  ];
}

function intersectBox(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  min: readonly [number, number, number],
  max: readonly [number, number, number]
): { readonly position: readonly [number, number, number]; readonly normal: readonly [number, number, number]; readonly distance: number } | undefined {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestNormal: readonly [number, number, number] | undefined;
  for (let axis = 0; axis < 3; axis += 1) {
    const component = direction[axis]!;
    if (Math.abs(component) <= 1e-8) continue;
    const plane = component > 0 ? max[axis]! : min[axis]!;
    const distance = (plane - origin[axis]!) / component;
    if (distance <= 1e-6 || distance >= bestDistance) continue;
    const hit: readonly [number, number, number] = [
      origin[0] + direction[0] * distance,
      origin[1] + direction[1] * distance,
      origin[2] + direction[2] * distance
    ];
    if (
      hit[0] < min[0] - 1e-5 || hit[0] > max[0] + 1e-5 ||
      hit[1] < min[1] - 1e-5 || hit[1] > max[1] + 1e-5 ||
      hit[2] < min[2] - 1e-5 || hit[2] > max[2] + 1e-5
    ) {
      continue;
    }
    bestDistance = distance;
    bestNormal = axis === 0
      ? [component > 0 ? 1 : -1, 0, 0]
      : axis === 1
        ? [0, component > 0 ? 1 : -1, 0]
        : [0, 0, component > 0 ? 1 : -1];
  }
  if (!bestNormal || !Number.isFinite(bestDistance)) return undefined;
  return {
    position: [
      origin[0] + direction[0] * bestDistance,
      origin[1] + direction[1] * bestDistance,
      origin[2] + direction[2] * bestDistance
    ],
    normal: bestNormal,
    distance: bestDistance
  };
}

function length(vector: readonly [number, number, number]): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function scale(vector: readonly [number, number, number], scalar: number): readonly [number, number, number] {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function reflect(vector: readonly [number, number, number], normal: readonly [number, number, number]): readonly [number, number, number] {
  return subtract(vector, scale(normal, 2 * dot(vector, normal)));
}

function refract(vector: readonly [number, number, number], normal: readonly [number, number, number], eta: number): readonly [number, number, number] {
  const cosi = clamp(dot(scale(vector, -1), normal), -1, 1);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return [0, 0, 0];
  return add(scale(vector, eta), scale(normal, eta * cosi - Math.sqrt(k)));
}

function add(left: readonly [number, number, number], right: readonly [number, number, number]): readonly [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: readonly [number, number, number], right: readonly [number, number, number]): readonly [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function average3(value: readonly [number, number, number]): number {
  return (value[0] + value[1] + value[2]) / 3;
}

function numberToHalfFloat(value: number): number {
  const clamped = Math.max(0, value);
  if (Number.isNaN(clamped)) return 0x7e00;
  if (clamped === Infinity) return 0x7c00;
  if (clamped >= 65504) return 0x7bff;
  if (clamped === 0) return 0;
  if (clamped < 2 ** -14) {
    return Math.round(clamped / 2 ** -24);
  }
  const exponent = Math.floor(Math.log2(clamped));
  const mantissa = Math.round((clamped / 2 ** exponent - 1) * 1024);
  return ((exponent + 15) << 10) | (mantissa & 0x03ff);
}
