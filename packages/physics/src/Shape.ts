export type Vec3 = readonly [number, number, number];

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
  readonly vertices: readonly Vec3[];
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

export const EPSILON = 1e-9;

export function vec3(x = 0, y = 0, z = 0): [number, number, number] {
  return [x, y, z];
}

export function cloneVec3(value: Vec3): [number, number, number] {
  return [value[0], value[1], value[2]];
}

export function addVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVec3(value: Vec3, scalar: number): [number, number, number] {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function lengthVec3(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

export function normalizeVec3(value: Vec3): [number, number, number] {
  const length = lengthVec3(value);
  if (length <= EPSILON) {
    throw new Error("Cannot normalize a zero-length vector.");
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

export function minVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}

export function maxVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

export function validateFiniteVec3(value: Vec3, name: string): void {
  if (value.length !== 3 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
    throw new Error(`${name} must be a finite 3D vector.`);
  }
}

function validatePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

export class Shape {
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
    if (vertices.length < 4) {
      throw new Error("convex hull shape requires at least four vertices.");
    }
    validateIndexedTriangles(vertices, indices, "convex hull");
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
    switch (shape.kind) {
      case "box":
        return boundsFromLocalVertices(boxVertices(shape.halfExtents), position, rotation);
      case "sphere":
        return {
          min: [position[0] - shape.radius, position[1] - shape.radius, position[2] - shape.radius],
          max: [position[0] + shape.radius, position[1] + shape.radius, position[2] + shape.radius]
        };
      case "capsule": {
        const axis = rotateVec3ByQuat([0, shape.halfHeight, 0], rotation);
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
        return boundsFromLocalVertices(shape.vertices, position, rotation);
      case "heightfield": {
        const halfWidth = (shape.columns - 1) * shape.cellSize * 0.5;
        const halfDepth = (shape.rows - 1) * shape.cellSize * 0.5;
        const minHeight = Math.min(...shape.heights);
        const maxHeight = Math.max(...shape.heights);
        return boundsFromLocalVertices([
          [-halfWidth, minHeight, -halfDepth],
          [halfWidth, minHeight, -halfDepth],
          [-halfWidth, maxHeight, halfDepth],
          [halfWidth, maxHeight, halfDepth]
        ], position, rotation);
      }
    }
  }
}

function validateIndexedTriangles(vertices: readonly Vec3[], indices: readonly number[], label: string): void {
    if (vertices.length < 3) {
      throw new Error(`${label} shape requires at least three vertices.`);
    }
    for (const [index, vertex] of vertices.entries()) {
      validateFiniteVec3(vertex, `${label} vertex ${index}`);
    }
    if (indices.length === 0 || indices.length % 3 !== 0) {
      throw new Error(`${label} shape indices must contain one or more complete triangles.`);
    }
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= vertices.length) {
        throw new Error(`${label} shape index ${index} is out of range.`);
      }
    }
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
