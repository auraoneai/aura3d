export class Vector3Compat {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(value: Vector3Compat): this {
    return this.set(value.x, value.y, value.z);
  }

  clone(): Vector3Compat {
    return new Vector3Compat(this.x, this.y, this.z);
  }

  add(value: Vector3Compat): this {
    this.x += value.x;
    this.y += value.y;
    this.z += value.z;
    return this;
  }

  sub(value: Vector3Compat): this {
    this.x -= value.x;
    this.y -= value.y;
    this.z -= value.z;
    return this;
  }

  multiplyScalar(value: number): this {
    this.x *= value;
    this.y *= value;
    this.z *= value;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  normalize(): this {
    const length = this.length();
    return length > 0 ? this.multiplyScalar(1 / length) : this;
  }
}

export class QuaternionCompat {
  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
}

export class ColorCompat {
  constructor(public r = 1, public g = 1, public b = 1) {}

  setRGB(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
}

export class Matrix4Compat {
  readonly elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  identity(): this {
    this.elements.splice(0, this.elements.length, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    return this;
  }
}
