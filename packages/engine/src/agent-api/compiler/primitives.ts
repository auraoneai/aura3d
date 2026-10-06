// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneNode, AuraTransformSpec, AuraVec3, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource, ProductionRuntimePrimitiveState } from "../nodes/types.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { animation } from "../nodes/animation.js";
import { geometry } from "../nodes/geometry.js";
import { primitive } from "../nodes/primitives.js";
import { createModelMatrix, shouldNormalizeModelNode } from "../sceneMath.js";
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

import { Geometry, IndexBuffer, InstancedPBRMaterial, PBRMaterial, VertexBuffer, VertexFormat } from "@aura3d/rendering";
import { defineAuraCustomGeometry } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import { instances } from "../nodes/instances.js";
import type { AuraMaterialSpec, AuraBuiltinPrimitive } from "../nodes/types.js";
import { renderer } from "../rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";
import { colorToLinearRgb } from "../colorUtils.js";
import type { GltfBounds } from "./gltfRuntime.js";
import { createPlaneGeometry, createBoxGeometry, createSphereGeometry, createCylinderGeometry, createTorusGeometry, createCapsuleApproxGeometry } from "./geometry.js";
import { clamp01 } from "../sceneMath.js";

/**
 * Build the production `PBRMaterial` for a primitive node.
 *
 * ## WS-2.1a — the parameter drop this function used to be
 *
 * Until 1.6 this forwarded `clearcoat` and **nothing else** from the extended material surface.
 * `AuraMaterialSpec` accepts `sheen`, `sheenRoughness`, `sheenColor`, `iridescence`,
 * `iridescenceIOR`, `iridescenceThicknessRange`, `anisotropy`, `anisotropyRotation`, `transmission`,
 * `thickness`, `ior`, `attenuationColor` and `attenuationDistance`; `PBRMaterial` accepts a uniform
 * for every one of them and binds them all. The bridge between the two dropped them on the floor.
 *
 * How that presented, measured by `tools/material-structural-parity` before the fix:
 *
 * ```
 * material.pbr({ ..., sheen: 1 })         -> byte-identical frame to sheen: 0
 * material.pbr({ ..., iridescence: 1 })   -> byte-identical frame to iridescence: 0
 * material.pbr({ ..., clearcoat: 1 })     -> byte-identical frame to clearcoat: 0
 * ```
 *
 * `clearcoat` was *forwarded* and still produced an identical frame, which pins the second, separate
 * defect: `a3dPbrExtensionEnvironmentLight` in `ShaderChunks.ts` adds its lobes to
 * `specularRadiance`, a term that is zero without an environment map. Forwarding alone is necessary
 * and not sufficient, so `environmentIntensity` now also has a floor when an extension factor is
 * present — otherwise a developer setting `clearcoat: 1` on a scene with no environment sees nothing
 * and has no way to find out why.
 *
 * The reason this survived so long is worth stating: three of the four lobes are scalar
 * approximations rather than real BRDFs, and **nobody could tell**, because the parameters never
 * arrived. The plumbing defect concealed the shading defect.
 */
interface ProductionPrimitiveScalars {
  readonly materialSpec: AuraMaterialSpec | undefined;
  readonly baseColor: readonly [number, number, number, number];
  readonly opacity: number;
  readonly emissiveColor: readonly [number, number, number];
  readonly clearcoat: number;
  readonly sheen: number;
  readonly iridescence: number;
  readonly anisotropy: number;
  readonly transmission: number;
  readonly thicknessRange: readonly [number, number] | undefined;
  readonly sheenColor: readonly [number, number, number];
  readonly declaresExtension: boolean;
  readonly environmentIntensity: number;
  /**
   * B3 per-material env-map response scale (muse3jsparity-PRD). Unlike
   * `environmentIntensity` (ambient only, and overwritten per-frame by the
   * scene environment), this reaches the sampled HDRI terms through the
   * `u_materialEnvironmentIntensity` uniform the forward pass never touches.
   */
  readonly envMapIntensity: number;
}

