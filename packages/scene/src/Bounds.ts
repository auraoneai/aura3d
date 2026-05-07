import { Box3, Vector3 } from "@galileo3d/math";
import { transformPoint, type Mat4, type Vec3 } from "./MathTypes.js";

export class Bounds3 {
  min: Vec3;
  max: Vec3;

  constructor(min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity]) {
    this.min = [...min] as Vec3;
    this.max = [...max] as Vec3;
  }

  static fromCenterSize(center: Vec3, size: Vec3): Bounds3 {
    return new Bounds3(
      [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
      [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
    );
  }

  static fromMathBox(box: Box3): Bounds3 {
    return new Bounds3(box.min.toArray(), box.max.toArray());
  }

  isEmpty(): boolean {
    return this.toMathBox().isEmpty();
  }

  union(other: Bounds3): Bounds3 {
    return Bounds3.fromMathBox(this.toMathBox().union(other.toMathBox()));
  }

  intersects(other: Bounds3): boolean {
    return this.toMathBox().intersectsBox(other.toMathBox());
  }

  containsPoint(point: Vec3): boolean {
    return this.toMathBox().containsPoint(new Vector3(point[0], point[1], point[2]));
  }

  transform(matrix: Mat4): Bounds3 {
    if (this.isEmpty()) return new Bounds3();
    const corners: Vec3[] = [
      [this.min[0], this.min[1], this.min[2]],
      [this.max[0], this.min[1], this.min[2]],
      [this.min[0], this.max[1], this.min[2]],
      [this.min[0], this.min[1], this.max[2]],
      [this.max[0], this.max[1], this.min[2]],
      [this.max[0], this.min[1], this.max[2]],
      [this.min[0], this.max[1], this.max[2]],
      [this.max[0], this.max[1], this.max[2]]
    ];
    return corners.reduce((bounds, corner) => bounds.includePoint(transformPoint(matrix, corner)), new Bounds3());
  }

  includePoint(point: Vec3): Bounds3 {
    this.min = [Math.min(this.min[0], point[0]), Math.min(this.min[1], point[1]), Math.min(this.min[2], point[2])];
    this.max = [Math.max(this.max[0], point[0]), Math.max(this.max[1], point[1]), Math.max(this.max[2], point[2])];
    return this;
  }

  clone(): Bounds3 {
    return new Bounds3(this.min, this.max);
  }

  toMathBox(): Box3 {
    return new Box3(new Vector3(this.min[0], this.min[1], this.min[2]), new Vector3(this.max[0], this.max[1], this.max[2]));
  }
}
