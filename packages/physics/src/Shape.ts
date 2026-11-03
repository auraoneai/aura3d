export type Vec3 = readonly [number, number, number];

// physics is tier 0 — these tuple helpers are defined locally so the package
// keeps zero Aura3D dependencies (scene/MathTypes lives at tier 1). Helpers
// return mutable tuples so callers may assign them into mutable positions.
export const EPSILON = 1e-8;

export function vec3(x = 0, y = 0, z = 0): [number, number, number] {
  return [x, y, z];
}

export function addVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVec3(a: Vec3, scalar: number): [number, number, number] {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

export function lengthVec3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalizeCanonicalVec3(a: Vec3): [number, number, number] {
  // Scale first so finite vectors close to Number.MAX_VALUE do not overflow
  // their length and accidentally normalize to the zero vector.
  const scale = Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]));
  const scaled: Vec3 = [a[0] / scale, a[1] / scale, a[2] / scale];
  const len = lengthVec3(scaled);
  return [scaled[0] / len, scaled[1] / len, scaled[2] / len];
}

export type BoxShape = {
  readonly kind: "box";
  readonly halfExtents: Vec3;
};

export type SphereShape = {
  readonly kind: "sphere";
  readonly radius: number;
};

export type CapsuleShape = {
  readonly kind: "capsule";
  readonly radius: number;
  readonly halfHeight: number;
};

export type PlaneShape = {
  readonly kind: "plane";
  readonly normal: Vec3;
  readonly constant: number;
};

export type MeshShape = {
  readonly kind: "mesh";
  readonly vertices: readonly Vec3[];
  readonly indices: readonly number[];
};

export type ConvexHullShape = {
  readonly kind: "convex-hull";
  /** All points participate in the convex volume, including unindexed points. */
  readonly vertices: readonly Vec3[];
  /** Surface triangles used for debug display; the collision hull is built from vertices. */
  readonly indices: readonly number[];
};

export type HeightfieldShape = {
  readonly kind: "heightfield";
  readonly rows: number;
  readonly columns: number;
  readonly heights: readonly number[];
  readonly cellSize: number;
};

export type PhysicsShape = BoxShape | SphereShape | CapsuleShape | PlaneShape | MeshShape | ConvexHullShape | HeightfieldShape;

export type Bounds = {
  readonly min: Vec3;
  readonly max: Vec3;
};

export function cloneVec3(value: Vec3): [number, number, number] {
  return [value[0], value[1], value[2]];
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalizeVec3(value: Vec3): [number, number, number] {
  validateFiniteVec3(value, "vector");
  if (lengthVec3(value) <= EPSILON) {
    throw new Error("Cannot normalize a zero-length vector.");
  }
  return normalizeCanonicalVec3(value);
}

export function minVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}

export function maxVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

export function validateFiniteVec3(value: Vec3, name: string): void {
  if (!value || value.length !== 3 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
    throw new Error(`${name} must be a finite 3D vector.`);
  }
}

function validatePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

export class Shape {
  /**
   * Validate both factory-created shapes and descriptors supplied directly from
   * JavaScript. This does not mutate the descriptor; worlds can reject malformed
   * geometry before allocating a native collider.
   */
  static validate(shape: PhysicsShape): void {
    if (!shape || typeof shape !== "object") throw new Error("Physics shape must be a shape descriptor.");
    switch (shape.kind) {
      case "box":
        validateFiniteVec3(shape.halfExtents, "box halfExtents");
        for (let index = 0; index < 3; index += 1) validatePositive(shape.halfExtents[index]!, "box half extent");
        return;
      case "sphere":
        validatePositive(shape.radius, "sphere radius");
        return;
      case "capsule":
        validatePositive(shape.radius, "capsule radius");
        validatePositive(shape.halfHeight, "capsule half height");
        return;
      case "plane": {
        validateFiniteVec3(shape.normal, "plane normal");
        const magnitude = lengthVec3(shape.normal);
        if (!Number.isFinite(magnitude) || Math.abs(magnitude - 1) > 1e-6) {
          throw new Error("plane normal must be a unit vector; use Shape.plane() to normalize it.");
        }
        if (!Number.isFinite(shape.constant)) throw new Error("plane constant must be finite.");
        return;
      }
      case "mesh":
        validateIndexedTriangles(shape.vertices, shape.indices, "mesh");
        return;
      case "convex-hull":
        validateConvexHull(shape.vertices, shape.indices);
        return;
      case "heightfield":
        validateHeightfield(shape);
        return;
      default:
        throw new Error(`Unknown physics shape kind '${String((shape as { kind?: unknown }).kind)}'.`);
    }
  }