export function resolveProductionPrimitiveScalars(node: AuraPrimitiveNode): ProductionPrimitiveScalars {
  const materialSpec = node.material;
  const baseColor = colorToLinearRgba(materialSpec?.color ?? materialSpec?.emissive ?? "#d7dee8");
  const opacity = clamp01(materialSpec?.opacity ?? baseColor[3] ?? 1);
  const emissiveColor = materialSpec?.emissive ? colorToLinearRgb(materialSpec.emissive) : [0, 0, 0] as const;
  const clearcoat = clamp01(materialSpec?.clearcoat ?? 0);
  const sheen = clamp01(materialSpec?.sheen ?? 0);
  const iridescence = clamp01(materialSpec?.iridescence ?? 0);
  const anisotropy = clamp01(Math.abs(materialSpec?.anisotropy ?? 0));
  const transmission = clamp01(materialSpec?.transmission ?? 0);
  const thicknessRange = materialSpec?.iridescenceThicknessRange;
  /*
   * Sheen colour defaults to the sheen strength as a white tint rather than to black.
   * `sheenColorFactor: [0,0,0]` multiplies the entire sheen lobe to zero, so `sheen: 1` with no
   * explicit colour would forward a factor and still render nothing — the same silent-no-op shape
   * this whole workstream exists to remove.
   */
  const sheenColor = materialSpec?.sheenColor
    ? colorToLinearRgb(materialSpec.sheenColor).map((channel) => channel * sheen) as [number, number, number]
    : ([sheen, sheen, sheen] as const);
  /*
   * The extension lobes are environment-driven. With `environmentIntensity: 0` a declared clearcoat,
   * sheen or iridescence factor reaches the shader and contributes exactly nothing, which is
   * indistinguishable from the parameter never arriving. A floor of 0.35 when any extension factor is
   * declared makes the declaration observable; scenes that declare none are unaffected.
   */
  const declaresExtension = clearcoat > 0 || sheen > 0 || iridescence > 0 || anisotropy > 0;
  const requestedEnvironmentIntensity = Math.max(0, materialSpec?.envMapIntensity ?? 0.75);
  const environmentIntensity = declaresExtension
    ? Math.max(0.35, requestedEnvironmentIntensity)
    : requestedEnvironmentIntensity;
  // B3: the sampled env-map scale defaults to 1 (no look change) and honors
  // an explicitly authored envMapIntensity, including 0 (killed response).
  const envMapIntensity = materialSpec?.envMapIntensity === undefined ? 1 : Math.max(0, materialSpec.envMapIntensity);
  return {
    materialSpec, baseColor, opacity, emissiveColor, clearcoat, sheen, iridescence,
    anisotropy, transmission, thicknessRange, sheenColor, declaresExtension, environmentIntensity, envMapIntensity
  };
}

export function createProductionPrimitiveMaterial(node: AuraPrimitiveNode): PBRMaterial | InstancedPBRMaterial {
  const materialSpec = node.material;
  const { baseColor, opacity, emissiveColor, clearcoat, sheenColor, declaresExtension, transmission, thicknessRange, sheen, iridescence, anisotropy, environmentIntensity, envMapIntensity } =
    resolveProductionPrimitiveScalars(node);
  /*
   * Native instance submission requires the renderer's instanced shader contract. The ordinary
   * PBR shader intentionally has no instance matrix inputs and ForwardPass therefore expands it.
   * Keep the full extension material for declarations that need its broader BRDF surface; the
   * root-safe instanced path selects the purpose-built lit material when every requested property
   * is represented by that shader. This makes the one-draw claim real without silently dropping
   * clearcoat/transmission/etc. (those continue to render correctly via expansion).
   */
  if (node.instances && !declaresExtension && transmission === 0 && materialSpec?.thickness === undefined && materialSpec?.ior === undefined && materialSpec?.attenuationColor === undefined && materialSpec?.attenuationDistance === undefined) {
    return new InstancedPBRMaterial({
      name: `a3d-production-instanced-primitive-${node.primitive}${node.name ? `-${node.name}` : ""}`,
      baseColor: [baseColor[0], baseColor[1], baseColor[2], opacity],
      metallic: clamp01(materialSpec?.metallic ?? materialSpec?.metalness ?? 0),
      roughness: clamp01(materialSpec?.roughness ?? 0.58),
      emissiveColor,
      emissiveStrength: Math.max(0, materialSpec?.emissiveIntensity ?? (materialSpec?.emissive ? 1.35 : 0)),
      environmentIntensity,
      envMapIntensity,
      renderState: {
        blend: opacity < 0.999,
        depthWrite: opacity >= 0.999,
        cullMode: node.primitive === "plane" || opacity < 0.999 ? "none" : "back"
      }
    });
  }
  return new PBRMaterial({
    name: `a3d-production-primitive-${node.primitive}${node.name ? `-${node.name}` : ""}`,
    baseColor: [baseColor[0], baseColor[1], baseColor[2], opacity],
    metallic: clamp01(materialSpec?.metallic ?? materialSpec?.metalness ?? 0),
    roughness: clamp01(materialSpec?.roughness ?? 0.58),
    emissiveColor,
    emissiveStrength: Math.max(0, materialSpec?.emissiveIntensity ?? (materialSpec?.emissive ? 1.35 : 0)),
    clearcoatFactor: clearcoat,
    clearcoatRoughnessFactor: clamp01(materialSpec?.clearcoatRoughness ?? 0.34),
    // WS-2.1a: everything below this line was previously dropped.
    sheenColorFactor: sheenColor,
    sheenRoughnessFactor: clamp01(materialSpec?.sheenRoughness ?? 0.3),
    anisotropyStrength: anisotropy,
    anisotropyRotation: materialSpec?.anisotropyRotation ?? 0,
    iridescenceFactor: iridescence,
    iridescenceIor: Math.max(1, materialSpec?.iridescenceIOR ?? 1.3),
    ...(thicknessRange ? { iridescenceThicknessMinimum: thicknessRange[0], iridescenceThicknessMaximum: thicknessRange[1] } : {}),
    transmissionFactor: transmission,
    ...(materialSpec?.thickness === undefined ? {} : { volumeThicknessFactor: Math.max(0, materialSpec.thickness) }),
    ...(materialSpec?.ior === undefined ? {} : { ior: Math.max(1, materialSpec.ior) }),
    ...(materialSpec?.attenuationColor ? { volumeAttenuationColor: colorToLinearRgb(materialSpec.attenuationColor) } : {}),
    ...(materialSpec?.attenuationDistance === undefined ? {} : { volumeAttenuationDistance: Math.max(0, materialSpec.attenuationDistance) }),
    environmentIntensity,
    envMapIntensity,
    renderState: {
      blend: opacity < 0.999,
      depthWrite: opacity >= 0.999,
      cullMode: node.primitive === "plane" || opacity < 0.999 ? "none" : "back"
    }
  });
}

