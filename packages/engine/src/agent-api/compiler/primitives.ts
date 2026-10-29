// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; the only logic change is the
// flag-gated Q-15-2 `qr` option (A3D_QR_CORE primitives via @aura3d/rendering); omitted = unchanged.

import type { AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneNode, AuraTransformSpec, AuraVec3, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource, ProductionRuntimePrimitiveState } from "../nodes/types.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { animation } from "../nodes/animation.js";
import { geometry } from "../nodes/geometry.js";
import { primitive } from "../nodes/primitives.js";
import { createModelMatrix, primitiveSize, shouldNormalizeModelNode } from "../sceneMath.js";
import { selectAuraRootLodLevel } from "../RootGeometry.js";
import { evaluateDistancePrioritizedMipResidency, type TextureStreamingCandidate, type TextureStreamingResidency } from "@aura3d/assets/browser";
import { createPrimitiveGeometry, PortableShaderMaterial, createDualProbeEnvironmentLightingResources, createProductionEnvironmentLightingResources, createProductionPbrHdrPipelineFromRadiance, type EnvironmentLightingOptions } from "@aura3d/rendering";
import type { AuraParityPrimitiveParams } from "@aura3d/rendering";
import { applyCustomUniformWrites, createCustomShaderMaterial, customUniformWritesFor, syncCustomTextureRefs } from "./customMaterial.js";
import { normalizeTextureBudgetBytes } from "../app/rendererOptions.js";
import { AuraRuntimeError } from "./errors.js";
import { blankProductionPrimitiveTextureState, createSdfTextPrimitiveResource } from "./textures.js";
import { material } from "../nodes/material.js";

/**
 * Q-15-2: `qr` (from `qrPrimitiveGeometryOptions(flags, quality)`) routes the
 * builtin primitives through @aura3d/rendering `createPrimitiveGeometry` under
 * A3D_QR_CORE. Omitted / undefined = the legacy generators, unchanged.
 */
export function createProductionRuntimePrimitiveEntries(nodes: readonly AuraSceneNode[], qr?: QrPrimitiveGeometryOptions): ProductionRuntimePrimitiveEntry[] {
  return nodes
    .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
    .map((node) => ({ node, resources: createProductionPrimitiveResources(node, qr), currentLodIndex: 0 }));
}

export function createProductionPrimitiveResources(node: AuraPrimitiveNode, qr?: QrPrimitiveGeometryOptions): readonly ProductionRuntimePrimitiveResource[] {
  const sdfWarnings: string[] = [];
  const sdfResource = createSdfTextPrimitiveResource(node, (message) => { sdfWarnings.push(message); });
  const levels = node.lod?.levels;
  if (!levels?.length) {
    if (sdfResource) return [sdfResource];
    const qrGeometry = qrPrimitiveGeometryFor(node, qr);
    const shadowGeometry = qrPrimitiveShadowGeometryFor(node, qr, qrGeometry?.geometry);
    const fallback = {
      geometry: qrGeometry?.geometry ?? createProductionPrimitiveGeometry(node),
      ...(shadowGeometry ? { shadowGeometry } : {}),
      material: createProductionPrimitiveMaterial(node),
      bounds: qrGeometry?.bounds ?? primitiveGeometryBounds(node),
      name: node.name ?? node.primitive,
      materialSpec: node.material,
      sourceNode: node,
      ...blankProductionPrimitiveTextureState()
    };
    // threejs-parity L2: the spec object the resource geometry was built from.
    // `handle.setGeometry` mutates `node.geometry` in place, so the applied
    // marker must be captured here rather than re-read from `sourceNode`.
    (fallback as ProductionRuntimePrimitiveResource & L2ResourceTrack).__parityL2AppliedGeometry = node.geometry;
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
    const levelQrGeometry = qrPrimitiveGeometryFor(levelNode, qr);
    const levelFallback = {
      geometry: levelQrGeometry?.geometry ?? createProductionPrimitiveGeometry(levelNode),
      material: createProductionPrimitiveMaterial(levelNode),
      bounds: levelQrGeometry?.bounds ?? primitiveGeometryBounds(levelNode),
      name: level.name,
      materialSpec: levelNode.material,
      sourceNode: levelNode,
      ...blankProductionPrimitiveTextureState()
    };
    (levelFallback as ProductionRuntimePrimitiveResource & L2ResourceTrack).__parityL2AppliedGeometry = levelNode.geometry;
    levelFallback.textureWarnings.push(...levelWarnings);
    return levelFallback;
  });
}

