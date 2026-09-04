import {
  Children,
  Suspense,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";
import {
  camera,
  createAuraApp,
  effects,
  environments,
  interactions,
  lights,
  model,
  scene,
  type AuraApp,
  type AuraAssetRef,
  type AuraCameraSpec,
  type AuraColor,
  type AuraCreateAppOptions,
  type AuraEffectNode,
  type AuraFrameCallback,
  type AuraFrameInfo,
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
  /**
   * Declarative canvas event bindings (V1). These are canvas-level DOM
   * listeners, attached on mount and removed on unmount. Per-node picking
   * stays declarative: pair them with `eventInteractionNodes(target)` (or
   * `.onPointer(...)` / `interactions.hover(...)` scene nodes) so the F4
   * picking stack is actually engaged — a DOM handler alone is not picking.
   */
  readonly onPointerDown?: (event: PointerEvent) => void;
  readonly onPointerMove?: (event: PointerEvent) => void;
  readonly onPointerUp?: (event: PointerEvent) => void;
  /** Fires on canvas pointermove for hover-position tracking. */
  readonly onHover?: (event: PointerEvent) => void;
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
  /**
   * Suspense-compatible asset boundary (V1). When provided, the model
   * suspends until every descriptor preloads, rendering `fallback` meanwhile.
   * Preloading reuses `AssetPreloader` semantics — preload-all with
   * per-record ok/failed evidence — not a second loader: pass
   * `preloader.preloadAll.bind(preloader)` as `loader` when the app already
   * owns a preloader, or omit `loader` to warm the HTTP cache with a fetch.
   */
  readonly suspendOnLoad?: readonly AuraAssetDescriptor[];
  readonly fallback?: ReactNode;
  readonly loader?: AuraAssetPreloadFn;
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

/**
 * The mounted app, for `useAuraFrame` / `useAuraEvents`. Undefined until
 * `AuraCanvas` mounts (and again after unmount). Components outside an
 * `AuraCanvas` see undefined — they must handle that rather than assume an app.
 */
export const AuraAppContext = createContext<AuraApp | undefined>(undefined);

export function useAuraApp(): AuraApp | undefined {
  return useContext(AuraAppContext);
}

export interface FrameSubscriberHost {
  onFrame(callback: AuraFrameCallback): () => void;
}

export interface FrameScheduler {
  subscribe(callback: AuraFrameCallback, priority?: number): () => void;
  subscriberCount(): number;
}

let frameSubscriptionOrder = 0;

/**
 * Priority-ordered fan-out over one host `onFrame` subscription (V1).
 *
 * Lower `priority` runs first; ties keep subscription order. One host
 * subscription is shared no matter how many components subscribe, and it is
 * released when the last subscriber leaves — that release is the tested
 * unmount-cleanup half of the U1 mount/unmount/listener-clean policy.
 * Pure except for the host calls, so it is unit-testable with a fake host.
 */
export function createFrameScheduler(host: FrameSubscriberHost): FrameScheduler {
  const entries: { readonly callback: AuraFrameCallback; readonly priority: number; readonly order: number }[] = [];
  let unsubscribe: (() => void) | undefined;
  const dispatch = (frame: AuraFrameInfo): void => {
    const ordered = [...entries].sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (const entry of ordered) entry.callback(frame);
  };
  return {
    subscribe(callback: AuraFrameCallback, priority = 0): () => void {
      if (!Number.isFinite(priority)) throw new Error("Aura3D frame priority must be finite.");
      const entry = { callback, priority, order: frameSubscriptionOrder++ };
      entries.push(entry);
      if (!unsubscribe) unsubscribe = host.onFrame(dispatch);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const index = entries.indexOf(entry);
        if (index !== -1) entries.splice(index, 1);
        if (entries.length === 0 && unsubscribe) {
          unsubscribe();
          unsubscribe = undefined;
        }
      };
    },
    subscriberCount(): number {
      return entries.length;
    }
  };
}

const schedulers = new WeakMap<object, FrameScheduler>();

function schedulerForApp(app: FrameSubscriberHost & object): FrameScheduler {
  let scheduler = schedulers.get(app);
  if (!scheduler) {
    scheduler = createFrameScheduler(app);
    schedulers.set(app, scheduler);
  }
  return scheduler;
}

/**
 * The game loop for React developers (V1): subscribe to frames with a
 * priority, automatically unsubscribed on unmount.
 *
 * Must be used under an `AuraCanvas`. The app arrives after mount (the canvas
 * node has to exist first), so the subscription attaches when `useAuraApp()`
 * turns defined — outside an `AuraCanvas` it stays undefined and the callback
 * never fires rather than throwing during the mount pass. Detect that case
 * with `useAuraApp() !== undefined`.
 */
export type { AuraFrameCallback, AuraFrameInfo } from "@aura3d/engine";

export function useAuraFrame(callback: AuraFrameCallback, priority = 0): void {
  const app = useAuraApp();
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    if (!app) return undefined;
    return schedulerForApp(app).subscribe((frame) => latest.current(frame), priority);
  }, [app, priority]);
}

