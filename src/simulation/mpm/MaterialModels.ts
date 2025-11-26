import { Matrix3 as Mat3 } from '../../math/Matrix3';

export enum MaterialType {
  NeoHookean = 0,
  Fluid = 1,
  Snow = 2,
  Sand = 3
}

export interface MaterialParameters {
  youngsModulus: number;
  poissonsRatio: number;
  density: number;
  bulkModulus?: number;
  criticalCompression?: number;
  criticalStretch?: number;
  hardeningCoefficient?: number;
  frictionAngle?: number;
  cohesion?: number;
}

export class MaterialModel {
  protected parameters: MaterialParameters;
  protected lambda: number;
  protected mu: number;

  constructor(parameters: MaterialParameters) {
    this.parameters = parameters;

    const E = parameters.youngsModulus;
    const nu = parameters.poissonsRatio;
    this.lambda = (E * nu) / ((1 + nu) * (1 - 2 * nu));
    this.mu = E / (2 * (1 + nu));
  }

  public computeStress(
    deformationGradient: Mat3,
    deformationGradientPlastic: Mat3,
    dt: number
  ): { stress: Mat3; newFp: Mat3 } {
    return {
      stress: new Mat3(),
      newFp: deformationGradientPlastic.clone()
    };
  }

  protected svd3x3(F: Mat3): { U: Mat3; S: Mat3; V: Mat3 } {
    const FtF = Mat3.multiply(F.transpose(), F);
    const { eigenvalues, eigenvectors } = this.eigenDecomposition3x3(FtF);

    const sigma1 = Math.sqrt(Math.max(0, eigenvalues[0]));
    const sigma2 = Math.sqrt(Math.max(0, eigenvalues[1]));
    const sigma3 = Math.sqrt(Math.max(0, eigenvalues[2]));

    const V = new Mat3();
    V.set(
      eigenvectors[0]!.elements[0], eigenvectors[1]!.elements[0], eigenvectors[2]!.elements[0],
      eigenvectors[0]!.elements[1], eigenvectors[1]!.elements[1], eigenvectors[2]!.elements[1],
      eigenvectors[0]!.elements[2], eigenvectors[1]!.elements[2], eigenvectors[2]!.elements[2]
    );

    const S = new Mat3();
    S.set(
      sigma1, 0, 0,
      0, sigma2, 0,
      0, 0, sigma3
    );

    const Sinv = new Mat3();
    Sinv.set(
      sigma1 > 1e-10 ? 1 / sigma1 : 0, 0, 0,
      0, sigma2 > 1e-10 ? 1 / sigma2 : 0, 0,
      0, 0, sigma3 > 1e-10 ? 1 / sigma3 : 0
    );

    const U = Mat3.multiply(Mat3.multiply(F, V), Sinv);

    return { U, S, V };
  }

  protected eigenDecomposition3x3(A: Mat3): {
    eigenvalues: number[];
    eigenvectors: Mat3[];
  } {
    const maxIterations = 50;
    const epsilon = 1e-10;

    let matrix = A.clone();
    let Q = Mat3.identity();

    for (let iter = 0; iter < maxIterations; iter++) {
      let maxOffDiag = 0;
      let p = 0, q = 1;

      const offDiagElements = [
        { val: Math.abs(matrix.elements[3]), p: 0, q: 1 },  // m01
        { val: Math.abs(matrix.elements[6]), p: 0, q: 2 },  // m02
        { val: Math.abs(matrix.elements[7]), p: 1, q: 2 }   // m12
      ];

      for (const elem of offDiagElements) {
        if (elem.val > maxOffDiag) {
          maxOffDiag = elem.val;
          p = elem.p;
          q = elem.q;
        }
      }

      if (maxOffDiag < epsilon) break;

      const app = this.getMatrixElement(matrix, p, p);
      const aqq = this.getMatrixElement(matrix, q, q);
      const apq = this.getMatrixElement(matrix, p, q);

      const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
      const c = Math.cos(theta);
      const s = Math.sin(theta);

      const G = Mat3.identity();
      this.setMatrixElement(G, p, p, c);
      this.setMatrixElement(G, q, q, c);
      this.setMatrixElement(G, p, q, s);
      this.setMatrixElement(G, q, p, -s);

      matrix = Mat3.multiply(Mat3.multiply(G.transpose(), matrix), G);
      Q = Mat3.multiply(Q, G);
    }

    const eigenvalues = [matrix.elements[0], matrix.elements[4], matrix.elements[8]];  // m00, m11, m22
    const ev0 = new Mat3();
    ev0.set(Q.elements[0], 0, 0, Q.elements[1], 0, 0, Q.elements[2], 0, 0);
    const ev1 = new Mat3();
    ev1.set(Q.elements[3], 0, 0, Q.elements[4], 0, 0, Q.elements[5], 0, 0);
    const ev2 = new Mat3();
    ev2.set(Q.elements[6], 0, 0, Q.elements[7], 0, 0, Q.elements[8], 0, 0);
    const eigenvectors = [ev0, ev1, ev2];

    return { eigenvalues, eigenvectors };
  }