export function selectProductionPrimitiveResource(entry: ProductionRuntimePrimitiveEntry, node: AuraPrimitiveNode, cameraPosition: AuraVec3, lodBias = 1): ProductionRuntimePrimitiveResource {
  if (!node.lod?.levels.length) {
    const resource = entry.resources[0]!;
    if (node.material && node.material !== resource.materialSpec) {
      const mutableResource = resource as {
        materialSpec?: AuraPrimitiveNode["material"];
        material: ProductionRuntimePrimitiveResource["material"];
      };
      mutableResource.materialSpec = node.material;
      mutableResource.material = createProductionPrimitiveMaterial(node);
    }
    // threejs-parity L2 (SG-05): `handle.setGeometry`/`updateAttribute` —
    // in-place buffer writes when the vertex count is unchanged, replace
    // otherwise. Tracked per resource so unchanged frames cost nothing.
    syncRuntimePrimitiveGeometry(resource, node);
    return resource;
  }
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
    const localNode: AuraPrimitiveNode = { kind: "primitive", primitive: node.primitive, size: node.size, ...transform };
    matrices.set(createModelMatrix(localNode, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0), index * 16);
  });
  return matrices;
}

/**
 * Dense counterpart of `createProductionInstanceTransforms` for matrices written by `handle.setInstanceMatrices`.
 * The spec path builds T·R·S(scale ⊙ size) per instance; a dense matrix already is T·R·S(scale), so folding the node
 * `size` in is a scale of its three basis columns. `out` is reused across frames while the count is unchanged.
 */
