export interface SoftBodyFixtureOptions {
  readonly seed?: number;
  readonly elapsedSeconds?: number;
  readonly divisions?: number;
}

export interface SoftBodySampleVertex {
  readonly index: number;
  readonly grid: readonly [number, number, number];
  readonly attached: boolean;
  readonly rest: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly displacement: number;
}

export interface SoftBodyFixture {
  readonly id: "external-parity-old-branch-soft-body-fixture";
  readonly source: "origin-master-softbody-tet-pbd-adapted";
  readonly sourceFiles: readonly [
    "origin/master:src/simulation/softbody/SoftBody.ts",
    "origin/master:src/simulation/softbody/SoftBodySolver.ts",
    "origin/master:src/simulation/softbody/TetMeshGenerator.ts"
  ];
  readonly config: {
    readonly method: "bounded-pbd-telemetry";
    readonly materialModel: "bounded-corotated-reference";
    readonly divisions: number;
    readonly damping: number;
    readonly solverIterations: number;
    readonly volumeStiffness: number;
    readonly shapeMatchingStiffness: number;
    readonly distanceStiffness: number;
    readonly particleMass: number;
  };
  readonly mesh: {
    readonly vertexCount: number;
    readonly tetrahedronCount: number;
    readonly surfaceTriangleEstimate: number;
    readonly distanceConstraintCount: number;
    readonly attachmentCount: number;
    readonly sampleVertices: readonly SoftBodySampleVertex[];
  };
  readonly deformation: {
    readonly centerOfMass: readonly [number, number, number];
    readonly restCenterOfMass: readonly [number, number, number];
    readonly maxDisplacement: number;
    readonly averageDisplacement: number;
    readonly volumeRatio: number;
    readonly restVolume: number;
    readonly currentVolume: number;
    readonly shapeMatchingError: number;
  };
  readonly collision: {
    readonly groundPlaneY: number;
    readonly contactVertices: number;
    readonly maxPenetrationBeforeResolve: number;
    readonly resolvedVertices: number;
    readonly restitution: number;
    readonly friction: number;
  };
  readonly attachments: {
    readonly rigidAttachmentCount: number;
    readonly targetOffset: readonly [number, number, number];
    readonly maxAttachmentError: number;
    readonly averageAttachmentError: number;
  };
  readonly blockedClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

const sourceFiles = [
  "origin/master:src/simulation/softbody/SoftBody.ts",
  "origin/master:src/simulation/softbody/SoftBodySolver.ts",
  "origin/master:src/simulation/softbody/TetMeshGenerator.ts"
] as const;

const blockedClaims = [
  "production tetrahedral FEM solver parity",
  "Neo-Hookean material parity",
  "implicit solver convergence parity",
  "soft body self-collision",
  "runtime tetrahedral remeshing",
  "skinned render mesh deformation",
  "Unity soft-body asset parity",
  "Unreal Chaos soft-body parity"
] as const;

export function sampleSoftBodyFixture(options: SoftBodyFixtureOptions = {}): SoftBodyFixture {
  const seed = integer(options.seed ?? 0x50fb0d, "seed");
  const elapsedSeconds = finiteNonNegative(options.elapsedSeconds ?? 0.36, "elapsedSeconds");
  const divisions = integerInRange(options.divisions ?? 2, "divisions", 1, 5);
  const gridSize = divisions + 1;
  const vertices: SoftBodySampleVertex[] = [];
  const restPositions = new Map<number, readonly [number, number, number]>();
  const positions = new Map<number, readonly [number, number, number]>();
  const attachedIndices = new Set<number>([
    vertexIndex(0, divisions, 0, gridSize),
    vertexIndex(divisions, divisions, 0, gridSize),
    vertexIndex(0, divisions, divisions, gridSize),
    vertexIndex(divisions, divisions, divisions, gridSize)
  ]);
  const tets: Array<readonly [number, number, number, number]> = [];
  const targetOffset = [0.08, 0.02, -0.035] as const;
  const groundPlaneY = -0.42;
  let maxDisplacement = 0;
  let displacementTotal = 0;
  let contactVertices = 0;
  let resolvedVertices = 0;
  let maxPenetrationBeforeResolve = 0;
  let attachmentErrorTotal = 0;
  let maxAttachmentError = 0;

  for (let z = 0; z <= divisions; z += 1) {
    for (let y = 0; y <= divisions; y += 1) {
      for (let x = 0; x <= divisions; x += 1) {
        const index = vertexIndex(x, y, z, gridSize);
        const nx = x / divisions - 0.5;
        const ny = y / divisions - 0.5;
        const nz = z / divisions - 0.5;
        const rest = [round4(nx * 0.9), round4(ny * 0.9), round4(nz * 0.9)] as const;
        const attached = attachedIndices.has(index);
        const verticalFall = attached ? targetOffset[1] : -0.12 - elapsedSeconds * 0.11 * (1 - y / divisions);
        const impulse = Math.sin(elapsedSeconds * 3.2 + x * 0.7 + z * 0.45 + hash01(seed, index) * 2.4) * 0.055;
        const squash = attached ? 1 : 1 - (0.06 + hash01(seed, index + 17) * 0.035) * (1 - y / divisions);
        let position: readonly [number, number, number] = attached
          ? [round4(rest[0] + targetOffset[0]), round4(rest[1] + targetOffset[1]), round4(rest[2] + targetOffset[2])]
          : [round4(rest[0] * squash + impulse), round4(rest[1] + verticalFall), round4(rest[2] * squash - impulse * 0.35)];
        const penetration = Math.max(0, groundPlaneY - position[1]);
        if (penetration > 0) {
          contactVertices += 1;
          resolvedVertices += 1;
          maxPenetrationBeforeResolve = Math.max(maxPenetrationBeforeResolve, penetration);
          position = [position[0], round4(groundPlaneY), position[2]];
        }
        const displacement = round4(distance(rest, position));
        maxDisplacement = Math.max(maxDisplacement, displacement);
        displacementTotal += displacement;
        restPositions.set(index, rest);
        positions.set(index, position);
        if (attached) {
          const target = [rest[0] + targetOffset[0], rest[1] + targetOffset[1], rest[2] + targetOffset[2]] as const;
          const error = distance(position, target);
          attachmentErrorTotal += error;
          maxAttachmentError = Math.max(maxAttachmentError, error);
        }
        if ((x === 0 || x === divisions) && (y === 0 || y === divisions) && (z === 0 || z === divisions) || (x === Math.floor(divisions / 2) && y === Math.floor(divisions / 2) && z === Math.floor(divisions / 2))) {
          vertices.push({ index, grid: [x, y, z], attached, rest, position, displacement });
        }
      }
    }
  }

  for (let z = 0; z < divisions; z += 1) {
    for (let y = 0; y < divisions; y += 1) {
      for (let x = 0; x < divisions; x += 1) {
        const cornerOrigin = vertexIndex(x, y, z, gridSize);
        const cornerX = vertexIndex(x + 1, y, z, gridSize);
        const cornerY = vertexIndex(x, y + 1, z, gridSize);
        const cornerXY = vertexIndex(x + 1, y + 1, z, gridSize);
        const cornerZ = vertexIndex(x, y, z + 1, gridSize);
        const cornerXZ = vertexIndex(x + 1, y, z + 1, gridSize);
        const cornerYZ = vertexIndex(x, y + 1, z + 1, gridSize);
        const cornerXYZ = vertexIndex(x + 1, y + 1, z + 1, gridSize);
        tets.push(
          [cornerOrigin, cornerX, cornerY, cornerZ],
          [cornerX, cornerXY, cornerY, cornerXYZ],
          [cornerX, cornerZ, cornerXZ, cornerXYZ],
          [cornerY, cornerZ, cornerYZ, cornerXYZ],
          [cornerX, cornerY, cornerZ, cornerXYZ]
        );
      }
    }
  }

  const edges = uniqueTetEdges(tets);
  const restVolume = sumTetVolumes(tets, restPositions);
  const currentVolume = sumTetVolumes(tets, positions);
  const restCenterOfMass = centerOfMass(restPositions);
  const center = centerOfMass(positions);
  const vertexCount = gridSize * gridSize * gridSize;
  const averageDisplacement = displacementTotal / vertexCount;
  const shapeMatchingError = distance(center, [
    restCenterOfMass[0] + targetOffset[0] * 0.18,
    restCenterOfMass[1] - 0.065,
    restCenterOfMass[2] + targetOffset[2] * 0.18
  ]);
  const attachmentCount = attachedIndices.size;

  return {
    id: "external-parity-old-branch-soft-body-fixture",
    source: "origin-master-softbody-tet-pbd-adapted",
    sourceFiles,
    config: {
      method: "bounded-pbd-telemetry",
      materialModel: "bounded-corotated-reference",
      divisions,
      damping: 0.99,
      solverIterations: 5,
      volumeStiffness: 0.5,
      shapeMatchingStiffness: 0.2,
      distanceStiffness: 0.8,
      particleMass: 1
    },
    mesh: {
      vertexCount,
      tetrahedronCount: tets.length,
      surfaceTriangleEstimate: divisions * divisions * 12,
      distanceConstraintCount: edges.size,
      attachmentCount,
      sampleVertices: vertices
    },
    deformation: {
      centerOfMass: roundVec3(center),
      restCenterOfMass: roundVec3(restCenterOfMass),
      maxDisplacement: round4(maxDisplacement),
      averageDisplacement: round4(averageDisplacement),
      volumeRatio: round4(currentVolume / restVolume),
      restVolume: round4(restVolume),
      currentVolume: round4(currentVolume),
      shapeMatchingError: round4(shapeMatchingError)
    },
    collision: {
      groundPlaneY,
      contactVertices,
      maxPenetrationBeforeResolve: round4(maxPenetrationBeforeResolve),
      resolvedVertices,
      restitution: 0.05,
      friction: 0.62
    },
    attachments: {
      rigidAttachmentCount: attachmentCount,
      targetOffset,
      maxAttachmentError: round4(maxAttachmentError),
      averageAttachmentError: round4(attachmentErrorTotal / attachmentCount)
    },
    blockedClaims,
    hash: hashNumbers([
      seed,
      elapsedSeconds,
      divisions,
      vertexCount,
      tets.length,
      edges.size,
      restVolume,
      currentVolume,
      maxDisplacement,
      averageDisplacement,
      contactVertices,
      maxPenetrationBeforeResolve,
      shapeMatchingError
    ]),
    claimBoundary: "Deterministic bounded soft-body telemetry adapted from old tetrahedral PBD/FEM soft-body concepts. It proves tet-mesh counts, distance constraints, volume/shape metrics, ground contact response, and rigid attachment telemetry; it does not claim a production FEM solver, Neo-Hookean material parity, self-collision, render-mesh deformation, Unity soft-body asset parity, or Unreal Chaos soft-body parity."
  };
}

function vertexIndex(x: number, y: number, z: number, gridSize: number): number {
  return z * gridSize * gridSize + y * gridSize + x;
}

function uniqueTetEdges(tets: readonly (readonly [number, number, number, number])[]): Set<string> {
  const edges = new Set<string>();
  for (const tet of tets) {
    const pairs = [
      [tet[0], tet[1]],
      [tet[0], tet[2]],
      [tet[0], tet[3]],
      [tet[1], tet[2]],
      [tet[1], tet[3]],
      [tet[2], tet[3]]
    ] as const;
    for (const [a, b] of pairs) {
      edges.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
  }
  return edges;
}

function sumTetVolumes(tets: readonly (readonly [number, number, number, number])[], positions: ReadonlyMap<number, readonly [number, number, number]>): number {
  let total = 0;
  for (const tet of tets) {
    const a = positions.get(tet[0]);
    const b = positions.get(tet[1]);
    const c = positions.get(tet[2]);
    const d = positions.get(tet[3]);
    if (!a || !b || !c || !d) continue;
    total += tetVolume(a, b, c, d);
  }
  return total;
}

function tetVolume(a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number], d: readonly [number, number, number]): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]] as const;
  const cross = [
    ac[1] * ad[2] - ac[2] * ad[1],
    ac[2] * ad[0] - ac[0] * ad[2],
    ac[0] * ad[1] - ac[1] * ad[0]
  ] as const;
  return Math.abs(ab[0] * cross[0] + ab[1] * cross[1] + ab[2] * cross[2]) / 6;
}

function centerOfMass(positions: ReadonlyMap<number, readonly [number, number, number]>): readonly [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const position of positions.values()) {
    x += position[0];
    y += position[1];
    z += position[2];
  }
  const count = Math.max(1, positions.size);
  return [x / count, y / count, z / count];
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

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Soft-body fixture ${label} must be finite and non-negative.`);
  return value;
}

function integer(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`Soft-body fixture ${label} must be an integer.`);
  return value;
}

function integerInRange(value: number, label: string, min: number, max: number): number {
  const parsed = integer(value, label);
  if (parsed < min || parsed > max) throw new RangeError(`Soft-body fixture ${label} must be in the [${min}, ${max}] range.`);
  return parsed;
}
