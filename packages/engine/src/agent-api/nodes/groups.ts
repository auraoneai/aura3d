// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraTransformSpec, AuraPrimitiveOptions, AuraRootLodLevelSpec, AuraLodGroupSpec, AuraAnimationSpec, AuraCharacterRigSpec, AuraSceneNode, AuraPrimitiveNode, AuraGroupNode, AuraNodeInput } from "./types.js";
import { AuraNodeBuilder, toSceneNode } from "./builder.js";
import { animation } from "./animation.js";
import { character } from "./character.js";
import { flattenSceneNodes } from "../sceneMath.js";
import { geometry } from "./geometry.js";
import { material } from "./material.js";
import { primitive } from "./primitives.js";
import { selectAuraRootLodLevel } from "../RootGeometry.js";
import { tagLodLevel, type AuraLodRootSpec } from "../lodMarkers.js";

function sceneNodeFromInput(node: AuraNodeInput): AuraSceneNode {
  return toSceneNode(node);
}

export function group(
  name: string,
  children: readonly AuraNodeInput[] = [],
  options: AuraTransformSpec & {
    readonly animation?: AuraAnimationSpec;
    readonly character?: AuraCharacterRigSpec;
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  return new AuraNodeBuilder({
    kind: "group",
    name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    animation: options.animation,
    character: options.character,
    children: children.map(sceneNodeFromInput)
  });
}

export function distanceLod(options: Omit<AuraPrimitiveOptions, "lod" | "geometry"> & { readonly levels: readonly AuraRootLodLevelSpec[]; readonly hysteresis?: number }): AuraNodeBuilder<AuraPrimitiveNode> {
  if (options.levels.length === 0) throw new Error("Aura3D distance LOD requires at least one level.");
  selectAuraRootLodLevel(0, options.levels, undefined, options.hysteresis ?? 0);
  const first = options.levels[0]!;
  if (!first.primitive && !first.geometry) throw new Error("Every Aura3D LOD level requires a primitive or custom geometry.");
  const { levels: _levels, hysteresis: _hysteresis, ...primitiveOptions } = options;
  return primitive(first.geometry ? "custom" : first.primitive!, {
    ...primitiveOptions,
    geometry: first.geometry,
    material: first.material ?? options.material,
    lod: { levels: options.levels, hysteresis: options.hysteresis }
  });
}

/**
 * threejs-parity L7/SG-11: `THREE.LOD` with arbitrary subtrees per level —
 * each level's children are tagged; the production render input shows only
 * the selected level's subtree each frame.
 */
export function lod(options: AuraLodGroupSpec): AuraNodeBuilder<AuraGroupNode> {
  if (options.levels.length === 0) throw new Error("Aura3D LOD requires at least one level.");
  const root: AuraLodRootSpec = {
    thresholds: options.levels.map((level) => ({ maxDistance: level.maxDistance })),
    hysteresis: options.hysteresis ?? 0,
    position: options.position ?? [0, 0, 0],
    ...(options.name ? { name: options.name } : {})
  };
  selectAuraRootLodLevel(0, root.thresholds, undefined, root.hysteresis); // validates ordering
  const children = options.levels.flatMap((level, levelIndex) =>
    level.children.map((child) => tagLodLevel(sceneNodeFromInput(child), { root, levelIndex }))
  );
  return new AuraNodeBuilder({
    kind: "group",
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    children
  });
}

export const groups = {
  create: group,
  lod,
  flatten: (nodes: readonly AuraSceneNode[]): readonly AuraSceneNode[] => flattenSceneNodes(nodes)
} as const;

export function findGroupNode(nodes: readonly AuraSceneNode[], predicate: (node: AuraGroupNode) => boolean): AuraGroupNode | undefined {
  for (const node of nodes) {
    if (node.kind !== "group") continue;
    if (predicate(node)) return node;
    const child = findGroupNode(node.children, predicate);
    if (child) return child;
  }
  return undefined;
}
