// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraTransformSpec, AuraVec3, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry } from "../nodes/types.js";
import type { AuraDegradation } from "../../contracts/compiler.js";
import { geometry } from "../nodes/geometry.js";
import { groups } from "../nodes/groups.js";
import { primitive } from "../nodes/primitives.js";
import { createModelMatrix, createViewProjection, shouldNormalizeModelNode } from "../sceneMath.js";
import { applyProductionActorFootPlanting, applyProductionActorMorphTargets, attachProductionActorEvidence, createProductionRuntimeMetadata, productionActorModelBounds, resolveProductionActorRuntimeState } from "./actors.js";
import { resolveCameraFrame } from "./camera.js";
import { createSceneLabelOcclusionTest } from "./labels.js";
import { productionRenderErrorMessage } from "./observations.js";
import { composeModelInstanceMatrices, getRootPerformanceQuality, getRootRenderSource, includeRootSourceMetadata } from "../RootRuntimeSupport.js";
import { resolveSdfTextFrameOpacity, resolveWrinkleMapStrength, warnOnInstancingFallback, type CameraLike, type CollectedLight, type EnvironmentLightingOptions, type ProductionRendererInput, type RenderItem, type RenderSource } from "@aura3d/rendering";
import { identityMat4 } from "@aura3d/scene/math";
import { applyProductionActorAnimation } from "./animation.js";
import { createProductionRuntimeEnvironmentFog } from "./fog.js";
import { createProductionRuntimePostprocess } from "./postprocess.js";
import { createProductionInstanceColors, createProductionInstanceTransforms, createProductionModelInstanceTransforms, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "./primitives.js";
import { createProductionRuntimeShadowOptions } from "./shadows.js";
import { camera } from "../nodes/camera.js";
import { instances } from "../nodes/instances.js";
import { material } from "../nodes/material.js";
import type { AuraStaticModelMatrixCache } from "../sceneGraph.js";

/*
 * PRD-01 §15 Phase-6 seam: under `A3D_QR_CORE`, createAuraApp installs the
 * Phase-1 fingerprinted model-matrix cache so static primitives skip the
 * per-frame createModelMatrix recompose+alloc; the per-frame instance
 * transform/color arrays are likewise retained per spec array. Flag-off
 * keeps the verbatim calls (C-01).
 */
let prd01ModelMatrixCache: AuraStaticModelMatrixCache | null = null;

/** createAuraApp installs the Phase-1 cache here when `A3D_QR_CORE` is on. */
export function setPrd01ModelMatrixCache(cache: AuraStaticModelMatrixCache | null): void {
  prd01ModelMatrixCache = cache;
}

/* Instance outputs depend on the spec array contents + `node.primitive`
 * (createProductionInstanceTransforms builds {kind, primitive, ...transform}
 * locals — node TRS is unused). Key on the spec array's identity and a
 * numeric fold of its transform fields; spec arrays are mount-frozen. */
const prd01InstanceTransformCache = new WeakMap<readonly AuraTransformSpec[], { fp: number; primitive: unknown; result: Float32Array }>();
const prd01InstanceColorCache = new WeakMap<readonly AuraColor[], { fp: number; count: number; result: Float32Array | undefined }>();
const prd01ModelInstanceCache = new WeakMap<readonly AuraTransformSpec[], { fp: number; node: object; bounds: Float64Array; result: Float32Array }>();

function instanceTransformFp(transforms: readonly AuraTransformSpec[]): number {
  let h = transforms.length;
  for (const t of transforms) {
    const p = t.position;
    if (p) h += p[0] * 3 + p[1] * 5 + p[2] * 7;
    const r = t.rotation;
    if (r) h += r[0] * 19 + r[1] * 23 + r[2] * 29;
    const s = t.scale;
    if (typeof s === "number") h += s * 11;
    else if (s) h += s[0] * 11 + s[1] * 13 + s[2] * 17;
  }
  return h;
}

function instanceColorFp(colors: readonly AuraColor[]): number {
  let h = colors.length;
  for (const c of colors) {
    if (typeof c === "string") h = h * 31 + c.length + (c.length > 0 ? c.charCodeAt(0) + c.charCodeAt(c.length - 1) : 0);
    else h = h * 31 + 1;
  }
  return h | 0;
}

function prd01InstanceTransforms(transforms: readonly AuraTransformSpec[], node: AuraPrimitiveNode): Float32Array {
  if (prd01ModelMatrixCache === null) return createProductionInstanceTransforms(transforms, node);
  const fp = instanceTransformFp(transforms);
  const hit = prd01InstanceTransformCache.get(transforms);
  if (hit && hit.fp === fp && hit.primitive === node.primitive) return hit.result;
  const result = createProductionInstanceTransforms(transforms, node);
  prd01InstanceTransformCache.set(transforms, { fp, primitive: node.primitive, result });
  return result;
}

function prd01InstanceColors(colors: readonly AuraColor[] | undefined, count: number): Float32Array | undefined {
  if (colors === undefined || prd01ModelMatrixCache === null) return createProductionInstanceColors(colors, count);
  const fp = instanceColorFp(colors);
  const hit = prd01InstanceColorCache.get(colors);
  if (hit && hit.fp === fp && hit.count === count) return hit.result;
  const result = createProductionInstanceColors(colors, count);
  prd01InstanceColorCache.set(colors, { fp, count, result });
  return result;
}

function prd01ModelInstanceTransforms(transforms: readonly AuraTransformSpec[], node: AuraModelNode, bounds: { readonly min: AuraVec3; readonly max: AuraVec3 }, time: number): Float32Array {
  if (prd01ModelMatrixCache === null || node.animation !== undefined) {
    return createProductionModelInstanceTransforms(transforms, node, bounds, time);
  }
  const fp = instanceTransformFp(transforms);
  const hit = prd01ModelInstanceCache.get(transforms);
  if (hit && hit.fp === fp && hit.node === node
    && hit.bounds[0] === bounds.min[0] && hit.bounds[1] === bounds.min[1] && hit.bounds[2] === bounds.min[2]
    && hit.bounds[3] === bounds.max[0] && hit.bounds[4] === bounds.max[1] && hit.bounds[5] === bounds.max[2]) {
    return hit.result;
  }
  const result = createProductionModelInstanceTransforms(transforms, node, bounds, time);
  prd01ModelInstanceCache.set(transforms, {
    fp,
    node,
    bounds: Float64Array.of(bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0], bounds.max[1], bounds.max[2]),
    result
  });
  return result;
}

