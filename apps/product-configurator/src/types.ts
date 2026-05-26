export interface ProductionAppAsset {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly url?: string;
  readonly role: "primary" | "secondary";
}

export interface ProductionAppSceneDefinition {
  readonly appId: string;
  readonly sceneId: string;
  readonly title: string;
  readonly workflow: string;
  readonly assets: readonly ProductionAppAsset[];
  readonly environment: {
    readonly id: string;
    readonly label: string;
    readonly file: string;
    readonly url?: string;
    readonly exposure: number;
    readonly intensity: number;
    readonly rotation: number;
  };
  readonly postprocess: boolean;
  readonly webgpuReport: boolean;
  readonly expectedPostprocessChain: readonly string[];
}

export interface ProductionAppUiDefinition {
  readonly primaryActionLabel: string;
  readonly secondaryLabel: string;
}