export interface AuraCanvasEventHandlers {
  readonly onPointerDown?: (event: PointerEvent) => void;
  readonly onPointerMove?: (event: PointerEvent) => void;
  readonly onPointerUp?: (event: PointerEvent) => void;
  readonly onHover?: (event: PointerEvent) => void;
}

/**
 * Interaction nodes that engage the F4 picking stack for a target node.
 * Add these to the scene alongside `AuraCanvas` event props: the props hear
 * canvas-level DOM events, these nodes declare what the picking stack tracks.
 */
export function eventInteractionNodes(target?: string) {
  return [
    interactions.pointer(target ? { target } : {}),
    interactions.hover(target ? { target } : {})
  ] as const;
}

export function AuraCanvas(props: AuraCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<AuraApp | undefined>(undefined);
  const builtScene = useMemo(() => buildSceneFromChildren(props.children), [props.children]);
  const handlers = useMemo<AuraCanvasEventHandlers>(
    () => ({
      ...(props.onPointerDown ? { onPointerDown: props.onPointerDown } : {}),
      ...(props.onPointerMove ? { onPointerMove: props.onPointerMove } : {}),
      ...(props.onPointerUp ? { onPointerUp: props.onPointerUp } : {}),
      ...(props.onHover ? { onHover: props.onHover } : {})
    }),
    [props.onPointerDown, props.onPointerMove, props.onPointerUp, props.onHover]
  );
  useEffect(() => {
    if (!ref.current) return undefined;
    const canvas = ref.current;
    const created = createAuraApp(canvas, {
      scene: builtScene,
      diagnostics: props.diagnostics,
      pixelRatio: props.pixelRatio,
      autoStart: props.autoStart,
      resize: props.resize
    });
    setApp(created);
    props.onReady?.(created);
    const pointerDown = (event: PointerEvent): void => handlers.onPointerDown?.(event);
    const pointerMove = (event: PointerEvent): void => {
      handlers.onPointerMove?.(event);
      handlers.onHover?.(event);
    };
    const pointerUp = (event: PointerEvent): void => handlers.onPointerUp?.(event);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      created.dispose();
      setApp(undefined);
    };
  }, [builtScene, props.autoStart, props.diagnostics, props.onReady, props.pixelRatio, props.resize, handlers]);
  return createElement(
    AuraAppContext.Provider,
    { value: app },
    createElement("canvas", {
      ref,
      className: props.className,
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        ...(props.style ?? {})
      }
    })
  );
}

export function Scene(_props: SceneProps): null {
  return null;
}

