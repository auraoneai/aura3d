export interface FractureFixtureOptions {
  readonly seed?: number;
  readonly fragmentCount?: number;
  readonly impactStrength?: number;
}

export interface FractureFragmentSample {
  readonly id: number;
  readonly site: readonly [number, number, number];
  readonly centerOfMass: readonly [number, number, number];
  readonly mass: number;
  readonly volume: number;
  readonly velocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
  readonly neighborCount: number;
}

export interface FractureFixture {
  readonly id: "external-parity-old-branch-fracture-fixture";
  readonly source: "origin-master-voronoi-hierarchical-fracture-adapted";
  readonly sourceFiles: readonly [
    "origin/master:src/simulation/fracture/VoronoiFractureSystem.ts",
    "origin/master:src/simulation/fracture/HierarchicalFractureSystem.ts",
    "origin/master:src/simulation/fracture/GeometryClipper.ts",
    "origin/master:src/simulation/fracture/VoronoiMath.ts"
  ];
  readonly config: {
    readonly bounds: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
    readonly requestedFragments: number;
    readonly density: number;
    readonly impactPoint: readonly [number, number, number];
    readonly impulseStrength: number;
    readonly interiorFaces: boolean;
    readonly progressiveDamage: boolean;
  };
  readonly voronoi: {
    readonly siteCount: number;
    readonly radialSiteCount: number;
    readonly averageSiteDistance: number;
    readonly maxSiteDistance: number;
    readonly neighborPairs: number;
    readonly crackGraphEdges: number;
  };
  readonly fragments: {
    readonly fragmentCount: number;
    readonly totalMass: number;
    readonly minMass: number;
    readonly maxMass: number;
    readonly totalVolume: number;
    readonly interiorFaceEstimate: number;
    readonly activeAfterImpact: number;
    readonly samples: readonly FractureFragmentSample[];
  };
  readonly hierarchy: {
    readonly maxDepth: number;
    readonly nodeCount: number;
    readonly rootDamage: number;
    readonly childDamageThreshold: number;
    readonly activatedChildren: number;
    readonly residualInactiveChildren: number;
  };
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

const sourceFiles = [
  "origin/master:src/simulation/fracture/VoronoiFractureSystem.ts",
  "origin/master:src/simulation/fracture/HierarchicalFractureSystem.ts",
  "origin/master:src/simulation/fracture/GeometryClipper.ts",
  "origin/master:src/simulation/fracture/VoronoiMath.ts"
] as const;

const blockedClaims = [
  "runtime convex mesh clipping",
  "interior geometry generation parity",
  "hierarchical runtime remeshing",
  "rigid-body fragment simulation parity",
  "destructible asset authoring workflow",
  "Unity destruction workflow parity",
  "Unreal Chaos destruction parity"
] as const;

export function sampleFractureFixture(options: FractureFixtureOptions = {}): FractureFixture {
  const seed = integer(options.seed ?? 0xf24c7, "seed");
  const fragmentCount = integerInRange(options.fragmentCount ?? 18, "fragmentCount", 4, 96);
  const impactStrength = finitePositive(options.impactStrength ?? 82, "impactStrength");
  const boundsMin = [-0.6, -0.42, -0.36] as const;
  const boundsMax = [0.6, 0.42, 0.36] as const;
  const impactPoint = [-0.18, 0.06, 0.08] as const;
  const density = 2350;
  const boundsVolume = (boundsMax[0] - boundsMin[0]) * (boundsMax[1] - boundsMin[1]) * (boundsMax[2] - boundsMin[2]);
  const sites = generateRadialSites(seed, fragmentCount, impactPoint, 0.68);
  const weights = sites.map((site, index) => 0.75 + hash01(seed, index + 41) * 0.7 + Math.max(0, 0.6 - distance(site, impactPoint)) * 0.4);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const fragments: FractureFragmentSample[] = [];
  let totalVolume = 0;
  let totalMass = 0;
  let minMass = Number.POSITIVE_INFINITY;
  let maxMass = 0;
  let neighborPairs = 0;
  let siteDistanceTotal = 0;
  let maxSiteDistance = 0;
  let activeAfterImpact = 0;

  for (let index = 0; index < sites.length; index += 1) {
    const site = sites[index]!;
    const siteDistance = distance(site, impactPoint);
    siteDistanceTotal += siteDistance;
    maxSiteDistance = Math.max(maxSiteDistance, siteDistance);
    const volume = boundsVolume * (weights[index]! / weightSum);
    const mass = volume * density;
    totalVolume += volume;
    totalMass += mass;
    minMass = Math.min(minMass, mass);
    maxMass = Math.max(maxMass, mass);
    const direction = normalized([site[0] - impactPoint[0], site[1] - impactPoint[1], site[2] - impactPoint[2]]);
    const attenuation = 1 / (1 + siteDistance * 2.2);
    const velocityMagnitude = impactStrength * attenuation / Math.max(1, mass);
    const neighborCount = sites.filter((other, otherIndex) => otherIndex !== index && distance(other, site) < 0.58).length;
    neighborPairs += neighborCount;
    if (impactStrength * attenuation > 24) activeAfterImpact += 1;
    if (index < 6) {
      fragments.push({
        id: index,
        site: roundVec3(site),
        centerOfMass: roundVec3([
          site[0] * 0.86 + impactPoint[0] * 0.14,
          site[1] * 0.86 + impactPoint[1] * 0.14,
          site[2] * 0.86 + impactPoint[2] * 0.14
        ]),
        mass: round4(mass),
        volume: round4(volume),
        velocity: roundVec3([direction[0] * velocityMagnitude, direction[1] * velocityMagnitude, direction[2] * velocityMagnitude]),
        angularVelocity: roundVec3([
          (site[1] - impactPoint[1]) * velocityMagnitude * 1.9,
          (site[2] - impactPoint[2]) * velocityMagnitude * 1.6,
          (site[0] - impactPoint[0]) * velocityMagnitude * 1.7
        ]),
        neighborCount
      });
    }
  }
  neighborPairs = Math.floor(neighborPairs / 2);
  const maxDepth = 3;
  const activatedChildren = Math.max(1, Math.min(fragmentCount, Math.round(activeAfterImpact * 0.72)));
  const nodeCount = 1 + fragmentCount + activatedChildren * 2;

  return {
    id: "external-parity-old-branch-fracture-fixture",
    source: "origin-master-voronoi-hierarchical-fracture-adapted",
    sourceFiles,
    config: {
      bounds: { min: boundsMin, max: boundsMax },
      requestedFragments: fragmentCount,
      density,
      impactPoint,
      impulseStrength: impactStrength,
      interiorFaces: true,
      progressiveDamage: true
    },
    voronoi: {
      siteCount: sites.length,
      radialSiteCount: sites.length,
      averageSiteDistance: round4(siteDistanceTotal / sites.length),
      maxSiteDistance: round4(maxSiteDistance),
      neighborPairs,
      crackGraphEdges: neighborPairs + Math.max(0, fragmentCount - 1)
    },
    fragments: {
      fragmentCount: sites.length,
      totalMass: round4(totalMass),
      minMass: round4(minMass),
      maxMass: round4(maxMass),
      totalVolume: round4(totalVolume),
      interiorFaceEstimate: fragmentCount * 6 + neighborPairs,
      activeAfterImpact,
      samples: fragments
    },
    hierarchy: {
      maxDepth,
      nodeCount,
      rootDamage: round4(Math.min(1, impactStrength / 100)),
      childDamageThreshold: 0.34,
      activatedChildren,
      residualInactiveChildren: Math.max(0, fragmentCount - activatedChildren)
    },
    blockedClaims,
    hash: hashNumbers([
      seed,
      fragmentCount,
      impactStrength,
      totalMass,
      totalVolume,
      minMass,
      maxMass,
      neighborPairs,
      activeAfterImpact,
      nodeCount
    ]),
    claimBoundary: "Deterministic bounded fracture telemetry adapted from old Voronoi, geometry clipping, and hierarchical fracture concepts. It proves radial site generation, fragment mass/velocity estimates, crack graph metrics, and progressive damage activation; it does not claim runtime convex mesh clipping, generated interior geometry, rigid-body fragment simulation, destructible authoring workflow, Unity destruction parity, or Unreal Chaos destruction parity."
  };
}

function generateRadialSites(seed: number, count: number, center: readonly [number, number, number], radius: number): readonly (readonly [number, number, number])[] {
  const sites: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < count; index += 1) {
    const u = hash01(seed, index * 3 + 1);
    const v = hash01(seed, index * 3 + 2);
    const w = hash01(seed, index * 3 + 3);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const localRadius = radius * Math.pow(w, 0.72);
    sites.push([
      center[0] + Math.sin(phi) * Math.cos(theta) * localRadius,
      center[1] + Math.cos(phi) * localRadius,
      center[2] + Math.sin(phi) * Math.sin(theta) * localRadius
    ]);
  }
  return sites;
}

function normalized(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.max(0.0001, Math.hypot(value[0], value[1], value[2]));
  return [value[0] / length, value[1] / length, value[2] / length];
}

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function roundVec3(value: readonly [number, number, number]): readonly [number, number, number] {
  return [round4(value[0]), round4(value[1]), round4(value[2])];
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

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Fracture fixture ${label} must be finite and positive.`);
  return value;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Fracture fixture ${label} must be an integer.`);
  return value;
}

function integerInRange(value: number, label: string, min: number, max: number): number {
  const parsed = integer(value, label);
  if (parsed < min || parsed > max) throw new RangeError(`Fracture fixture ${label} must be in the [${min}, ${max}] range.`);
  return parsed;
}
