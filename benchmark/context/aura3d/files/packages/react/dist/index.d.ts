import { type CSSProperties, type ReactElement, type ReactNode } from "react";
import { type AuraApp, type AuraAssetRef, type AuraCameraSpec, type AuraColor, type AuraCreateAppOptions, type AuraEffectNode, type AuraLightNode, type AuraMaterialSpec, type AuraModelOptions, type AuraSceneBuilder, type AuraTimelineSpec } from "@aura3d/engine";
export interface AuraCanvasProps {
    readonly children?: ReactNode;
    readonly diagnostics?: AuraCreateAppOptions["diagnostics"];
    readonly pixelRatio?: number;
    readonly autoStart?: boolean;
    readonly resize?: boolean;
    readonly className?: string;
    readonly style?: CSSProperties;
    readonly onReady?: (app: AuraApp) => void;
}
export interface SceneProps {
    readonly children?: ReactNode;
    readonly background?: AuraColor;
    readonly camera?: AuraCameraSpec;
    readonly timeline?: AuraTimelineSpec;
    readonly diagnostics?: boolean;
}
export interface ModelProps extends AuraModelOptions {
    readonly asset: AuraAssetRef<"model">;
}
export interface CameraProps extends Omit<AuraCameraSpec, "mode"> {
    readonly mode?: AuraCameraSpec["mode"];
}
export interface LightsProps {
    readonly preset?: "studio";
    readonly type?: AuraLightNode["light"];
    readonly intensity?: number;
    readonly color?: AuraColor;
    readonly position?: readonly [number, number, number];
}
export interface EffectProps extends Omit<AuraEffectNode, "kind" | "effect"> {
    readonly type: AuraEffectNode["effect"];
}
export declare function AuraCanvas(props: AuraCanvasProps): ReactElement;
export declare function Scene(_props: SceneProps): null;
export declare function Model(_props: ModelProps): null;
export declare function Camera(_props: CameraProps): null;
export declare function Lights(_props: LightsProps): null;
export declare function Effect(_props: EffectProps): null;
export declare function buildSceneFromChildren(children: ReactNode): AuraSceneBuilder;
export declare function productViewerScene(asset: AuraAssetRef<"model">, material?: AuraMaterialSpec): AuraSceneBuilder;
//# sourceMappingURL=index.d.ts.map