export function Model(props: ModelProps): ReactElement | null {
  if (!props.suspendOnLoad || props.suspendOnLoad.length === 0) return null;
  return createElement(
    Suspense,
    { fallback: props.fallback ?? null },
    createElement(ModelPreloader, { descriptors: props.suspendOnLoad, loader: props.loader })
  );
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

export interface AuraAssetDescriptor {
  readonly id: string;
  readonly url: string;
}

export interface AuraAssetPreloadEvidence {
  readonly ok: boolean;
  readonly loaded: readonly string[];
  readonly failed: readonly { readonly id: string; readonly message: string }[];
}

export type AuraAssetPreloadFn = (
  descriptors: readonly AuraAssetDescriptor[]
) => Promise<AuraAssetPreloadEvidence>;

async function fetchPreload(descriptors: readonly AuraAssetDescriptor[]): Promise<AuraAssetPreloadEvidence> {
  const settled = await Promise.allSettled(
    descriptors.map(async (descriptor) => {
      const response = await fetch(descriptor.url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${descriptor.url}`);
      await response.arrayBuffer();
      return descriptor.id;
    })
  );
  const loaded: string[] = [];
  const failed: { readonly id: string; readonly message: string }[] = [];
  settled.forEach((result, index) => {
    const id = descriptors[index]?.id ?? `asset-${index}`;
    if (result.status === "fulfilled") loaded.push(result.value);
    else failed.push({ id, message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });
  return { ok: failed.length === 0, loaded, failed };
}

export interface AuraAssetResource {
  preload(): Promise<AuraAssetPreloadEvidence>;
  read(): AuraAssetPreloadEvidence;
  readonly descriptors: readonly AuraAssetDescriptor[];
}

type ResourceState =
  | { readonly status: "pending"; readonly promise: Promise<AuraAssetPreloadEvidence> }
  | { readonly status: "ready"; readonly evidence: AuraAssetPreloadEvidence }
  | { readonly status: "error"; readonly error: unknown };

/**
 * Suspense-compatible asset boundary over typed-asset preload (V1).
 *
 * `read()` throws the in-flight promise while pending (so `<Suspense>`
 * shows the fallback), throws the failure once failed (so an error boundary
 * hears it — preload failures are never silent), and returns evidence when
 * ready. Consecutive `preload()` calls share one flight. Not a second loader:
 * the default warms the HTTP cache the engine loader then reads, and apps
 * that own an `AssetPreloader` pass its `preloadAll` as `loader`.
 */
export function createAuraAssetResource(
  descriptors: readonly AuraAssetDescriptor[],
  loader: AuraAssetPreloadFn = fetchPreload
): AuraAssetResource {
  if (descriptors.length === 0) throw new Error("Aura3D asset preload requires at least one descriptor.");
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (!descriptor.id || !descriptor.url) throw new Error("Aura3D asset descriptors require an id and a url.");
    if (seen.has(descriptor.id)) throw new Error(`Duplicate Aura3D asset descriptor id "${descriptor.id}".`);
    seen.add(descriptor.id);
  }
  let state: ResourceState | undefined;
  const preload = (): Promise<AuraAssetPreloadEvidence> => {
    if (state?.status === "ready") return Promise.resolve(state.evidence);
    if (state?.status === "pending") return state.promise;
    if (state?.status === "error") return Promise.reject(state.error);
    const promise = loader(descriptors).then(
      (evidence) => {
        state = { status: "ready", evidence };
        return evidence;
      },
      (error: unknown) => {
        state = { status: "error", error };
        throw error;
      }
    );
    state = { status: "pending", promise };
    return promise;
  };
  return {
    descriptors,
    preload,
    read(): AuraAssetPreloadEvidence {
      if (!state) throw preload();
      if (state.status === "pending") throw state.promise;
      if (state.status === "error") throw state.error;
      return state.evidence;
    }
  };
}

const resourceCache = new Map<string, AuraAssetResource>();

function resourceKey(descriptors: readonly AuraAssetDescriptor[]): string {
  return [...descriptors].map((d) => `${d.id}@${d.url}`).sort().join("|");
}

/** Shared resource per descriptor set, so sibling `<Model>`s preload once. */
export function resourceForDescriptors(
  descriptors: readonly AuraAssetDescriptor[],
  loader?: AuraAssetPreloadFn
): AuraAssetResource {
  const key = resourceKey(descriptors);
  let resource = resourceCache.get(key);
  if (!resource) {
    resource = createAuraAssetResource(descriptors, loader);
    resourceCache.set(key, resource);
  }
  return resource;
}

/** Read preloaded asset evidence inside a `<Suspense>` boundary. Suspends while pending. */
export function useAuraAsset(resource: AuraAssetResource): AuraAssetPreloadEvidence {
  return resource.read();
}

function ModelPreloader(props: { readonly descriptors: readonly AuraAssetDescriptor[]; readonly loader?: AuraAssetPreloadFn }): null {
  useAuraAsset(resourceForDescriptors(props.descriptors, props.loader));
  return null;
}

/**
 * drei-pattern recipes (V1): documented, tested scene fragments — not deps,
 * not parity claims. Each takes a scene builder and returns it with the
 * recipe's nodes applied.
 */
export type SceneRecipe = (builder: AuraSceneBuilder) => AuraSceneBuilder;

/** Camera-controls binding (F1/N2): orbit camera plus an orbit interaction node. */
export function cameraControlsRecipe(options: { readonly distance?: number; readonly target?: string } = {}): SceneRecipe {
  return (builder) =>
    builder
      .camera(camera.orbit(options.distance !== undefined ? { distance: options.distance } : {}))
      .add(interactions.orbit(options.target ? { target: options.target } : {}));
}

/** Environment preset (M3/B3): one IBL environment node from the preset catalog. */
export function environmentPresetRecipe(
  preset: "studio" | "materialLab" | "productHero" | "nightCinematic" | "metalStudio" | "glassStudio" = "studio"
): SceneRecipe {
  return (builder) => builder.add(environments[preset]());
}

/** Transform gizmo (F4/O3): drag-vector plus hover-select on a target node. */
export function transformGizmoRecipe(target: string): SceneRecipe {
  if (!target) throw new Error("Aura3D transform gizmo recipe requires a target node name.");
  return (builder) => builder.add(interactions.dragVector({ target })).add(interactions.hover({ target, selected: target }));
}

export interface R3FMigrationRow {
  /** The idiomatic R3F / drei surface. */
  readonly r3f: string;
  /** The AuraCanvas mapping. A mapping, not a parity claim. */
  readonly aura: string;
  readonly notes: string;
}

/**
 * R3F → AuraCanvas mapping table (V1). Documents the manual mapping for
 * importers; "R3F parity" wording is deliberately absent — these are the
 * covered paths, not the whole library.
 */
export const R3F_TO_AURA_MIGRATION_TABLE: readonly R3FMigrationRow[] = [
  { r3f: "<Canvas>", aura: "<AuraCanvas>", notes: "Mounts createAuraApp; diagnostics/pixelRatio/autoStart/resize map directly." },
  { r3f: "<mesh> / <primitive>", aura: "<Model asset={...}>", notes: "Typed asset refs only (assets.*); no raw GLB URLs or guessed IDs." },
  { r3f: "<ambientLight> / <pointLight>", aura: "<Lights>", notes: "Studio preset plus ambient/directional/point declarations." },
  { r3f: "<PerspectiveCamera> / OrbitControls", aura: "<Camera> + cameraControlsRecipe", notes: "Orbit/dolly/follow/perspective declarations; recipe adds the orbit interaction node." },
  { r3f: "<EffectComposer> effects", aura: "<Effect>", notes: "Fog/bloom/rain declarations; no postprocess parity beyond the covered set." },
  { r3f: "useFrame(callback)", aura: "useAuraFrame(callback, priority?)", notes: "Priority-ordered fan-out over app.onFrame; cleanup on unmount." },
  { r3f: "useThree((s) => s.gl)", aura: "useAuraApp()", notes: "Returns the mounted AuraApp or undefined before mount." },
  { r3f: "useLoader + <Suspense>", aura: "<Model suspendOnLoad fallback> + useAuraAsset", notes: "preloadAll semantics with per-record ok/failed evidence; failures throw to an error boundary." },
  { r3f: "onPointerOver / onClick on meshes", aura: "AuraCanvas event props + eventInteractionNodes", notes: "Props hear canvas-level DOM events; picking stays declarative via interaction nodes." },
  { r3f: "drei <OrbitControls>", aura: "cameraControlsRecipe", notes: "Tested recipe, not a drei port." },
  { r3f: "drei <Environment>", aura: "environmentPresetRecipe", notes: "IBL preset catalog node; HDRI probe stays on environments.hdri." },
  { r3f: "drei <TransformControls>", aura: "transformGizmoRecipe", notes: "Drag-vector plus hover-select recipe; editor gizmos stay in editor-runtime." }
];

/** Migration-table scope guard: the table maps covered paths, never claims R3F parity. */
export const R3F_MIGRATION_NOT_PARITY =
  "This table maps idiomatic R3F to the covered AuraCanvas surface. It is not an R3F-parity claim.";

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