export function createProductionPrimitiveGeometry(node: AuraPrimitiveNode): Geometry {
  if (node.geometry) return createProductionGeometryFromCustomSpec(node.geometry);
  if (node.primitive === "custom") throw new Error("Aura3D custom primitive requires geometry.");
  return createProductionGeometryFromPrimitiveMesh(createProductionPrimitiveMesh(node.primitive));
}

export function primitiveGeometryBounds(nodeOrPrimitive: AuraPrimitiveNode | AuraBuiltinPrimitive): GltfBounds {
  if (typeof nodeOrPrimitive === "object" && nodeOrPrimitive.geometry) return customGeometryBounds(nodeOrPrimitive.geometry);
  const primitive = typeof nodeOrPrimitive === "string" ? nodeOrPrimitive : nodeOrPrimitive.primitive;
  if (primitive === "custom") throw new Error("Aura3D custom primitive requires geometry.");
  return createProductionPrimitiveMesh(primitive).bounds;
}

/**
 * Production primitive mesh (muse3jsparity-PRD C1). uvs/uv1s are optional:
 * generators that provide them opt into textured materials; uv1 is a
 * procedural 2x tiling unwrap of uv0 (documented) so the native texCoord
 * selector has two distinct sets to choose between.
 */
export interface ProductionPrimitiveMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array;
  readonly bounds: GltfBounds;
  readonly uvs?: Float32Array;
  readonly uv1s?: Float32Array;
  /**
   * Axis-aligned analytic tangents (vec4 per vertex, w = handedness) for the
   * textured material contract. Generators with uvs provide these.
   */
  readonly tangents?: Float32Array;
}

export function tilingSecondUnwrap(uvs: Float32Array): Float32Array {
  const uv1s = new Float32Array(uvs.length);
  for (let i = 0; i < uvs.length; i += 1) uv1s[i] = (uvs[i] ?? 0) * 2;
  return uv1s;
}

function createProductionPrimitiveMesh(primitive: AuraBuiltinPrimitive): ProductionPrimitiveMesh {
  if (primitive === "sphere") return createSphereGeometry();
  if (primitive === "capsule") return createCapsuleApproxGeometry();
  if (primitive === "torus") return createTorusGeometry();
  if (primitive === "box") return createBoxGeometry();
  if (primitive === "cylinder") return createCylinderGeometry();
  return createPlaneGeometry();
}

function createProductionGeometryFromCustomSpec(spec: AuraCustomGeometrySpec): Geometry {
  const normalized = defineAuraCustomGeometry(spec);
  const normals = normalized.normals ?? calculateCustomGeometryNormals(normalized);
  const vertexCount = normalized.positions.length;
  const vertices = new VertexBuffer(VertexFormat.P3N3, vertexCount);
  normalized.positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "normal", normals[index] ?? [0, 1, 0]);
  });
  return new Geometry(vertices, new IndexBuffer(normalized.indices, vertexCount), "triangles", customGeometryBounds(normalized));
}

function customGeometryBounds(spec: AuraCustomGeometrySpec): GltfBounds {
  if (spec.bounds) return { min: spec.bounds.min, max: spec.bounds.max };
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  spec.positions.forEach((position) => { for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis], position[axis]!); max[axis] = Math.max(max[axis], position[axis]!); } });
  return { min, max };
}

