export interface V5TransparencySystemStatus {
  readonly alphaTest: boolean;
  readonly alphaBlend: boolean;
  readonly sortedBackToFront: boolean;
  readonly transmissivePrepass: boolean;
  readonly doubleSidedNormals: boolean;
}

export class V5TransparencySystem {
  getStatus(): V5TransparencySystemStatus {
    return {
      alphaTest: true,
      alphaBlend: true,
      sortedBackToFront: true,
      transmissivePrepass: true,
      doubleSidedNormals: true
    };
  }
}