  /** Return an immutable, deeply owned copy suitable for a live collider. */
  static clone(shape: PhysicsShape): PhysicsShape {
    Shape.validate(shape);
    switch (shape.kind) {
      case "box":
        return Object.freeze({ kind: "box", halfExtents: Object.freeze(cloneVec3(shape.halfExtents)) });
      case "sphere":
        return Object.freeze({ kind: "sphere", radius: shape.radius });
      case "capsule":
        return Object.freeze({ kind: "capsule", radius: shape.radius, halfHeight: shape.halfHeight });
      case "plane":
        return Object.freeze({ kind: "plane", normal: Object.freeze(cloneVec3(shape.normal)), constant: shape.constant });
      case "mesh":
      case "convex-hull":
        return Object.freeze({
          kind: shape.kind,
          vertices: Object.freeze(shape.vertices.map((vertex) => Object.freeze(cloneVec3(vertex)))),
          indices: Object.freeze([...shape.indices])
        });
      case "heightfield":
        return Object.freeze({
          kind: "heightfield", rows: shape.rows, columns: shape.columns,
          heights: Object.freeze([...shape.heights]), cellSize: shape.cellSize
        });
    }
  }

  static box(x: number, y: number, z: number): BoxShape {
    validatePositive(x, "box x half extent");
    validatePositive(y, "box y half extent");
    validatePositive(z, "box z half extent");
    return { kind: "box", halfExtents: [x, y, z] };
  }

  static sphere(radius: number): SphereShape {
    validatePositive(radius, "sphere radius");
    return { kind: "sphere", radius };
  }

  static capsule(radius: number, halfHeight: number): CapsuleShape {
    validatePositive(radius, "capsule radius");
    validatePositive(halfHeight, "capsule half height");
    return { kind: "capsule", radius, halfHeight };
  }

  static plane(normal: Vec3 = [0, 1, 0], constant = 0): PlaneShape {
    validateFiniteVec3(normal, "plane normal");
    if (!Number.isFinite(constant)) {
      throw new Error("plane constant must be finite.");
    }
    return { kind: "plane", normal: normalizeVec3(normal), constant };
  }

  static mesh(vertices: readonly Vec3[], indices: readonly number[]): MeshShape {
    validateIndexedTriangles(vertices, indices, "mesh");
    return {
      kind: "mesh",
      vertices: vertices.map(cloneVec3),
      indices: [...indices]
    };
  }

  static convexHull(vertices: readonly Vec3[], indices: readonly number[]): ConvexHullShape {
    validateConvexHull(vertices, indices);
    return {
      kind: "convex-hull",
      vertices: vertices.map(cloneVec3),
      indices: [...indices]
    };
  }

  static heightfield(rows: readonly (readonly number[])[], cellSize = 1): HeightfieldShape {
    if (rows.length < 2 || rows[0] === undefined || rows[0].length < 2) {
      throw new Error("heightfield shape requires at least two rows and two columns.");
    }
    validatePositive(cellSize, "heightfield cellSize");
    const columns = rows[0].length;
    const heights: number[] = [];
    for (const [rowIndex, row] of rows.entries()) {
      if (row.length !== columns) {
        throw new Error(`heightfield row ${rowIndex} must contain ${columns} columns.`);
      }
      for (const [columnIndex, height] of row.entries()) {
        if (!Number.isFinite(height)) {
          throw new Error(`heightfield sample [${rowIndex}, ${columnIndex}] must be finite.`);
        }
        heights.push(height);
      }
    }
    return { kind: "heightfield", rows: rows.length, columns, heights, cellSize };
  }

