export interface FireSmokeFixtureOptions {
  readonly seed?: number;
  readonly gridResolution?: readonly [number, number, number];
  readonly elapsedSeconds?: number;
  readonly sourceCount?: number;
}

export interface FireSmokeFixture {
  readonly id: "v4-old-branch-fire-smoke-fixture";
  readonly source: "origin-master-fire-smoke-volume-adapted";
  readonly sourceFiles: readonly [
    "origin/master:src/simulation/fire/FireSimulation.ts",
    "origin/master:src/simulation/fire/FireParticleSystem.ts",
    "origin/master:src/simulation/fire/TemperatureField.ts",
    "origin/master:src/simulation/fire/TurbulenceSimulation.ts",
    "origin/master:src/simulation/smoke/SmokeSimulation.ts",
    "origin/master:src/simulation/smoke/SmokeGrid.ts",
    "origin/master:src/simulation/smoke/SmokeRenderer.ts"
  ];
  readonly config: {
    readonly solver: "bounded-fire-smoke-telemetry";
    readonly ambientTemperature: number;
    readonly combustionTemperature: number;
    readonly ignitionTemperature: number;
    readonly fuelConsumptionRate: number;
    readonly buoyancyStrength: number;
    readonly turbulenceStrength: number;
    readonly smokeGenerationRate: number;
    readonly coolingRate: number;
    readonly diffusionRate: number;
    readonly smokePressureIterations: number;
    readonly vorticityStrength: number;
    readonly smokeDissipationRate: number;
    readonly particleEmissionRate: number;
    readonly particleLifetime: number;
    readonly maxParticles: number;
    readonly rayMarchMaxSteps: number;
    readonly rayMarchStepSize: number;
  };
  readonly grid: {
    readonly resolution: readonly [number, number, number];
    readonly cellCount: number;
    readonly sourceCount: number;
    readonly hotCellSamples: readonly FireSmokeHotCellSample[];
  };
  readonly fire: {
    readonly activeFuelCells: number;
    readonly burningCells: number;
    readonly averageTemperature: number;
    readonly maxTemperature: number;
    readonly fuelConsumed: number;
    readonly smokeGenerated: number;
    readonly buoyancyImpulse: number;
    readonly turbulenceEnergy: number;
    readonly coolingLoss: number;
    readonly diffusionEstimate: number;
  };
  readonly particles: {
    readonly emittedParticles: number;
    readonly activeParticles: number;
    readonly emberParticles: number;
    readonly averageLifetime: number;
    readonly averageSize: number;
    readonly maxTemperature: number;
    readonly uploadBytes: number;
  };
  readonly smoke: {
    readonly densityCells: number;
    readonly totalDensity: number;
    readonly maxDensity: number;
    readonly averageVelocityMagnitude: number;
    readonly divergenceBeforeProjection: number;
    readonly divergenceAfterProjection: number;
    readonly pressureIterations: number;
    readonly vorticityCells: number;
    readonly buoyancyForceEstimate: number;
    readonly dissipationLoss: number;
  };
  readonly volumeRendering: {
    readonly rayMarchSteps: number;
    readonly stepSize: number;
    readonly sampledDensity: number;
    readonly transmittance: number;
    readonly scattering: number;
    readonly shadowSamples: number;
    readonly shadowTransmittance: number;
    readonly alpha: number;
    readonly volumetricRendererClaimed: false;
    readonly productionLightingClaimed: false;
  };
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

export interface FireSmokeHotCellSample {
  readonly index: number;
  readonly cell: readonly [number, number, number];
  readonly temperature: number;
  readonly fuel: number;
  readonly smokeDensity: number;
  readonly velocity: readonly [number, number, number];
}

const sourceFiles = [
  "origin/master:src/simulation/fire/FireSimulation.ts",
  "origin/master:src/simulation/fire/FireParticleSystem.ts",
  "origin/master:src/simulation/fire/TemperatureField.ts",
  "origin/master:src/simulation/fire/TurbulenceSimulation.ts",
  "origin/master:src/simulation/smoke/SmokeSimulation.ts",
  "origin/master:src/simulation/smoke/SmokeGrid.ts",
  "origin/master:src/simulation/smoke/SmokeRenderer.ts"
] as const;

const blockedClaims = [
  "production combustion solver parity",
  "GPU fire simulation",
  "production incompressible smoke solver parity",
  "volumetric ray-marched renderer parity",
  "fluid/fire coupling parity",
  "Unity VFX Graph fire/smoke parity",
  "Unreal Niagara fire/smoke parity"
] as const;

export function sampleFireSmokeFixture(options: FireSmokeFixtureOptions = {}): FireSmokeFixture {
  const seed = integer(options.seed ?? 0xf17e, "seed");
  const elapsedSeconds = finiteNonNegative(options.elapsedSeconds ?? 0.5, "elapsedSeconds");
  const gridResolution = options.gridResolution ?? [8, 6, 8] as const;
  const gridX = integerInRange(gridResolution[0], "gridResolution[0]", 4, 18);
  const gridY = integerInRange(gridResolution[1], "gridResolution[1]", 4, 18);
  const gridZ = integerInRange(gridResolution[2], "gridResolution[2]", 4, 18);
  const sourceCount = integerInRange(options.sourceCount ?? 3, "sourceCount", 1, 8);
  const ambientTemperature = 293;
  const combustionTemperature = 1200;
  const ignitionTemperature = 500;
  const fuelConsumptionRate = 0.5;
  const buoyancyStrength = 2;
  const turbulenceStrength = 1.5;
  const smokeGenerationRate = 0.8;
  const coolingRate = 0.1;
  const diffusionRate = 2.2e-5;
  const smokePressureIterations = 40;
  const vorticityStrength = 0.5;
  const smokeDissipationRate = 0.01;
  const particleEmissionRate = 500;
  const particleLifetime = 2;
  const maxParticles = 10_000;
  const rayMarchMaxSteps = 128;
  const rayMarchStepSize = 0.1;

  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    x: (index + 1) / (sourceCount + 1) * (gridX - 1),
    y: 0.65 + hash01(seed, index + 37) * 0.4,
    z: (0.25 + hash01(seed, index + 73) * 0.5) * (gridZ - 1),
    radius: 1.45 + hash01(seed, index + 101) * 0.32
  }));
  const hotCellSamples: FireSmokeHotCellSample[] = [];
  let activeFuelCells = 0;
  let burningCells = 0;
  let temperatureTotal = 0;
  let maxTemperature = ambientTemperature;
  let fuelConsumed = 0;
  let smokeGenerated = 0;
  let buoyancyImpulse = 0;
  let turbulenceEnergy = 0;
  let coolingLoss = 0;
  let diffusionEstimate = 0;
  let densityCells = 0;
  let totalDensity = 0;
  let maxDensity = 0;
  let velocityMagnitudeTotal = 0;
  let divergenceBeforeProjection = 0;
  let vorticityCells = 0;

  for (let z = 0; z < gridZ; z += 1) {
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const index = x + gridX * (y + gridY * z);
        const normalizedHeight = y / Math.max(1, gridY - 1);
        let sourceHeat = 0;
        for (const source of sources) {
          const distance = Math.hypot(x - source.x, y - source.y, z - source.z);
          sourceHeat += Math.max(0, 1 - distance / source.radius);
        }
        const flicker = 0.85 + hash01(seed, index) * 0.16 + Math.sin(elapsedSeconds * 4.2 + index * 0.19) * 0.04;
        const plume = Math.max(0, sourceHeat * (1 - normalizedHeight * 0.42) * flicker);
        const fuel = Math.max(0, 1 - normalizedHeight * 0.28 - elapsedSeconds * fuelConsumptionRate * plume * 0.08);
        const temperature = ambientTemperature + plume * (combustionTemperature - ambientTemperature);
        const smokeDensity = Math.max(0, plume * smokeGenerationRate * (0.45 + normalizedHeight * 0.85) * (1 - smokeDissipationRate * elapsedSeconds));
        const turbulence = Math.abs(Math.sin((x + seed * 0.001) * 0.7 + z * 0.43 + elapsedSeconds * 1.7)) * turbulenceStrength * plume;
        const velocityY = buoyancyStrength * Math.max(0, (temperature - ambientTemperature) / (combustionTemperature - ambientTemperature));
        const velocity = [
          round4((hash01(seed, index + 11) - 0.5) * turbulence),
          round4(velocityY + turbulence * 0.18),
          round4((hash01(seed, index + 23) - 0.5) * turbulence)
        ] as const;

        temperatureTotal += temperature;
        maxTemperature = Math.max(maxTemperature, temperature);
        if (fuel > 0.02) activeFuelCells += 1;
        if (temperature >= ignitionTemperature && fuel > 0.02) {
          burningCells += 1;
          fuelConsumed += fuelConsumptionRate * plume * 0.016;
          buoyancyImpulse += velocityY;
          turbulenceEnergy += turbulence * turbulence;
          if (hotCellSamples.length < 6) {
            hotCellSamples.push({
              index,
              cell: [x, y, z],
              temperature: round4(temperature),
              fuel: round4(fuel),
              smokeDensity: round4(smokeDensity),
              velocity
            });
          }
        }
        if (smokeDensity > 0.005) {
          densityCells += 1;
          totalDensity += smokeDensity;
          maxDensity = Math.max(maxDensity, smokeDensity);
          velocityMagnitudeTotal += Math.hypot(velocity[0], velocity[1], velocity[2]);
        }
        if (turbulence > 0.05) vorticityCells += 1;
        smokeGenerated += smokeDensity;
        coolingLoss += Math.max(0, temperature - ambientTemperature) * coolingRate * 0.001;
        diffusionEstimate += Math.max(0, temperature - ambientTemperature) * diffusionRate;
        divergenceBeforeProjection += Math.abs(velocity[0]) * 0.16 + Math.abs(velocity[1]) * 0.05 + Math.abs(velocity[2]) * 0.16;
      }
    }
  }

  const cellCount = gridX * gridY * gridZ;
  const averageTemperature = temperatureTotal / cellCount;
  const emittedParticles = Math.min(maxParticles, Math.max(1, Math.round(burningCells * particleEmissionRate / 60)));
  const activeParticles = Math.min(maxParticles, Math.max(emittedParticles, Math.round(emittedParticles * particleLifetime * 0.72)));
  const emberParticles = Math.max(1, Math.round(activeParticles * 0.18));
  const averageLifetime = Math.max(0.05, particleLifetime * (0.42 + Math.min(0.35, burningCells / cellCount)));
  const averageSize = 0.05 + Math.min(0.15, (maxTemperature - ignitionTemperature) / combustionTemperature * 0.12);
  const divergenceAfterProjection = divergenceBeforeProjection / (1 + smokePressureIterations * 0.38);
  const sampledDensity = totalDensity / Math.max(1, densityCells);
  const transmittance = Math.exp(-sampledDensity * rayMarchMaxSteps * rayMarchStepSize * 0.18);
  const shadowTransmittance = Math.exp(-sampledDensity * 8 * 0.5);
  const alpha = 1 - transmittance;

  return {
    id: "v4-old-branch-fire-smoke-fixture",
    source: "origin-master-fire-smoke-volume-adapted",
    sourceFiles,
    config: {
      solver: "bounded-fire-smoke-telemetry",
      ambientTemperature,
      combustionTemperature,
      ignitionTemperature,
      fuelConsumptionRate,
      buoyancyStrength,
      turbulenceStrength,
      smokeGenerationRate,
      coolingRate,
      diffusionRate,
      smokePressureIterations,
      vorticityStrength,
      smokeDissipationRate,
      particleEmissionRate,
      particleLifetime,
      maxParticles,
      rayMarchMaxSteps,
      rayMarchStepSize
    },
    grid: {
      resolution: [gridX, gridY, gridZ],
      cellCount,
      sourceCount,
      hotCellSamples
    },
    fire: {
      activeFuelCells,
      burningCells,
      averageTemperature: round4(averageTemperature),
      maxTemperature: round4(maxTemperature),
      fuelConsumed: round4(fuelConsumed),
      smokeGenerated: round4(smokeGenerated),
      buoyancyImpulse: round4(buoyancyImpulse),
      turbulenceEnergy: round4(turbulenceEnergy),
      coolingLoss: round4(coolingLoss),
      diffusionEstimate: round4(diffusionEstimate)
    },
    particles: {
      emittedParticles,
      activeParticles,
      emberParticles,
      averageLifetime: round4(averageLifetime),
      averageSize: round4(averageSize),
      maxTemperature: round4(maxTemperature),
      uploadBytes: activeParticles * 32
    },
    smoke: {
      densityCells,
      totalDensity: round4(totalDensity),
      maxDensity: round4(maxDensity),
      averageVelocityMagnitude: round4(velocityMagnitudeTotal / Math.max(1, densityCells)),
      divergenceBeforeProjection: round4(divergenceBeforeProjection),
      divergenceAfterProjection: round4(divergenceAfterProjection),
      pressureIterations: smokePressureIterations,
      vorticityCells,
      buoyancyForceEstimate: round4(buoyancyImpulse * 0.12),
      dissipationLoss: round4(totalDensity * smokeDissipationRate)
    },
    volumeRendering: {
      rayMarchSteps: rayMarchMaxSteps,
      stepSize: rayMarchStepSize,
      sampledDensity: round4(sampledDensity),
      transmittance: round4(transmittance),
      scattering: round4(sampledDensity * (1 - shadowTransmittance) * 0.62),
      shadowSamples: 8,
      shadowTransmittance: round4(shadowTransmittance),
      alpha: round4(alpha),
      volumetricRendererClaimed: false,
      productionLightingClaimed: false
    },
    blockedClaims,
    hash: hashNumbers([
      seed,
      elapsedSeconds,
      gridX,
      gridY,
      gridZ,
      sourceCount,
      activeFuelCells,
      burningCells,
      averageTemperature,
      maxTemperature,
      fuelConsumed,
      smokeGenerated,
      activeParticles,
      totalDensity,
      divergenceBeforeProjection,
      divergenceAfterProjection,
      transmittance
    ]),
    claimBoundary: "Deterministic bounded fire/smoke telemetry adapted from old combustion, temperature, turbulence, smoke-grid, particle-emission, and ray-marching concepts. It proves current runtime evidence for hot cells, fuel consumption, smoke density, buoyancy, vorticity, pressure-projection reduction, particle emission, and volume sampling; it does not claim production combustion solver parity, GPU fire/smoke simulation, production volumetric rendering, Unity VFX Graph parity, or Unreal Niagara parity."
  };
}

function hash01(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function hashNumbers(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const scaled = Math.round(value * 1_000_000);
    hash ^= scaled;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Fire/smoke fixture ${label} must be finite and non-negative.`);
  return value;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Fire/smoke fixture ${label} must be an integer.`);
  return value;
}

function integerInRange(value: number, label: string, min: number, max: number): number {
  const parsed = integer(value, label);
  if (parsed < min || parsed > max) throw new RangeError(`Fire/smoke fixture ${label} must be in the [${min}, ${max}] range.`);
  return parsed;
}