  private getMatrixElement(m: Mat3, i: number, j: number): number {
    // Column-major: elements[col * 3 + row]
    return m.elements[j * 3 + i];
  }

  private setMatrixElement(m: Mat3, i: number, j: number, val: number): void {
    // Column-major: elements[col * 3 + row]
    m.elements[j * 3 + i] = val;
  }
}

export class NeoHookeanModel extends MaterialModel {
  constructor(parameters: MaterialParameters) {
    super(parameters);
  }

  public override computeStress(
    deformationGradient: Mat3,
    deformationGradientPlastic: Mat3,
    dt: number
  ): { stress: Mat3; newFp: Mat3 } {
    const F = deformationGradient;
    const J = F.determinant();

    if (J <= 0) {
      return {
        stress: new Mat3(),
        newFp: deformationGradientPlastic.clone()
      };
    }

    const Ft = F.transpose();
    const FtF = Mat3.multiply(Ft, F);
    const I = Mat3.identity();

    const logJ = Math.log(J);
    const Jinv = 1 / J;

    const P1 = Mat3.subtract(FtF, I);
    const P2 = Mat3.multiplyScalar(I, logJ);

    const stress1 = Mat3.multiplyScalar(P1, this.mu * Jinv);
    const stress2 = Mat3.multiplyScalar(P2, this.lambda * Jinv);

    const stress = Mat3.add(stress1, stress2);

    return {
      stress,
      newFp: deformationGradientPlastic.clone()
    };
  }
}

export class FluidModel extends MaterialModel {
  private bulkModulus: number;

  constructor(parameters: MaterialParameters) {
    super(parameters);
    this.bulkModulus = parameters.bulkModulus ?? 50000;
  }

  public override computeStress(
    deformationGradient: Mat3,
    deformationGradientPlastic: Mat3,
    dt: number
  ): { stress: Mat3; newFp: Mat3 } {
    const F = deformationGradient;
    const J = F.determinant();

    if (J <= 0) {
      return {
        stress: new Mat3(),
        newFp: Mat3.identity()
      };
    }

    const pressure = this.bulkModulus * (1 - 1 / J);
    const stress = Mat3.multiplyScalar(Mat3.identity(), -pressure);

    return {
      stress,
      newFp: Mat3.identity()
    };
  }
}

export class SnowModel extends MaterialModel {
  private criticalCompression: number;
  private criticalStretch: number;
  private hardeningCoefficient: number;

  constructor(parameters: MaterialParameters) {
    super(parameters);
    this.criticalCompression = parameters.criticalCompression ?? 0.025;
    this.criticalStretch = parameters.criticalStretch ?? 0.0075;
    this.hardeningCoefficient = parameters.hardeningCoefficient ?? 10;
  }

  public override computeStress(
    deformationGradient: Mat3,
    deformationGradientPlastic: Mat3,
    dt: number
  ): { stress: Mat3; newFp: Mat3 } {
    const F = deformationGradient;
    const Fp = deformationGradientPlastic;

    const { U, S, V } = this.svd3x3(F);

    const sigma1 = S.elements[0];  // m00
    const sigma2 = S.elements[4];  // m11
    const sigma3 = S.elements[8];  // m22

    const thetaC = this.criticalCompression;
    const thetaS = this.criticalStretch;

    const sigma1Clamped = Math.max(1 - thetaC, Math.min(1 + thetaS, sigma1));
    const sigma2Clamped = Math.max(1 - thetaC, Math.min(1 + thetaS, sigma2));
    const sigma3Clamped = Math.max(1 - thetaC, Math.min(1 + thetaS, sigma3));

    const SClamped = new Mat3();
    SClamped.set(
      sigma1Clamped, 0, 0,
      0, sigma2Clamped, 0,
      0, 0, sigma3Clamped
    );

    const Fe = Mat3.multiply(Mat3.multiply(U, SClamped), V.transpose());

    const SPlastic = new Mat3();
    SPlastic.set(
      sigma1 / sigma1Clamped, 0, 0,
      0, sigma2 / sigma2Clamped, 0,
      0, 0, sigma3 / sigma3Clamped
    );

    const newFp = Mat3.multiply(Mat3.multiply(U, SPlastic), V.transpose());

    const J = Fe.determinant();
    const logJ = Math.log(Math.max(0.1, J));

    const Jp = newFp.determinant();
    const hardenedMu = this.mu * Math.exp(this.hardeningCoefficient * (1 - Jp));
    const hardenedLambda = this.lambda * Math.exp(this.hardeningCoefficient * (1 - Jp));

    const Ft = Fe.transpose();
    const FtF = Mat3.multiply(Ft, Fe);
    const I = Mat3.identity();

    const P1 = Mat3.subtract(FtF, I);
    const P2 = Mat3.multiplyScalar(I, logJ);

    const stress1 = Mat3.multiplyScalar(P1, hardenedMu / J);
    const stress2 = Mat3.multiplyScalar(P2, hardenedLambda / J);

    const stress = Mat3.add(stress1, stress2);

    return { stress, newFp };
  }
}