function calculateCustomGeometryNormals(spec: AuraCustomGeometrySpec): readonly AuraVec3[] {
  const totals = Array.from({ length: spec.positions.length }, () => [0, 0, 0] as [number, number, number]);
  for (let offset = 0; offset < spec.indices.length; offset += 3) {
    const ia = spec.indices[offset]!, ib = spec.indices[offset + 1]!, ic = spec.indices[offset + 2]!;
    const a = spec.positions[ia]!, b = spec.positions[ib]!, c = spec.positions[ic]!;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]] as const;
    for (const index of [ia, ib, ic]) for (let axis = 0; axis < 3; axis += 1) totals[index]![axis] += normal[axis]!;
  }
  return totals.map((normal) => { const length = Math.hypot(...normal) || 1; return [normal[0] / length, normal[1] / length, normal[2] / length] as const; });
}

function createProductionGeometryFromPrimitiveMesh(mesh: ProductionPrimitiveMesh): Geometry {
  const vertexCount = mesh.positions.length / 3;
  const textured = Boolean(
    mesh.uvs && mesh.uvs.length === vertexCount * 2
    && mesh.tangents && mesh.tangents.length === vertexCount * 4
  );
  const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2T2 : VertexFormat.P3N3, vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    const base = index * 3;
    vertices.setAttribute(index, "position", [mesh.positions[base] ?? 0, mesh.positions[base + 1] ?? 0, mesh.positions[base + 2] ?? 0]);
    vertices.setAttribute(index, "normal", [mesh.normals[base] ?? 0, mesh.normals[base + 1] ?? 1, mesh.normals[base + 2] ?? 0]);
    if (textured) {
      const uvBase = index * 2;
      const tangentBase = index * 4;
      vertices.setAttribute(index, "tangent", [
        mesh.tangents![tangentBase] ?? 1, mesh.tangents![tangentBase + 1] ?? 0,
        mesh.tangents![tangentBase + 2] ?? 0, mesh.tangents![tangentBase + 3] ?? 1
      ]);
      vertices.setAttribute(index, "uv", [mesh.uvs![uvBase] ?? 0, mesh.uvs![uvBase + 1] ?? 0]);
      const uv1 = mesh.uv1s && mesh.uv1s.length === vertexCount * 2 ? mesh.uv1s : mesh.uvs!;
      vertices.setAttribute(index, "uv1", [uv1[uvBase] ?? 0, uv1[uvBase + 1] ?? 0]);
    }
  }
  return new Geometry(vertices, new IndexBuffer(Array.from(mesh.indices), vertexCount), "triangles", mesh.bounds);
}



/**
 * Build the production `PBRMaterial` for a primitive node.
 *
 * ## WS-2.1a — the parameter drop this function used to be
 *
 * Until 1.6 this forwarded `clearcoat` and **nothing else** from the extended material surface.
 * `AuraMaterialSpec` accepts `sheen`, `sheenRoughness`, `sheenColor`, `iridescence`,
 * `iridescenceIOR`, `iridescenceThicknessRange`, `anisotropy`, `anisotropyRotation`, `transmission`,
 * `thickness`, `ior`, `attenuationColor` and `attenuationDistance`; `PBRMaterial` accepts a uniform
 * for every one of them and binds them all. The bridge between the two dropped them on the floor.
 *
 * How that presented, measured by `tools/material-structural-parity` before the fix:
 *
 * ```
 * material.pbr({ ..., sheen: 1 })         -> byte-identical frame to sheen: 0
 * material.pbr({ ..., iridescence: 1 })   -> byte-identical frame to iridescence: 0
 * material.pbr({ ..., clearcoat: 1 })     -> byte-identical frame to clearcoat: 0
 * ```
 *
 * `clearcoat` was *forwarded* and still produced an identical frame, which pins the second, separate
 * defect: `a3dPbrExtensionEnvironmentLight` in `ShaderChunks.ts` adds its lobes to
 * `specularRadiance`, a term that is zero without an environment map. Forwarding alone is necessary
 * and not sufficient, so `environmentIntensity` now also has a floor when an extension factor is
 * present — otherwise a developer setting `clearcoat: 1` on a scene with no environment sees nothing
 * and has no way to find out why.
 *
 * The reason this survived so long is worth stating: three of the four lobes are scalar
 * approximations rather than real BRDFs, and **nobody could tell**, because the parameters never
 * arrived. The plumbing defect concealed the shading defect.
 */










/**
 * Production primitive mesh (muse3jsparity-PRD C1). uvs/uv1s are optional:
 * generators that provide them opt into textured materials; uv1 is a
 * procedural 2x tiling unwrap of uv0 (documented) so the native texCoord
 * selector has two distinct sets to choose between.
 */













