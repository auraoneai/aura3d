/**
 * World bounds of scene nodes for `camera.frame`. Uses the same matrix the
 * renderer composes for every model/primitive (`createModelMatrix`, which owns
 * `size`, `scale`, `rotation`, `pivot`, `targetHeight` and normalised model fit)
 * and the same group flattening the camera rigs use, so the framed box is the
 * box that is drawn.
 */
import type { AuraAssetRef, AuraModelNode, AuraNodeInput, AuraPrimitiveNode, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "../nodes/types.js";
import { toSceneNode } from "../nodes/builder.js";
import { createModelMatrix, shouldNormalizeModelNode } from "../sceneMath.js";
import { boundsFromAsset } from "../SceneGroundingUtils.js";
import { flattenSceneNodes } from "./sceneNodes.js";
import type { AuraFrameBounds, AuraFramePoseOptions } from "./frameSubject.js";

/** Anything `camera.frame` accepts as a subject. */
export type AuraFrameSubject = AuraNodeInput | { toJSON(): unknown };

export interface AuraFrameNodeFilter {
  /** Return true to leave a node out of the framed bounds (e.g. a ground slab). */
  readonly exclude?: (node: AuraSceneNode) => boolean;
}

const UNIT_BOUNDS = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } as const;
const GROUND_NAME = /ground|floor|terrain|backdrop|skybox|sea|ocean/i;

/** Node kinds that occupy space. Lights, effects, environments, cameras, labels and the rest never do. */
function isSpatial(node: AuraSceneNode): node is AuraModelNode | AuraPrimitiveNode {
  return node.kind === "model" || node.kind === "primitive";
}

function resolveSubject(entry: AuraFrameSubject): readonly AuraSceneNode[] {
  const candidate = entry as { toJSON?: () => unknown; kind?: unknown };
  // A `scene()` builder serialises to a snapshot with `nodes`; a node builder serialises to the node itself.
  if (typeof candidate.toJSON === "function" && candidate.kind === undefined) {
    const json = candidate.toJSON() as { schema?: unknown; nodes?: readonly AuraSceneNode[] };
    if (typeof json.schema === "string" && Array.isArray(json.nodes)) return json.nodes;
  }
  return [toSceneNode(entry as never)];
}

/** Default scene-wide filter: skips planes and nodes named like ground, which would otherwise dominate the box. */
export function isGroundLikeNode(node: AuraSceneNode): boolean {
  const named = (node as { name?: string }).name;
  if (node.kind === "primitive" && (node as AuraPrimitiveNode).primitive === "plane") return true;
  return typeof named === "string" && GROUND_NAME.test(named);
}

function localBounds(node: AuraModelNode | AuraPrimitiveNode): { readonly min: AuraVec3; readonly max: AuraVec3 } {
  if (node.kind === "model") return boundsFromAsset(node.asset as AuraAssetRef<"model">);
  const geometryBounds = (node.geometry as { bounds?: { min: AuraVec3; max: AuraVec3 } } | undefined)?.bounds;
  if (geometryBounds) return geometryBounds;
  if (node.primitive === "plane") return { min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] };
  return UNIT_BOUNDS;
}

function transformedCorners(node: AuraModelNode | AuraPrimitiveNode, transform: AuraTransformSpec): AuraVec3[] {
  const local = localBounds(node);
  const merged = { ...node, ...transform } as AuraModelNode | AuraPrimitiveNode;
  const normalize = node.kind === "model" && shouldNormalizeModelNode(node);
  const matrix = createModelMatrix(merged, local, normalize);
  const out: AuraVec3[] = [];
  for (const x of [local.min[0], local.max[0]]) {
    for (const y of [local.min[1], local.max[1]]) {
      for (const z of [local.min[2], local.max[2]]) {
        out.push([
          matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
          matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
          matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!
        ]);
      }
    }
  }
  return out;
}

/**
 * World-space AABB of the given nodes (groups expanded, hidden nodes and
 * non-spatial nodes skipped, per-instance transforms honoured), or `undefined`
 * when nothing occupies space.
 */
export function worldBoundsOfNodes(
  subjects: AuraFrameSubject | readonly AuraFrameSubject[],
  filter: AuraFrameNodeFilter = {}
): AuraFrameBounds | undefined {
  const list: readonly AuraFrameSubject[] = Array.isArray(subjects) ? subjects : [subjects as AuraFrameSubject];
  const nodes: AuraSceneNode[] = [];
  for (const entry of list) nodes.push(...resolveSubject(entry));
  let min: [number, number, number] = [Infinity, Infinity, Infinity];
  let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const grow = (p: AuraVec3): void => {
    min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
    max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
  };
  for (const flat of flattenSceneNodes(nodes as never) as unknown as AuraSceneNode[]) {
    if (!isSpatial(flat) || (flat as { visible?: boolean }).visible === false) continue;
    if (filter.exclude?.(flat)) continue;
    const instances = flat.instances;
    if (instances && instances.length > 0) {
      for (const instance of instances) {
        // Primitive instances use only the instance transform; model instances override the node's.
        const transform: AuraTransformSpec = instance;
        const base = flat.kind === "model" ? flat : ({ ...flat, position: undefined, rotation: undefined, scale: undefined } as AuraPrimitiveNode);
        for (const corner of transformedCorners(base, transform)) grow(corner);
      }
      continue;
    }
    for (const corner of transformedCorners(flat, {})) grow(corner);
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return undefined;
  return { min, max };
}

export interface AuraCameraFrameOptions extends AuraFramePoseOptions, AuraFrameNodeFilter {}
