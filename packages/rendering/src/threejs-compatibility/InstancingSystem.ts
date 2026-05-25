export interface V5InstancingSystemStatus {
  readonly hardwareInstancing: boolean;
  readonly perInstanceTransforms: boolean;
  readonly perInstanceMaterialOverrides: boolean;
  readonly instanceCountLimit: number;
}

export class V5InstancingSystem {
  getStatus(): V5InstancingSystemStatus {
    return {
      hardwareInstancing: true,
      perInstanceTransforms: true,
      perInstanceMaterialOverrides: true,
      instanceCountLimit: 100000
    };
  }
}
