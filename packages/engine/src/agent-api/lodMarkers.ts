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
  const tagged = Object.assign({}, node, { __lod: lodMarkerOf(node) ?? marker }) as unknown as AuraSceneNode;
  if (node.kind === "group") {
    return Object.assign({}, tagged, { children: node.children.map((child) => tagLodLevel(child, marker)) }) as unknown as AuraSceneNode;
  }
  return tagged;
}

/** Optional live placement and hysteresis identity supplied by the renderer. */
export interface AuraLodVisibilityOptions {
  /** World-space origin of the LOD group, not of an individual level child. */
  readonly worldPosition?: AuraVec3;
  /** Identity of this particular mounted LOD group. */
  readonly owner?: object;
  /** Identity of the mounted scene or renderer using this selection. */
  readonly scope?: object;
}

// The same authored root can occur in multiple mounts or multiple group
// instances. Keep hysteresis private to the actual mount, authored LOD and
// group instance. Weak keys keep disposed mounts and group handles collectible.
const defaultScope = {};
const levelIndicesByScope = new WeakMap<object, WeakMap<AuraLodRootSpec, WeakMap<object, number>>>();

function indicesFor(root: AuraLodRootSpec, scope: object): WeakMap<object, number> {
  let roots = levelIndicesByScope.get(scope);
  if (!roots) {
    roots = new WeakMap();
    levelIndicesByScope.set(scope, roots);
  }
  let indices = roots.get(root);
  if (!indices) {
    indices = new WeakMap();
    roots.set(root, indices);
  }
  return indices;
}

/**
 * True when `node` is outside any LOD tag or its level is selected at the
 * current camera distance. Recomputing per node is idempotent within a frame
 * (hysteresis keeps the previous index until a threshold is crossed).
 */
export function lodLevelVisible(node: unknown, cameraPosition: AuraVec3, options?: AuraLodVisibilityOptions): boolean {
  const marker = lodMarkerOf(node);
  if (!marker) return true;
  const [x, y, z] = options?.worldPosition ?? marker.root.position;
  const distance = Math.hypot(cameraPosition[0] - x, cameraPosition[1] - y, cameraPosition[2] - z);
  const indices = indicesFor(marker.root, options?.scope ?? defaultScope);
  const owner = options?.owner ?? marker.root;
  const selection = selectAuraRootLodLevel(distance, marker.root.thresholds, indices.get(owner), marker.root.hysteresis);
  indices.set(owner, selection.levelIndex);
  return selection.levelIndex === marker.levelIndex;
}
