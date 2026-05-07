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

export type PhysicsShape = BoxShape | SphereShape | CapsuleShape | PlaneShape | MeshShape;

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
    if (vertices.length < 3) {
      throw new Error("mesh shape requires at least three vertices.");
    }
    for (const [index, vertex] of vertices.entries()) {
      validateFiniteVec3(vertex, `mesh vertex ${index}`);
    }
    if (indices.length === 0 || indices.length % 3 !== 0) {
      throw new Error("mesh shape indices must contain one or more complete triangles.");
    }
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= vertices.length) {
        throw new Error(`mesh shape index ${index} is out of range.`);
      }
    }
    return {
      kind: "mesh",
      vertices: vertices.map(cloneVec3),
      indices: [...indices]
    };
  }

  static bounds(shape: PhysicsShape, position: Vec3): Bounds {
    validateFiniteVec3(position, "shape position");
    switch (shape.kind) {
      case "box":
        return {
          min: subVec3(position, shape.halfExtents),
          max: addVec3(position, shape.halfExtents)
        };
      case "sphere":
        return {
          min: [position[0] - shape.radius, position[1] - shape.radius, position[2] - shape.radius],
          max: [position[0] + shape.radius, position[1] + shape.radius, position[2] + shape.radius]
        };
      case "capsule": {
        const yRadius = shape.radius + shape.halfHeight;
        return {
          min: [position[0] - shape.radius, position[1] - yRadius, position[2] - shape.radius],
          max: [position[0] + shape.radius, position[1] + yRadius, position[2] + shape.radius]
        };
      }
      case "plane":
        return {
          min: [-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER],
          max: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
        };
      case "mesh": {
        let min = addVec3(position, shape.vertices[0]!);
        let max = cloneVec3(min);
        for (let index = 1; index < shape.vertices.length; index += 1) {
          const vertex = addVec3(position, shape.vertices[index]!);
          min = minVec3(min, vertex);
          max = maxVec3(max, vertex);
        }
        return { min, max };
      }
    }
  }
}
