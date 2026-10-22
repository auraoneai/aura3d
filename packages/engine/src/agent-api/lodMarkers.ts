// threejs-parity L7/SG-11: mixed-child LOD (three's `THREE.LOD` where every
// level is an arbitrary object). `groups.lod` tags each level's subtree with
// an `AuraLodMarker`; the production render input consults `lodLevelVisible`
// once per flattened node per frame and skips deselected subtrees. Selection
// state lives in a WeakMap keyed by the shared root spec object, so it is
// per-authored-LOD (stable across frames and across mounts).

import type { AuraSceneNode, AuraVec3 } from "./nodes/types.js";
import { selectAuraRootLodLevel } from "./RootGeometry.js";

export interface AuraLodRootSpec {
  readonly thresholds: readonly { readonly maxDistance?: number }[];
  readonly hysteresis: number;
  readonly position: AuraVec3;
  readonly name?: string;
}

export interface AuraLodMarker {
  readonly root: AuraLodRootSpec;
  readonly levelIndex: number;
}

type LodTagged = { readonly __lod?: AuraLodMarker };

export const lodMarkerOf = (node: unknown): AuraLodMarker | undefined =>
  (node as LodTagged).__lod;

/** Tag `node` (and its group descendants) with `marker`; an existing inner marker wins (nested LOD). */
export function tagLodLevel(node: AuraSceneNode, marker: AuraLodMarker): AuraSceneNode {
  const tagged = { ...node, __lod: lodMarkerOf(node) ?? marker } as AuraSceneNode;
  if (node.kind === "group") {
    return { ...tagged, children: node.children.map((child) => tagLodLevel(child, marker)) } as AuraSceneNode;
  }
  return tagged;
}

const levelIndexByRoot = new WeakMap<AuraLodRootSpec, number>();

/**
 * True when `node` is outside any LOD tag or its level is selected at the
 * current camera distance. Recomputing per node is idempotent within a frame
 * (hysteresis keeps the previous index until a threshold is crossed).
 */
export function lodLevelVisible(node: unknown, cameraPosition: AuraVec3): boolean {
  const marker = lodMarkerOf(node);
  if (!marker) return true;
  const [x, y, z] = marker.root.position;
  const distance = Math.hypot(cameraPosition[0] - x, cameraPosition[1] - y, cameraPosition[2] - z);
  const selection = selectAuraRootLodLevel(distance, marker.root.thresholds, levelIndexByRoot.get(marker.root), marker.root.hysteresis);
  levelIndexByRoot.set(marker.root, selection.levelIndex);
  return selection.levelIndex === marker.levelIndex;
}
