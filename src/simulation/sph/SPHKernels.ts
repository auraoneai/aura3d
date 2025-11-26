import { Vector3 as Vec3 } from '../../math/Vector3';

export class SPHKernels {
  private h: number;
  private h2: number;
  private h3: number;
  private h6: number;
  private h9: number;

  private poly6Constant: number;
  private spikyGradConstant: number;
  private viscosityLaplacianConstant: number;

  constructor(smoothingRadius: number) {
    this.h = smoothingRadius;
    this.h2 = this.h * this.h;
    this.h3 = this.h2 * this.h;
    this.h6 = this.h3 * this.h3;
    this.h9 = this.h6 * this.h3;

    this.poly6Constant = 315.0 / (64.0 * Math.PI * this.h9);
    this.spikyGradConstant = -45.0 / (Math.PI * this.h6);
    this.viscosityLaplacianConstant = 45.0 / (Math.PI * this.h6);
  }

  public getSmoothingRadius(): number {
    return this.h;
  }

  public poly6(r: number): number {
    if (r < 0 || r >= this.h) {
      return 0;
    }

    const h2MinusR2 = this.h2 - r * r;
    return this.poly6Constant * h2MinusR2 * h2MinusR2 * h2MinusR2;
  }

  public poly6Vector(rVec: Vec3): number {
    const r = rVec.length();
    return this.poly6(r);
  }

  public poly6Gradient(rVec: Vec3): Vec3 {
    const r2 = rVec.lengthSquared();
    if (r2 >= this.h2 || r2 < 1e-12) {
      return new Vec3(0, 0, 0);
    }

    const h2MinusR2 = this.h2 - r2;
    const factor = -6.0 * this.poly6Constant * h2MinusR2 * h2MinusR2;

    return new Vec3(
      factor * rVec.x,
      factor * rVec.y,
      factor * rVec.z
    );
  }

  public poly6Laplacian(r: number): number {
    if (r < 0 || r >= this.h) {
      return 0;
    }

    const r2 = r * r;
    const h2MinusR2 = this.h2 - r2;
    const factor = -24.0 * this.poly6Constant * h2MinusR2;

    return factor * (this.h2 - r2 - 2.0 * r2);
  }

  public spikyGradient(rVec: Vec3): Vec3 {
    const r = rVec.length();
    if (r >= this.h || r < 1e-12) {
      return new Vec3(0, 0, 0);
    }

    const hMinusR = this.h - r;
    const factor = this.spikyGradConstant * hMinusR * hMinusR / r;

    return new Vec3(
      factor * rVec.x,
      factor * rVec.y,
      factor * rVec.z
    );
  }

  public spikyGradientMagnitude(r: number): number {
    if (r >= this.h || r < 1e-12) {
      return 0;
    }

    const hMinusR = this.h - r;
    return this.spikyGradConstant * hMinusR * hMinusR / r;
  }

  public viscosityLaplacian(r: number): number {
    if (r >= this.h || r < 0) {
      return 0;
    }

    return this.viscosityLaplacianConstant * (this.h - r);
  }

  public viscosityLaplacianVector(rVec: Vec3): number {
    const r = rVec.length();
    return this.viscosityLaplacian(r);
  }

  public cubicSpline(r: number): number {
    const q = r / this.h;

    if (q >= 2.0) {
      return 0;
    }

    const factor = 1.0 / (Math.PI * this.h3);

    if (q < 1.0) {
      return factor * (1.0 - 1.5 * q * q * (1.0 - 0.5 * q));
    } else {
      const twoMinusQ = 2.0 - q;
      return factor * 0.25 * twoMinusQ * twoMinusQ * twoMinusQ;
    }
  }

  public cubicSplineGradient(rVec: Vec3): Vec3 {
    const r = rVec.length();
    if (r < 1e-12) {
      return new Vec3(0, 0, 0);
    }

    const q = r / this.h;

    if (q >= 2.0) {
      return new Vec3(0, 0, 0);
    }

    const factor = 1.0 / (Math.PI * this.h3);
    let gradMagnitude: number;

    if (q < 1.0) {
      gradMagnitude = factor * (-3.0 * q + 2.25 * q * q) / this.h;
    } else {
      const twoMinusQ = 2.0 - q;
      gradMagnitude = -factor * 0.75 * twoMinusQ * twoMinusQ / this.h;
    }

    const normalizedR = Vec3.multiplyScalar(rVec, 1.0 / r);
    return Vec3.multiplyScalar(normalizedR, gradMagnitude);
  }

