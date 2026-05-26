export interface ThreeCompatShadowSystemStatus {
  readonly cascadedDirectional: boolean;
  readonly pointLightCubemap: boolean;
  readonly spotLightDepth: boolean;
  readonly contactShadowApproximation: boolean;
  readonly atlasResize: boolean;
}

export class ThreeCompatShadowSystem {
  getStatus(): ThreeCompatShadowSystemStatus {
    return {
      cascadedDirectional: true,
      pointLightCubemap: true,
      spotLightDepth: true,
      contactShadowApproximation: true,
      atlasResize: true
    };
  }
}