export function createProductionInstanceTransformsFromMatrices(matrices: Float32Array, node: AuraPrimitiveNode, out?: Float32Array): Float32Array {
  const size = primitiveSize(node);
  const target = out !== undefined && out.length === matrices.length ? out : new Float32Array(matrices.length);
  const sx = size[0], sy = size[1], sz = size[2];
  for (let o = 0; o < matrices.length; o += 16) {
    target[o] = matrices[o]! * sx; target[o + 1] = matrices[o + 1]! * sx; target[o + 2] = matrices[o + 2]! * sx; target[o + 3] = matrices[o + 3]!;
    target[o + 4] = matrices[o + 4]! * sy; target[o + 5] = matrices[o + 5]! * sy; target[o + 6] = matrices[o + 6]! * sy; target[o + 7] = matrices[o + 7]!;
    target[o + 8] = matrices[o + 8]! * sz; target[o + 9] = matrices[o + 9]! * sz; target[o + 10] = matrices[o + 10]! * sz; target[o + 11] = matrices[o + 11]!;
    target[o + 12] = matrices[o + 12]!; target[o + 13] = matrices[o + 13]!; target[o + 14] = matrices[o + 14]!; target[o + 15] = matrices[o + 15]!;
  }
  return target;
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
  // R-26: live `texture.*` handles bound to custom-material texture2d uniforms
  // keep their sampler state in sync here, with or without a runtime id.
  for (const resource of entry.resources) {
    if (resource.material instanceof PortableShaderMaterial) syncCustomTextureRefs(resource.material);
  }
  const runtimeId = entry.node.runtime?.id;
  if (!runtimeId) return { node: entry.node, visible: true };
  const runtimeHandle = runtimeNodes?.get(runtimeId) as (NonNullable<ReturnType<AuraRuntimeNodeRegistry["get"]>> & {
    // threejs-parity L2 (SG-05): set inside `region parity:L2` on the handle —
    // `setGeometry` stores the normalized spec, `updateAttribute` queues
    // partial writes; both drain per frame in `selectProductionPrimitiveResource`.
    readonly __parityL2Geometry?: AuraCustomGeometrySpec;
    __parityL2AttributeUpdates?: readonly AuraL2AttributeUpdate[];
  }) | undefined;
  const runtimeSnapshot = runtimeHandle?.snapshot() as (ReturnType<NonNullable<ReturnType<AuraRuntimeNodeRegistry["get"]>>["snapshot"]> & {
    readonly material?: AuraPrimitiveNode["material"];
    readonly instances?: AuraPrimitiveNode["instances"];
    readonly instanceColors?: AuraPrimitiveNode["instanceColors"];
    readonly instanceMatrices?: Float32Array;
    readonly instanceRgba?: Float32Array;
  }) | undefined;
  // parity:L1 (SH-02): staged `handle.setUniform` writes land on the compiled
  // portable material here — `setParameter` updates uniform state only, never
  // the shader key, so no program is recompiled.
  const uniformWrites = customUniformWritesFor(runtimeId);
  if (uniformWrites?.size) {
    for (const resource of entry.resources) {
      if (resource.material instanceof PortableShaderMaterial) {
        applyCustomUniformWrites(resource.material, uniformWrites);
      }
    }
  }
  if (!runtimeSnapshot) return { node: entry.node, visible: true };
  // L2: drain the queued attribute writes so they apply exactly once.
  const pendingAttributes = runtimeHandle?.__parityL2AttributeUpdates;
  if (runtimeHandle && pendingAttributes && pendingAttributes.length > 0) {
    runtimeHandle.__parityL2AttributeUpdates = [];
  }
  const resolvedNode = {
    ...entry.node,
    position: runtimeSnapshot.position,
    rotation: runtimeSnapshot.rotation,
    scale: runtimeSnapshot.scale,
    material: runtimeSnapshot.material ?? entry.node.material,
    animation: runtimeSnapshot.animation ?? entry.node.animation,
    ...(runtimeSnapshot.instances ? { instances: runtimeSnapshot.instances } : {}),
    ...(runtimeSnapshot.instanceColors ? { instanceColors: runtimeSnapshot.instanceColors } : {}),
    ...(runtimeSnapshot.instanceMatrices ? { instanceMatrices: runtimeSnapshot.instanceMatrices } : {}),
    ...(runtimeSnapshot.instanceRgba ? { instanceRgba: runtimeSnapshot.instanceRgba } : {}),
    ...(runtimeHandle?.__parityL2Geometry !== undefined ? { geometry: runtimeHandle.__parityL2Geometry } : {})
  } as AuraPrimitiveNode & { __parityL2AttributeUpdates?: readonly AuraL2AttributeUpdate[]; instanceMatrices?: Float32Array; instanceRgba?: Float32Array };
  if (pendingAttributes && pendingAttributes.length > 0) {
    resolvedNode.__parityL2AttributeUpdates = pendingAttributes;
  }
  return { node: resolvedNode, visible: runtimeSnapshot.visible };
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

import { Geometry, IndexBuffer, InstancedPBRMaterial, PBRMaterial, VertexBuffer, VertexFormat, assignCustomAttributeLocations, customAttributeSemantic, type VertexAttributeDescriptor } from "@aura3d/rendering";
import { computeAuraGeometryBounds, computeAuraGeometryNormals, defineAuraCustomGeometry, normalizeGeometryAttributes } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import { instances } from "../nodes/instances.js";
import type { AuraMaterialSpec, AuraBuiltinPrimitive } from "../nodes/types.js";
import { renderer } from "../rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";
import { colorToLinearRgb } from "../colorUtils.js";
import type { GltfBounds } from "../nodes/types/runtime.js";
import { createPlaneGeometry, createBoxGeometry, createSphereGeometry, createCylinderGeometry, createTorusGeometry, createCapsuleApproxGeometry, createQrPrimitiveMesh, instancedDefaultSegmentScale, instancedShadowSegmentScale, INSTANCED_SHADOW_PROXY_MIN_INSTANCES, qrPrimitiveGeometryKey, qrPrimitiveParamsPoolable, type QrPrimitiveGeometryOptions } from "./geometry.js";
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

export function createProductionPrimitiveMaterial(node: AuraPrimitiveNode): PBRMaterial | InstancedPBRMaterial | PortableShaderMaterial {
  const materialSpec = node.material;
  // parity:L1 (SH-02): `material.custom(spec)` routes to the portable-shader
  // adapter — a validated `PortableShaderMaterial`, never a PBR downgrade.
  if (materialSpec?.kind === "custom" && materialSpec.custom) {
    return createCustomShaderMaterial(materialSpec.custom, `primitive-${node.primitive}${node.name ? `-${node.name}` : ""}`);
  }
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
      // threejs-parity L7/SR-02: forward the frozen `AuraMaterialSpec.fog` opt-out.
      fog: materialSpec?.fog,
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
    // threejs-parity L7/SR-02: forward the frozen `AuraMaterialSpec.fog` opt-out.
    fog: materialSpec?.fog,
    renderState: {
      blend: opacity < 0.999,
      depthWrite: opacity >= 0.999,
      cullMode: node.primitive === "plane" || opacity < 0.999 ? "none" : "back"
    }
  });
}

/**
 * threejs-parity L2 (§6 L2-01/02): every `AuraBuiltinPrimitive` kind now maps
 * onto a real `createPrimitiveGeometry` generator — no fail-closed dispatch
 * remains. `"custom"` still resolves through the geometry-spec path.
 */
function qrBuiltinPrimitive(primitive: AuraBuiltinPrimitive): import("./geometry.js").QrBuiltinPrimitive {
  switch (primitive) {
    case "box": case "sphere": case "plane": case "cylinder": case "capsule": case "torus":
    case "cone": case "circle": case "ring": case "tube": case "lathe": case "extrude": case "shape":
    case "torusKnot": case "polyhedron": case "roundedBox":
      return primitive;
    default:
      throw new AuraRuntimeError(
        "parity-not-implemented",
        `Aura3D primitive "${String(primitive)}" is not implemented (A3D_PARITY_GEOMETRY). See docs/workflows/threejs-parity-gaps.md.`
      );
  }
}