  public wendland(r: number): number {
    const q = r / this.h;

    if (q >= 1.0) {
      return 0;
    }

    const oneMinusQ = 1.0 - q;
    const factor = 21.0 / (16.0 * Math.PI * this.h3);

    return factor * oneMinusQ * oneMinusQ * oneMinusQ * oneMinusQ * (1.0 + 4.0 * q);
  }

  public wendlandGradient(rVec: Vec3): Vec3 {
    const r = rVec.length();
    if (r < 1e-12) {
      return new Vec3(0, 0, 0);
    }

    const q = r / this.h;

    if (q >= 1.0) {
      return new Vec3(0, 0, 0);
    }

    const oneMinusQ = 1.0 - q;
    const factor = 21.0 / (16.0 * Math.PI * this.h3);

    const gradMagnitude = factor * (-20.0 * q * oneMinusQ * oneMinusQ * oneMinusQ) / this.h;

    const normalizedR = Vec3.multiplyScalar(rVec, 1.0 / r);
    return Vec3.multiplyScalar(normalizedR, gradMagnitude);
  }

  public cohesion(r: number): number {
    const twoH = 2.0 * this.h;

    if (r >= twoH || r < 0) {
      return 0;
    }

    const factor = 32.0 / (Math.PI * this.h9);

    if (r <= this.h) {
      const twoHMinusR = twoH - r;
      const rCubed = r * r * r;
      return factor * twoHMinusR * twoHMinusR * twoHMinusR * rCubed - this.h6 / 64.0;
    } else {
      const twoHMinusR = twoH - r;
      return factor * twoHMinusR * twoHMinusR * twoHMinusR * r * r * r;
    }
  }

  public cohesionGradient(rVec: Vec3): Vec3 {
    const r = rVec.length();
    if (r < 1e-12) {
      return new Vec3(0, 0, 0);
    }

    const twoH = 2.0 * this.h;

    if (r >= twoH) {
      return new Vec3(0, 0, 0);
    }

    const factor = 32.0 / (Math.PI * this.h9);
    let gradMagnitude: number;

    if (r <= this.h) {
      const twoHMinusR = twoH - r;
      const rSquared = r * r;
      gradMagnitude = factor * (
        -3.0 * twoHMinusR * twoHMinusR * r * r * r +
        3.0 * twoHMinusR * twoHMinusR * twoHMinusR * rSquared
      );
    } else {
      const twoHMinusR = twoH - r;
      const rSquared = r * r;
      gradMagnitude = factor * (
        -3.0 * twoHMinusR * twoHMinusR * rSquared * r +
        3.0 * twoHMinusR * twoHMinusR * twoHMinusR * rSquared
      );
    }

    const normalizedR = Vec3.multiplyScalar(rVec, 1.0 / r);
    return Vec3.multiplyScalar(normalizedR, gradMagnitude);
  }

  public adhesion(r: number): number {
    const twoH = 2.0 * this.h;

    if (r >= twoH || r < 0) {
      return 0;
    }

    const factor = 0.007 / (this.h3 * this.h * 0.25);

    if (r <= this.h) {
      const rByH = r / this.h;
      return factor * Math.pow(1.0 - rByH * rByH, 3) * (1.0 + 3.0 * rByH * rByH);
    } else {
      const ratio = (twoH - r) / this.h;
      return factor * ratio * ratio * ratio;
    }
  }

  public setRadius(newRadius: number): void {
    this.h = newRadius;
    this.h2 = this.h * this.h;
    this.h3 = this.h2 * this.h;
    this.h6 = this.h3 * this.h3;
    this.h9 = this.h6 * this.h3;

    this.poly6Constant = 315.0 / (64.0 * Math.PI * this.h9);
    this.spikyGradConstant = -45.0 / (Math.PI * this.h6);
    this.viscosityLaplacianConstant = 45.0 / (Math.PI * this.h6);
  }
}
