export interface ThreeCompatInstancingSystemStatus {
  readonly hardwareInstancing: boolean;
  readonly perInstanceTransforms: boolean;
  readonly perInstanceMaterialOverrides: boolean;
  readonly instanceCountLimit: number;
}

export class ThreeCompatInstancingSystem {
  getStatus(): ThreeCompatInstancingSystemStatus {
    return {
      hardwareInstancing: true,
      perInstanceTransforms: true,
      perInstanceMaterialOverrides: true,
      instanceCountLimit: 100000
    };
  }
}
