export type OceanFixturePreset = "calm" | "moderate" | "rough" | "storm";

export interface OceanFixtureOptions {
  readonly preset?: OceanFixturePreset;
  readonly seed?: number;
  readonly elapsedSeconds?: number;
  readonly sampleCount?: number;
  readonly cameraX?: number;
}

export interface OceanWaveDescriptor {
  readonly amplitude: number;
  readonly wavelength: number;
  readonly speed: number;
  readonly direction: readonly [number, number];
  readonly steepness: number;
}

export interface OceanWaveSample {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly horizontalDisplacement: readonly [number, number];
  readonly normal: readonly [number, number, number];
  readonly foam: number;
}

export interface OceanFoamPatch {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly intensity: number;
  readonly radius: number;
}

export interface OceanBuoyancySample {
  readonly objectId: "marker-buoy";
  readonly samplePointCount: number;
  readonly submergedPointCount: number;
  readonly waterHeight: number;
  readonly submergedVolume: number;
  readonly force: readonly [number, number, number];
  readonly drag: readonly [number, number, number];
}

export interface OceanFixtureSample {
  readonly id: "external-parity-old-branch-ocean-fixture";
  readonly source: "origin-master-ocean-gerstner-foam-buoyancy-adapted";
  readonly sourceFiles: readonly string[];
  readonly preset: OceanFixturePreset;
  readonly seed: number;
  readonly elapsedSeconds: number;
  readonly waveCount: number;
  readonly waves: readonly OceanWaveDescriptor[];
  readonly samples: readonly OceanWaveSample[];
  readonly foamPatches: readonly OceanFoamPatch[];
  readonly buoyancy: OceanBuoyancySample;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly averageHeight: number;
  readonly averageFoam: number;
  readonly maxFoam: number;
  readonly hash: string;
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
}

const sourceFiles = [
  "origin/master:src/ocean/GerstnerWaves.ts",
  "origin/master:src/ocean/FoamGenerator.ts",
  "origin/master:src/ocean/BuoyancySystem.ts",
  "origin/master:src/ocean/OceanFFT.ts",
  "origin/master:src/ocean/OceanRenderer.ts"
] as const;

const blockedClaims = [
  "FFT ocean spectrum parity",
  "planar reflection/refraction water renderer",
  "underwater volume rendering",
  "screen-space caustics parity",
  "shoreline foam simulation",
  "production buoyancy physics",
  "Unity HDRP water parity",
  "Unreal Water plugin parity"
] as const;

export function sampleOceanFixture(options: OceanFixtureOptions = {}): OceanFixtureSample {
  const preset = options.preset ?? "moderate";
  const seed = integerOption(options.seed ?? 0x0cea6, "seed");
  const elapsedSeconds = nonNegativeNumber(options.elapsedSeconds ?? 0, "elapsedSeconds");
  const sampleCount = integerRange(options.sampleCount ?? 9, 5, 32, "sampleCount");
  const cameraX = finiteNumber(options.cameraX ?? 0, "cameraX");
  const waves = oceanPresetWaves(preset);
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const t = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const x = round3(-1.2 + t * 2.4 + Math.sin(seed + index) * 0.035 + cameraX * 0.08);
    const z = round3(0.42 + Math.cos(seed * 0.17 + index) * 0.08);
    const evaluated = evaluateWaves(waves, x, z, elapsedSeconds);
    const compression = waveCompression(waves, x, z, elapsedSeconds);
    const crestFoam = Math.abs(evaluated.height) * (preset === "calm" ? 0.16 : 0.42);
    const foam = round3(Math.max(0, (1.08 - compression) * 1.45 + crestFoam));
    return {
      x,
      z,
      height: evaluated.height,
      horizontalDisplacement: evaluated.horizontalDisplacement,
      normal: evaluated.normal,
      foam
    };
  });
  const foamPatches = samples
    .filter((sample) => sample.foam > 0.08)
    .slice(0, 8)
    .map((sample, index) => ({
      id: `ocean-foam-${index}`,
      x: sample.x,
      z: sample.z,
      intensity: sample.foam,
      radius: round3(0.035 + sample.foam * 0.04)
    }));
  const buoyancy = calculateBuoyancy(waves, elapsedSeconds, cameraX);
  const heights = samples.map((sample) => sample.height);
  const foams = samples.map((sample) => sample.foam);
  const hash = stableHash([
    preset,
    seed,
    elapsedSeconds.toFixed(3),
    samples.map((sample) => `${sample.x}:${sample.height}:${sample.foam}`).join("|"),
    foamPatches.length,
    buoyancy.force.join(",")
  ].join("#"));
  return {
    id: "external-parity-old-branch-ocean-fixture",
    source: "origin-master-ocean-gerstner-foam-buoyancy-adapted",
    sourceFiles,
    preset,
    seed,
    elapsedSeconds: round3(elapsedSeconds),
    waveCount: waves.length,
    waves,
    samples,
    foamPatches,
    buoyancy,
    minHeight: round3(Math.min(...heights)),
    maxHeight: round3(Math.max(...heights)),
    averageHeight: round3(heights.reduce((sum, value) => sum + value, 0) / heights.length),
    averageFoam: round3(foams.reduce((sum, value) => sum + value, 0) / foams.length),
    maxFoam: round3(Math.max(...foams)),
    hash,
    claimBoundary: "This adapts old Gerstner, foam, and buoyancy concepts into deterministic local telemetry and simple markers; it does not implement a production ocean renderer.",
    blockedClaims
  };
}

