/**
 * C-37 — RuntimeNode add/remove and node-handle extensions (CONTRACTS.md).
 * Provider: PRD 15. Flag: A3D_QR_COMPILER.
 */

import type { RegistryEntry } from "@aura3d/rendering/contracts";
import type { AuraSceneNode, AuraNodeBuilder, AuraRuntimeNodeHandle, AuraApp, AuraVec3 } from "../agent-api/index";
import type { AuraNodeKindMap } from "./compiler";
import type { AuraModelMaterialHandle } from "./materials";
import type { AuraActorAnimationApi } from "./animation";
import type { AuraHeightFogSpec } from "./atmosphere";

export interface AuraRuntimeNodeRegistryV2 /* merges into AuraRuntimeNodeRegistry */ {
  get(id: string): AuraRuntimeNodeHandle | undefined; require(id: string): AuraRuntimeNodeHandle; has(id: string): boolean; ids(): readonly string[]; all(): readonly AuraRuntimeNodeHandle[];
  add(node: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }): AuraRuntimeNodeHandle;
  remove(idOrHandle: string | AuraRuntimeNodeHandle): boolean;
  readonly version: number;          // increments on add/remove
}
export interface NodeHandleExtension<K extends keyof AuraNodeHandleExtensionMap> extends RegistryEntry { readonly member: K; readonly appliesTo: readonly (keyof AuraNodeKindMap)[]; create(handle: AuraRuntimeNodeHandle, app: AuraApp): AuraNodeHandleExtensionMap[K]; }
export interface AuraNodeHandleExtensionMap {
  materials: AuraModelMaterialHandle;                                  // C-15, prd04
  animation: AuraActorAnimationApi;                                    // C-19, prd06 (members also flattened onto handle: crossFadeTo, playLayer, ...)
  interpolate: boolean; timeScale: number; teleport: (x: number, y: number, z: number, rotation?: AuraVec3) => AuraRuntimeNodeHandle;   // C-23, prd08
  setInstanceTransforms: (matrices: Float32Array, count: number, colors?: Float32Array) => AuraRuntimeNodeHandle;                        // prd09 (instanced nodes only; throws if count > capacity)
  setFog: (partial: Partial<AuraHeightFogSpec>) => void;                                                          // C-21, prd07 (fog nodes)
}

const nodeHandleExtensions = new Map<keyof AuraNodeHandleExtensionMap, NodeHandleExtension<keyof AuraNodeHandleExtensionMap>>();

export function registerNodeHandleExtension<K extends keyof AuraNodeHandleExtensionMap>(ext: NodeHandleExtension<K>): () => void {
  nodeHandleExtensions.set(ext.member, ext as NodeHandleExtension<keyof AuraNodeHandleExtensionMap>);
  return () => {
    if (nodeHandleExtensions.get(ext.member) === ext) nodeHandleExtensions.delete(ext.member);
  };
}

export function nodeHandleExtensionFor<K extends keyof AuraNodeHandleExtensionMap>(member: K): NodeHandleExtension<K> | undefined {
  return nodeHandleExtensions.get(member) as NodeHandleExtension<K> | undefined;
}

export function nodeHandleExtensionsAll(): readonly NodeHandleExtension<keyof AuraNodeHandleExtensionMap>[] {
  return [...nodeHandleExtensions.values()];
}