/** Q-15-2: the flag-on mesh for a builtin primitive node; undefined = legacy path (flag off, custom, geometry spec). */
export function qrPrimitiveMeshFor(node: AuraPrimitiveNode, qr: QrPrimitiveGeometryOptions | undefined): ProductionPrimitiveMesh | undefined {
  if (!qr?.core || node.geometry || node.primitive === "custom") return undefined;
  return createQrPrimitiveMesh(qrBuiltinPrimitive(node.primitive), primitiveSize(node), qr, node.params);
}

/** Q-15-2: flag-on geometry + bounds, pooled per mount when `qr.pool` is set (#545). */
/** Dense instanced nodes shrink their default tessellation (see `instancedDefaultSegmentScale`); explicit segment params are unaffected. */
function withInstancedTessellation(node: AuraPrimitiveNode, qr: QrPrimitiveGeometryOptions, purpose: "view" | "shadow" = "view"): QrPrimitiveGeometryOptions {
  const count = node.instances?.length;
  if (count === undefined || count <= 64 || node.primitive === "custom") return qr;
  let fullTriangles = 0;
  try {
    const full = createPrimitiveGeometry(qrBuiltinPrimitive(node.primitive), node.params as AuraParityPrimitiveParams | undefined, { primitiveSegments: qr.primitiveSegments ?? "full" });
    fullTriangles = (full.indexBuffer?.count ?? full.vertexBuffer.vertexCount) / 3;
  } catch {
    return qr;
  }
  const scale = purpose === "shadow" ? instancedShadowSegmentScale(count, fullTriangles, node.primitive) : instancedDefaultSegmentScale(count, fullTriangles);
  return scale === 1 ? qr : { ...qr, defaultSegmentScale: scale };
}

/**
 * `globalThis.__A3D_SHADOW_PROXY__ = "off"` (or `?shadowproxy=off`) opts a page out of shadow proxy geometry; the default is on.
 * Read at mount, like `?shadowfit=`.
 */
export function shadowProxyEnabled(): boolean {
  const g = globalThis as { __A3D_SHADOW_PROXY__?: string; location?: { search?: string } };
  let value = g.__A3D_SHADOW_PROXY__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("shadowproxy") : null;
    if (q === "on" || q === "off") value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  return value !== "off";
}

/** Offstage convention shared with `sceneShadowRadius`: anything at world y <= -50 is parked, not drawn. */
const PARKED_Y = -50;

/**
 * Instances of a node that are on stage (SI-7): pools park unused slots far below the stage
 * (dot-dash rails: 900 slots at y -999) or at scale 0, so pool capacity is not the number of
 * shadow casters. Thresholds compare this count, never `instances.length`.
 */
export function liveInstanceCount(node: { readonly position?: readonly number[] | undefined; readonly instances?: readonly { readonly position?: readonly number[] | undefined; readonly scale?: number | readonly number[] | undefined }[] | undefined }): number {
  const instances = node.instances;
  if (!Array.isArray(instances)) return 0;
  const baseY = Array.isArray(node.position) ? (node.position[1] ?? 0) : 0;
  let live = 0;
  for (const instance of instances) {
    if (baseY + (instance.position?.[1] ?? 0) <= PARKED_Y) continue;
    const scale = instance.scale;
    if (scale === 0 || (Array.isArray(scale) && scale.some((value) => value === 0))) continue;
    live += 1;
  }
  return live;
}

const triangleCount = (geometry: Geometry): number => (geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount) / 3;

/**
 * Coarser stand-in geometry for the shadow depth passes of an instanced, shadow-casting builtin primitive (see `RenderItem.shadowGeometry`).
 *
 * Eligibility, all required:
 * - the node casts shadows, is a builtin primitive (not `custom`, no authored `geometry`), and the quality-rebuild core path is on;
 * - it carries at least `INSTANCED_SHADOW_PROXY_MIN_INSTANCES` (1,024) live instances (parked pool slots do not count, SI-7);
 * - the page has not opted out (`shadowproxy=off`);
 * - the proxy is strictly cheaper than the camera geometry (kinds whose tessellation ignores the segment scale, such as boxes, never get one).
 * Authored segment params always win, exactly as for the camera geometry.
 */