export class SandModel extends MaterialModel {
  private frictionAngle: number;
  private cohesion: number;
  private alpha: number;

  constructor(parameters: MaterialParameters) {
    super(parameters);
    this.frictionAngle = parameters.frictionAngle ?? 30;
    this.cohesion = parameters.cohesion ?? 0;

    const phi = (this.frictionAngle * Math.PI) / 180;
    this.alpha = Math.sqrt(2 / 3) * (2 * Math.sin(phi)) / (3 - Math.sin(phi));
  }

  public override computeStress(
    deformationGradient: Mat3,
    deformationGradientPlastic: Mat3,
    dt: number
  ): { stress: Mat3; newFp: Mat3 } {
    const F = deformationGradient;
    const Fp = deformationGradientPlastic;

    const { U, S, V } = this.svd3x3(F);

    let sigma1 = S.elements[0];  // m00
    let sigma2 = S.elements[4];  // m11
    let sigma3 = S.elements[8];  // m22

    const epsilon = [
      Math.log(Math.max(0.01, sigma1)),
      Math.log(Math.max(0.01, sigma2)),
      Math.log(Math.max(0.01, sigma3))
    ];

    const traceEpsilon = epsilon[0]! + epsilon[1]! + epsilon[2]!;
    const epsilonHat = [
      epsilon[0]! - traceEpsilon / 3,
      epsilon[1]! - traceEpsilon / 3,
      epsilon[2]! - traceEpsilon / 3
    ];

    const epsilonHatNorm = Math.sqrt(
      epsilonHat[0]! * epsilonHat[0]! +
      epsilonHat[1]! * epsilonHat[1]! +
      epsilonHat[2]! * epsilonHat[2]!
    );

    const deltaGamma = epsilonHatNorm + (3 * this.lambda + 2 * this.mu) / (2 * this.mu) * traceEpsilon * this.alpha;

    if (deltaGamma > 0) {
      const H = epsilonHatNorm > 1e-10 ? epsilonHat.map(e => e / epsilonHatNorm) : [0, 0, 0];

      const newEpsilon = [
        epsilon[0]! - deltaGamma * H[0]!,
        epsilon[1]! - deltaGamma * H[1]!,
        epsilon[2]! - deltaGamma * H[2]!
      ];

      sigma1 = Math.exp(newEpsilon[0]!);
      sigma2 = Math.exp(newEpsilon[1]!);
      sigma3 = Math.exp(newEpsilon[2]!);

      const SNew = new Mat3();
      SNew.set(
        sigma1, 0, 0,
        0, sigma2, 0,
        0, 0, sigma3
      );

      const newFp = Mat3.multiply(Mat3.multiply(U, SNew), V.transpose());

      const SClamped = new Mat3();
      SClamped.set(
        S.elements[0] / sigma1, 0, 0,  // m00
        0, S.elements[4] / sigma2, 0,  // m11
        0, 0, S.elements[8] / sigma3   // m22
      );

      const Fe = Mat3.multiply(Mat3.multiply(U, SClamped), V.transpose());
      const J = Fe.determinant();

      if (J <= 0) {
        return {
          stress: new Mat3(),
          newFp: deformationGradientPlastic.clone()
        };
      }

      const logJ = Math.log(J);
      const Ft = Fe.transpose();
      const FtF = Mat3.multiply(Ft, Fe);
      const I = Mat3.identity();

      const P1 = Mat3.subtract(FtF, I);
      const P2 = Mat3.multiplyScalar(I, logJ);

      const stress1 = Mat3.multiplyScalar(P1, this.mu / J);
      const stress2 = Mat3.multiplyScalar(P2, this.lambda / J);

      const stress = Mat3.add(stress1, stress2);

      return { stress, newFp };
    } else {
      const J = F.determinant();

      if (J <= 0) {
        return {
          stress: new Mat3(),
          newFp: deformationGradientPlastic.clone()
        };
      }

      const logJ = Math.log(J);
      const Ft = F.transpose();
      const FtF = Mat3.multiply(Ft, F);
      const I = Mat3.identity();

      const P1 = Mat3.subtract(FtF, I);
      const P2 = Mat3.multiplyScalar(I, logJ);

      const stress1 = Mat3.multiplyScalar(P1, this.mu / J);
      const stress2 = Mat3.multiplyScalar(P2, this.lambda / J);

      const stress = Mat3.add(stress1, stress2);

      return { stress, newFp: deformationGradientPlastic.clone() };
    }
  }
}

export function createMaterial(
  type: MaterialType,
  parameters: MaterialParameters
): MaterialModel {
  switch (type) {
    case MaterialType.NeoHookean:
      return new NeoHookeanModel(parameters);
    case MaterialType.Fluid:
      return new FluidModel(parameters);
    case MaterialType.Snow:
      return new SnowModel(parameters);
    case MaterialType.Sand:
      return new SandModel(parameters);
    default:
      return new NeoHookeanModel(parameters);
  }
}