  static bounds(shape: PhysicsShape, position: Vec3, rotation: readonly [number, number, number, number] = [0, 0, 0, 1]): Bounds {
    validateFiniteVec3(position, "shape position");
    const unitRotation = normalizeBoundsRotation(rotation);
    switch (shape.kind) {
      case "box":
        return boundsFromLocalVertices(boxVertices(shape.halfExtents), position, unitRotation);
      case "sphere":
        return {
          min: [position[0] - shape.radius, position[1] - shape.radius, position[2] - shape.radius],
          max: [position[0] + shape.radius, position[1] + shape.radius, position[2] + shape.radius]
        };
      case "capsule": {
        const axis = rotateVec3ByQuat([0, shape.halfHeight, 0], unitRotation);
        return {
          min: [
            position[0] - Math.abs(axis[0]) - shape.radius,
            position[1] - Math.abs(axis[1]) - shape.radius,
            position[2] - Math.abs(axis[2]) - shape.radius
          ],
          max: [
            position[0] + Math.abs(axis[0]) + shape.radius,
            position[1] + Math.abs(axis[1]) + shape.radius,
            position[2] + Math.abs(axis[2]) + shape.radius
          ]
        };
      }
      case "plane":
        return {
          min: [-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER],
          max: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
        };
      case "mesh":
      case "convex-hull":
        return boundsFromLocalVertices(shape.vertices, position, unitRotation);
      case "heightfield": {
        const halfWidth = (shape.columns - 1) * shape.cellSize * 0.5;
        const halfDepth = (shape.rows - 1) * shape.cellSize * 0.5;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (const height of shape.heights) {
          minHeight = Math.min(minHeight, height);
          maxHeight = Math.max(maxHeight, height);
        }
        // Rotation can make any corner of this local box extremal. Four
        // diagonally paired corners do not contain a tilted heightfield.
        return boundsFromLocalVertices([
          [-halfWidth, minHeight, -halfDepth],
          [halfWidth, minHeight, -halfDepth],
          [-halfWidth, minHeight, halfDepth],
          [halfWidth, minHeight, halfDepth],
          [-halfWidth, maxHeight, -halfDepth],
          [halfWidth, maxHeight, -halfDepth],
          [-halfWidth, maxHeight, halfDepth],
          [halfWidth, maxHeight, halfDepth]
        ], position, unitRotation);
      }
    }
  }
}

function validateIndexedTriangles(vertices: readonly Vec3[], indices: readonly number[], label: string): void {
    if (!vertices || vertices.length < 3) {
      throw new Error(`${label} shape requires at least three vertices.`);
    }
    for (const [index, vertex] of vertices.entries()) {
      validateFiniteVec3(vertex, `${label} vertex ${index}`);
    }
    if (!indices || indices.length === 0 || indices.length % 3 !== 0) {
      throw new Error(`${label} shape indices must contain one or more complete triangles.`);
    }
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= vertices.length) {
        throw new Error(`${label} shape index ${index} is out of range.`);
      }
    }
    let hasArea = false;
    for (let index = 0; index < indices.length; index += 3) {
      const a = vertices[indices[index]!]!;
      const b = vertices[indices[index + 1]!]!;
      const c = vertices[indices[index + 2]!]!;
      const ab = subVec3(b, a);
      const ac = subVec3(c, a);
      const extent = Math.max(...ab.map(Math.abs), ...ac.map(Math.abs));
      if (!Number.isFinite(extent)) throw new Error(`${label} shape vertices exceed finite geometry bounds.`);
      if (extent > 0) {
        const abUnit: Vec3 = [ab[0] / extent, ab[1] / extent, ab[2] / extent];
        const acUnit: Vec3 = [ac[0] / extent, ac[1] / extent, ac[2] / extent];
        if (lengthVec3(crossVec3(abUnit, acUnit)) > 1e-12) {
          hasArea = true;
          break;
        }
      }
    }
    if (!hasArea) throw new Error(`${label} shape requires at least one non-degenerate triangle.`);
}

