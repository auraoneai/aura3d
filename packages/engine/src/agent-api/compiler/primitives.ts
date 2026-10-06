// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneNode, AuraTransformSpec, AuraVec3, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource, ProductionRuntimePrimitiveState } from "../index.js";
import { animation, colorToLinearRgba, createModelMatrix, createProductionPrimitiveGeometry, createProductionPrimitiveMaterial, geometry, primitive, primitiveGeometryBounds, shouldNormalizeModelNode } from "../index.js";
import { selectAuraRootLodLevel } from "../RootGeometry.js";
import { evaluateDistancePrioritizedMipResidency, type TextureStreamingCandidate, type TextureStreamingResidency } from "@aura3d/assets/browser";
import { createDualProbeEnvironmentLightingResources, createProductionEnvironmentLightingResources, createProductionPbrHdrPipelineFromRadiance, type EnvironmentLightingOptions } from "@aura3d/rendering";
import { normalizeTextureBudgetBytes } from "../app/rendererOptions.js";
import { blankProductionPrimitiveTextureState, createSdfTextPrimitiveResource } from "./textures.js";
import { material } from "../nodes/material.js";

export function createProductionRuntimePrimitiveEntries(nodes: readonly AuraSceneNode[]): ProductionRuntimePrimitiveEntry[] {
  return nodes
    .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
    .map((node) => ({ node, resources: createProductionPrimitiveResources(node), currentLodIndex: 0 }));
}

export function createProductionPrimitiveResources(node: AuraPrimitiveNode): readonly ProductionRuntimePrimitiveResource[] {
  const sdfWarnings: string[] = [];
  const sdfResource = createSdfTextPrimitiveResource(node, (message) => { sdfWarnings.push(message); });
  const levels = node.lod?.levels;
  if (!levels?.length) {
    if (sdfResource) return [sdfResource];
    const fallback = {
      geometry: createProductionPrimitiveGeometry(node),
      material: createProductionPrimitiveMaterial(node),
      bounds: primitiveGeometryBounds(node),
      name: node.name ?? node.primitive,
      materialSpec: node.material,
      sourceNode: node,
      ...blankProductionPrimitiveTextureState()
    };
    // Sampler failures stay visible on the fallback resource (surfaced via
    // texturedMaterials diagnostics), never swallowed by the mesh swap.
    fallback.textureWarnings.push(...sdfWarnings);
    return [fallback];
  }
  return levels.map((level, index) => {
    if (!level.primitive && !level.geometry) throw new Error(`Aura3D LOD level ${index} requires primitive or custom geometry.`);
    const levelNode: AuraPrimitiveNode = {
      ...node,
      primitive: level.geometry ? "custom" : level.primitive!,
      geometry: level.geometry,
      material: level.material ?? node.material,
      lod: undefined
    };
    const levelWarnings: string[] = [];
    const levelSdf = createSdfTextPrimitiveResource(levelNode, (message) => { levelWarnings.push(message); });
    if (levelSdf) return { ...levelSdf, name: level.name };
    const levelFallback = {
      geometry: createProductionPrimitiveGeometry(levelNode),
      material: createProductionPrimitiveMaterial(levelNode),
      bounds: primitiveGeometryBounds(levelNode),
      name: level.name,
      materialSpec: levelNode.material,
      sourceNode: levelNode,
      ...blankProductionPrimitiveTextureState()
    };
    levelFallback.textureWarnings.push(...levelWarnings);
    return levelFallback;
  });
}

export function selectProductionPrimitiveResource(entry: ProductionRuntimePrimitiveEntry, node: AuraPrimitiveNode, cameraPosition: AuraVec3, lodBias = 1): ProductionRuntimePrimitiveResource {
  if (!node.lod?.levels.length) return entry.resources[0]!;
  const position = node.position ?? [0, 0, 0];
  const distance = Math.hypot(cameraPosition[0] - position[0], cameraPosition[1] - position[1], cameraPosition[2] - position[2]);
  const selection = selectAuraRootLodLevel(distance * lodBias, node.lod.levels, entry.currentLodIndex, node.lod.hysteresis ?? 0);
  entry.currentLodIndex = selection.levelIndex;
  return entry.resources[selection.levelIndex] ?? entry.resources[entry.resources.length - 1]!;
}

export function createProductionModelInstanceTransforms(
  transforms: readonly AuraTransformSpec[],
  node: AuraModelNode,
  bounds: { readonly min: AuraVec3; readonly max: AuraVec3 },
  time: number
): Float32Array {
  const matrices = new Float32Array(transforms.length * 16);
  transforms.forEach((transform, index) => {
    const localNode: AuraModelNode = { ...node, ...transform };
    matrices.set(createModelMatrix(localNode, bounds, shouldNormalizeModelNode(node), time), index * 16);
  });
  return matrices;
}

