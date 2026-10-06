// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraTransformSpec, AuraPrimitiveOptions, AuraRootLodLevelSpec, AuraAnimationSpec, AuraCharacterRigSpec, AuraSceneNode, AuraPrimitiveNode, AuraGroupNode, AuraNodeInput } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { animation } from "./animation.js";
import { character } from "./character.js";
import { flattenSceneNodes } from "../compiler/sceneMath.js";
import { geometry } from "./geometry.js";
import { material } from "./material.js";
import { primitive } from "./primitives.js";
import { selectAuraRootLodLevel } from "../RootGeometry.js";

function sceneNodeFromInput(node: AuraNodeInput): AuraSceneNode {
  return node instanceof AuraNodeBuilder ? node.toJSON() : node;
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
  return primitive(first.geometry ? "custom" : first.primitive!, {
    ...options,
    geometry: first.geometry,
    material: first.material ?? options.material,
    lod: { levels: options.levels, hysteresis: options.hysteresis }
  });
}

export const groups = {
  create: group,
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
