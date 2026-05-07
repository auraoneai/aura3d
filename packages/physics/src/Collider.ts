import { Shape, type Bounds, type PhysicsShape, type Vec3 } from "./Shape.js";

export type CollisionFilter = {
  readonly layer: number;
  readonly mask: number;
};

export type ColliderMaterial = {
  readonly restitution: number;
  readonly friction: number;
};

export type ColliderDescriptor = {
  readonly shape: PhysicsShape;
  readonly sensor?: boolean;
  readonly filter?: Partial<CollisionFilter>;
  readonly material?: Partial<ColliderMaterial>;
};

export class Collider {
  readonly id: number;
  readonly bodyId: number;
  readonly shape: PhysicsShape;
  readonly sensor: boolean;
  readonly filter: CollisionFilter;
  readonly material: ColliderMaterial;

  constructor(id: number, bodyId: number, descriptor: ColliderDescriptor) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Collider id must be a positive integer.");
    }
    if (!Number.isInteger(bodyId) || bodyId <= 0) {
      throw new Error("Collider body id must be a positive integer.");
    }
    this.id = id;
    this.bodyId = bodyId;
    this.shape = descriptor.shape;
    this.sensor = descriptor.sensor ?? false;
    this.filter = {
      layer: descriptor.filter?.layer ?? 1,
      mask: descriptor.filter?.mask ?? 0xffffffff
    };
    this.material = {
      restitution: descriptor.material?.restitution ?? 0,
      friction: descriptor.material?.friction ?? 0.5
    };
    if (this.filter.layer < 0 || this.filter.mask < 0) {
      throw new Error("Collider filter layer and mask must be non-negative bit masks.");
    }
    if (
      !Number.isFinite(this.material.restitution) ||
      !Number.isFinite(this.material.friction) ||
      this.material.restitution < 0 ||
      this.material.friction < 0
    ) {
      throw new Error("Collider material values must be finite and non-negative.");
    }
  }

  canCollideWith(other: Collider): boolean {
    return (this.filter.mask & other.filter.layer) !== 0 && (other.filter.mask & this.filter.layer) !== 0;
  }

  bounds(position: Vec3): Bounds {
    return Shape.bounds(this.shape, position);
  }
}
