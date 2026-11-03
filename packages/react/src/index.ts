import {
  Children,
  Fragment,
  Suspense,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  type AuraLightNode,
  type AuraMaterialSpec,
  type AuraModelOptions,
  type AuraSceneBuilder
} from "@aura3d/engine";

/**
 * Declared locally: the engine removed these names from "." in 4.0.0
 * (PRD-15 T8.1). React's public API keeps them as its own structurally
 * identical types — the engine-side definitions live in
 * `packages/engine/src/agent-api/nodes/types/runtime.ts` and
 * `packages/engine/src/agent-api/nodes/types.ts` if these drift.
 */
export interface AuraFrameInfo {
  readonly dt: number;
  readonly fixedDt: number;
  readonly time: number;
  readonly frame: number;
  readonly alpha: number;
  readonly paused: boolean;
  readonly source: "raf" | "manual" | "fixed";
  readonly substep: number;
  readonly substeps: number;
}

export type AuraFrameCallback = (frame: AuraFrameInfo) => void;

export interface AuraTimelineSpec {
  readonly mode: "loop" | "once";
  readonly seconds?: number;
  readonly startTime?: number;
  readonly duration?: number;
  readonly loop?: boolean;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
}

export interface AuraCanvasProps {
  readonly children?: ReactNode;
  readonly diagnostics?: AuraCreateAppOptions["diagnostics"];
  readonly pixelRatio?: number;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onReady?: (app: AuraApp) => void;
  /** Renderer creation or readiness failure. Without this callback an error boundary receives it. */
  readonly onError?: (error: unknown) => void;
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

/** A renderer readiness outcome that did not produce a usable renderer. */
export class AuraCanvasReadinessError extends Error {
  readonly state: "failed" | "cancelled" | "disposed" | "superseded";
  readonly code: string;
  constructor(outcome: { readonly state: "failed"; readonly code: string; readonly message: string } | { readonly state: "cancelled" | "disposed" | "superseded" }) {
    super(outcome.state === "failed" ? outcome.message : `Aura3D renderer readiness was ${outcome.state}.`);
    this.name = "AuraCanvasReadinessError";
    this.state = outcome.state;
    this.code = outcome.state === "failed" ? outcome.code : outcome.state;
  }
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
   * A custom loader may adapt an app-owned preloader. The default loader
   * warms the HTTP cache with credential-free requests.
   */
  readonly suspendOnLoad?: readonly AuraAssetDescriptor[];
  readonly fallback?: ReactNode;
  readonly loader?: AuraAssetPreloadFn;
  /** Stable request-context identity; replace it whenever credentials or policy change. */
  readonly securityContext?: object;
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

/** Scene fog mode (C-21), as accepted by `effects.fog`; not the anti-alias `mode`. */
type FogEffectMode = NonNullable<Parameters<typeof effects.fog>[0]>["mode"];
type EffectBaseProps = Omit<AuraEffectNode, "kind" | "effect" | "mode">;

/**
 * `<Effect>` props. `mode` depends on `type`: a fog effect takes the scene fog
 * mode, every other effect keeps the effect node's anti-alias mode.
 */
export type EffectProps =
  | (EffectBaseProps & { readonly type: "fog"; readonly mode?: FogEffectMode })
  | (EffectBaseProps & { readonly type: Exclude<AuraEffectNode["effect"], "fog">; readonly mode?: AuraEffectNode["mode"] });

/**
 * The renderer-ready app for `useAuraFrame`. Undefined before readiness and
 * outside an `AuraCanvas`.
 */
export const AuraAppContext = createContext<AuraApp | undefined>(undefined);
// An app owns a security partition by default, even when two apps use one loader.
const AuraAssetSecurityContext = createContext<object | undefined>(undefined);

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
  const entries: { readonly callback: AuraFrameCallback; readonly priority: number; readonly order: number; active: boolean }[] = [];
  let unsubscribe: (() => void) | undefined;
  const dispatch = (frame: AuraFrameInfo): void => {
    const ordered = [...entries].sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (const entry of ordered) if (entry.active) entry.callback(frame);
  };
  return {
    subscribe(callback: AuraFrameCallback, priority = 0): () => void {
      if (!Number.isFinite(priority)) throw new Error("Aura3D frame priority must be finite.");
      const entry = { callback, priority, order: frameSubscriptionOrder++, active: true };
      entries.push(entry);
      try {
        if (!unsubscribe) unsubscribe = host.onFrame(dispatch);
      } catch (error) {
        entry.active = false;
        const index = entries.indexOf(entry);
        if (index !== -1) entries.splice(index, 1);
        throw error;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        entry.active = false;
        const index = entries.indexOf(entry);
        if (index !== -1) entries.splice(index, 1);
        if (entries.length === 0 && unsubscribe) {
          const releaseHost = unsubscribe;
          unsubscribe = undefined;
          releaseHost();
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
 * node has to exist and the renderer must be ready first), so the subscription attaches when `useAuraApp()`
 * turns defined — outside an `AuraCanvas` it stays undefined and the callback
 * never fires rather than throwing during the mount pass. Detect that case
 * with `useAuraApp() !== undefined`.
 */

export function useAuraFrame(callback: AuraFrameCallback, priority = 0): void {
  const app = useAuraApp();
  const latest = useRef(callback);
  // A concurrent render can be discarded while the old subscription remains
  // live. Publish its callback only after React commits that render.
  const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useCommitEffect(() => { latest.current = callback; }, [callback]);
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

let unstableMountKeys = 0;

/**
 * Identity of a built scene for remount decisions. React children are new objects on every parent
 * render, so keying the mount effect on them would dispose and recreate the app (and its WebGL
 * context) each time the parent re-renders. The serialized snapshot only changes when the scene does.
 * A snapshot that cannot be serialized gets a fresh key each call, which is the old always-remount
 * behaviour rather than a silently stale scene.
 */
export function sceneMountKey(builder: AuraSceneBuilder): string {
  try {
    return JSON.stringify(builder.toJSON());
  } catch {
    return `unserializable:${unstableMountKeys++}`;
  }
}

/** Props that never reach the scene: React-only (Suspense boundary, children) or the positional asset. */
const NON_SCENE_PROPS: ReadonlySet<string> = new Set(["children", "fallback", "loader", "securityContext", "suspendOnLoad"]);

const DECLARATIVE_TYPES = new Map<unknown, string>();

function declarativeTypeName(type: unknown): string | undefined {
  if (DECLARATIVE_TYPES.size === 0) {
    DECLARATIVE_TYPES.set(Scene, "Scene").set(Model, "Model").set(Camera, "Camera").set(Lights, "Lights").set(Effect, "Effect");
  }
  return DECLARATIVE_TYPES.get(type);
}

/**
 * Identity of the scene the declarative children describe, without building or serializing the
 * scene (anim-phys-10). It reads only the `Scene`/`Model`/`Camera`/`Lights`/`Effect` elements and
 * their scene-relevant props, so it costs a few small `JSON.stringify` calls instead of
 * `JSON.stringify(scene.toJSON())` on every render. Functions key by identity; nested React elements
 * key as placeholders. An unserializable prop gets a fresh key (a scene update, never a stale scene).
 */
export function sceneChildrenKey(children: ReactNode): string {
  const parts: string[] = [];
  const visit = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === Fragment) {
        visit((child.props as { readonly children?: ReactNode }).children);
        return;
      }
      const name = declarativeTypeName(child.type);
      if (name === undefined) return;
      const props = child.props as Record<string, unknown>;
      const sceneProps: Record<string, unknown> = {};
      for (const key of Object.keys(props).sort()) if (!NON_SCENE_PROPS.has(key)) sceneProps[key] = props[key];
      parts.push(`${name}:${propsKey(sceneProps)}`);
      if (name === "Scene") {
        parts.push("[");
        visit(props.children as ReactNode);
        parts.push("]");
      }
    });
  };
  visit(children);
  return parts.join("|");
}

function propsKey(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, entry: unknown) => {
      if (typeof entry === "function") return `fn:${identityFor(entry)}`;
      if (isValidElement(entry)) return "[element]";
      if (entry instanceof RegExp) return `re:${entry.source}/${entry.flags}`;
      return entry;
    }) ?? "undefined";
  } catch {
    return `unserializable:${unstableMountKeys++}`;
  }
}

