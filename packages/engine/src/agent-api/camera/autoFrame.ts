/**
 * N4 (5.4.0): framing by default. `camera.auto(options)` returns a camera spec
 * the scene builder solves against its own nodes when it serialises, so an
 * author never hand-places a camera and never needs the scene object to frame
 * it (`scene().add(...).camera(camera.auto())` works in one chain). A scene
 * whose author never chose a camera is solved the same way.
 *
 * The solve is the `camera.frame` maths (`frameCameraPose`, exact perspective
 * fit over the drawn world bounds; ground planes and ground-named nodes are
 * left out of the box). The aspect is the author's `aspect`, else the window's
 * at serialisation time, else 16/9. With no model or primitive nodes the spec
 * stays the plain default orbit.
 */
import type { AuraCameraSpec, AuraSceneNode, AuraVec3 } from "../nodes/types.js";
import { frameCameraPose } from "./frameSubject.js";
import { isGroundLikeNode, worldBoundsOfNodes, type AuraCameraFrameOptions } from "./frameNodes.js";

/** Options for `camera.auto`: the `camera.frame` options (fill default 0.6) plus orbit extras. */
export interface AuraCameraAutoOptions extends AuraCameraFrameOptions {
  /**
   * Frame only these nodes, matched by `name` or runtime `id` anywhere in the
   * scene (parent group transforms are honoured), e.g. `subject: "clock"` keeps
   * the floor, wall and props in shot without letting them set the size.
   * Unmatched names fall back to the whole scene.
   */
  readonly subject?: string | readonly string[];
  /** Orbit auto-rotation speed, as on `camera.orbit`. */
  readonly autoRotate?: number;
}

const AUTO_SPECS = new WeakMap<object, AuraCameraAutoOptions>();

/** Mark `spec` as an auto-framed placeholder (resolved by the scene builder). */
export function markAutoFrameSpec(spec: AuraCameraSpec, options: AuraCameraAutoOptions): AuraCameraSpec {
  AUTO_SPECS.set(spec, options);
  return spec;
}

/** The `camera.auto` options of a placeholder spec, or `undefined` for an ordinary spec. */
export function autoFrameOptionsOf(spec: AuraCameraSpec | undefined): AuraCameraAutoOptions | undefined {
  return spec ? AUTO_SPECS.get(spec) : undefined;
}

type TreeNode = AuraSceneNode & { readonly children?: readonly TreeNode[]; readonly runtime?: { readonly id?: string } };

/** The scene tree pruned to the branches holding a matching node (ancestors kept for their transforms). */
function pruneToSubject(nodes: readonly AuraSceneNode[], names: ReadonlySet<string>): AuraSceneNode[] {
  const visit = (node: TreeNode): TreeNode | undefined => {
    const named = (node as { name?: unknown }).name;
    if ((typeof named === "string" && names.has(named)) || (node.runtime?.id !== undefined && names.has(node.runtime.id))) return node;
    if (!Array.isArray(node.children)) return undefined;
    const kept = node.children.map(visit).filter((child): child is TreeNode => child !== undefined);
    return kept.length > 0 ? ({ ...node, children: kept } as TreeNode) : undefined;
  };
  return (nodes as readonly TreeNode[]).map(visit).filter((node): node is TreeNode => node !== undefined);
}

function viewportAspect(): number | undefined {
  const view = (globalThis as { innerWidth?: unknown; innerHeight?: unknown });
  const w = Number(view.innerWidth);
  const h = Number(view.innerHeight);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : undefined;
}

/**
 * Solve an auto-framed orbit spec for `nodes`, or `undefined` when nothing in
 * the scene occupies space (the caller keeps its fallback spec).
 */
export function resolveAutoFrameSpec(
  nodes: readonly AuraSceneNode[],
  options: AuraCameraAutoOptions,
  build: (pose: { readonly target: AuraVec3; readonly position: AuraVec3; readonly distance: number; readonly fov: number; readonly near: number; readonly far: number; readonly autoRotate?: number }) => AuraCameraSpec
): AuraCameraSpec | undefined {
  let bounds;
  try {
    const names = options.subject === undefined ? undefined : new Set(typeof options.subject === "string" ? [options.subject] : options.subject);
    const subject = names ? pruneToSubject(nodes, names) : [];
    bounds = subject.length > 0
      ? worldBoundsOfNodes(subject as never, options.exclude ? { exclude: options.exclude } : {})
      : worldBoundsOfNodes(nodes as never, { exclude: options.exclude ?? isGroundLikeNode });
  } catch {
    return undefined;
  }
  if (!bounds) return undefined;
  const aspect = options.aspect ?? viewportAspect() ?? 16 / 9;
  const { subject: _subject, autoRotate: _autoRotate, exclude: _exclude, ...poseOptions } = options;
  const pose = frameCameraPose(bounds, { ...poseOptions, aspect });
  return build({
    target: pose.target,
    position: pose.position,
    distance: pose.distance,
    fov: pose.fov,
    near: pose.near,
    far: pose.far,
    ...(options.autoRotate !== undefined ? { autoRotate: options.autoRotate } : {})
  });
}