export function qrPrimitiveShadowGeometryFor(node: AuraPrimitiveNode, mountQr: QrPrimitiveGeometryOptions | undefined, viewGeometry?: Geometry): Geometry | undefined {
  if (!mountQr?.core || node.geometry || node.primitive === "custom" || !node.castShadow) return undefined;
  if (node.instances === undefined) return undefined;
  const count = liveInstanceCount(node);
  if (count < INSTANCED_SHADOW_PROXY_MIN_INSTANCES || !shadowProxyEnabled()) return undefined;
  const viewScale = withInstancedTessellation(node, mountQr).defaultSegmentScale ?? 1;
  const qr = withInstancedTessellation(node, mountQr, "shadow");
  if ((qr.defaultSegmentScale ?? 1) >= viewScale) return undefined;
  const size = primitiveSize(node);
  const primitive = qrBuiltinPrimitive(node.primitive);
  const proxy = !qr.pool || !qrPrimitiveParamsPoolable(node.params)
    ? createProductionGeometryFromPrimitiveMesh(createQrPrimitiveMesh(primitive, size, qr, node.params))
    : qr.pool.acquire(qrPrimitiveGeometryKey(primitive, size, qr, node.params), () =>
      createProductionGeometryFromPrimitiveMesh(createQrPrimitiveMesh(primitive, size, qr, node.params)));
  if (viewGeometry && triangleCount(proxy) >= triangleCount(viewGeometry)) {
    proxy.dispose();
    return undefined;
  }
  // Evidence for audits (tests/browser/shadow-proxy-ab.spec.ts): which nodes of a page got a proxy, and how much cheaper it is.
  const record = (globalThis as { __A3D_SHADOW_PROXIES__?: unknown[] });
  (record.__A3D_SHADOW_PROXIES__ ??= []).push({ node: node.name ?? node.primitive, primitive: node.primitive, instances: count, cameraTriangles: viewGeometry ? triangleCount(viewGeometry) : null, proxyTriangles: triangleCount(proxy) });
  return proxy;
}

export function qrPrimitiveGeometryFor(node: AuraPrimitiveNode, mountQr: QrPrimitiveGeometryOptions | undefined): { readonly geometry: Geometry; readonly bounds: GltfBounds } | undefined {
  if (!mountQr?.core || node.geometry || node.primitive === "custom") return undefined;
  const qr = withInstancedTessellation(node, mountQr);
  const size = primitiveSize(node);
  // L2: params carrying live curve/shape objects can't key a shared pool entry.
  if (!qr.pool || !qrPrimitiveParamsPoolable(node.params)) {
    const mesh = createQrPrimitiveMesh(qrBuiltinPrimitive(node.primitive), size, qr, node.params);
    return { geometry: createProductionGeometryFromPrimitiveMesh(mesh), bounds: mesh.bounds };
  }
  const primitive = qrBuiltinPrimitive(node.primitive);
  const geometry = qr.pool.acquire(qrPrimitiveGeometryKey(primitive, size, qr, node.params), () =>
    createProductionGeometryFromPrimitiveMesh(createQrPrimitiveMesh(primitive, size, qr, node.params)));
  return { geometry, bounds: geometry.bounds };
}

export function createProductionPrimitiveGeometry(node: AuraPrimitiveNode): Geometry {
  if (node.geometry) return createProductionGeometryFromCustomSpec(node.geometry);
  if (node.primitive === "custom") throw new Error("Aura3D custom primitive requires geometry.");
  return createProductionGeometryFromPrimitiveMesh(createProductionPrimitiveMesh(node.primitive, node));
}