function oceanPresetWaves(preset: OceanFixturePreset): readonly OceanWaveDescriptor[] {
  if (preset === "calm") {
    return [
      wave(0.045, 0.9, 0.55, [1, 0.12], 0.2),
      wave(0.026, 0.48, 0.42, [0.58, 0.82], 0.18)
    ];
  }
  if (preset === "rough") {
    return [
      wave(0.13, 1.4, 0.86, [1, 0.08], 0.58),
      wave(0.09, 0.82, 0.72, [0.86, 0.5], 0.48),
      wave(0.052, 0.46, 0.58, [0.54, 0.84], 0.42),
      wave(0.032, 0.28, 0.48, [0.35, 0.94], 0.36)
    ];
  }
  if (preset === "storm") {
    return [
      wave(0.18, 1.75, 1.02, [1, 0.06], 0.72),
      wave(0.13, 1.08, 0.88, [0.92, 0.39], 0.62),
      wave(0.082, 0.62, 0.75, [0.76, 0.65], 0.54),
      wave(0.052, 0.36, 0.62, [0.48, 0.88], 0.48),
      wave(0.034, 0.22, 0.52, [0.28, 0.96], 0.42)
    ];
  }
  return [
    wave(0.08, 1.1, 0.72, [1, 0.1], 0.38),
    wave(0.055, 0.68, 0.58, [0.8, 0.6], 0.32),
    wave(0.036, 0.38, 0.46, [0.6, 0.8], 0.28)
  ];
}

function wave(amplitude: number, wavelength: number, speed: number, direction: readonly [number, number], steepness: number): OceanWaveDescriptor {
  const length = Math.hypot(direction[0], direction[1]) || 1;
  return {
    amplitude,
    wavelength,
    speed,
    direction: [round3(direction[0] / length), round3(direction[1] / length)],
    steepness: Math.min(1, steepness)
  };
}

function evaluateWaves(waves: readonly OceanWaveDescriptor[], x: number, z: number, time: number): {
  readonly height: number;
  readonly horizontalDisplacement: readonly [number, number];
  readonly normal: readonly [number, number, number];
} {
  let height = 0;
  let dx = 0;
  let dz = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  for (const descriptor of waves) {
    const k = (2 * Math.PI) / descriptor.wavelength;
    const omega = descriptor.speed * k;
    const phase = k * (descriptor.direction[0] * x + descriptor.direction[1] * z) - omega * time;
    const sin = Math.sin(phase);
    const cos = Math.cos(phase);
    const q = descriptor.steepness / Math.max(0.0001, descriptor.amplitude * k * waves.length);
    const waveAmplitude = k * descriptor.amplitude;
    height += descriptor.amplitude * sin;
    dx += q * descriptor.amplitude * descriptor.direction[0] * cos;
    dz += q * descriptor.amplitude * descriptor.direction[1] * cos;
    nx -= descriptor.direction[0] * waveAmplitude * cos;
    ny -= q * waveAmplitude * sin;
    nz -= descriptor.direction[1] * waveAmplitude * cos;
  }
  const normalLength = Math.hypot(nx, ny, nz) || 1;
  return {
    height: round3(height),
    horizontalDisplacement: [round3(dx), round3(dz)],
    normal: [round3(nx / normalLength), round3(ny / normalLength), round3(nz / normalLength)]
  };
}

function waveCompression(waves: readonly OceanWaveDescriptor[], x: number, z: number, time: number): number {
  let compression = 1;
  for (const descriptor of waves) {
    const k = (2 * Math.PI) / descriptor.wavelength;
    const omega = descriptor.speed * k;
    const phase = k * (descriptor.direction[0] * x + descriptor.direction[1] * z) - omega * time;
    compression -= descriptor.steepness * descriptor.amplitude * k * Math.sin(phase) * 0.35;
  }
  return round3(compression);
}

function calculateBuoyancy(waves: readonly OceanWaveDescriptor[], time: number, cameraX: number): OceanBuoyancySample {
  const position: [number, number, number] = [round3(cameraX * 0.04), -0.12, 0.44];
  const velocity: [number, number, number] = [0.18, 0, -0.04];
  const samplePoints: readonly (readonly [number, number, number])[] = [
    [-0.08, -0.035, -0.045],
    [0.08, -0.035, -0.045],
    [-0.08, -0.035, 0.045],
    [0.08, -0.035, 0.045],
    [0, 0.035, 0]
  ];
  const mass = 18;
  const volume = 0.055;
  const density = 1000;
  const gravity = 9.81;
  let submerged = 0;
  let waterHeightSum = 0;
  let buoyancyY = -mass * gravity;
  let dragX = 0;
  let dragZ = 0;
  for (const point of samplePoints) {
    const worldX = position[0] + point[0];
    const worldY = position[1] + point[1];
    const worldZ = position[2] + point[2];
    const waterHeight = evaluateWaves(waves, worldX, worldZ, time).height;
    waterHeightSum += waterHeight;
    const depth = waterHeight - worldY;
    if (depth <= 0) continue;
    submerged += 1;
    buoyancyY += density * gravity * depth / samplePoints.length;
    const speedSq = velocity[0] * velocity[0] + velocity[2] * velocity[2];
    const drag = 0.5 * density * 0.38 * depth * speedSq / samplePoints.length;
    dragX -= velocity[0] * drag;
    dragZ -= velocity[2] * drag;
  }
  return {
    objectId: "marker-buoy",
    samplePointCount: samplePoints.length,
    submergedPointCount: submerged,
    waterHeight: round3(waterHeightSum / samplePoints.length),
    submergedVolume: round3((submerged / samplePoints.length) * volume),
    force: [round3(dragX), round3(buoyancyY), round3(dragZ)],
    drag: [round3(dragX), 0, round3(dragZ)]
  };
}

function integerOption(value: number, name: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer.`);
  return value;
}

function integerRange(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be non-negative.`);
  return value;
}

function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
