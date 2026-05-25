export interface V6AppAsset {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly url?: string;
  readonly role: "primary" | "secondary";
}

export interface V6AppSceneDefinition {
  readonly appId: string;
  readonly sceneId: string;
  readonly title: string;
  readonly workflow: string;
  readonly assets: readonly V6AppAsset[];
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

export interface V6AppUiDefinition {
  readonly primaryActionLabel: string;
  readonly secondaryLabel: string;
}
