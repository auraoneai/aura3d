export type BenchmarkEngine = "galileo" | "threejs" | "babylon";

export type BenchmarkSceneDescriptor = {
  readonly id: string;
  readonly sceneVersion: number;
  readonly assetId: string;
  readonly assetClass?: string;
  readonly resolution: { readonly width: number; readonly height: number; readonly dpr: number };
  readonly warmupFrames: number;
  readonly measuredFrames: number;
  readonly cameraPath: string;
  readonly lighting: string;
  readonly materialFeatures?: readonly string[];
  readonly postprocessState?: {
    readonly enabled: boolean;
    readonly effects: readonly string[];
    readonly sourceEvidence?: readonly string[];
  };
  readonly animationState?: {
    readonly enabled: boolean;
    readonly clips: number;
    readonly skinning: boolean;
    readonly morphTargets: boolean;
    readonly playback: string;
  };
  readonly quality: {
    readonly antialias: boolean;
    readonly shadows: boolean;
    readonly postprocess: boolean;
    readonly pbr: boolean;
    readonly skinning: boolean;
    readonly instancing: boolean;
    readonly particles: boolean;
  };
  readonly workload: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly materials: number;
    readonly materialVariants: number;
    readonly textures: number;
    readonly textureBytes: number;
    readonly geometryBytes: number;
    readonly shaders: number;
    readonly animations: number;
    readonly particles: number;
    readonly instances: number;
  };
  readonly workflow?: {
    readonly kind: "editor-authored-exported-app-startup";
    readonly exportedProjectPath: string;
    readonly exportedRuntimePath: string;
    readonly editorEvidenceReportPath: string;
    readonly comparisonMode: string;
    readonly authoredOperations: readonly string[];
  };
  readonly unsupportedFeatures: readonly string[];
};

export type EngineBenchmarkScene = BenchmarkSceneDescriptor & {
  readonly engine: BenchmarkEngine;
  readonly engineVersion: string;
};

const engineVersions: Record<BenchmarkEngine, string> = {
  galileo: "0.1.0-alpha.0",
  threejs: "0.165.0",
  babylon: "7.16.1",
};

export function forEngine(scene: BenchmarkSceneDescriptor, engine: BenchmarkEngine): EngineBenchmarkScene {
  return {
    ...scene,
    engine,
    engineVersion: engineVersions[engine],
  };
}
