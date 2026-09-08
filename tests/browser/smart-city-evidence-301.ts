/** Browser protocol published by showcase-smart-city-control's publishEvidence.
 * Keep the hook local to these specs so unrelated route Window declarations do
 * not merge. Optional diagnostics reflect the route's pre-mount publication. */
export interface SmartCityBrowserEvidence301 {
  readonly systems: readonly string[];
  readonly status: string;
  readonly frameCount: number;
  readonly interactionState: {
    readonly selectedBuildingId?: string;
    readonly cameraMode: string;
  };
  readonly diagnostics: {
    readonly buildingFocus?: {
      readonly targetId?: string;
      readonly cameraFocused: boolean;
      readonly invariants?: { readonly passes: boolean };
    };
    readonly rendererRuntime?: {
      readonly backend: string;
      readonly nativeInstancedSubmissions: number;
      readonly submittedObjects: number;
      readonly visibleObjects: number;
      readonly culledObjects: number;
      readonly frustumTestedObjects: number;
      readonly lodSelections: readonly { readonly nodeName: string; readonly levelIndex: number; readonly levelName: string }[];
    };
    readonly scatterCorridor?: unknown;
  };
}

export type SmartCityBrowserWindow301 = Window & {
  readonly __AURA3D_SHOWCASE_SMART_CITY_CONTROL__?: SmartCityBrowserEvidence301;
};