/**
 * Apply a scene change to a mounted app in place (anim-phys-10): `setScene` when the children key
 * moved, nothing otherwise. Returns the key now mounted. The app, its canvas and WebGL context stay.
 */
export function applySceneChange(
  app: Pick<AuraApp, "setScene">,
  mountedKey: string,
  nextKey: string,
  nextScene: AuraSceneBuilder
): string {
  if (mountedKey === nextKey) return mountedKey;
  app.setScene(nextScene);
  return nextKey;
}

function optionMountKey(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return `unserializable:${unstableMountKeys++}`;
  }
}

export function AuraCanvas(props: AuraCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const assetSecurityContext = useRef<object>({});
  const [status, setStatus] = useState<{
    app?: AuraApp;
    sceneKey?: string;
    options?: readonly [string, boolean | undefined, number | undefined, boolean | undefined];
    error?: unknown;
    failed?: boolean;
    handled?: boolean;
  }>({});
  const live = useRef<{
    app: AuraApp;
    sceneKey: string;
    refreshReadiness(): void;
    fail(error: unknown): void;
  } | undefined>(undefined);
  // The scene is rebuilt only when the declarative children change, keyed without serializing it.
  const sceneKey = sceneChildrenKey(props.children);
  // The key tracks the children's scene identity, not their object identity.
  const builtScene = useMemo(() => buildSceneFromChildren(props.children), [sceneKey]);
  const diagnosticsKey = optionMountKey(props.diagnostics);
  // Publish only committed props. A concurrent render may be abandoned, so
  // writing this ref during render could expose callbacks from a discarded tree.
  const latest = useRef({ props, builtScene, sceneKey, diagnosticsKey });
  const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useCommitEffect(() => {
    latest.current = { props, builtScene, sceneKey, diagnosticsKey };
  });
  useEffect(() => {
    if (!ref.current) return undefined;
    const canvas = ref.current;
    const { props: mountProps, builtScene: mountScene } = latest.current;
    let active = true;
    let revision = 0;
    let notified = false;
    let readinessController: AbortController | undefined;
    setStatus({});
    const isCurrentMount = (mountedSceneKey: string): boolean => {
      const current = latest.current;
      return current.sceneKey === mountedSceneKey && current.diagnosticsKey === diagnosticsKey &&
        Object.is(current.props.autoStart, mountProps.autoStart) &&
        Object.is(current.props.pixelRatio, mountProps.pixelRatio) && Object.is(current.props.resize, mountProps.resize);
    };
    const fail = (error: unknown): void => {
      if (!active) return;
      ++revision;
      readinessController?.abort();
      const handler = latest.current.props.onError;
      setStatus({ error, failed: true, handled: typeof handler === "function" });
      if (typeof handler === "function") {
        try {
          handler(error);
        } catch (handlerError) {
          if (active) setStatus({ error: handlerError, failed: true });
        }
      }
    };
    let created: AuraApp;
    try {
      created = createAuraApp(canvas, {
        scene: mountScene,
        diagnostics: mountProps.diagnostics,
        pixelRatio: mountProps.pixelRatio,
        autoStart: mountProps.autoStart,
        resize: mountProps.resize
      });
    } catch (error) {
      fail(error);
      return () => { active = false; };
    }
    const mount = {
      app: created,
      sceneKey: latest.current.sceneKey,
      fail,
      refreshReadiness(): void {
        readinessController?.abort();
        const controller = new AbortController();
        readinessController = controller;
        const currentRevision = ++revision;
        // setScene starts a new renderer mount on the same app. Do not expose
        // the previous mount's readiness to hooks while that mount is pending.
        setStatus({});
        // Re-read readiness after setScene: an earlier mount can settle after a newer one started.
        void Promise.resolve().then(async () => {
          if (!active || currentRevision !== revision || !isCurrentMount(mount.sceneKey)) return undefined;
          if (typeof created.readiness === "function") {
            return created.readiness({ stage: "renderer", signal: controller.signal });
          }
          // Older supported peers expose settled-only ready(), which can also resolve on
          // failure. Never turn that resolution alone into a successful readiness signal.
          try {
            await created.ready();
            if (controller.signal.aborted) return { state: "cancelled" as const };
            const diagnostics = created.diagnostics();
            if (diagnostics.backend === "webgl2" && diagnostics.renderer?.runtime.mounted === true) {
              return { state: "ready" as const, stage: "renderer" as const, backend: "webgl2" as const };
            }
          } catch {
            // Old runtime errors may contain private URLs; do not copy them into this boundary.
          }
          return {
            state: "failed" as const,
            code: "legacy-renderer-unavailable",
            message: "The legacy engine did not confirm that its renderer mounted. Inspect diagnostics or upgrade @aura3d/engine."
          };
        }).then(
          (outcome) => {
            if (!outcome || !active || currentRevision !== revision || !isCurrentMount(mount.sceneKey)) return;
            if (outcome.state !== "ready") {
              fail(new AuraCanvasReadinessError(outcome));
              return;
            }
            setStatus({
              app: created,
              sceneKey: mount.sceneKey,
              options: [diagnosticsKey, mountProps.autoStart, mountProps.pixelRatio, mountProps.resize]
            });
            if (!notified) {
              notified = true;
              try {
                latest.current.props.onReady?.(created);
              } catch (error) {
                fail(error);
              }
            }
          },
          (error: unknown) => {
            if (active && currentRevision === revision && isCurrentMount(mount.sceneKey)) fail(error);
          }
        );
      }
    };
    live.current = mount;
    const pointerDown = (event: PointerEvent): void => latest.current.props.onPointerDown?.(event);
    const pointerMove = (event: PointerEvent): void => {
      latest.current.props.onPointerMove?.(event);
      latest.current.props.onHover?.(event);
    };
    const pointerUp = (event: PointerEvent): void => latest.current.props.onPointerUp?.(event);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    mount.refreshReadiness();
    return () => {
      active = false;
      ++revision;
      readinessController?.abort();
      if (live.current === mount) live.current = undefined;
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      created.dispose();
    };
  }, [diagnosticsKey, props.autoStart, props.pixelRatio, props.resize]);
  // A changed scene goes to the live app through setScene; it no longer disposes and recreates the app.
  useEffect(() => {
    const mount = live.current;
    if (!mount || mount.sceneKey === sceneKey) return;
    try {
      mount.sceneKey = applySceneChange(mount.app, mount.sceneKey, sceneKey, builtScene);
      mount.refreshReadiness();
    } catch (error) {
      mount.fail(error);
    }
  }, [sceneKey, builtScene]);
  if (status.failed && !status.handled) throw status.error;
  // A prop change renders before effects can remount the renderer. Hide the
  // previous app immediately, including before the cleanup effect has run.
  const mountedOptions = status.options;
  const currentApp = status.sceneKey === sceneKey && mountedOptions &&
    mountedOptions[0] === diagnosticsKey && Object.is(mountedOptions[1], props.autoStart) &&
    Object.is(mountedOptions[2], props.pixelRatio) && Object.is(mountedOptions[3], props.resize)
    ? status.app
    : undefined;
  // Children render inside the provider: `Scene` forwards children and the declarative leaf nodes return null,
  // `<Model suspendOnLoad>` suspends, and any other child (a component calling `useAuraFrame`/`useAuraApp`, a DOM
  // overlay) now sees the mounted app. Before this, children were only read for the scene and never rendered.
  return createElement(
    AuraAppContext.Provider,
    { value: currentApp },
    createElement("canvas", {
      ref,
      className: props.className,
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        ...(props.style ?? {})
      }
    }),
    createElement(AuraAssetSecurityContext.Provider, { value: assetSecurityContext.current }, props.children)
  );
}

