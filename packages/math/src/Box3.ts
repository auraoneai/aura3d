import { Matrix4 } from "./Matrix4.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";

export class Box3 {
  constructor(
    readonly min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    readonly max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  ) {}

  static fromPoints(points: readonly Vector3[]): Box3 {
    return points.reduce((box, point) => box.expandByPoint(point), new Box3());
  }

  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  expandByPoint(point: Vector3): Box3 {
    return new Box3(this.min.min(point), this.max.max(point));
  }

  union(box: Box3): Box3 {
    if (this.isEmpty()) return box;
    if (box.isEmpty()) return this;
    return new Box3(this.min.min(box.min), this.max.max(box.max));
  }

  intersectsBox(box: Box3): boolean {
    if (this.isEmpty() || box.isEmpty()) return false;
    return !(box.max.x < this.min.x || box.min.x > this.max.x || box.max.y < this.min.y || box.min.y > this.max.y || box.max.z < this.min.z || box.min.z > this.max.z);
  }

  containsPoint(point: Vector3): boolean {
    return !this.isEmpty() && point.x >= this.min.x && point.x <= this.max.x && point.y >= this.min.y && point.y <= this.max.y && point.z >= this.min.z && point.z <= this.max.z;
  }

  getCenter(): Vector3 {
    return this.isEmpty() ? Vector3.zero.clone() : this.min.add(this.max).multiplyScalar(0.5);
  }

  getSize(): Vector3 {
    return this.isEmpty() ? Vector3.zero.clone() : this.max.subtract(this.min);
  }

  getBoundingSphere(): Sphere {
    const center = this.getCenter();
    return new Sphere(center, center.distanceTo(this.max));
  }

  transform(matrix: Matrix4): Box3 {
    if (this.isEmpty()) return new Box3();
    const corners = [
      new Vector3(this.min.x, this.min.y, this.min.z),
      new Vector3(this.min.x, this.min.y, this.max.z),
      new Vector3(this.min.x, this.max.y, this.min.z),
      new Vector3(this.min.x, this.max.y, this.max.z),
      new Vector3(this.max.x, this.min.y, this.min.z),
      new Vector3(this.max.x, this.min.y, this.max.z),
      new Vector3(this.max.x, this.max.y, this.min.z),
      new Vector3(this.max.x, this.max.y, this.max.z)
    ];
    return Box3.fromPoints(corners.map((corner) => matrix.transformPoint(corner)));
  }
}
