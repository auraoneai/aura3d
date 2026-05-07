export class Vector2 {
  static readonly zero = Object.freeze(new Vector2(0, 0));
  static readonly one = Object.freeze(new Vector2(1, 1));

  constructor(
    readonly x = 0,
    readonly y = 0
  ) {}

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  subtract(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  multiplyScalar(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  lengthSquared(): number {
    return this.dot(this);
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  normalize(): Vector2 {
    const len = this.length();
    return len === 0 ? Vector2.zero.clone() : this.multiplyScalar(1 / len);
  }

  distanceTo(v: Vector2): number {
    return this.subtract(v).length();
  }

  lerp(v: Vector2, t: number): Vector2 {
    return new Vector2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }

  equals(v: Vector2, epsilon = 1e-10): boolean {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon;
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }
}
