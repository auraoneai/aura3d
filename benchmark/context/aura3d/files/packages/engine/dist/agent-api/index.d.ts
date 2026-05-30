export type AuraVec3 = readonly [number, number, number];
export type AuraColor = `#${string}` | string;
export type AuraAssetType = "model" | "texture" | "environment" | "audio";
export type AuraModelFormat = "glb" | "gltf";
export type AuraTextureFormat = "png" | "jpg" | "jpeg" | "webp" | "ktx2";
export interface AuraAssetDefinition {
    readonly type: AuraAssetType;
    readonly format: string;
    readonly url: string;
    readonly hash?: string;
    readonly bounds?: AuraVec3;
    readonly sizeBytes?: number;
    readonly optional?: boolean;
    readonly metadata?: AuraAssetMetadata;
}
export interface AuraAssetMetadata {
    readonly materials?: readonly string[];
    readonly animations?: readonly string[];
    readonly textures?: readonly string[];
    readonly thumbnailUrl?: string;
    readonly license?: string;
}
declare const auraAssetRefBrand: unique symbol;
export type AuraAssetRef<TType extends AuraAssetType = AuraAssetType, TId extends string = string> = AuraAssetDefinition & {
    readonly kind: "aura-asset-ref";
    readonly id: TId;
    readonly type: TType;
    readonly [auraAssetRefBrand]: {
        readonly type: TType;
        readonly id: TId;
    };
};
export type AuraAssetMap<T extends Record<string, AuraAssetDefinition>> = {
    readonly [K in keyof T]: AuraAssetRef<T[K]["type"], Extract<K, string>> & T[K];
};
export declare function defineAuraAssets<const T extends Record<string, AuraAssetDefinition>>(definitions: T): AuraAssetMap<T>;
export interface AuraTransformSpec {
    readonly position?: AuraVec3;
    readonly rotation?: AuraVec3;
    readonly scale?: number | AuraVec3;
    readonly lookAt?: AuraVec3;
}
export interface AuraMaterialSpec {
    readonly name?: string;
    readonly color?: AuraColor;
    readonly roughness?: number;
    readonly metallic?: number;
    readonly emissive?: AuraColor;
    readonly opacity?: number;
    readonly transmission?: number;
    readonly clearcoat?: number;
    readonly clearcoatRoughness?: number;
    readonly texture?: AuraAssetRef<"texture">;
}
export interface AuraModelOptions extends AuraTransformSpec {
    readonly name?: string;
    readonly material?: AuraMaterialSpec;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly visible?: boolean;
}
export interface AuraPrimitiveOptions extends AuraTransformSpec {
    readonly name?: string;
    readonly material?: AuraMaterialSpec;
    readonly size?: number | AuraVec3;
}
export interface AuraAnimationSpec {
    readonly clip?: string;
    readonly loop?: boolean;
    readonly speed?: number;
}
export interface AuraInteractionSpec {
    readonly cursor?: string;
    readonly onClick?: string;
    readonly onHover?: string;
}
export type AuraSceneNode = AuraModelNode | AuraPrimitiveNode | AuraLightNode | AuraEffectNode | AuraInteractionNode;
export interface AuraModelNode extends AuraTransformSpec {
    readonly kind: "model";
    readonly name?: string;
    readonly asset: AuraAssetRef<"model">;
    readonly material?: AuraMaterialSpec;
    readonly castShadow: boolean;
    readonly receiveShadow: boolean;
    readonly visible: boolean;
    readonly animation?: AuraAnimationSpec;
    readonly interaction?: AuraInteractionSpec;
}
export interface AuraPrimitiveNode extends AuraTransformSpec {
    readonly kind: "primitive";
    readonly primitive: "box" | "sphere" | "plane" | "cylinder";
    readonly name?: string;
    readonly material?: AuraMaterialSpec;
    readonly size?: number | AuraVec3;
    readonly animation?: AuraAnimationSpec;
    readonly interaction?: AuraInteractionSpec;
}
export type AuraLightType = "ambient" | "directional" | "point" | "studio";
export interface AuraLightNode extends AuraTransformSpec {
    readonly kind: "light";
    readonly light: AuraLightType;
    readonly name?: string;
    readonly color?: AuraColor;
    readonly intensity: number;
}
export type AuraEffectType = "fog" | "bloom" | "rain" | "particles";
export interface AuraEffectNode {
    readonly kind: "effect";
    readonly effect: AuraEffectType;
    readonly name?: string;
    readonly intensity?: number;
    readonly density?: number;
    readonly color?: AuraColor;
    readonly speed?: number;
    readonly wind?: AuraVec3;
    readonly particleCount?: number;
    readonly emitter?: "fountain" | "swirl" | "ambient";
    readonly radius?: number;
    readonly height?: number;
    readonly splashes?: boolean;
    readonly mist?: boolean;
}
declare global {
    interface HTMLStrongElement extends HTMLElement {
    }
}
export interface AuraInteractionNode {
    readonly kind: "interaction";
    readonly mode: "orbit" | "pointer" | "keyboard";
    readonly target?: string;
}
export declare class AuraNodeBuilder<TNode extends AuraSceneNode> {
    private readonly value;
    constructor(value: TNode);
    position(x: number, y: number, z: number): AuraNodeBuilder<TNode & {
        readonly position: AuraVec3;
    }>;
    rotate(x: number, y: number, z: number): AuraNodeBuilder<TNode & {
        readonly rotation: AuraVec3;
    }>;
    scale(value: number | AuraVec3): AuraNodeBuilder<TNode & {
        readonly scale: number | AuraVec3;
    }>;
    lookAt(x: number, y: number, z: number): AuraNodeBuilder<TNode & {
        readonly lookAt: AuraVec3;
    }>;
    material(material: AuraMaterialSpec): AuraNodeBuilder<TNode & {
        readonly material: AuraMaterialSpec;
    }>;
    animate(animation: AuraAnimationSpec): AuraNodeBuilder<TNode & {
        readonly animation: AuraAnimationSpec;
    }>;
    onPointer(interaction: AuraInteractionSpec): AuraNodeBuilder<TNode & {
        readonly interaction: AuraInteractionSpec;
    }>;
    toJSON(): TNode;
    private with;
}
export declare function model<TAsset extends AuraAssetRef<"model">>(asset: TAsset, options?: AuraModelOptions): AuraNodeBuilder<AuraModelNode>;
export declare function unsafeModelUrl(url: string, options?: Omit<AuraAssetDefinition, "type" | "format" | "url">): AuraAssetRef<"model", "unsafe">;
export declare const primitives: {
    readonly box: (options?: AuraPrimitiveOptions) => AuraNodeBuilder<AuraPrimitiveNode>;
    readonly sphere: (options?: AuraPrimitiveOptions) => AuraNodeBuilder<AuraPrimitiveNode>;
    readonly plane: (options?: AuraPrimitiveOptions) => AuraNodeBuilder<AuraPrimitiveNode>;
    readonly cylinder: (options?: AuraPrimitiveOptions) => AuraNodeBuilder<AuraPrimitiveNode>;
};
export declare const material: {
    readonly pbr: (options?: AuraMaterialSpec) => AuraMaterialSpec;
    readonly emissive: (options?: AuraMaterialSpec) => AuraMaterialSpec;
    readonly metal: (options?: AuraMaterialSpec) => AuraMaterialSpec;
    readonly rubber: (options?: AuraMaterialSpec) => AuraMaterialSpec;
    readonly glass: (options?: AuraMaterialSpec) => AuraMaterialSpec;
    readonly clearcoat: (options?: AuraMaterialSpec) => AuraMaterialSpec;
};
export declare const lights: {
    readonly ambient: (options?: {
        readonly name?: string;
        readonly intensity?: number;
        readonly color?: AuraColor;
    }) => AuraNodeBuilder<AuraLightNode>;
    readonly directional: (options?: {
        readonly name?: string;
        readonly position?: AuraVec3;
        readonly intensity?: number;
        readonly color?: AuraColor;
    }) => AuraNodeBuilder<AuraLightNode>;
    readonly point: (options?: {
        readonly name?: string;
        readonly position?: AuraVec3;
        readonly intensity?: number;
        readonly color?: AuraColor;
    }) => AuraNodeBuilder<AuraLightNode>;
    readonly studio: (options?: {
        readonly intensity?: number;
    }) => AuraNodeBuilder<AuraLightNode>;
};
export type AuraCameraMode = "perspective" | "orbit" | "dolly" | "follow";
export interface AuraCameraSpec {
    readonly mode: AuraCameraMode;
    readonly position?: AuraVec3;
    readonly target?: AuraVec3;
    readonly fov?: number;
    readonly distance?: number;
    readonly from?: AuraVec3;
    readonly to?: AuraVec3;
    readonly seconds?: number;
    readonly targetNode?: string;
}
export declare const camera: {
    readonly perspective: (options?: Omit<AuraCameraSpec, "mode">) => AuraCameraSpec;
    readonly orbit: (options?: Omit<AuraCameraSpec, "mode">) => AuraCameraSpec;
    readonly dolly: (options: Omit<AuraCameraSpec, "mode"> & {
        readonly from: AuraVec3;
        readonly to: AuraVec3;
    }) => AuraCameraSpec;
    readonly follow: (options: Omit<AuraCameraSpec, "mode"> & {
        readonly targetNode: string;
    }) => AuraCameraSpec;
};
export interface AuraTimelineSpec {
    readonly mode: "loop" | "once";
    readonly seconds?: number;
}
export declare const timeline: {
    readonly loop: (options?: Omit<AuraTimelineSpec, "mode">) => AuraTimelineSpec;
    readonly once: (options?: Omit<AuraTimelineSpec, "mode">) => AuraTimelineSpec;
};
export declare const effects: {
    readonly fog: (options?: Omit<AuraEffectNode, "kind" | "effect">) => AuraNodeBuilder<AuraEffectNode>;
    readonly bloom: (options?: Omit<AuraEffectNode, "kind" | "effect">) => AuraNodeBuilder<AuraEffectNode>;
    readonly rain: (options?: Omit<AuraEffectNode, "kind" | "effect">) => AuraNodeBuilder<AuraEffectNode>;
    readonly particles: (options?: Omit<AuraEffectNode, "kind" | "effect">) => AuraNodeBuilder<AuraEffectNode>;
};
export declare const interactions: {
    readonly orbit: (options?: {
        readonly target?: string;
    }) => AuraNodeBuilder<AuraInteractionNode>;
    readonly pointer: (options?: {
        readonly target?: string;
    }) => AuraNodeBuilder<AuraInteractionNode>;
    readonly keyboard: (options?: {
        readonly target?: string;
    }) => AuraNodeBuilder<AuraInteractionNode>;
};
type AuraUiTarget<TElement extends HTMLElement = HTMLElement> = string | TElement;
export declare const ui: {
    readonly root: (selector?: string) => HTMLElement;
    readonly text: (selector: string) => HTMLElement;
    readonly button: (selector: string) => HTMLButtonElement;
    readonly html: (target: AuraUiTarget, markup: string, position?: InsertPosition) => HTMLElement;
    readonly setText: (target: AuraUiTarget, value: string | number) => void;
    readonly setPressed: (target: AuraUiTarget<HTMLButtonElement>, pressed: boolean) => void;
    readonly onClick: (target: AuraUiTarget<HTMLButtonElement>, handler: (button: HTMLButtonElement, event: MouseEvent) => void) => HTMLButtonElement;
};
export interface AuraSceneSnapshot {
    readonly schema: "aura3d-scene-snapshot/1.0";
    readonly background: AuraColor;
    readonly camera: AuraCameraSpec;
    readonly timeline?: AuraTimelineSpec;
    readonly nodes: readonly AuraSceneNode[];
    readonly diagnostics: {
        readonly enabled: boolean;
    };
}
export declare class AuraSceneBuilder {
    private readonly nodes;
    private backgroundColor;
    private cameraSpec;
    private timelineSpec;
    private diagnosticsEnabled;
    background(color: AuraColor): this;
    add(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): this;
    addMany(nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[]): this;
    camera(next: AuraCameraSpec): this;
    timeline(next: AuraTimelineSpec): this;
    diagnostics(enabled?: boolean): this;
    toJSON(): AuraSceneSnapshot;
}
export declare function scene(): AuraSceneBuilder;
export declare const prefabs: {
    readonly particleFountain: (options?: {
        readonly color?: AuraColor;
        readonly count?: number;
    }) => readonly AuraSceneNode[];
    readonly cityBlock: (options?: {
        readonly blocks?: number;
        readonly litWindows?: boolean;
    }) => readonly AuraSceneNode[];
    readonly materialSwatches: () => readonly AuraSceneNode[];
    readonly productStage: () => readonly AuraSceneNode[];
    readonly physicsRamp: () => readonly AuraSceneNode[];
    readonly physicsPlayground: (options?: {
        readonly cubes?: number;
    }) => readonly AuraSceneNode[];
    readonly solarSystem: () => readonly AuraSceneNode[];
    readonly dataBars3D: (options?: {
        readonly grid?: number;
    }) => readonly AuraSceneNode[];
    readonly neonTunnel: (options?: {
        readonly rings?: number;
    }) => readonly AuraSceneNode[];
    readonly miniGolfHole: () => readonly AuraSceneNode[];
    readonly primitiveHumanoid: () => readonly AuraSceneNode[];
};
export type AuraPromptSceneType = "product-viewer" | "cinematic-scene" | "mini-game" | "material-studio";
export type AuraPromptEffectId = "rain" | "fog" | "bloom" | "particles" | "wet-reflection" | "motion-trail" | "hud";
export type AuraPromptCameraPreset = "product-orbit" | "cinematic-dolly" | "game-board" | "material-inspection";
export type AuraPromptLightingPreset = "studio-softbox" | "neon-practicals" | "game-readable" | "material-studio";
export type AuraPromptInteractionMode = "orbit" | "keyboard" | "pointer";
export interface AuraPromptPlanSubject {
    readonly asset: AuraAssetRef<"model">;
    readonly label?: string;
}
export interface AuraPromptPlan {
    readonly sceneType: AuraPromptSceneType;
    readonly subject: AuraPromptPlanSubject;
    readonly style?: string;
    readonly environment?: string;
    readonly camera?: {
        readonly preset: AuraPromptCameraPreset;
        readonly note?: string;
    };
    readonly lighting?: {
        readonly preset: AuraPromptLightingPreset;
        readonly note?: string;
    };
    readonly effects?: readonly AuraPromptEffectId[];
    readonly interaction?: AuraPromptInteractionMode;
    readonly acceptanceCriteria: readonly string[];
    readonly negativeCriteria?: readonly string[];
}
export interface AuraPromptPlanReport {
    readonly schema: "aura3d-prompt-plan-report/1.0";
    readonly sceneType: AuraPromptSceneType;
    readonly subjectAssetId: string;
    readonly recipe: AuraPromptSceneType;
    readonly cameraPreset: AuraPromptCameraPreset;
    readonly lightingPreset: AuraPromptLightingPreset;
    readonly effects: readonly AuraPromptEffectId[];
    readonly acceptanceCriteria: readonly string[];
    readonly negativeCriteria: readonly string[];
    readonly warnings: readonly string[];
    readonly visualSystems: readonly string[];
    readonly repairHints: readonly string[];
}
export interface AuraCompiledPromptPlan {
    readonly scene: AuraSceneBuilder;
    readonly report: AuraPromptPlanReport;
}
export declare function definePromptPlan<const TPlan extends AuraPromptPlan>(plan: TPlan): TPlan;
export declare function compilePromptPlan(plan: AuraPromptPlan): AuraCompiledPromptPlan;
export declare function promptPlanToScene(plan: AuraPromptPlan): AuraSceneBuilder;
export declare const promptRecipes: {
    readonly "product-viewer": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan) => AuraSceneBuilder;
    readonly "cinematic-scene": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan) => AuraSceneBuilder;
    readonly "mini-game": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan) => AuraSceneBuilder;
    readonly "material-studio": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan) => AuraSceneBuilder;
};
export type AuraBackend = "webgl2" | "webgpu" | "canvas2d" | "headless";
export interface AuraDiagnostics {
    readonly backend: AuraBackend;
    readonly fps: number;
    readonly drawCalls: number;
    readonly renderSize: readonly [number, number];
    readonly assets: readonly AuraAssetLoadState[];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
}
export interface AuraAssetLoadState {
    readonly id: string;
    readonly type: AuraAssetType;
    readonly url: string;
    readonly status: "ready" | "optional-missing" | "error";
    readonly message?: string;
}
export interface AuraApp {
    readonly canvas?: HTMLCanvasElement;
    readonly scene: AuraSceneSnapshot;
    readonly backend: AuraBackend;
    diagnostics(): AuraDiagnostics;
    screenshot(): AuraScreenshot;
    dispose(): void;
}
export interface AuraCreateAppOptions {
    readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
    readonly diagnostics?: boolean | AuraDiagnosticsOptions;
    readonly pixelRatio?: number;
    readonly autoStart?: boolean;
    readonly resize?: boolean;
}
export interface AuraDiagnosticsOptions {
    readonly overlay?: boolean;
    readonly assetPanel?: boolean;
    readonly performancePanel?: boolean;
}
export interface AuraScreenshot {
    readonly mimeType: "image/png";
    readonly dataUrl: string;
    readonly width: number;
    readonly height: number;
}
export type AuraAppTarget = string | HTMLElement | HTMLCanvasElement | null | undefined;
export declare class AuraRuntimeError extends Error {
    readonly code: "missing-canvas" | "missing-asset" | "failed-glb-load" | "unsupported-texture" | "backend-fallback";
    constructor(code: AuraRuntimeError["code"], message: string);
}
export declare function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp;
export declare function createAuraRouteHealthSnapshot(app: AuraApp): {
    readonly status: "ready" | "error";
    readonly diagnostics: AuraDiagnostics;
    readonly scene: AuraSceneSnapshot;
};
export declare function captureAuraScreenshot(target?: HTMLCanvasElement): AuraScreenshot;
export declare function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError;
export {};
//# sourceMappingURL=index.d.ts.map