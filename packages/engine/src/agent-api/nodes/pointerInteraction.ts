// S5-WP19-04: the runtime consumer of `interactions.pointer({ target })`. The builder only declares which node
// receives pointer input; this module routes real canvas pointer events to that node by casting the pointer
// through the presented camera and comparing the nearest hit with the declared target.

import type { AuraInteractionNode, AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "./types.js";
import type { AuraRuntimeNodeHandle } from "./types/runtime.js";
import { raycast, type SceneQueryHit, type SceneRaycastCamera } from "../SceneQueries.js";
import { presentedViewProjection } from "../camera/CameraController.js";

export type AuraPointerInteractionPhase = "down" | "move" | "up";

export interface AuraPointerInteractionEvent {
  readonly phase: AuraPointerInteractionPhase;
  /** The `target` of the `interactions.pointer` node this event was routed to; `undefined` for an untargeted node. */
  readonly target: string | undefined;
  /** Nearest node under the pointer (always the target's hit for a targeted interaction). */
  readonly hit: SceneQueryHit | undefined;
  readonly ndc: readonly [number, number];
  readonly pointerId: number | undefined;
}

interface PointerElementLike {
  addEventListener(type: string, listener: (event: unknown) => void): unknown;
  removeEventListener(type: string, listener: (event: unknown) => void): unknown;
  getBoundingClientRect(): { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

/** The parts of an `AuraApp` the router reads; `camera` is the optional live camera controller. */
export interface AuraPointerInteractionApp {
  readonly canvas?: unknown;
  readonly scene: AuraSceneSnapshot;
  readonly nodes?: { all(): readonly AuraRuntimeNodeHandle[] };
  readonly camera?: unknown;
}

export interface AuraPointerInteractionBindOptions {
  /** Element that receives pointer events; defaults to `app.canvas`. */
  readonly element?: PointerElementLike;
}

/** Every `interactions.pointer` node in the scene, including those nested in groups. */
export function pointerInteractions(nodes: readonly AuraSceneNode[], found: AuraInteractionNode[] = []): AuraInteractionNode[] {
  for (const node of nodes) {
    if (node.kind === "interaction" && node.mode === "pointer") found.push(node);
    else if (node.kind === "group") pointerInteractions(node.children, found);
  }
  return found;
}

const hitMatches = (hit: SceneQueryHit | undefined, target: string): boolean =>
  hit !== undefined && (hit.nodeName === target || hit.nodeId === target);

/**
 * Route one pointer sample to the scene's pointer interactions. A targeted interaction receives the event only
 * when its target (node name or runtime id) is the nearest hit, so an occluded or missed target does not fire;
 * an untargeted interaction receives every sample with whatever is under the pointer.
 */
export function routePointerInteraction(
  nodes: readonly AuraSceneNode[],
  sample: { readonly phase: AuraPointerInteractionPhase; readonly hit: SceneQueryHit | undefined; readonly ndc: readonly [number, number]; readonly pointerId?: number }
): AuraPointerInteractionEvent[] {
  const events: AuraPointerInteractionEvent[] = [];
  for (const node of pointerInteractions(nodes)) {
    if (node.target !== undefined && !hitMatches(sample.hit, node.target)) continue;
    events.push({ phase: sample.phase, target: node.target, hit: sample.hit, ndc: sample.ndc, pointerId: sample.pointerId });
  }
  return events;
}

function cameraFor(app: AuraPointerInteractionApp, aspect: number): SceneRaycastCamera | undefined {
  const viewProjection = presentedViewProjection(app);
  if (viewProjection && viewProjection.length === 16) return { viewProjectionMatrix: viewProjection };
  const spec = app.scene.camera;
  if (!spec?.position) return undefined;
  return { position: spec.position as AuraVec3, target: spec.target ?? [0, 0, 0], ...(spec.up ? { up: spec.up } : {}), fov: spec.fov ?? 50, aspect };
}

/**
 * Bind `interactions.pointer` nodes to real pointer input. Each pointerdown/move/up on the element is cast through
 * the presented camera (the scene camera before the first frame) against the mounted node handles (the scene
 * nodes when no handle is mounted), and `listener` receives one event per pointer interaction it routes to.
 * Scenes without an `interactions.pointer` node dispatch nothing. Returns a disposer.
 */
export function bindPointerInteractions(
  app: AuraPointerInteractionApp,
  listener: (event: AuraPointerInteractionEvent) => void,
  options: AuraPointerInteractionBindOptions = {}
): () => void {
  const element = options.element ?? (app.canvas as PointerElementLike | undefined);
  if (!element || typeof element.addEventListener !== "function" || typeof element.getBoundingClientRect !== "function") {
    throw new TypeError("POINTER_INTERACTION_NO_ELEMENT: bindPointerInteractions needs app.canvas or options.element with pointer events and getBoundingClientRect().");
  }
  const handler = (phase: AuraPointerInteractionPhase) => (raw: unknown): void => {
    const event = raw as { clientX?: number; clientY?: number; pointerId?: number };
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const nodes = app.scene.nodes;
    if (pointerInteractions(nodes).length === 0) return;
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const ndc = [((event.clientX! - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY! - rect.top) / rect.height) * 2] as const;
    const camera = cameraFor(app, rect.width / rect.height);
    const handles = app.nodes?.all() ?? [];
    const hit = camera
      ? raycast({ camera, ndc }, handles.length > 0 ? { handles, firstHitOnly: true } : { nodes, recursive: true, firstHitOnly: true })[0]
      : undefined;
    for (const routed of routePointerInteraction(nodes, { phase, hit, ndc, ...(event.pointerId !== undefined ? { pointerId: event.pointerId } : {}) })) listener(routed);
  };
  const listeners: Array<[string, (event: unknown) => void]> = [["pointerdown", handler("down")], ["pointermove", handler("move")], ["pointerup", handler("up")]];
  for (const [type, fn] of listeners) element.addEventListener(type, fn);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const [type, fn] of listeners) element.removeEventListener(type, fn);
  };
}