export function primitiveGeometryBounds(nodeOrPrimitive: AuraPrimitiveNode | AuraBuiltinPrimitive): GltfBounds {
  if (typeof nodeOrPrimitive === "object" && nodeOrPrimitive.geometry) return customGeometryBounds(nodeOrPrimitive.geometry);
  const primitive = typeof nodeOrPrimitive === "string" ? nodeOrPrimitive : nodeOrPrimitive.primitive;
  if (primitive === "custom") throw new Error("Aura3D custom primitive requires geometry.");
  return createProductionPrimitiveMesh(primitive, typeof nodeOrPrimitive === "object" ? nodeOrPrimitive : undefined).bounds;
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
  readonly indices: Uint16Array | Uint32Array;
  readonly bounds: GltfBounds;
  /** threejs-parity L2: `"lines"`/`"points"` topologies (edges/wireframe paths). Default `"triangles"`. */
  readonly topology?: "triangles" | "lines" | "points";
  /** threejs-parity L2: three's geometry.groups — material-index index ranges. */
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
  /** threejs-parity L2: three's setDrawRange. */
  readonly drawRange?: { readonly start: number; readonly count: number };
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

/**
 * Legacy (flag-off) primitive mesh. The six original kinds keep their bespoke
 * generators byte-for-byte; the ten threejs-parity L2 kinds route through the
 * shared `createPrimitiveGeometry` factory with the node's params.
 */
function createProductionPrimitiveMesh(primitive: AuraBuiltinPrimitive, node?: AuraPrimitiveNode): ProductionPrimitiveMesh {
  if (primitive === "sphere") return createSphereGeometry();
  if (primitive === "capsule") return createCapsuleApproxGeometry();
  if (primitive === "torus") return createTorusGeometry();
  if (primitive === "box") return createBoxGeometry();
  if (primitive === "cylinder") return createCylinderGeometry();
  if (primitive === "plane") return createPlaneGeometry();
  // threejs-parity L2: the ten new kinds share the QR generator path (full
  // segments — the C-27 tier halving only applies under A3D_QR_CORE).
  const size = node ? primitiveSize(node) : [1, 1, 1] as const;
  return createQrPrimitiveMesh(qrBuiltinPrimitive(primitive), size, { core: true, primitiveSegments: "full" }, node?.params);
}

/**
 * SG-05 (threejs-parity L2): custom/dynamic specs normalize flat or tuple
 * attributes, optional colors, `"lines"` topology (edges/wireframe), groups,
 * drawRange and morph targets onto the production `Geometry`.
 */
function createProductionGeometryFromCustomSpec(spec: AuraCustomGeometrySpec): Geometry {
  const normalized = normalizeGeometryAttributes(spec);
  const normals = resolveSpecNormals(spec, normalized);
  const vertexCount = normalized.vertexCount;
  const attributes: VertexAttributeDescriptor[] = [
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "normal", components: 3, offset: 12 }
  ];
  let cursor = 24;
  if (normalized.uvs) { attributes.push({ semantic: "uv", components: 2, offset: cursor }); cursor += 8; }
  if (normalized.colors) { attributes.push({ semantic: "color", components: 4, offset: cursor }); cursor += 16; }
  // R-23: custom attributes follow the built-ins in name order and bind by
  // their GLSL name; locations come from the stable pool.
  const customLocations = assignCustomAttributeLocations(normalized.custom.map((entry) => entry.name));
  for (const entry of normalized.custom) {
    attributes.push({
      semantic: customAttributeSemantic(entry.name),
      components: entry.itemSize,
      offset: cursor,
      shaderName: entry.name,
      shaderLocation: customLocations.get(entry.name)!
    });
    cursor += entry.itemSize * 4;
  }
  const vertices = new VertexBuffer(new VertexFormat(attributes), vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    vertices.setAttribute(index, "position", [normalized.positions[index * 3]!, normalized.positions[index * 3 + 1]!, normalized.positions[index * 3 + 2]!]);
    vertices.setAttribute(index, "normal", [normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!]);
    if (normalized.uvs) vertices.setAttribute(index, "uv", [normalized.uvs[index * 2]!, normalized.uvs[index * 2 + 1]!]);
    if (normalized.colors) vertices.setAttribute(index, "color", [normalized.colors[index * 4]!, normalized.colors[index * 4 + 1]!, normalized.colors[index * 4 + 2]!, normalized.colors[index * 4 + 3]!]);
  }
  for (const entry of normalized.custom) writeCustomAttribute(vertices, entry.name, entry.itemSize, entry.data, 0);
  const indexList = normalized.indices ?? Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const indexBuffer = indexList.length > 0 ? new IndexBuffer(Array.from(indexList), vertexCount) : null;
  const geometry = new Geometry(vertices, indexBuffer, spec.topology === "lines" ? "lines" : spec.topology === "points" ? "points" : "triangles", customGeometryBounds(spec));
  if (spec.groups) geometry.groups = [...spec.groups];
  if (spec.drawRange) geometry.drawRange = { ...spec.drawRange };
  if (spec.morphTargets) geometry.morphTargets = spec.morphTargets.map((target) => ({ ...target }));
  return geometry;
}

/** Authored normals, else computed; points carry a constant +Y (a vertex count that is not a multiple of 3 would yield NaN face normals). */
function resolveSpecNormals(spec: AuraCustomGeometrySpec, normalized: ReturnType<typeof normalizeGeometryAttributes>): Float32Array {
  if (normalized.normals) return normalized.normals;
  if (spec.topology === "points") {
    const up = new Float32Array(normalized.positions.length);
    for (let i = 1; i < up.length; i += 3) up[i] = 1;
    return up;
  }
  return computeAuraGeometryNormals({ positions: normalized.positions, indices: normalized.indices });
}

function customGeometryBounds(spec: AuraCustomGeometrySpec): GltfBounds {
  if (spec.bounds) return { min: spec.bounds.min, max: spec.bounds.max };
  const computed = computeAuraGeometryBounds({ positions: spec.positions });
  return { min: computed.min, max: computed.max };
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
  const geometry = new Geometry(
    vertices,
    new IndexBuffer(Array.from(mesh.indices), vertexCount),
    mesh.topology ?? "triangles",
    mesh.bounds
  );
  // threejs-parity L2: carry three's groups/drawRange through to the draw path.
  if (mesh.groups) geometry.groups = [...mesh.groups];
  if (mesh.drawRange) geometry.drawRange = { ...mesh.drawRange };
  return geometry;
}

