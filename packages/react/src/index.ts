import {
  Children,
  createElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";
import {
  camera,
  createAuraApp,
  effects,
  lights,
  model,
  scene,
  type AuraApp,
  type AuraAssetRef,
  type AuraCameraSpec,
  type AuraColor,
  type AuraCreateAppOptions,
  type AuraEffectNode,
  type AuraLightNode,
  type AuraMaterialSpec,
  type AuraModelOptions,
  type AuraSceneBuilder,
  type AuraTimelineSpec
} from "@aura3d/engine";

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

export function AuraCanvas(props: AuraCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const builtScene = useMemo(() => buildSceneFromChildren(props.children), [props.children]);
  useEffect(() => {
    if (!ref.current) return undefined;
    const app = createAuraApp(ref.current, {
      scene: builtScene,
      diagnostics: props.diagnostics,
      pixelRatio: props.pixelRatio,
      autoStart: props.autoStart,
      resize: props.resize
    });
    props.onReady?.(app);
    return () => app.dispose();
  }, [builtScene, props.autoStart, props.diagnostics, props.onReady, props.pixelRatio, props.resize]);
  return createElement("canvas", {
    ref,
    className: props.className,
    style: {
      width: "100%",
      height: "100%",
      display: "block",
      ...(props.style ?? {})
    }
  });
}

export function Scene(_props: SceneProps): null {
  return null;
}

export function Model(_props: ModelProps): null {
  return null;
}

export function Camera(_props: CameraProps): null {
  return null;
}

export function Lights(_props: LightsProps): null {
  return null;
}

export function Effect(_props: EffectProps): null {
  return null;
}

export function buildSceneFromChildren(children: ReactNode): AuraSceneBuilder {
  let builder = scene();
  const sceneElement = findFirstElementOfType(children, Scene);
  const sceneProps = (sceneElement?.props ?? {}) as SceneProps;
  if (sceneProps.background) builder = builder.background(sceneProps.background);
  if (sceneProps.camera) builder = builder.camera(sceneProps.camera);
  if (sceneProps.timeline) builder = builder.timeline(sceneProps.timeline);
  if (sceneProps.diagnostics) builder = builder.diagnostics(sceneProps.diagnostics);
  const content = sceneElement ? sceneProps.children : children;
  Children.forEach(content, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Model) {
      const props = child.props as ModelProps;
      builder.add(model(props.asset, props));
    }
    if (child.type === Camera) {
      const props = child.props as CameraProps;
      const mode = props.mode ?? "orbit";
      if (mode === "dolly" && props.from && props.to) builder.camera(camera.dolly({ ...props, from: props.from, to: props.to }));
      else if (mode === "follow" && props.targetNode) builder.camera(camera.follow({ ...props, targetNode: props.targetNode }));
      else if (mode === "perspective") builder.camera(camera.perspective(props));
      else builder.camera(camera.orbit(props));
    }
    if (child.type === Lights) {
      const props = child.props as LightsProps;
      if (props.preset === "studio" || !props.type || props.type === "studio") builder.add(lights.studio({ intensity: props.intensity }));
      else if (props.type === "ambient") builder.add(lights.ambient(props));
      else if (props.type === "directional") builder.add(lights.directional(props));
      else builder.add(lights.point(props));
    }
    if (child.type === Effect) {
      const props = child.props as EffectProps;
      if (props.type === "fog") builder.add(effects.fog(props));
      if (props.type === "bloom") builder.add(effects.bloom(props));
      if (props.type === "rain") builder.add(effects.rain(props));
    }
  });
  return builder;
}

export function productViewerScene(asset: AuraAssetRef<"model">, material?: AuraMaterialSpec): AuraSceneBuilder {
  return scene()
    .background("#08111f")
    .add(model(asset, { material }).position(0, 0, 0).scale(1))
    .add(lights.studio({ intensity: 1.1 }))
    .camera(camera.orbit({ distance: 4 }))
    .diagnostics(true);
}

function findFirstElementOfType(children: ReactNode, type: (props: never) => null): ReactElement | undefined {
  let found: ReactElement | undefined;
  Children.forEach(children, (child) => {
    if (!found && isValidElement(child) && child.type === type) found = child;
  });
  return found;
}
