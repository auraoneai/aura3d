import { Vector3 } from "./Vector3.js";

/**
 * Third-order spherical harmonics (9 coefficients) —
 * three.js `SphericalHarmonics3` parity: `getAt`, `getIrradianceAt`,
 * `getBasisAt`, `add`, `addScaledSH`, `scale`, `lerp`.
 *
 * Uses three's basis/sign convention (positive harmonics); this differs from
 * the rendering package's internal SH9 projection and is intentionally kept
 * separate — `R/environment/SphericalHarmonics.ts` stays internal.
 */
export class SphericalHarmonics3 {
  /** 9 band-0/1/2 coefficients, RGB each (three `coefficients`). */
  readonly coefficients: Vector3[];

  constructor(coefficients?: readonly Vector3[]) {
    this.coefficients = [];
    for (let i = 0; i < 9; i += 1) {
      this.coefficients.push(coefficients?.[i] ?? new Vector3(0, 0, 0));
    }
  }

  set(coefficients: readonly Vector3[]): SphericalHarmonics3 {
    return new SphericalHarmonics3(coefficients);
  }

  zero(): SphericalHarmonics3 {
    return new SphericalHarmonics3();
  }

  clone(): SphericalHarmonics3 {
    return new SphericalHarmonics3(this.coefficients);
  }

  copy(sh: SphericalHarmonics3): SphericalHarmonics3 {
    return new SphericalHarmonics3(sh.coefficients);
  }

  /** Irradiance-free evaluation at unit `normal` (three `getAt`). */
  getAt(normal: Vector3): Vector3 {
    const basis = SphericalHarmonics3.getBasisAt(normal);
    let target = new Vector3(0, 0, 0);
    for (let i = 0; i < 9; i += 1) {
      target = target.addScaled(this.coefficients[i]!, basis[i]!);
    }
    return target;
  }

  /** Lambert-convolved evaluation at unit `normal` (three `getIrradianceAt`). */
  getIrradianceAt(normal: Vector3): Vector3 {
    const x = normal.x;
    const y = normal.y;
    const z = normal.z;
    const coeff = this.coefficients;
    return coeff[0]!.multiplyScalar(0.886227) // π * 0.282095
      .addScaled(coeff[1]!, 2.0 * 0.511664 * y) // ( 2 * π / 3 ) * 0.488603
      .addScaled(coeff[2]!, 2.0 * 0.511664 * z)
      .addScaled(coeff[3]!, 2.0 * 0.511664 * x)
      .addScaled(coeff[4]!, 2.0 * 0.429043 * x * y) // ( π / 4 ) * 1.092548
      .addScaled(coeff[5]!, 2.0 * 0.429043 * y * z)
      .addScaled(coeff[6]!, 0.743125 * z * z - 0.247708) // ( π / 4 ) * 0.315392 * 3
      .addScaled(coeff[7]!, 2.0 * 0.429043 * x * z)
      .addScaled(coeff[8]!, 0.429043 * (x * x - y * y)); // ( π / 4 ) * 0.546274
  }

  /**
   * nine basis function values at unit `normal` (three `getBasisAt(normal, shBasis)`):
   * fills and returns `target` when given (three's out-parameter form), otherwise a new array.
   */
  static getBasisAt(normal: Vector3, target?: number[]): number[] {
    const x = normal.x;
    const y = normal.y;
    const z = normal.z;
    const shBasis = target ?? new Array<number>(9);
    // band 0
    shBasis[0] = 0.282095;
    // band 1
    shBasis[1] = 0.488603 * y;
    shBasis[2] = 0.488603 * z;
    shBasis[3] = 0.488603 * x;
    // band 2
    shBasis[4] = 1.092548 * x * y;
    shBasis[5] = 1.092548 * y * z;
    shBasis[6] = 0.315392 * (3 * z * z - 1);
    shBasis[7] = 1.092548 * x * z;
    shBasis[8] = 0.546274 * (x * x - y * y);
    return shBasis;
  }

  getBasisAt(normal: Vector3, target?: number[]): number[] {
    return SphericalHarmonics3.getBasisAt(normal, target);
  }

  add(sh: SphericalHarmonics3): SphericalHarmonics3 {
    const coeffs = this.coefficients.map((c, i) => c.add(sh.coefficients[i]!));
    return new SphericalHarmonics3(coeffs);
  }

  addScaledSH(sh: SphericalHarmonics3, s: number): SphericalHarmonics3 {
    const coeffs = this.coefficients.map((c, i) => c.addScaled(sh.coefficients[i]!, s));
    return new SphericalHarmonics3(coeffs);
  }

  scale(s: number): SphericalHarmonics3 {
    return new SphericalHarmonics3(this.coefficients.map((c) => c.multiplyScalar(s)));
  }

  lerp(sh: SphericalHarmonics3, alpha: number): SphericalHarmonics3 {
    return new SphericalHarmonics3(this.coefficients.map((c, i) => c.lerp(sh.coefficients[i]!, alpha)));
  }

  equals(sh: SphericalHarmonics3, epsilon = 1e-10): boolean {
    return this.coefficients.every((c, i) => c.equals(sh.coefficients[i]!, epsilon));
  }

  /** `[r0,g0,b0, r1,g1,b1, ...]` (three `fromArray`/`toArray` layout). */
  static fromArray(array: ArrayLike<number>, offset = 0): SphericalHarmonics3 {
    const coeffs: Vector3[] = [];
    for (let i = 0; i < 9; i += 1) {
      coeffs.push(new Vector3(array[offset + i * 3]!, array[offset + i * 3 + 1]!, array[offset + i * 3 + 2]!));
    }
    return new SphericalHarmonics3(coeffs);
  }

  toArray(offset = 0, array: number[] = []): number[] {
    for (let i = 0; i < 9; i += 1) {
      const c = this.coefficients[i]!;
      array[offset + i * 3] = c.x;
      array[offset + i * 3 + 1] = c.y;
      array[offset + i * 3 + 2] = c.z;
    }
    return array;
  }
}