export function createProductionRuntimeRendererInput(
  snapshot: AuraSceneSnapshot,
  canvas: HTMLCanvasElement,
  actorEntries: readonly ProductionRuntimeActorEntry[],
  primitiveEntries: readonly ProductionRuntimePrimitiveEntry[],
  time: number,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  runtimeWarnings: Set<string>,
  environmentLighting: EnvironmentLightingOptions,
  collectedLights: readonly CollectedLight[],
  // T4.1 (PRD-15): C-36 degrade handler for the flag-on path. Undefined under
  // flag-off keeps the legacy runtimeWarnings text byte-identical.
  degrade?: (d: Omit<AuraDegradation, "frame">) => void
): ProductionRendererInput {
  const compatibility = getRootRenderSource(canvas);
  const attachedItems: readonly RenderItem[] = compatibility ? [...(compatibility.source.collectRenderItems?.() ?? compatibility.source.renderItems ?? [])] : [];
  const items: RenderItem[] = [...attachedItems];
  prd01ModelMatrixCache?.beginFrame();
  const viewProjectionMatrix = createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
  const cameraPosition = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes).eye;
  for (const [actorIndex, entry] of actorEntries.entries()) {
    let currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
    let currentNode = currentState.node;
    if (currentNode.visible === false) continue;
    const actorBounds = productionActorModelBounds(currentNode.asset, entry.actor);
    const actorNormalize = shouldNormalizeModelNode(currentNode);
    let modelMatrix = [...(prd01ModelMatrixCache?.modelMatrix(currentNode, actorBounds, actorNormalize, time) ?? createModelMatrix(currentNode, actorBounds, actorNormalize, time))];
    // The foot-planting post-pass solves in the same world space this matrix draws into;
    // refresh its matrix before the clip plays so the solve uses this frame, not the last.
    applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
    if (currentState.animationPose) {
      try {
        entry.actor.applyRetargetedPose(currentState.animationPose, currentState.animationPoseTime ?? time);
        entry.rootMotionCursors = undefined;
      } catch (error) {
        if (degrade) degrade({ code: "pose-apply-failed", nodeId: entry.actor.id, message: `Typed GLB actor "${entry.actor.id}" failed to apply bound pose: ${productionRenderErrorMessage(error)}`, cause: error });
        else runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply bound pose: ${productionRenderErrorMessage(error)}`);
      }
    } else applyProductionActorAnimation(entry, currentNode, currentState.animationBinding, time, runtimeWarnings, modelMatrix, () => {
      currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
      currentNode = currentState.node;
      const actorBoundsRefresh = productionActorModelBounds(currentNode.asset, entry.actor);
      const actorNormalizeRefresh = shouldNormalizeModelNode(currentNode);
      modelMatrix = [...(prd01ModelMatrixCache?.modelMatrix(currentNode, actorBoundsRefresh, actorNormalizeRefresh, time) ?? createModelMatrix(currentNode, actorBoundsRefresh, actorNormalizeRefresh, time))];
      applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
    }, runtimeNodes);
    applyProductionActorMorphTargets(entry, currentState.morphTargets, runtimeWarnings, degrade);
    // Wrinkle detail (E1 face-rig demo): resolve morph weights through the model's hook.
    // Absent hook (or empty weights) resolves to 0 = today's rendering exactly.
    const wrinkleStrength = currentNode.wrinkle
      ? resolveWrinkleMapStrength(currentState.morphTargets ?? {}, currentNode.wrinkle)
      : undefined;
    const actorItems = entry.actor.collectRenderItems({
      modelMatrix,
      ...(wrinkleStrength === undefined ? {} : { wrinkleStrength })
    });
    // P2 (muse3jsparity-PRD): model instances attach exactly like primitive
    // nodes. Skinned actors cannot instance (D1 matrix) — warn once and draw
    // single instead of silently dropping copies.
    const modelInstances = currentNode.instances;
    let modelInstanceAttach: { readonly instanceTransforms?: Float32Array; readonly instanceColors?: Float32Array } = {};
    if (modelInstances && modelInstances.length > 0) {
      if (actorItems.some((item) => item.skinning)) {
        warnOnInstancingFallback({
          material: currentNode.name ?? currentNode.asset.id,
          requestedInstances: modelInstances.length,
          drawnBatches: Math.max(1, actorItems.length),
          reason: "skinned-palette-overflow-cpu-fallback",
          onWarning: (message) => runtimeWarnings.add(message)
        });
      } else {
        modelInstanceAttach = {
          instanceTransforms: prd01ModelInstanceTransforms(modelInstances, currentNode, productionActorModelBounds(currentNode.asset, entry.actor), time),
          ...(currentNode.instanceColors
            ? { instanceColors: prd01InstanceColors(currentNode.instanceColors, modelInstances.length) }
            : {})
        };
      }
    }
    if (currentNode.instancedModelWarning) runtimeWarnings.add(currentNode.instancedModelWarning);
    // A GLB mesh has its own authored local/world transform. Native instance
    // transforms must apply the complete normalized node placement BEFORE that
    // mesh transform, exactly like an individually mounted actor. The previous
    // base(actorRoot * mesh) * instance(actorRoot) order normalized twice and
    // rotated/scaled the instance translations in the mesh's coordinate system.
    const localActorItems = modelInstanceAttach.instanceTransforms
      ? entry.actor.collectRenderItems({ modelMatrix: identityMat4(), ...(wrinkleStrength === undefined ? {} : { wrinkleStrength }) })
      : undefined;
    items.push(...actorItems.map((item, itemIndex) => {
      const nativeMatrices = modelInstanceAttach.instanceTransforms;
      const localItem = localActorItems?.[itemIndex];
      if (nativeMatrices && !localItem) throw new Error("Instanced GLB mesh collection changed within one frame");
      return { ...item, label: `actor-${actorIndex}:mesh-${itemIndex}:${item.label ?? "mesh"}`, castShadow: currentNode.castShadow, ...modelInstanceAttach,
        ...(nativeMatrices && localItem ? {
          modelMatrix: identityMat4(),
          instanceTransforms: composeModelInstanceMatrices(nativeMatrices, localItem.modelMatrix ?? identityMat4())
        } : {}) };
    }));
    attachProductionActorEvidence(currentNode, entry.actor, actorItems, runtimeNodes);
  }
  // G1 SDF occlusion test, built once per frame only when SDF quads exist
  // (same cost argument as WS-2.7: one bbox per node, negligible beside render).
  const sdfEntries = primitiveEntries.filter((entry) =>
    entry.resources.some((resource) => resource.sdfText !== null));
  const sdfOcclusionTest = sdfEntries.length > 0
    ? createSceneLabelOcclusionTest(snapshot, cameraPosition, runtimeNodes)
    : undefined;
  for (const [primitiveIndex, entry] of primitiveEntries.entries()) {
    const currentState = resolveProductionPrimitiveRuntimeState(entry, runtimeNodes);
    if (!currentState.visible) continue;
    const resource = selectProductionPrimitiveResource(entry, currentState.node, cameraPosition, getRootPerformanceQuality(canvas)?.lodBias ?? 1);
    if (resource.sdfText && resource.texturedMaterial) {
      // G1 per-frame SDF opacity: LOD fade from the live camera distance
      // times the scene occlusion policy, written to the quad material.
      // Occlusion "hide" skips submission (no pixels, no backing claim).
      const position = currentState.node.position ?? [0, 0, 0];
      const distance = Math.hypot(
        cameraPosition[0] - position[0], cameraPosition[1] - position[1], cameraPosition[2] - position[2]);
      const frame = resolveSdfTextFrameOpacity({
        distance,
        ...(resource.sdfText.lodFadeNear === undefined ? {} : { lodFadeNear: resource.sdfText.lodFadeNear }),
        ...(resource.sdfText.lodFadeFar === undefined ? {} : { lodFadeFar: resource.sdfText.lodFadeFar }),
        occluded: sdfOcclusionTest?.(position) ?? false,
        occlusionPolicy: resource.sdfText.occlusionPolicy
      });
      resource.sdfText.lastOpacity = frame.opacity;
      resource.sdfText.lastVisible = frame.visible;
      resource.sdfText.lastSubmitted = frame.visible;
      if (!frame.visible) continue;
      const base = resource.texturedMaterial.getParameter("baseColor");
      const rgb = Array.isArray(base) && base.length >= 3
        ? [base[0] ?? 1, base[1] ?? 1, base[2] ?? 1]
        : [1, 1, 1];
      resource.texturedMaterial.setParameter("baseColor", [rgb[0], rgb[1], rgb[2], frame.opacity]);
    }
    items.push({
      geometry: resource.geometry,
      material: resource.texturedMaterial ?? resource.material,
      modelMatrix: prd01ModelMatrixCache?.modelMatrix(currentState.node, resource.bounds, false, time) ?? createModelMatrix(currentState.node, resource.bounds, false, time),
      label: `primitive-${primitiveIndex}:${resource.name}:${currentState.node.name ?? currentState.node.primitive}`,
      castShadow: currentState.node.castShadow,
      includeInAutoFrame: false,
      ...(currentState.node.instances ? { instanceTransforms: prd01InstanceTransforms(currentState.node.instances, currentState.node), instanceColors: prd01InstanceColors(currentState.node.instanceColors, currentState.node.instances.length) } : {})
    });
  }
  const unsupportedTemporal = items.find(item => {
    const base = item.material && "baseMaterial" in item.material ? item.material.baseMaterial : item.material;
    return Boolean(item.skinning || item.morphTargets?.length || item.instanceTransforms?.length || item.geometry.topology !== "triangles" || base?.renderState.blend);
  });
  const temporalRequested = groups.flatten(snapshot.nodes).some(node => node.kind === "effect" && (node.effect === "motion-blur" || (node.effect === "anti-alias" && node.mode === "taa")));
  for (const warning of runtimeWarnings) if (warning.startsWith("TEMPORAL_UNSUPPORTED_GEOMETRY:")) runtimeWarnings.delete(warning);
  if (temporalRequested && unsupportedTemporal) runtimeWarnings.add(`TEMPORAL_UNSUPPORTED_GEOMETRY: ${unsupportedTemporal.label}; requires opaque rigid noninstanced triangles`);
  const source: RenderSource = {
    ...(compatibility?.source ?? {}),
    collectRenderItems: () => items,
    cameraPolicy: compatibility?.source.cameraPolicy ?? "require",
    staticBatching: !temporalRequested,
    frustumCulling: true,
    collectedLights: [...collectedLights, ...(compatibility?.source.collectedLights ?? [])],
    environmentLighting: compatibility?.source.environmentLighting ?? environmentLighting,
    // The production runtime owns the pixel-backed HDR target and pass chain for
    // routes that request effects. The diagnostics are device-observed, so a
    // compositor failure is reported as fallback rather than claimed as a pass.
    // CCR-03-1: `attach.canvas` keys the submitted record/context stores so a
    // second app's compile never overwrites the first's post diagnostics.
    postprocess: compatibility?.source.postprocess ?? createProductionRuntimePostprocess(snapshot, collectedLights, canvas.width, canvas.height, !unsupportedTemporal, { canvas }),
    shadow: { ...createProductionRuntimeShadowOptions(snapshot, collectedLights), ...(getRootPerformanceQuality(canvas) ? { size: getRootPerformanceQuality(canvas)!.shadowSize } : {}) },
    environmentFog: compatibility?.source.environmentFog ?? createProductionRuntimeEnvironmentFog(snapshot, collectedLights, canvas.width, canvas.height),
    ...(compatibility?.source.cameraPolicy === "auto-frame" ? {} : { cameraPosition })
  };
  const cameraLike: CameraLike = { viewProjectionMatrix };
  return {
    source,
    ...(compatibility?.source.cameraPolicy === "auto-frame" ? {} : { camera: cameraLike }),
    metadata: includeRootSourceMetadata(createProductionRuntimeMetadata(actorEntries, primitiveEntries), attachedItems)
  };
}
