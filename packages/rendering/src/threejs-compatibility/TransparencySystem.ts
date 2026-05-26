export interface ThreeCompatTransparencySystemStatus {
  readonly alphaTest: boolean;
  readonly alphaBlend: boolean;
  readonly sortedBackToFront: boolean;
  readonly transmissivePrepass: boolean;
  readonly doubleSidedNormals: boolean;
}

export class ThreeCompatTransparencySystem {
  getStatus(): ThreeCompatTransparencySystemStatus {
    return {
      alphaTest: true,
      alphaBlend: true,
      sortedBackToFront: true,
      transmissivePrepass: true,
      doubleSidedNormals: true
    };
  }
}