function validateConvexHull(vertices: readonly Vec3[], indices: readonly number[]): void {
  if (!vertices || vertices.length < 4) throw new Error("convex hull shape requires at least four vertices.");
  validateIndexedTriangles(vertices, indices, "convex hull");

  // A convex volume needs four affinely independent points. Normalize by the
  // largest displacement first so this test is invariant to the authored scale.
  const origin = vertices[0]!;
  let extent = 0;
  for (const point of vertices) {
    extent = Math.max(extent, Math.abs(point[0] - origin[0]), Math.abs(point[1] - origin[1]), Math.abs(point[2] - origin[2]));
  }
  if (!Number.isFinite(extent) || extent === 0) throw new Error("convex hull vertices must span a finite 3D volume.");
  const offsets = vertices.map((point): Vec3 => [
    (point[0] - origin[0]) / extent,
    (point[1] - origin[1]) / extent,
    (point[2] - origin[2]) / extent
  ]);
  const first = offsets.reduce((best, point) => lengthVec3(point) > lengthVec3(best) ? point : best, offsets[0]!);
  const normal = offsets.reduce((best, point) => {
    const candidate = crossVec3(first, point);
    return lengthVec3(candidate) > lengthVec3(best) ? candidate : best;
  }, [0, 0, 0] as Vec3);
  if (lengthVec3(normal) <= 1e-12 || !offsets.some((point) => Math.abs(dotVec3(normal, point)) > 1e-12 * lengthVec3(normal))) {
    throw new Error("convex hull vertices must span a finite 3D volume.");
  }
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function validateHeightfield(shape: HeightfieldShape): void {
  if (!Number.isSafeInteger(shape.rows) || shape.rows < 2 || !Number.isSafeInteger(shape.columns) || shape.columns < 2) {
    throw new Error("heightfield shape requires at least two rows and two columns.");
  }
  validatePositive(shape.cellSize, "heightfield cellSize");
  if (!Number.isSafeInteger(shape.rows * shape.columns) || !shape.heights || shape.heights.length !== shape.rows * shape.columns) {
    throw new Error("heightfield heights must contain rows*columns samples.");
  }
  for (const [index, height] of shape.heights.entries()) {
    if (!Number.isFinite(height)) throw new Error(`heightfield sample ${index} must be finite.`);
  }
}

function normalizeBoundsRotation(rotation: readonly [number, number, number, number]): [number, number, number, number] {
  if (!rotation || rotation.length !== 4 || !rotation.every(Number.isFinite)) {
    throw new Error("shape rotation must be a finite quaternion.");
  }
  const scale = Math.max(...rotation.map(Math.abs));
  if (scale === 0) throw new Error("shape rotation quaternion cannot be zero.");
  const scaled = rotation.map((value) => value / scale);
  const length = Math.hypot(...scaled);
  return [scaled[0]! / length, scaled[1]! / length, scaled[2]! / length, scaled[3]! / length];
}

function boxVertices(halfExtents: Vec3): readonly Vec3[] {
  const [x, y, z] = halfExtents;
  return [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
  ];
}

function boundsFromLocalVertices(
  vertices: readonly Vec3[],
  position: Vec3,
  rotation: readonly [number, number, number, number]
): Bounds {
  const first = addVec3(position, rotateVec3ByQuat(vertices[0]!, rotation));
  let min = cloneVec3(first);
  let max = cloneVec3(first);
  for (let index = 1; index < vertices.length; index += 1) {
    const vertex = addVec3(position, rotateVec3ByQuat(vertices[index]!, rotation));
    min = minVec3(min, vertex);
    max = maxVec3(max, vertex);
  }
  return { min, max };
}

export function rotateVec3ByQuat(v: Vec3, q: readonly [number, number, number, number]): [number, number, number] {
  // q * v * q^-1 for rotating a vector by a unit quaternion
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx)
  ];
}
