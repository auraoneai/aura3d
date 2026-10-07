/**
 * Lane-local scene-node flatten reproducing index.ts `flattenSceneNodes` /
 * `composeAuraTransform` / `applyAuraParentTransform` exactly (component-wise
 * add/multiply, groups expanded, effect/environment/interaction untouched).
 * Duplicated deliberately: lane files may not import the barrel (cycle rule).
 */
import type { AuraVec3 } from "../index.js";
import type { SceneCameraNodeLike } from "./subject.js";

interface TransformLike {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
  readonly lookAt?: AuraVec3;
}

interface NodeWithChildren extends SceneCameraNodeLike {
  readonly children?: readonly NodeWithChildren[];
}

function scaleToVec3(scale: number | AuraVec3 | undefined): AuraVec3 {
  if (typeof scale === "number") return [scale, scale, scale];
  return scale ?? [1, 1, 1];
}

function hasTransform(t: TransformLike): boolean {
  return Boolean(t.position || t.rotation || t.scale || t.lookAt);
}

function composeTransform(parent: TransformLike, child: TransformLike): TransformLike {
  const composed: {
    position?: AuraVec3;
    rotation?: AuraVec3;
    scale?: AuraVec3;
    lookAt?: AuraVec3;
  } = {};
  if (parent.position || child.position) {
    const p = parent.position ?? [0, 0, 0];
    const c = child.position ?? [0, 0, 0];
    composed.position = [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
  }
  if (parent.rotation || child.rotation) {
    const p = parent.rotation ?? [0, 0, 0];
    const c = child.rotation ?? [0, 0, 0];
    composed.rotation = [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
  }
  if (parent.scale || child.scale) {
    const p = scaleToVec3(parent.scale);
    const c = scaleToVec3(child.scale);
    composed.scale = [p[0] * c[0], p[1] * c[1], p[2] * c[2]];
  }
  composed.lookAt = child.lookAt ?? parent.lookAt;
  return composed;
}

export function flattenSceneNodes(nodes: readonly SceneCameraNodeLike[]): SceneCameraNodeLike[] {
  const out: SceneCameraNodeLike[] = [];
  const walk = (list: readonly NodeWithChildren[], parent: TransformLike) => {
    for (const node of list) {
      if (node.kind === "group" && node.children) {
        walk(node.children, composeTransform(parent, node));
        continue;
      }
      if (
        hasTransform(parent) &&
        node.kind !== "effect" &&
        node.kind !== "environment" &&
        node.kind !== "interaction"
      ) {
        out.push({ ...node, ...composeTransform(parent, node) });
      } else {
        out.push(node);
      }
    }
  };
  walk(nodes as readonly NodeWithChildren[], {});
  return out;
}