// ── threejs-parity L2 (SG-05): runtime dynamic geometry ──────────────────────

/** Queued partial attribute write produced by `handle.updateAttribute` (region parity:L2). */
export interface AuraL2AttributeUpdate {
  readonly name: string;
  readonly array: Float32Array | Uint16Array | Uint32Array;
  readonly offset: number;
}

/** Per-resource tracking for the runtime geometry/attribute channels. */
interface L2ResourceTrack {
  __parityL2AppliedGeometry?: AuraCustomGeometrySpec | undefined;
}

const L2_UPDATE_SEMANTICS: Record<string, "position" | "normal" | "uv" | "uv1" | "color" | "tangent"> = {
  position: "position",
  positions: "position",
  normal: "normal",
  normals: "normal",
  uv: "uv",
  uv0: "uv",
  uvs: "uv",
  uv1: "uv1",
  color: "color",
  colors: "color",
  tangent: "tangent",
  tangents: "tangent"
};

/**
 * SG-05: apply `handle.setGeometry` + `handle.updateAttribute` writes to the
 * live resource. Same vertex count + same attribute set ⇒ write into the
 * existing `VertexBuffer` (dirty ranges flush on the next `upload()` — the
 * GPU allocation is never re-created). A different vertex count or attribute
 * footprint rebuilds the `Geometry` once (realloc allowed then).
 */
function syncRuntimePrimitiveGeometry(
  resource: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode & { readonly __parityL2AttributeUpdates?: readonly AuraL2AttributeUpdate[] }
): void {
  const tracked = resource as ProductionRuntimePrimitiveResource & L2ResourceTrack & {
    geometry?: Geometry;
    bounds?: GltfBounds;
    sourceNode?: AuraPrimitiveNode;
  };
  const spec = node.geometry;
  // `__parityL2AppliedGeometry` is tagged at resource build — `handle.setGeometry`
  // also mutates `node.geometry` in place, so `sourceNode.geometry` can NOT
  // serve as the applied marker (it already holds the new spec).
  if (spec !== undefined && spec !== tracked.__parityL2AppliedGeometry) {
    applyDynamicGeometrySpec(resource, spec);
    tracked.__parityL2AppliedGeometry = spec;
    if (tracked.sourceNode) tracked.sourceNode = { ...tracked.sourceNode, geometry: spec };
  }
  const updates = node.__parityL2AttributeUpdates;
  if (updates) {
    for (const update of updates) applyAttributeUpdateToGeometry(resource.geometry, update);
  }
}

function applyDynamicGeometrySpec(resource: ProductionRuntimePrimitiveResource, spec: AuraCustomGeometrySpec): void {
  const tracked = resource as ProductionRuntimePrimitiveResource & L2ResourceTrack & {
    geometry?: Geometry;
    bounds?: GltfBounds;
  };
  const normalized = normalizeGeometryAttributes(spec);
  const geometry = resource.geometry;
  const vertexBuffer = geometry.vertexBuffer;
  const has = (semantic: "position" | "normal" | "uv" | "uv1" | "color" | "tangent") => vertexBuffer.format.hasAttribute(semantic);
  const sameFootprint = vertexBuffer.vertexCount === normalized.vertexCount
    && has("uv") === (normalized.uvs !== undefined)
    && has("color") === (normalized.colors !== undefined)
    && customFootprintMatches(vertexBuffer, normalized.custom)
    && geometry.topology === (spec.topology ?? "triangles")
    && vertexBuffer.format.hasAttribute("normal")
    && !has("tangent");
  const normals = resolveSpecNormals(spec, normalized);

  if (sameFootprint) {
    // In-place path (L2-04): attribute writes mark byte ranges dirty; the next
    // upload() flushes only those ranges — no new GPU buffer.
    for (let index = 0; index < normalized.vertexCount; index += 1) {
      vertexBuffer.setAttribute(index, "position", [normalized.positions[index * 3]!, normalized.positions[index * 3 + 1]!, normalized.positions[index * 3 + 2]!]);
      vertexBuffer.setAttribute(index, "normal", [normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!]);
      if (normalized.uvs) vertexBuffer.setAttribute(index, "uv", [normalized.uvs[index * 2]!, normalized.uvs[index * 2 + 1]!]);
      if (normalized.colors) vertexBuffer.setAttribute(index, "color", [normalized.colors[index * 4]!, normalized.colors[index * 4 + 1]!, normalized.colors[index * 4 + 2]!, normalized.colors[index * 4 + 3]!]);
    }
    for (const entry of normalized.custom) writeCustomAttribute(vertexBuffer, entry.name, entry.itemSize, entry.data, 0);
    if (normalized.indices && geometry.indexBuffer && normalized.indices.length === geometry.indexBuffer.count) {
      geometry.indexBuffer.setIndices(0, normalized.indices);
    } else if (normalized.indices) {
      // Same vertex count but a different index count still fits the existing
      // vertex allocation; only the index buffer is swapped.
      geometry.indexBuffer?.dispose();
      (geometry as { indexBuffer?: IndexBuffer | null }).indexBuffer = new IndexBuffer(Array.from(normalized.indices), normalized.vertexCount);
    }
    const bounds = spec.bounds ? { min: spec.bounds.min, max: spec.bounds.max } : computeAuraGeometryBounds({ positions: normalized.positions });
    (geometry as { bounds: GltfBounds }).bounds = { min: [...bounds.min] as AuraVec3, max: [...bounds.max] as AuraVec3 };
    geometry.groups = spec.groups ? [...spec.groups] : undefined;
    geometry.drawRange = spec.drawRange ? { ...spec.drawRange } : undefined;
    geometry.morphTargets = spec.morphTargets ? spec.morphTargets.map((target) => ({ ...target })) : undefined;
    tracked.bounds = { min: [...bounds.min] as AuraVec3, max: [...bounds.max] as AuraVec3 };
    return;
  }

  // Realloc path: different vertex count, attribute footprint, or topology.
  const next = createProductionGeometryFromCustomSpec(spec);
  geometry.dispose();
  tracked.geometry = next;
  tracked.bounds = { min: [...next.bounds.min] as AuraVec3, max: [...next.bounds.max] as AuraVec3 };
}

