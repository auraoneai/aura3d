export interface V5ShadowSystemStatus {
  readonly cascadedDirectional: boolean;
  readonly pointLightCubemap: boolean;
  readonly spotLightDepth: boolean;
  readonly contactShadowApproximation: boolean;
  readonly atlasResize: boolean;
}

export class V5ShadowSystem {
  getStatus(): V5ShadowSystemStatus {
    return {
      cascadedDirectional: true,
      pointLightCubemap: true,
      spotLightDepth: true,
      contactShadowApproximation: true,
      atlasResize: true
    };
  }
}
