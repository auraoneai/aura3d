export interface ClothSimulationFixtureOptions {
  readonly seed?: number;
  readonly elapsedSeconds?: number;
  readonly segmentsX?: number;
  readonly segmentsY?: number;
}

export interface ClothSampleParticle {
  readonly index: number;
  readonly grid: readonly [number, number];
  readonly pinned: boolean;
  readonly position: readonly [number, number, number];
  readonly uv: readonly [number, number];
}

export interface ClothSimulationFixture {
  readonly id: "external-parity-old-branch-cloth-simulation-fixture";
  readonly source: "origin-master-cloth-pbd-material-adapted";
  readonly sourceFiles: readonly [
    "origin/master:src/simulation/cloth/ClothSimulation.ts",
    "origin/master:src/simulation/cloth/ClothCollisionSystem.ts",
    "origin/master:src/simulation/cloth/ClothTearingSystem.ts",
    "origin/master:src/materials/ClothMaterial.ts"
  ];
  readonly config: {
    readonly width: number;
    readonly height: number;
    readonly segmentsX: number;
    readonly segmentsY: number;
    readonly particleMass: number;
    readonly structuralStiffness: number;
    readonly shearStiffness: number;
    readonly bendingStiffness: number;
    readonly solverIterations: number;
    readonly damping: number;
  };
  readonly mesh: {
    readonly particleCount: number;
    readonly triangleCount: number;
    readonly normalCount: number;
    readonly uvCount: number;
    readonly indexCount: number;
    readonly pinnedCount: number;
    readonly pinnedPattern: "top-edge";
    readonly sampleParticles: readonly ClothSampleParticle[];
  };
  readonly constraints: {
    readonly structural: number;
    readonly shear: number;
    readonly bending: number;
    readonly total: number;
    readonly maxStrain: number;
    readonly tearThreshold: number;
    readonly tearCandidates: number;
    readonly cutPlaneConstraintCandidates: number;
  };
  readonly wind: {
    readonly direction: readonly [number, number, number];
    readonly turbulence: number;
    readonly frequency: number;
    readonly maxOffset: number;
    readonly affectedParticles: number;
  };
  readonly collision: {
    readonly shape: "sphere";
    readonly center: readonly [number, number, number];
    readonly radius: number;
    readonly penetrationCount: number;
    readonly resolvedParticles: number;
    readonly maxPenetration: number;
    readonly friction: number;
    readonly restitution: number;
  };
  readonly material: {
    readonly preset: "coarse-wool-flag";
    readonly sheenIntensity: number;
    readonly sheenRoughness: number;
    readonly subsurfaceIntensity: number;
    readonly anisotropyStrength: number;
    readonly fuzzIntensity: number;
    readonly roughness: number;
    readonly tiling: readonly [number, number];
  };
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

const sourceFiles = [
  "origin/master:src/simulation/cloth/ClothSimulation.ts",
  "origin/master:src/simulation/cloth/ClothCollisionSystem.ts",
  "origin/master:src/simulation/cloth/ClothTearingSystem.ts",
  "origin/master:src/materials/ClothMaterial.ts"
] as const;

const blockedClaims = [
  "GPU cloth compute parity",
  "100k particle cloth performance",
  "production PBD solver parity",
  "cloth self-collision",
  "mesh-splitting topology tearing",
  "fabric shader parity",
  "Unity Cloth parity",
  "Unreal Chaos Cloth parity"
] as const;

export function sampleClothSimulationFixture(options: ClothSimulationFixtureOptions = {}): ClothSimulationFixture {
  const seed = integer(options.seed ?? 0x3d2025, "seed");
  const elapsedSeconds = finiteNonNegative(options.elapsedSeconds ?? 0.4, "elapsedSeconds");
  const segmentsX = integerInRange(options.segmentsX ?? 12, "segmentsX", 2, 64);
  const segmentsY = integerInRange(options.segmentsY ?? 8, "segmentsY", 2, 64);
  const width = 2.4;
  const height = 1.5;
  const particleCount = (segmentsX + 1) * (segmentsY + 1);
  const triangleCount = segmentsX * segmentsY * 2;
  const structural = segmentsX * (segmentsY + 1) + (segmentsX + 1) * segmentsY;
  const shear = segmentsX * segmentsY * 2;
  const bending = Math.max(0, (segmentsX - 1) * (segmentsY + 1) + (segmentsY - 1) * (segmentsX + 1));
  const pinnedCount = segmentsX + 1;
  const windDirection = [3.2, 0.35, 1.15] as const;
  const turbulence = 0.35;
  const frequency = 1.8;
  const collisionCenter = [0.08, -0.18, 0.06] as const;
  const collisionRadius = 0.34;
  let maxOffset = 0;
  let affectedParticles = 0;
  let penetrationCount = 0;
  let resolvedParticles = 0;
  let maxPenetration = 0;
  let maxStrain = 1;
  let tearCandidates = 0;
  let cutPlaneConstraintCandidates = 0;

  const positions = new Map<number, readonly [number, number, number]>();
  const sampleParticles: ClothSampleParticle[] = [];
  const sampleKeys = new Set([
    particleIndex(0, 0, segmentsX),
    particleIndex(Math.floor(segmentsX / 2), 0, segmentsX),
    particleIndex(segmentsX, 0, segmentsX),
    particleIndex(0, Math.floor(segmentsY / 2), segmentsX),
    particleIndex(Math.floor(segmentsX / 2), Math.floor(segmentsY / 2), segmentsX),
    particleIndex(segmentsX, Math.floor(segmentsY / 2), segmentsX),
    particleIndex(0, segmentsY, segmentsX),
    particleIndex(Math.floor(segmentsX / 2), segmentsY, segmentsX),
    particleIndex(segmentsX, segmentsY, segmentsX)
  ]);

  for (let y = 0; y <= segmentsY; y += 1) {
    for (let x = 0; x <= segmentsX; x += 1) {
      const index = particleIndex(x, y, segmentsX);
      const vertical = y / segmentsY;
      const horizontal = x / segmentsX;
      const pinned = y === 0;
      const baseX = (horizontal - 0.5) * width;
      const sag = pinned ? 0 : Math.pow(vertical, 1.42) * (0.28 + hash01(seed, 7) * 0.08 + elapsedSeconds * 0.045);
      const gust = pinned ? 0 : Math.sin(elapsedSeconds * frequency + x * 0.73 + y * 0.41 + hash01(seed, x + y + 11) * 2) * turbulence * vertical;
      const xOffset = pinned ? 0 : windDirection[0] * 0.018 * vertical + gust * 0.06;
      const zOffset = pinned ? 0 : windDirection[2] * 0.035 * vertical + gust * 0.1;
      let position: readonly [number, number, number] = [
        round4(baseX + xOffset),
        round4(height * 0.5 - vertical * height - sag),
        round4(zOffset)
      ];
      const penetration = spherePenetration(position, collisionCenter, collisionRadius);
      if (penetration > 0) {
        penetrationCount += 1;
        resolvedParticles += 1;
        maxPenetration = Math.max(maxPenetration, penetration);
        position = resolveSphere(position, collisionCenter, collisionRadius);
      }
      const offset = Math.hypot(position[0] - baseX, position[2]);
      if (offset > 0.002 && !pinned) affectedParticles += 1;
      maxOffset = Math.max(maxOffset, offset);
      positions.set(index, position);
      if (sampleKeys.has(index)) {
        sampleParticles.push({
          index,
          grid: [x, y],
          pinned,
          position,
          uv: [round4(horizontal), round4(vertical)]
        });
      }
    }
  }

  for (let y = 0; y <= segmentsY; y += 1) {
    for (let x = 0; x <= segmentsX; x += 1) {
      const current = positions.get(particleIndex(x, y, segmentsX));
      if (!current) continue;
      if (x < segmentsX) {
        const strain = constraintStrain(current, positions.get(particleIndex(x + 1, y, segmentsX)), width / segmentsX);
        maxStrain = Math.max(maxStrain, strain);
        if (strain >= 1.035 && y >= segmentsY - 2) tearCandidates += 1;
        if (x < segmentsX / 2 && x + 1 >= segmentsX / 2 && y > 0) cutPlaneConstraintCandidates += 1;
      }
      if (y < segmentsY) {
        const strain = constraintStrain(current, positions.get(particleIndex(x, y + 1, segmentsX)), height / segmentsY);
        maxStrain = Math.max(maxStrain, strain);
        if (strain >= 1.05 && y >= segmentsY - 3) tearCandidates += 1;
      }
    }
  }

  const metricsForHash = [
    seed,
    elapsedSeconds,
    segmentsX,
    segmentsY,
    particleCount,
    triangleCount,
    structural,
    shear,
    bending,
    pinnedCount,
    maxOffset,
    affectedParticles,
    penetrationCount,
    maxPenetration,
    maxStrain,
    tearCandidates,
    cutPlaneConstraintCandidates
  ];

  return {
    id: "external-parity-old-branch-cloth-simulation-fixture",
    source: "origin-master-cloth-pbd-material-adapted",
    sourceFiles,
    config: {
      width,
      height,
      segmentsX,
      segmentsY,
      particleMass: 0.1,
      structuralStiffness: 0.9,
      shearStiffness: 0.8,
      bendingStiffness: 0.12,
      solverIterations: 6,
      damping: 0.01
    },
    mesh: {
      particleCount,
      triangleCount,
      normalCount: particleCount,
      uvCount: particleCount,
      indexCount: triangleCount * 3,
      pinnedCount,
      pinnedPattern: "top-edge",
      sampleParticles
    },
    constraints: {
      structural,
      shear,
      bending,
      total: structural + shear + bending,
      maxStrain: round4(maxStrain),
      tearThreshold: 1.035,
      tearCandidates,
      cutPlaneConstraintCandidates
    },
    wind: {
      direction: windDirection,
      turbulence,
      frequency,
      maxOffset: round4(maxOffset),
      affectedParticles
    },
    collision: {
      shape: "sphere",
      center: collisionCenter,
      radius: collisionRadius,
      penetrationCount,
      resolvedParticles,
      maxPenetration: round4(maxPenetration),
      friction: 0.42,
      restitution: 0.04
    },
    material: {
      preset: "coarse-wool-flag",
      sheenIntensity: 0.56,
      sheenRoughness: 0.34,
      subsurfaceIntensity: 0.24,
      anisotropyStrength: 0.42,
      fuzzIntensity: 0.22,
      roughness: 0.74,
      tiling: [3, 2]
    },
    blockedClaims,
    hash: hashNumbers(metricsForHash),
    claimBoundary: "Deterministic bounded cloth telemetry adapted from old PBD cloth, collision, tearing, and cloth-material concepts. It proves a pinned cloth grid, structural/shear/bending constraint counts, wind displacement, sphere-collision response, tear-candidate metrics, and fabric material parameters; it does not claim GPU cloth, self-collision, topology tearing, fabric shader parity, Unity Cloth parity, or Unreal Chaos Cloth parity."
  };
}

function particleIndex(x: number, y: number, segmentsX: number): number {
  return y * (segmentsX + 1) + x;
}

function constraintStrain(left: readonly [number, number, number], right: readonly [number, number, number] | undefined, restLength: number): number {
  if (!right) return 1;
  const length = Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
  return restLength > 0 ? length / restLength : 1;
}

function spherePenetration(position: readonly [number, number, number], center: readonly [number, number, number], radius: number): number {
  const distance = Math.hypot(position[0] - center[0], position[1] - center[1], position[2] - center[2]);
  return Math.max(0, radius - distance);
}

function resolveSphere(position: readonly [number, number, number], center: readonly [number, number, number], radius: number): readonly [number, number, number] {
  const dx = position[0] - center[0];
  const dy = position[1] - center[1];
  const dz = position[2] - center[2];
  const length = Math.max(0.0001, Math.hypot(dx, dy, dz));
  return [
    round4(center[0] + dx / length * radius),
    round4(center[1] + dy / length * radius),
    round4(center[2] + dz / length * radius)
  ];
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
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Cloth fixture ${label} must be finite and non-negative.`);
  return value;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Cloth fixture ${label} must be an integer.`);
  return value;
}

function integerInRange(value: number, label: string, min: number, max: number): number {
  const parsed = integer(value, label);
  if (parsed < min || parsed > max) throw new RangeError(`Cloth fixture ${label} must be in the [${min}, ${max}] range.`);
  return parsed;
}
