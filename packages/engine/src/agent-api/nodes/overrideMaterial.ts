/**
 * threejs-parity SG-10 (P2): `scene().overrideMaterial(material)` — three's
 * `scene.overrideMaterial`. Applied at snapshot time (`AuraSceneBuilder.toJSON`)
 * by rewriting the `material` of every mesh-like node, so the compiler,
 * instanced paths and the model material bridge all see the override through
 * their normal `node.material` input. Authored nodes are never mutated, so
 * `overrideMaterial(null)` restores the originals exactly.
 *
 * Mesh-like = `primitive` (incl. its `instances` and distance-LOD levels),
 * `model`, and `batched`/`instances.mesh`. Lines, points, sprites and
 * procedural character parts keep their own materials: their shaders are
 * topology-specific and a mesh material cannot stand in for them.
 */
import type { AuraMaterialSpec, AuraSceneNode } from "./types.js";
import { AuraRuntimeError } from "../compiler/errors.js";
import { assertAuraCustomMaterialSpec } from "../compiler/customMaterial.js";

const OWNER = "scene().overrideMaterial";

export function assertAuraOverrideMaterial(spec: unknown): asserts spec is AuraMaterialSpec {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new AuraRuntimeError("invalid-material-spec", `${OWNER} expects a material spec such as material.pbr({...}) or material.custom({...}), or null to clear it`);
  }
  const record = spec as Record<string, unknown>;
  if (typeof record.toJSON === "function") {
    throw new AuraRuntimeError("invalid-material-spec", `${OWNER} received a node/builder, not a material spec`);
  }
  if (record.kind !== undefined && record.kind !== "custom") {
    throw new AuraRuntimeError("invalid-material-spec", `${OWNER} received a "${String(record.kind)}" object, not a material spec`);
  }
  if (record.kind === "custom") assertAuraCustomMaterialSpec(record.custom, OWNER);
}

function overrideNode(node: AuraSceneNode, spec: AuraMaterialSpec): AuraSceneNode {
  switch (node.kind) {
    case "group":
      return { ...node, children: node.children.map((child) => overrideNode(child, spec)) };
    case "primitive": {
      const lod = node.lod
        ? { ...node.lod, levels: node.lod.levels.map((level) => ({ ...level, material: spec })) }
        : undefined;
      return { ...node, material: spec, ...(lod ? { lod } : {}) };
    }
    case "model": {
      // Per-slot C-15 overrides would otherwise win over the scene override.
      const { materialOverrides: _slotOverrides, ...rest } = node as typeof node & { readonly materialOverrides?: unknown };
      return { ...rest, material: spec } as AuraSceneNode;
    }
    case "batched":
      return { ...node, material: spec };
    default:
      return node;
  }
}

/** Pure: returns new nodes with every mesh-like node's material replaced by `spec`. */
export function applyOverrideMaterial(nodes: readonly AuraSceneNode[], spec: AuraMaterialSpec): AuraSceneNode[] {
  return nodes.map((node) => overrideNode(node, spec));
}