export function createProductionInstanceTransforms(transforms: readonly AuraTransformSpec[], node: AuraPrimitiveNode): Float32Array {
  const matrices = new Float32Array(transforms.length * 16);
  transforms.forEach((transform, index) => {
    const localNode: AuraPrimitiveNode = { kind: "primitive", primitive: node.primitive, ...transform };
    matrices.set(createModelMatrix(localNode, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0), index * 16);
  });
  return matrices;
}

export function createProductionInstanceColors(colors: readonly AuraColor[] | undefined, count: number): Float32Array | undefined {
  if (!colors) return undefined;
  if (colors.length !== count) throw new Error("Aura3D instance color count must match instance transform count.");
  const values = new Float32Array(count * 4);
  colors.forEach((color, index) => values.set(colorToLinearRgba(color), index * 4));
  return values;
}

export function resolveProductionPrimitiveRuntimeState(
  entry: ProductionRuntimePrimitiveEntry,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined
): ProductionRuntimePrimitiveState {
  const runtimeId = entry.node.runtime?.id;
  if (!runtimeId) return { node: entry.node, visible: true };
  const runtimeSnapshot = runtimeNodes?.get(runtimeId)?.snapshot();
  if (!runtimeSnapshot) return { node: entry.node, visible: true };
  return {
    node: {
      ...entry.node,
      position: runtimeSnapshot.position,
      rotation: runtimeSnapshot.rotation,
      scale: runtimeSnapshot.scale,
      animation: runtimeSnapshot.animation ?? entry.node.animation
    },
    visible: runtimeSnapshot.visible
  };
}

export interface TextureStreamingTableEntry {
  readonly id: string;
  readonly mipBytesCoarseToFine: readonly number[];
  readonly distanceMeters: number;
}

export function describeTextureStreamingResidency(
  table: readonly TextureStreamingTableEntry[],
  budgetBytes: number
): TextureStreamingResidency {
  const candidates: TextureStreamingCandidate[] = table.map((entry) => ({
    id: entry.id,
    mipBytesCoarseToFine: entry.mipBytesCoarseToFine,
    distanceMeters: entry.distanceMeters
  }));
  return evaluateDistancePrioritizedMipResidency(candidates, normalizeTextureBudgetBytes(budgetBytes));
}

export async function upgradeProductionEnvironmentHdri(
  url: string,
  intensity: number,
  reflectionUrl?: string,
  rotation?: number
): Promise<{
  readonly lighting: EnvironmentLightingOptions;
  readonly dispose: () => void;
  readonly maxLinearValue: number;
  readonly specularMipCount: number;
  readonly dualProbe: boolean;
}> {
  if (typeof fetch !== "function") {
    throw new Error("HDRI upgrade requires fetch (browser production mount)");
  }
  const fetchRadiance = async (assetUrl: string): Promise<Uint8Array> => {
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`HDRI fetch failed with status ${response.status} for ${assetUrl}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error(`HDRI asset is empty for ${assetUrl}`);
    return bytes;
  };
  const clampIntensity = Math.max(0, intensity);
  const illumination = createProductionPbrHdrPipelineFromRadiance(await fetchRadiance(url), {
    id: "root-hdri-environment",
    label: "Root HDRI environment",
    intensity: clampIntensity,
    ...(rotation !== undefined ? { rotation } : {})
  });
  if (!illumination.diagnostics.realRadianceHdr) throw new Error(`HDRI asset did not parse as Radiance HDR for ${url}`);
  if (!reflectionUrl) {
    const resources = createProductionEnvironmentLightingResources(illumination);
    return {
      lighting: resources.lighting,
      dispose: resources.dispose,
      maxLinearValue: illumination.diagnostics.maxLinearValue,
      specularMipCount: illumination.diagnostics.specularMipCount,
      dualProbe: false
    };
  }
  const reflection = createProductionPbrHdrPipelineFromRadiance(await fetchRadiance(reflectionUrl), {
    id: "root-hdri-reflection-environment",
    label: "Root HDRI reflection environment",
    intensity: clampIntensity,
    ...(rotation !== undefined ? { rotation } : {})
  });
  if (!reflection.diagnostics.realRadianceHdr) throw new Error(`HDRI reflection asset did not parse as Radiance HDR for ${reflectionUrl}`);
  const dual = createDualProbeEnvironmentLightingResources({ illumination, reflection });
  return {
    lighting: dual.lighting,
    dispose: dual.dispose,
    maxLinearValue: Math.max(illumination.diagnostics.maxLinearValue, reflection.diagnostics.maxLinearValue),
    specularMipCount: reflection.diagnostics.specularMipCount,
    dualProbe: true
  };
}
