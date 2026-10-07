/**
 * nodes/game/lookSignature.ts — PRD-09 (C-38 node methods).
 *
 * Extracts the look-defining fields of one authored scene node for the
 * `@aura3d/game` look signature manifest: asset/material/authored
 * scale/authored visible. Position, rotation, and every runtime or
 * animation field are excluded by construction.
 */

import type { AuraSceneNode } from "../../index";

export interface NodeLookEntry {
  readonly asset?: unknown;
  readonly material?: unknown;
  readonly scale?: unknown;
  readonly visible?: unknown;
}

/**
 * Canonical per-node look entry. Unknown fields are ignored — anything that
 * does not change the produced pixels of this node (pose, runtime metadata,
 * animation state) must not be included here.
 */
export function nodeLookEntry(node: AuraSceneNode): NodeLookEntry {
  const rec = node as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const asset = rec.asset ?? rec.source ?? rec.gltf ?? rec.model;
  if (asset !== undefined) out.asset = asset;
  const nodeMaterial = rec.material ?? rec.materials;
  if (nodeMaterial !== undefined) out.material = nodeMaterial;
  if (rec.scale !== undefined) out.scale = rec.scale;
  if (rec.visible !== undefined) out.visible = rec.visible;
  return out;
}

/**
 * Stable node id for the manifest map: `runtime.id` wins over `name`, then
 * `id`. Returns null when the node carries no identity the manifest can key
 * on (anonymous nodes are excluded — they cannot be addressed by routes).
 */
export function nodeLookId(node: AuraSceneNode): string | null {
  const rec = node as unknown as Record<string, unknown>;
  const runtime = rec.runtime as { id?: unknown } | undefined;
  if (typeof runtime?.id === "string") return runtime.id;
  if (typeof rec.name === "string" && rec.name) return rec.name;
  if (typeof rec.id === "string" && rec.id) return rec.id;
  return null;
}