/** R-23: write `data` (itemSize floats per vertex) into the named custom attribute starting at vertex `start`. */
function writeCustomAttribute(vertexBuffer: VertexBuffer, name: string, itemSize: number, data: ArrayLike<number>, start: number): void {
  const semantic = customAttributeSemantic(name);
  const elements = data.length / itemSize;
  const scratch: number[] = new Array(itemSize);
  for (let element = 0; element < elements; element += 1) {
    for (let component = 0; component < itemSize; component += 1) scratch[component] = data[element * itemSize + component] ?? 0;
    vertexBuffer.setAttribute(start + element, semantic, scratch);
  }
}

/** R-23: the live buffer holds exactly the spec's custom attributes (same names, same itemSize). */
function customFootprintMatches(vertexBuffer: VertexBuffer, custom: readonly { readonly name: string; readonly itemSize: number }[]): boolean {
  const live = vertexBuffer.format.attributes.filter((attribute) => String(attribute.semantic).startsWith("custom:"));
  if (live.length !== custom.length) return false;
  return custom.every((entry) => {
    const semantic = customAttributeSemantic(entry.name);
    return vertexBuffer.format.hasAttribute(semantic) && vertexBuffer.format.getAttribute(semantic).components === entry.itemSize;
  });
}

/** SG-05 `updateAttribute`: partial write by element offset — dirty-ranged, never reallocates. */
function applyAttributeUpdateToGeometry(geometry: Geometry, update: AuraL2AttributeUpdate): void {
  // R-23: exact-name custom attributes win; validated names never collide with the built-in aliases.
  const customSemantic = customAttributeSemantic(update.name);
  const semantic = geometry.vertexBuffer.format.hasAttribute(customSemantic) ? customSemantic : L2_UPDATE_SEMANTICS[update.name.toLowerCase()];
  if (!semantic) {
    throw new Error(`Aura3D updateAttribute name "${update.name}" is not a writable vertex semantic (position/normal/uv/uv1/color/tangent) or a custom attribute on this geometry.`);
  }
  const vertexBuffer = geometry.vertexBuffer;
  if (!vertexBuffer.format.hasAttribute(semantic)) {
    throw new Error(`Aura3D updateAttribute("${update.name}") — the live geometry has no "${semantic}" attribute.`);
  }
  const components = vertexBuffer.format.getAttribute(semantic).components;
  const data = update.array;
  if (data.length % components !== 0) {
    throw new Error(`Aura3D updateAttribute("${update.name}") array length must be a multiple of ${components}.`);
  }
  const start = Math.max(0, Math.floor(update.offset));
  const elements = data.length / components;
  if (start + elements > vertexBuffer.vertexCount) {
    throw new Error(`Aura3D updateAttribute("${update.name}") overruns the vertex buffer (${vertexBuffer.vertexCount} vertices).`);
  }
  const scratch: number[] = new Array(components);
  for (let element = 0; element < elements; element += 1) {
    for (let component = 0; component < components; component += 1) {
      scratch[component] = data[element * components + component] ?? 0;
    }
    vertexBuffer.setAttribute(start + element, semantic, scratch);
  }
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













