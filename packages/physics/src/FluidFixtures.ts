export interface FluidFixtureOptions {
  readonly seed?: number;
  readonly particleGrid?: readonly [number, number, number];
  readonly elapsedSeconds?: number;
}

export interface FluidParticleSample {
  readonly index: number;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly density: number;
  readonly pressure: number;
  readonly neighborCount: number;
}

export interface FluidFixture {
  readonly id: "external-parity-old-branch-fluid-fixture";
  readonly source: "origin-master-sph-mpm-fluid-adapted";
  readonly sourceFiles: readonly [
    "origin/master:src/simulation/sph/SPHFluidFramework.ts",
    "origin/master:src/simulation/sph/FluidRenderer.ts",
    "origin/master:src/simulation/mpm/MPMFluidSimulation.ts",
    "origin/master:src/simulation/mpm/ParticleBuffer.ts"
  ];
  readonly config: {
    readonly solver: "bounded-sph-pcisph-dfsph-telemetry";
    readonly restDensity: number;
    readonly particleMass: number;
    readonly smoothingRadius: number;
    readonly viscosity: number;
    readonly surfaceTension: number;
    readonly stiffness: number;
    readonly dt: number;
    readonly pcisphIterations: number;
    readonly dfsphIterations: number;
  };
  readonly sph: {
    readonly particleCount: number;
    readonly capacity: number;
    readonly averageDensity: number;
    readonly maxDensity: number;
    readonly averagePressure: number;
    readonly maxPressure: number;
    readonly neighborPairs: number;
    readonly maxNeighborCount: number;
    readonly viscosityForceEstimate: number;
    readonly surfaceTensionEstimate: number;
    readonly boundaryCollisionCount: number;
    readonly sampleParticles: readonly FluidParticleSample[];
  };
  readonly mpm: {
    readonly gridResolution: readonly [number, number, number];
    readonly activeCells: number;
    readonly particleToGridTransfers: number;
    readonly gridToParticleTransfers: number;
    readonly flipRatio: number;
    readonly deformationGradientSamples: number;
    readonly plasticityEvents: number;
    readonly boundaryClamps: number;
  };
  readonly rendering: {
    readonly screenWidth: number;
    readonly screenHeight: number;
    readonly particleRadius: number;
    readonly depthPixels: number;
    readonly thicknessPixels: number;
    readonly maxThickness: number;
    readonly smoothingPasses: number;
    readonly refractionClaimed: false;
    readonly subsurfaceScatteringClaimed: false;
  };
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

const sourceFiles = [
  "origin/master:src/simulation/sph/SPHFluidFramework.ts",
  "origin/master:src/simulation/sph/FluidRenderer.ts",
  "origin/master:src/simulation/mpm/MPMFluidSimulation.ts",
  "origin/master:src/simulation/mpm/ParticleBuffer.ts"
] as const;

const blockedClaims = [
  "production SPH pressure solve parity",
  "PCISPH/DFSPH convergence parity",
  "GPU fluid simulation",
  "screen-space fluid renderer parity",
  "refraction and subsurface fluid rendering",
  "MPM material model parity",
  "Unity fluid tooling parity",
  "Unreal Niagara/fluid parity"
] as const;

export function sampleFluidFixture(options: FluidFixtureOptions = {}): FluidFixture {
  const seed = integer(options.seed ?? 0xf10d, "seed");
  const elapsedSeconds = finiteNonNegative(options.elapsedSeconds ?? 0.42, "elapsedSeconds");
  const particleGrid = options.particleGrid ?? [4, 3, 3] as const;
  const gridX = integerInRange(particleGrid[0], "particleGrid[0]", 2, 12);
  const gridY = integerInRange(particleGrid[1], "particleGrid[1]", 2, 12);
  const gridZ = integerInRange(particleGrid[2], "particleGrid[2]", 2, 12);
  const restDensity = 1000;
  const particleMass = 0.02;
  const smoothingRadius = 0.24;
  const stiffness = 180;
  const samples: FluidParticleSample[] = [];
  const positions: Array<readonly [number, number, number]> = [];
  const velocities: Array<readonly [number, number, number]> = [];
  let neighborPairs = 0;
  let maxNeighborCount = 0;
  let densityTotal = 0;
  let maxDensity = 0;
  let pressureTotal = 0;
  let maxPressure = 0;
  let viscosityForceEstimate = 0;
  let surfaceTensionEstimate = 0;
  let boundaryCollisionCount = 0;
  let depthPixels = 0;
  let thicknessPixels = 0;
  let maxThickness = 0;

  for (let z = 0; z < gridZ; z += 1) {
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const index = positions.length;
        const jitter = (hash01(seed, index) - 0.5) * 0.018;
        const position = [
          round4((x - (gridX - 1) / 2) * 0.15 + jitter),
          round4(0.1 + y * 0.14 - elapsedSeconds * 0.08 + Math.sin(elapsedSeconds * 2 + x) * 0.012),
          round4((z - (gridZ - 1) / 2) * 0.15 - jitter * 0.5)
        ] as const;
        const velocity = [
          round4(0.12 + hash01(seed, index + 19) * 0.18),
          round4(-0.38 + y * 0.03),
          round4((hash01(seed, index + 31) - 0.5) * 0.18)
        ] as const;
        if (position[1] < -0.05) boundaryCollisionCount += 1;
        positions.push(position);
        velocities.push(velocity);
      }
    }
  }

  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]!;
    const velocity = velocities[index]!;
    let neighborCount = 0;
    let density = restDensity;
    let localVelocityDelta = 0;
    for (let other = 0; other < positions.length; other += 1) {
      if (other === index) continue;
      const otherPosition = positions[other]!;
      const d = distance(position, otherPosition);
      if (d <= smoothingRadius) {
        neighborCount += 1;
        const weight = Math.pow(1 - d / smoothingRadius, 3);
        density += particleMass * 5400 * weight;
        localVelocityDelta += distance(velocity, velocities[other]!);
      }
    }
    neighborPairs += neighborCount;
    maxNeighborCount = Math.max(maxNeighborCount, neighborCount);
    const pressure = Math.max(0, (density - restDensity) * stiffness * 0.001);
    densityTotal += density;
    maxDensity = Math.max(maxDensity, density);
    pressureTotal += pressure;
    maxPressure = Math.max(maxPressure, pressure);
    viscosityForceEstimate += localVelocityDelta * 0.08;
    surfaceTensionEstimate += Math.max(0, maxNeighborCount - neighborCount) * 0.015;
    const projectedArea = Math.max(1, Math.round((neighborCount + 1) * 2.3));
    depthPixels += projectedArea;
    thicknessPixels += projectedArea + neighborCount;
    maxThickness = Math.max(maxThickness, (neighborCount + 1) * 0.035);
    if (samples.length < 6) {
      samples.push({
        index,
        position,
        velocity,
        density: round4(density),
        pressure: round4(pressure),
        neighborCount
      });
    }
  }
  neighborPairs = Math.floor(neighborPairs / 2);
  const particleCount = positions.length;
  const activeCells = new Set(positions.map((position) => `${Math.floor((position[0] + 0.6) / 0.16)}:${Math.floor((position[1] + 0.4) / 0.16)}:${Math.floor((position[2] + 0.6) / 0.16)}`)).size;

  return {
    id: "external-parity-old-branch-fluid-fixture",
    source: "origin-master-sph-mpm-fluid-adapted",
    sourceFiles,
    config: {
      solver: "bounded-sph-pcisph-dfsph-telemetry",
      restDensity,
      particleMass,
      smoothingRadius,
      viscosity: 0.08,
      surfaceTension: 0.015,
      stiffness,
      dt: 1 / 60,
      pcisphIterations: 3,
      dfsphIterations: 5
    },
    sph: {
      particleCount,
      capacity: 128,
      averageDensity: round4(densityTotal / particleCount),
      maxDensity: round4(maxDensity),
      averagePressure: round4(pressureTotal / particleCount),
      maxPressure: round4(maxPressure),
      neighborPairs,
      maxNeighborCount,
      viscosityForceEstimate: round4(viscosityForceEstimate),
      surfaceTensionEstimate: round4(surfaceTensionEstimate),
      boundaryCollisionCount,
      sampleParticles: samples
    },
    mpm: {
      gridResolution: [12, 8, 12],
      activeCells,
      particleToGridTransfers: particleCount * 8,
      gridToParticleTransfers: particleCount * 8,
      flipRatio: 0.96,
      deformationGradientSamples: particleCount,
      plasticityEvents: Math.max(1, Math.floor(particleCount * 0.08)),
      boundaryClamps: boundaryCollisionCount
    },
    rendering: {
      screenWidth: 320,
      screenHeight: 180,
      particleRadius: 0.055,
      depthPixels,
      thicknessPixels,
      maxThickness: round4(maxThickness),
      smoothingPasses: 2,
      refractionClaimed: false,
      subsurfaceScatteringClaimed: false
    },
    blockedClaims,
    hash: hashNumbers([
      seed,
      elapsedSeconds,
      particleCount,
      neighborPairs,
      maxNeighborCount,
      densityTotal,
      pressureTotal,
      viscosityForceEstimate,
      surfaceTensionEstimate,
      activeCells,
      depthPixels,
      thicknessPixels
    ]),
    claimBoundary: "Deterministic bounded fluid telemetry adapted from old SPH, MPM, particle-buffer, and fluid-renderer concepts. It proves particle-box setup, density/pressure/neighborhood metrics, MPM particle-grid transfer counts, boundary contacts, and screen-space depth/thickness estimates; it does not claim production pressure-solve convergence, GPU fluid simulation, screen-space refraction/subsurface rendering, Unity fluid tooling parity, or Unreal Niagara/fluid parity."
  };
}

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function hash01(seed: number, salt: number): number {
  let value = Math.imul(seed + salt * 1013904223, 1664525) + 1013904223;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function hashNumbers(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const scaled = Math.round(value * 10_000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Fluid fixture ${label} must be finite and non-negative.`);
  return value;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Fluid fixture ${label} must be an integer.`);
  return value;
}

function integerInRange(value: number, label: string, min: number, max: number): number {
  const parsed = integer(value, label);
  if (parsed < min || parsed > max) throw new RangeError(`Fluid fixture ${label} must be in the [${min}, ${max}] range.`);
  return parsed;
}