export function Scene(props: SceneProps): ReactElement {
  return createElement(Fragment, null, props.children);
}

export function Model(props: ModelProps): ReactElement | null {
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const canvasSecurityContext = useContext(AuraAssetSecurityContext);
  const standaloneSecurityContext = useRef<object>({});
  const committedResource = useRef<{
    readonly resource: AuraAssetResource;
    readonly loader: AuraAssetPreloadFn | undefined;
    readonly securityContext: object;
  } | undefined>(undefined);
  // A custom loader can close over mutable credentials. A canvas identity is
  // not proof that two Models use the same request context, so custom loaders
  // default to the Model's own scope. The resource is not started until the
  // effect below commits, including when an ancestor suspends the first render.
  const securityContext = props.securityContext !== undefined
    ? props.securityContext
    : props.loader !== undefined
      ? standaloneSecurityContext.current
      : canvasSecurityContext ?? standaloneSecurityContext.current;
  const descriptors = props.suspendOnLoad;
  const previous = committedResource.current;
  // A selection can leave the idle cache before it commits. Keep the committed
  // Model's resource stable even when unrelated lookups fill that cache.
  const resource = hydrated && descriptors?.length
    ? previous && previous.loader === props.loader && previous.securityContext === securityContext &&
      !resourceIsDisposed.get(previous.resource)?.() && sameDescriptorIdentity(descriptors, previous.resource.descriptors)
      ? previous.resource
      : resourceForDescriptors(descriptors, props.loader, securityContext)
    : undefined;
  const [ownedResource, setOwnedResource] = useState<AuraAssetResource | undefined>(undefined);
  useEffect(() => {
    if (!resource) return undefined;
    const release = resource.retain();
    const selection = { resource, loader: props.loader, securityContext };
    committedResource.current = selection;
    const controller = new AbortController();
    // The boundary commits even while its child suspends, so it can own and cancel this wait.
    void resource.preload({ signal: controller.signal }).catch(() => undefined);
    setOwnedResource(resource);
    return () => {
      if (committedResource.current === selection) committedResource.current = undefined;
      controller.abort();
      release();
    };
  }, [resource]);
  if (!props.suspendOnLoad || props.suspendOnLoad.length === 0) return null;
  return createElement(
    Suspense,
    { fallback: props.fallback ?? null },
    resource && ownedResource === resource
      ? createElement(ModelPreloader, { resource })
      : props.fallback ?? null
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
  /** Optional SHA-256, as 64 hex digits with or without the `sha256-` prefix. */
  readonly hash?: string;
  readonly sha256?: string;
}

export interface AuraAssetPreloadEvidence {
  readonly ok: boolean;
  readonly loaded: readonly string[];
  readonly failed: readonly { readonly id: string; readonly message: string }[];
}

export type AuraAssetPreloadFn = (
  descriptors: readonly AuraAssetDescriptor[],
  options?: { readonly signal: AbortSignal }
) => Promise<AuraAssetPreloadEvidence>;

async function fetchPreload(
  descriptors: readonly AuraAssetDescriptor[],
  options?: { readonly signal: AbortSignal }
): Promise<AuraAssetPreloadEvidence> {
  const settled = await Promise.allSettled(
    descriptors.map(async (descriptor) => {
      const response = await fetch(descriptor.url, { credentials: "omit", signal: options?.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const expected = descriptor.hash ?? descriptor.sha256;
      if (expected) {
        if (!globalThis.crypto?.subtle) throw new Error("SHA-256 verification is unavailable.");
        const actual = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
        const hex = Array.from(actual, (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (hex !== normalizeDigest(expected)) throw new Error("Asset SHA-256 does not match.");
      }
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
  /**
   * Unsignalled callers share a 30-second deadline for a flight. An explicit
   * retain defers that deadline until the last release. Pass a signal to
   * control an independent longer wait.
   */
  preload(options?: { readonly signal?: AbortSignal }): Promise<AuraAssetPreloadEvidence>;
  /**
   * An unsignalled read uses the same deadline as preload. React cannot report
   * an abandoned render before its first commit, so prompt cancellation needs
   * a signal owned outside the suspending subtree. Other owners can keep the
   * shared flight alive after this wait times out.
   */
  read(options?: { readonly signal?: AbortSignal }): AuraAssetPreloadEvidence;
  /** Retry after failure or cancellation; reuse an already-owned flight. */
  retry(options?: { readonly signal?: AbortSignal }): Promise<AuraAssetPreloadEvidence>;
  /** Keep this resource alive independently of other owners; release is idempotent. */
  retain(): () => void;
  /** Evict this resource and cancel its current flight for all owners. */
  dispose(): void;
  readonly descriptors: readonly AuraAssetDescriptor[];
}

interface ResourceWaiter {
  resolve(evidence: AuraAssetPreloadEvidence): void;
  reject(error: unknown): void;
}

interface UnsignalledResourceWait {
  readonly promise: Promise<AuraAssetPreloadEvidence>;
  error?: Error;
  pause(): void;
  resume(): void;
}

interface PendingResource {
  readonly status: "pending";
  readonly promise: Promise<AuraAssetPreloadEvidence>;
  readonly controller: AbortController;
  readonly waiters: Set<ResourceWaiter>;
  observingWaiters: boolean;
  starting: boolean;
  abortScheduled: boolean;
  unsignalled?: UnsignalledResourceWait;
}

type ResourceState =
  | PendingResource
  | { readonly status: "ready"; readonly evidence: AuraAssetPreloadEvidence }
  | { readonly status: "error"; readonly error: unknown };

/** Carries individual loader failures without treating partial preload as success. */
export class AuraAssetPreloadError extends Error {
  readonly evidence: AuraAssetPreloadEvidence;
  constructor(evidence: AuraAssetPreloadEvidence) {
    super("Aura3D asset preload failed or returned incomplete evidence.");
    this.name = "AuraAssetPreloadError";
    this.evidence = evidence;
  }
}

function abortError(): Error {
  const error = new Error("Aura3D asset preload was cancelled.");
  error.name = "AbortError";
  return error;
}

const UNSIGNALLED_WAIT_TIMEOUT_MS = 30_000;

function timeoutError(): Error {
  const error = new Error("An unsignalled Aura3D asset wait timed out after 30 seconds. Pass a signal or retain the resource.");
  error.name = "TimeoutError";
  return error;
}

function normalizeDigest(digest: string): string {
  const hex = digest.replace(/^sha256-/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Aura3D asset SHA-256 must contain 64 hex digits.");
  return hex.toLowerCase();
}

function snapshotDescriptors(descriptors: readonly AuraAssetDescriptor[]): readonly AuraAssetDescriptor[] {
  if (descriptors.length === 0) throw new Error("Aura3D asset preload requires at least one descriptor.");
  const seen = new Set<string>();
  const copy = descriptors.map((descriptor) => {
    if (!descriptor.id || !descriptor.url) throw new Error("Aura3D asset descriptors require an id and a url.");
    if (seen.has(descriptor.id)) throw new Error(`Duplicate Aura3D asset descriptor id "${descriptor.id}".`);
    seen.add(descriptor.id);
    if (descriptor.hash !== undefined) normalizeDigest(descriptor.hash);
    if (descriptor.sha256 !== undefined) normalizeDigest(descriptor.sha256);
    if (descriptor.hash !== undefined && descriptor.sha256 !== undefined && normalizeDigest(descriptor.hash) !== normalizeDigest(descriptor.sha256)) {
      throw new Error("Aura3D asset hash and sha256 disagree.");
    }
    return Object.freeze({ id: descriptor.id, url: descriptor.url, ...(descriptor.hash !== undefined ? { hash: descriptor.hash } : {}), ...(descriptor.sha256 !== undefined ? { sha256: descriptor.sha256 } : {}) });
  });
  return Object.freeze(copy);
}

function sameDescriptorIdentity(left: readonly AuraAssetDescriptor[], right: readonly AuraAssetDescriptor[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return other?.id === item.id && other.url === item.url && other.hash === item.hash && other.sha256 === item.sha256;
  });
}

/**
 * A standalone Suspense resource. The default loader warms the HTTP cache;
 * it does not transfer ownership of engine resources to the adapter.
 */
export function createAuraAssetResource(
  descriptors: readonly AuraAssetDescriptor[],
  loader: AuraAssetPreloadFn = fetchPreload
): AuraAssetResource {
  return makeAssetResource(snapshotDescriptors(descriptors), loader);
}

function makeAssetResource(
  descriptors: readonly AuraAssetDescriptor[],
  loader: AuraAssetPreloadFn,
  onDispose: () => void = () => undefined,
  onOwnershipChange: () => void = () => undefined
): AuraAssetResource {
  let state: ResourceState | undefined;
  let disposed = false;
  let retained = 0;
  let subscribers = 0;
  const readInterests = new WeakMap<AbortSignal, {
    readonly pending: PendingResource;
    readonly promise: Promise<AuraAssetPreloadEvidence>;
  }>();
  const start = (): PendingResource => {
    const controller = new AbortController();
    const cancellation = abortError();
    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(cancellation), { once: true });
    });
    let resolveLoad!: (value: AuraAssetPreloadEvidence | PromiseLike<AuraAssetPreloadEvidence>) => void;
    let rejectLoad!: (error: unknown) => void;
    const load = new Promise<AuraAssetPreloadEvidence>((resolve, reject) => {
      resolveLoad = resolve;
      rejectLoad = reject;
    });
    let pending: PendingResource;
    const promise = Promise.race([load, cancelled]).then(
      (evidence) => {
        if (disposed || controller.signal.aborted) throw cancellation;
        if (!evidence.ok || evidence.failed.length > 0 || descriptors.some(({ id }) => !evidence.loaded.includes(id))) {
          throw new AuraAssetPreloadError(evidence);
        }
        if (!disposed && state === pending) {
          state = { status: "ready", evidence };
          onOwnershipChange();
        }
        return evidence;
      }
    ).catch((error: unknown) => {
      const reason = disposed || controller.signal.aborted ? cancellation : error;
      if (!disposed && state === pending) {
        // Last-owner cancellation is not a failed asset: a later owner may
        // start a new flight. Keep real loader failures, including its own
        // AbortError, until the caller explicitly retries them.
        state = reason === cancellation ? undefined : { status: "error", error: reason };
        onOwnershipChange();
      }
      throw reason;
    });
    pending = {
      status: "pending", promise, controller, waiters: new Set(), observingWaiters: false,
      starting: true, abortScheduled: false
    };
    state = pending;
    // A synchronous loader may reenter the shared lookup before its initiating
    // caller is registered; do not treat that flight as an idle cache entry.
    onOwnershipChange();
    try {
      resolveLoad(loader(descriptors, { signal: controller.signal }));
    } catch (error) {
      rejectLoad(error);
    } finally {
      // The initiating caller is not registered until the synchronous loader returns.
      pending.starting = false;
      if (!disposed && state === pending && pending.unsignalled?.error && pending.waiters.size === 0 && retained === 0) {
        state = { status: "error", error: pending.unsignalled.error };
        pending.controller.abort();
      }
      onOwnershipChange();
    }
    return pending;
  };
  const observeWaiters = (pending: PendingResource): void => {
    if (pending.observingWaiters) return;
    pending.observingWaiters = true;
    // One reaction per flight lets cancelled subscribers release their references
    // even when another owner keeps a slow or stalled shared load alive.
    void pending.promise.then(
      (evidence) => { for (const waiter of pending.waiters) waiter.resolve(evidence); },
      (error: unknown) => { for (const waiter of pending.waiters) waiter.reject(error); }
    );
  };
  const unsignalledWait = (pending: PendingResource): Promise<AuraAssetPreloadEvidence> => {
    if (pending.unsignalled) return pending.unsignalled.promise;
    let resolve!: (evidence: AuraAssetPreloadEvidence) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<AuraAssetPreloadEvidence>((fulfill, fail) => {
      resolve = fulfill;
      reject = fail;
    });
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pause = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      pause();
      pending.waiters.delete(waiter);
      --subscribers;
      return true;
    };
    const expire = (): void => {
      timer = undefined;
      if (!finish()) return;
      const error = timeoutError();
      interest.error = error;
      if (!disposed && state === pending && retained === 0 && pending.waiters.size === 0 && !pending.starting) {
        // Keep a timeout as a retryable failure, rather than making Suspense
        // restart a permanently stalled flight on every rejected wakeable.
        state = { status: "error", error };
        pending.controller.abort();
      }
      reject(error);
      onOwnershipChange();
    };
    const interest: UnsignalledResourceWait = {
      promise,
      pause,
      resume(): void {
        if (settled || disposed || retained > 0 || timer !== undefined) return;
        timer = setTimeout(expire, UNSIGNALLED_WAIT_TIMEOUT_MS);
        // An abandoned server render must not by itself keep Node alive.
        (timer as unknown as { unref?: () => void }).unref?.();
      }
    };
    const waiter: ResourceWaiter = {
      resolve: (evidence) => {
        if (!finish()) return;
        resolve(evidence);
        onOwnershipChange();
      },
      reject: (error) => {
        if (!finish()) return;
        reject(error);
        onOwnershipChange();
      }
    };
    pending.unsignalled = interest;
    pending.waiters.add(waiter);
    ++subscribers;
    observeWaiters(pending);
    interest.resume();
    onOwnershipChange();
    return promise;
  };
  const preload = (options?: { readonly signal?: AbortSignal }): Promise<AuraAssetPreloadEvidence> => {
    const signal = options?.signal;
    if (disposed || signal?.aborted) return Promise.reject(abortError());
    if (state?.status === "ready") return Promise.resolve(state.evidence);
    if (state?.status === "error") return Promise.reject(state.error);
    // A StrictMode cleanup can abort a flight immediately before the next setup.
    if (state?.status === "pending" && state.controller.signal.aborted) state = undefined;
    const pending = state?.status === "pending" ? state : start();
    if (!signal) return unsignalledWait(pending);
    observeWaiters(pending);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (): boolean => {
        if (settled) return false;
        settled = true;
        pending.waiters.delete(waiter);
        --subscribers;
        signal.removeEventListener("abort", cancel);
        return true;
      };
      const cancel = (): void => {
        if (!finish()) return;
        reject(abortError());
        if (pending.waiters.size === 0 && retained === 0 &&
            !pending.starting && !pending.abortScheduled && state === pending) pending.controller.abort();
        onOwnershipChange();
      };
      const waiter: ResourceWaiter = {
        resolve: (evidence) => {
          if (!finish()) return;
          resolve(evidence);
          onOwnershipChange();
        },
        reject: (error) => {
          if (!finish()) return;
          reject(error);
          onOwnershipChange();
        }
      };
      pending.waiters.add(waiter);
      ++subscribers;
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      else onOwnershipChange();
    });
  };
  const read = (implicitInterest: boolean, options?: { readonly signal?: AbortSignal }): AuraAssetPreloadEvidence => {
    const signal = options?.signal;
    if (disposed || signal?.aborted) throw abortError();
    if (state?.status === "pending" && state.controller.signal.aborted) state = undefined;
    if (implicitInterest && signal && (!state || state.status === "pending")) {
      const previous = readInterests.get(signal);
      if (previous && previous.pending === state) throw previous.promise;
      const promise = preload({ signal });
      const pending = state as ResourceState | undefined;
      if (pending?.status === "pending") {
        readInterests.set(signal, { pending, promise });
        const forget = (): void => {
          if (readInterests.get(signal)?.promise === promise) readInterests.delete(signal);
        };
        void promise.then(forget, forget);
      }
      throw promise;
    }
    if (!state) {
      if (implicitInterest) throw preload();
      const pending = start();
      // ModelPreloader normally has a committed owner. If it is ever read
      // without one, do not leave a detached flight running indefinitely.
      throw retained === 0 && pending.waiters.size === 0 ? unsignalledWait(pending) : pending.promise;
    }
    if (state.status === "pending") {
      if (implicitInterest) {
        if (state.unsignalled?.error) throw state.unsignalled.error;
        throw unsignalledWait(state);
      }
      if (retained === 0 && state.waiters.size === 0) throw unsignalledWait(state);
      throw state.promise;
    }
    if (state.status === "error") throw state.error;
    return state.evidence;
  };
  const resource: AuraAssetResource = {
    descriptors,
    preload,
    read: (options) => read(true, options),
    retry(options): Promise<AuraAssetPreloadEvidence> {
      if (disposed || options?.signal?.aborted) return Promise.reject(abortError());
      if (state?.status === "error") state = undefined;
      else if (state?.status === "pending" && state.unsignalled?.error) state.unsignalled = undefined;
      return preload(options);
    },
    retain(): () => void {
      if (disposed) throw abortError();
      ++retained;
      if (state?.status === "pending") state.unsignalled?.pause();
      onOwnershipChange();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        --retained;
        const pending = state?.status === "pending" ? state : undefined;
        if (retained === 0 && pending) pending.unsignalled?.resume();
        if (retained === 0 && pending && !pending.abortScheduled) {
          // React StrictMode replays effect cleanup and setup synchronously. Give the next
          // owner one microtask to retain the same flight before cancelling an orphan.
          pending.abortScheduled = true;
          queueMicrotask(() => {
            pending.abortScheduled = false;
            if (!disposed && state === pending && retained === 0 && pending.waiters.size === 0) {
              pending.controller.abort();
            }
            onOwnershipChange();
          });
        }
        onOwnershipChange();
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (state?.status === "pending") state.controller.abort();
      onDispose();
    }
  };
  resourceHasOwners.set(resource, () => retained > 0 || subscribers > 0 || (state?.status === "pending" &&
    (state.starting || state.abortScheduled)));
  resourceScopedReads.set(resource, () => read(false));
  resourceIsDisposed.set(resource, () => disposed);
  return resource;
}

// The limit applies to idle entries. Explicit owners and pending subscribers
// must remain discoverable even when their number exceeds the idle capacity.
const RESOURCE_CACHE_LIMIT = 128;
const resourceHasOwners = new WeakMap<AuraAssetResource, () => boolean>();
const resourceScopedReads = new WeakMap<AuraAssetResource, () => AuraAssetPreloadEvidence>();
const resourceIsDisposed = new WeakMap<AuraAssetResource, () => boolean>();
interface CachedResource {
  readonly resource: AuraAssetResource;
  readonly loaderIdentity: number;
  readonly securityIdentity: number | undefined;
}
// Opaque numeric keys avoid retaining signed URLs or credentials as cache keys.
const resourceCache = new Map<number, CachedResource>();
const idleResourceCache = new Map<number, CachedResource>();
const identityIds = new WeakMap<object, number>();
let nextIdentity = 1;
let nextCacheEntry = 1;

function identityFor(value: object): number {
  let identity = identityIds.get(value);
  if (identity === undefined) {
    identity = nextIdentity++;
    identityIds.set(value, identity);
  }
  return identity;
}

function trimResourceCache(): void {
  while (idleResourceCache.size > RESOURCE_CACHE_LIMIT) {
    const oldest = idleResourceCache.entries().next().value as [number, CachedResource] | undefined;
    if (!oldest) return;
    const [key, entry] = oldest;
    idleResourceCache.delete(key);
    // Eviction removes only the lookup, not the resource: an uncommitted render
    // or an external caller may still hold and later retain that resource.
    if (resourceCache.get(key) === entry && !resourceHasOwners.get(entry.resource)?.()) resourceCache.delete(key);
  }
}

function syncResourceCache(key: number, entry: CachedResource): void {
  const cached = resourceCache.get(key) === entry;
  if (resourceIsDisposed.get(entry.resource)?.()) {
    if (cached) resourceCache.delete(key);
    idleResourceCache.delete(key);
  } else if (resourceHasOwners.get(entry.resource)?.()) {
    idleResourceCache.delete(key);
    // A resource may have been evicted while idle, then acquired by a render
    // that already held it. Make it discoverable again while it has an owner.
    if (!cached) resourceCache.set(key, entry);
  } else if (cached && !idleResourceCache.has(key)) {
    idleResourceCache.set(key, entry);
  }
  trimResourceCache();
}

/**
 * Share by loader, security-context identity and ordered descriptor identity.
 * A custom loader requires an explicit security context; use
 * `createAuraAssetResource` for an independently owned resource. The idle
 * lookup cache is bounded; resources with live owners remain discoverable.
 */
export function resourceForDescriptors(
  descriptors: readonly AuraAssetDescriptor[],
  loader: AuraAssetPreloadFn = fetchPreload,
  securityContext?: object
): AuraAssetResource {
  if (securityContext !== undefined && (typeof securityContext !== "object" || securityContext === null)) {
    throw new Error("Aura3D asset securityContext must be an object identity.");
  }
  const snapshot = snapshotDescriptors(descriptors);
  if (loader !== fetchPreload && securityContext === undefined) {
    throw new Error("Aura3D custom loaders require a securityContext for shared resources; pass a stable request context or use createAuraAssetResource().");
  }
  const loaderIdentity = identityFor(loader);
  const securityIdentity = securityContext === undefined ? undefined : identityFor(securityContext);
  let match: [number, CachedResource] | undefined;
  let matchOwned = false;
  for (const [key, entry] of resourceCache) {
    const previous = entry.resource.descriptors;
    if (entry.loaderIdentity !== loaderIdentity || entry.securityIdentity !== securityIdentity || previous.length !== snapshot.length) continue;
    if (!sameDescriptorIdentity(snapshot, previous)) continue;
    // An idle resource can have been evicted and later reacquired after another
    // lookup was created. Prefer an owned entry, with a stable tie-breaker if
    // several already-held resources were reacquired for the same identity.
    const owned = resourceHasOwners.get(entry.resource)?.() ?? false;
    if (!match || (owned && !matchOwned) || (owned === matchOwned && key < match[0])) {
      match = [key, entry];
      matchOwned = owned;
    }
  }
  if (match) {
    const [key, entry] = match;
    resourceCache.delete(key);
    resourceCache.set(key, entry);
    if (idleResourceCache.delete(key)) idleResourceCache.set(key, entry);
    return entry.resource;
  }
  const key = nextCacheEntry++;
  let entry: CachedResource;
  const resource = makeAssetResource(snapshot, loader, () => {
    if (resourceCache.get(key) === entry) resourceCache.delete(key);
    idleResourceCache.delete(key);
  }, () => syncResourceCache(key, entry));
  entry = { resource, loaderIdentity, securityIdentity };
  resourceCache.set(key, entry);
  syncResourceCache(key, entry);
  return resource;
}

/**
 * Read preloaded evidence inside a `<Suspense>` boundary. After this hook
 * commits, later unsignalled reads of native resources are scoped to its effect
 * lifetime; prompt cancellation before its first commit needs an externally
 * owned signal.
 */
export function useAuraAsset(resource: AuraAssetResource, options?: { readonly signal?: AbortSignal }): AuraAssetPreloadEvidence {
  const committedOwner = useRef<{ readonly controller: AbortController; active: boolean } | undefined>(undefined);
  useEffect(() => {
    if (typeof AbortController === "undefined") return undefined;
    const owner = committedOwner.current ?? { controller: new AbortController(), active: false };
    committedOwner.current = owner;
    owner.active = true;
    return () => {
      owner.active = false;
      // StrictMode can replay cleanup and setup synchronously. Keep the same
      // signal through that replay rather than cancelling a live read.
      void Promise.resolve().then(() => {
        if (owner.active) return;
        if (committedOwner.current === owner) committedOwner.current = undefined;
        owner.controller.abort();
      });
    };
  }, []);
  useEffect(() => resource.retain(), [resource]);
  const owner = committedOwner.current;
  // Only native resources have the per-signal shared-waiter semantics below.
  // Preserve the behavior of structurally compatible third-party resources.
  if (!options?.signal && owner?.active && resourceScopedReads.has(resource)) {
    return resource.read({ ...options, signal: owner.controller.signal });
  }
  return resource.read(options);
}

const subscribeHydration = (): (() => void) => () => undefined;
const clientSnapshot = (): boolean => true;
const serverSnapshot = (): boolean => false;

function ModelPreloader(props: { readonly resource: AuraAssetResource }): null {
  resourceScopedReads.get(props.resource)!();
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

function isRainParticleSize(size: AuraEffectNode["size"]): size is number | readonly [number, number] | undefined {
  return size === undefined || typeof size === "number" ||
    (Array.isArray(size) && size.length === 2 && typeof size[0] === "number" && typeof size[1] === "number");
}

export function buildSceneFromChildren(children: ReactNode): AuraSceneBuilder {
  let builder = scene();
  const sceneElement = findFirstElementOfType(children, Scene);
  const sceneProps = (sceneElement?.props ?? {}) as SceneProps;
  if (sceneProps.background) builder = builder.background(sceneProps.background);
  if (sceneProps.camera) builder = builder.camera(sceneProps.camera);
  if (sceneProps.timeline) builder = builder.timeline(sceneProps.timeline);
  if (sceneProps.diagnostics) builder = builder.diagnostics(sceneProps.diagnostics);
  const visit = (nodes: ReactNode): void => forEachSceneElement(nodes, (child) => {
    if (child.type === Scene) {
      // Keep the existing first-Scene rule while also accepting declarative
      // siblings. Fragments are transparent to the scene builder.
      if (child === sceneElement) visit(sceneProps.children);
      return;
    }
    if (child.type === Model) {
      // Only model options reach model(): the asset is positional and the Suspense props are React-only,
      // so they must not show up as OPTION_IGNORED notes.
      const { asset, suspendOnLoad: _suspendOnLoad, fallback: _fallback, loader: _loader, securityContext: _securityContext, ...options } = child.props as ModelProps & { readonly children?: ReactNode };
      delete (options as { children?: ReactNode }).children;
      builder.add(model(asset, options));
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
      if (props.type === "fog") builder.add(effects.fog({ ...props }));
      if (props.type === "bloom") builder.add(effects.bloom(props));
      if (props.type === "rain") {
        const size = props.size;
        if (!isRainParticleSize(size)) {
          throw new RangeError("Aura3D Effect rain size must be a scalar or a [min, max] particle size range.");
        }
        builder.add(effects.rain({ ...props, size }));
      }
    }
  });
  visit(children);
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

function forEachSceneElement(children: ReactNode, visit: (child: ReactElement) => void): void {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) forEachSceneElement((child.props as { readonly children?: ReactNode }).children, visit);
    else visit(child);
  });
}

function findFirstElementOfType(children: ReactNode, type: (props: never) => ReactElement | null): ReactElement | undefined {
  let found: ReactElement | undefined;
  forEachSceneElement(children, (child) => { if (!found && child.type === type) found = child; });
  return found;
}
