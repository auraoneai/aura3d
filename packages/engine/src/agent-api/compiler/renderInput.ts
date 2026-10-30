// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraTransformSpec, AuraVec3, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry } from "../nodes/types.js";
import type { AuraDegradation } from "../../contracts/compiler.js";
import { geometry } from "../nodes/geometry.js";
import { groups } from "../nodes/groups.js";
import { primitive } from "../nodes/primitives.js";
import { createCameraMatrices, createModelMatrix, shouldNormalizeModelNode } from "../sceneMath.js";
import { applyProductionActorFootPlanting, applyProductionActorMorphTargets, attachProductionActorEvidence, createProductionRuntimeMetadata, productionActorModelBounds, resolveProductionActorRuntimeState } from "./actors.js";
import { resolveCameraFrame } from "./camera.js";
import { createSceneLabelOcclusionTest } from "./labels.js";
import { createAssetProvenance, formatSkippedInlineModelWarning } from "../diagnostics.js";
import { isRenderableModelNode, productionRenderErrorMessage } from "./observations.js";
import { composeModelInstanceMatrices, getRootPerformanceQuality, getRootRenderSource, includeRootSourceMetadata } from "../RootRuntimeSupport.js";
import { resolveSdfTextFrameOpacity, resolveWrinkleMapStrength, warnOnInstancingFallback, type CameraLike, type CollectedLight, type EnvironmentLightingOptions, type ProductionRendererInput, type RenderItem, type RenderSource } from "@aura3d/rendering";
import { identityMat4 } from "@aura3d/scene/math";
import { applyProductionActorAnimation, applySpecRootMotionTransform } from "./animation.js";
import { resolveActorBoneAttachments } from "../app/actorAnimationHandle.js";
import { createProductionRuntimeEnvironmentFog } from "./fog.js";
import { lodLevelVisible } from "../lodMarkers.js";
import { createProductionRuntimePostprocess } from "./postprocess.js";
import { isDirectRenderPath } from "../app/renderPath.js";
import { authoredPostContextFor } from "../postBridge.js";
import { createProductionInstanceColors, createProductionInstanceTransforms, createProductionInstanceTransformsFromMatrices, createProductionModelInstanceTransforms, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "./primitives.js";
import { createProductionRuntimeShadowOptions } from "./shadows.js";
import { applyNodeMaterialExtras, setMaterialInstanceColorTarget } from "../../production-runtime/ModelMaterialOverrides.js";
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

/*
 * Instanced primitives: `createProductionInstanceTransforms` already folds the
 * node `size` into every instance matrix (T_i·R_i·S(scale_i ⊙ size)), and the
 * renderer draws `modelMatrix · instanceMatrix`. The node model matrix must
 * therefore carry the node TRS only — applying S(size) there too scaled every
 * instance translation by `size` (a 10,000-box field of 0.3-unit boxes
 * collapsed to a 0.3× central cluster) and shrank each box a second time.
 * three.js equivalent: mesh.matrixWorld · instanceMatrix · geometry(size).
 * The size-less node is memoized per node so the static matrix cache (keyed
 * on node identity) still hits.
 */
const instancedModelNodes = new WeakMap<AuraPrimitiveNode, AuraPrimitiveNode>();

export function instancedPrimitiveModelNode(node: AuraPrimitiveNode): AuraPrimitiveNode {
  if (!node.instances || node.size === undefined) return node;
  let sizeless = instancedModelNodes.get(node);
  if (sizeless === undefined) {
    const { size: _size, ...rest } = node;
    sizeless = rest as AuraPrimitiveNode;
    instancedModelNodes.set(node, sizeless);
  }
  return sizeless;
}

/** PRD-03 Phase 4: measured per-canvas frame delta (seconds) for the §8.8
 * shutter scale — `time` is the seconds timestamp the caller passes. */
const productionFrameTimes = new WeakMap<HTMLCanvasElement, number>();

function instanceTransformFp(transforms: readonly AuraTransformSpec[]): number {
  let h = transforms.length;
  for (let i = 0; i < transforms.length; i += 1) {
    const t = transforms[i]!;
    const w = i + 1;
    const p = t.position;
    if (p) h += w * (p[0] * 3.17 + p[1] * 5.23 + p[2] * 7.31);
    const r = t.rotation;
    if (r) h += w * (r[0] * 19.1 + r[1] * 23.3 + r[2] * 29.7);
    const s = t.scale;
    if (typeof s === "number") h += w * s * 11.3;
    else if (s) h += w * (s[0] * 11.3 + s[1] * 13.7 + s[2] * 17.9);
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

/** Dense matrices (handle.setInstanceMatrices) are node-owned and rewritten in place, so only the output buffer is cached: refolded every frame (a linear multiply), reallocated only when the count changes. */
const denseInstanceOut = new WeakMap<Float32Array, Float32Array>();
/** Spec colors reused under a dense matrix write whose count is below capacity. */
const denseSpecColorCache = new WeakMap<readonly AuraColor[], { count: number; result: Float32Array | undefined }>();

type DenseInstanceNode = AuraPrimitiveNode & { readonly instanceMatrices?: Float32Array; readonly instanceRgba?: Float32Array };

function denseInstanceMatrices(node: AuraPrimitiveNode): Float32Array | undefined {
  return (node as DenseInstanceNode).instanceMatrices;
}

function prd01DenseInstanceTransforms(matrices: Float32Array, node: AuraPrimitiveNode): Float32Array {
  const out = createProductionInstanceTransformsFromMatrices(matrices, node, denseInstanceOut.get(matrices));
  denseInstanceOut.set(matrices, out);
  return out;
}

function prd01DenseInstanceColors(node: AuraPrimitiveNode, count: number): Float32Array | undefined {
  const rgba = (node as DenseInstanceNode).instanceRgba;
  if (rgba !== undefined && rgba.length === count * 4) return rgba;
  const specColors = node.instanceColors;
  if (specColors === undefined) return undefined;
  const hit = denseSpecColorCache.get(specColors);
  if (hit && hit.count === count) return hit.result;
  const result = createProductionInstanceColors(specColors.slice(0, count), count);
  denseSpecColorCache.set(specColors, { count, result });
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
  const cameraMatrices = createCameraMatrices(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
  const viewProjectionMatrix = cameraMatrices.viewProjection;
  const cameraPosition = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes).eye;
  for (const node of groups.flatten(snapshot.nodes)) {
    if (isRenderableModelNode(node) && createAssetProvenance(node.asset).source === "inline-definition") {
      runtimeWarnings.add(formatSkippedInlineModelWarning(node));
    }
  }
  for (const [actorIndex, entry] of actorEntries.entries()) {
    let currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
    let currentNode = currentState.node;
    // threejs-parity L7/SG-11: `groups.lod` — deselected levels skip this frame.
    if (currentNode.visible === false || !lodLevelVisible(currentNode, cameraPosition)) continue;
    if (currentNode.instances !== undefined && currentNode.instances.length === 0) {
      runtimeWarnings.add(`INSTANCES_EMPTY: instances.model "${currentNode.name ?? currentNode.asset.id}" has no instances this frame; nothing is drawn.`);
      continue;
    }
    const actorBounds = productionActorModelBounds(currentNode.asset, entry.actor);
    const actorNormalize = shouldNormalizeModelNode(currentNode);
    let modelMatrix = [...(prd01ModelMatrixCache?.modelMatrix(currentNode, actorBounds, actorNormalize, time) ?? createModelMatrix(currentNode, actorBounds, actorNormalize, time))];
    // T3.7 — spec-level root motion on a node without a runtime handle folds its
    // accumulated offset/yaw into the model matrix (no-op when unset).
    applySpecRootMotionTransform(entry, modelMatrix);
    // The foot-planting post-pass solves in the same world space this matrix draws into;
    // refresh its matrix before the clip plays so the solve uses this frame, not the last.
    applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
    if (currentState.animationPose) {
      // Overlay poses evaluate the clip first and write their bones on top, so
      // omitted bones keep the clip's motion (route pose after clip evaluation
      // — the structural fix for poses being overwritten by later clip eval).
      const overlay = currentState.animationPose.mode === "overlay";
      if (overlay) {
        applyProductionActorAnimation(entry, currentNode, currentState.animationBinding, time, runtimeWarnings, modelMatrix, () => {
          currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
          currentNode = currentState.node;
          const actorBoundsRefresh = productionActorModelBounds(currentNode.asset, entry.actor);
          const actorNormalizeRefresh = shouldNormalizeModelNode(currentNode);
          modelMatrix = [...(prd01ModelMatrixCache?.modelMatrix(currentNode, actorBoundsRefresh, actorNormalizeRefresh, time) ?? createModelMatrix(currentNode, actorBoundsRefresh, actorNormalizeRefresh, time))];
          applySpecRootMotionTransform(entry, modelMatrix);
          applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
        }, runtimeNodes);
      }
      try {
        entry.actor.applyRetargetedPose(currentState.animationPose, currentState.animationPoseTime ?? time);
        if (!overlay) entry.rootMotionCursors = undefined;
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
      applySpecRootMotionTransform(entry, modelMatrix);
      applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings, degrade);
    }, runtimeNodes);
    // Bone attachments resolve against the just-applied pose: current-frame
    // bone world matrices, before this or any later entry collects render items.
    resolveActorBoneAttachments(entry.actor.id, modelMatrix, runtimeNodes);
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
        // GU47 E-D: what the instance colours multiply (`instances.model({ instanceColorTarget })`).
        for (const item of actorItems) {
          const itemMaterial = item.material;
          if (itemMaterial) setMaterialInstanceColorTarget("baseMaterial" in itemMaterial ? itemMaterial.baseMaterial : itemMaterial, currentNode.instanceColorTarget);
        }
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
      return { ...item, label: `actor-${actorIndex}:mesh-${itemIndex}:${item.label ?? "mesh"}`, castShadow: currentNode.castShadow,
        // threejs-parity L7/SG-09: spec parity fields (see primitive path below).
        renderOrder: currentNode.renderOrder, frustumCulled: currentNode.frustumCulled,
        layerMask: currentNode.layers, userData: currentNode.userData,
        ...modelInstanceAttach,
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
    // threejs-parity L7/SG-11: `groups.lod` — deselected levels skip this frame.
    if (!currentState.visible || !lodLevelVisible(currentState.node, cameraPosition)) continue;
    const denseMatrices = currentState.node.instances !== undefined ? denseInstanceMatrices(currentState.node) : undefined;
    if (currentState.node.instances !== undefined && (currentState.node.instances.length === 0 || denseMatrices?.length === 0)) {
      runtimeWarnings.add(`INSTANCES_EMPTY: instances.${currentState.node.primitive} "${currentState.node.name ?? "unnamed"}" has no instances this frame; nothing is drawn.`);
      continue;
    }
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
    const drawMaterial = resource.texturedMaterial ?? resource.material;
    // GU47 E-D: the spec's `rim` and the node's `instanceColorTarget` reach the material this draw uses (writes on change only).
    applyNodeMaterialExtras(drawMaterial, currentState.node.material, currentState.node.instanceColorTarget);
    items.push({
      geometry: resource.geometry,
      ...(resource.shadowGeometry ? { shadowGeometry: resource.shadowGeometry } : {}),
      material: drawMaterial,
      modelMatrix: prd01ModelMatrixCache?.modelMatrix(instancedPrimitiveModelNode(currentState.node), resource.bounds, false, time) ?? createModelMatrix(instancedPrimitiveModelNode(currentState.node), resource.bounds, false, time),
      label: `primitive-${primitiveIndex}:${resource.name}:${currentState.node.name ?? currentState.node.primitive}`,
      castShadow: currentState.node.castShadow,
      includeInAutoFrame: false,
      // threejs-parity L7/SG-09: spec parity fields ride the item so layer
      // gating, frustumCulled=false, and renderOrder sorting reach the draw.
      renderOrder: currentState.node.renderOrder,
      frustumCulled: currentState.node.frustumCulled,
      layerMask: currentState.node.layers,
      userData: currentState.node.userData,
      // L7/SC-01: `material.*({ envMap: { cubeCamera } })` → environmentCube.
      ...(currentState.node.material?.envMap?.cubeCamera
        ? { cubeCameraEnvMap: currentState.node.material.envMap.cubeCamera }
        : {}),
      ...(denseMatrices && currentState.node.instances
        ? (() => {
            const dense = prd01DenseInstanceColors(currentState.node, denseMatrices.length / 16);
            return { instanceTransforms: prd01DenseInstanceTransforms(denseMatrices, currentState.node), ...(dense ? { instanceColors: dense } : {}) };
          })()
        : currentState.node.instances ? { instanceTransforms: prd01InstanceTransforms(currentState.node.instances, currentState.node), instanceColors: prd01InstanceColors(currentState.node.instanceColors, currentState.node.instances.length) } : {})
    });
  }
  const unsupportedTemporal = items.find(item => {
    const base = item.material && "baseMaterial" in item.material ? item.material.baseMaterial : item.material;
    return Boolean(item.skinning || item.morphTargets?.length || item.instanceTransforms?.length || item.geometry.topology !== "triangles" || base?.renderState.blend);
  });
  const temporalRequested = groups.flatten(snapshot.nodes).some(node => node.kind === "effect" && (node.effect === "motion-blur" || (node.effect === "anti-alias" && node.mode === "taa")));
  for (const warning of runtimeWarnings) if (warning.startsWith("TEMPORAL_UNSUPPORTED_GEOMETRY:")) runtimeWarnings.delete(warning);
  if (temporalRequested && unsupportedTemporal) runtimeWarnings.add(`TEMPORAL_UNSUPPORTED_GEOMETRY: ${unsupportedTemporal.label}; requires opaque rigid noninstanced triangles`);
  // PRD-03 Phase 4: under flag-on a compatibility-injected postprocess chain is
  // a legacy catalog — warn and drop it; the v2 builder is the single chain.
  const injectedPostprocess = compatibility?.source.postprocess;
  const postFlagOn = authoredPostContextFor(canvas)?.flags.post === true;
  if (injectedPostprocess && postFlagOn) {
    runtimeWarnings.add("POST_LEGACY_POSTPROCESS: compatibility source.postprocess dropped on the v2 post chain (POST_POSTPROCESSES_MIGRATED)");
  }
  const buildPostprocess = () => {
    const prevTime = productionFrameTimes.get(canvas);
    const frameTime = prevTime === undefined ? 1 / 60 : Math.min(1, Math.max(0, time - prevTime));
    productionFrameTimes.set(canvas, time);
    return createProductionRuntimePostprocess(snapshot, collectedLights, canvas.width, canvas.height, !unsupportedTemporal, { canvas, frameTime });
  };
  // Direct path (quality "auto", no authored post/HDR/transmission): no postprocess object at all, so the
  // renderer draws straight into the canvas instead of an HDR target plus a tone-mapping present pass.
  const builtPostprocess = isDirectRenderPath(canvas) ? undefined : (postFlagOn ? undefined : injectedPostprocess) ?? buildPostprocess();
  const source: RenderSource = {
    ...(compatibility?.source ?? {}),
    collectRenderItems: () => items,
    cameraPolicy: compatibility?.source.cameraPolicy ?? "require",
    // Flag-on the resolved AA (tier/auto → TAA) decides batching too — a scene
    // whose postprocess carries a temporal bag can't static-batch (velocity).
    staticBatching: postFlagOn
      ? (typeof builtPostprocess === "object" && builtPostprocess !== null ? !builtPostprocess.temporal : true)
      : !temporalRequested,
    frustumCulling: true,
    collectedLights: [...collectedLights, ...(compatibility?.source.collectedLights ?? [])],
    environmentLighting: compatibility?.source.environmentLighting ?? environmentLighting,
    // The production runtime owns the pixel-backed HDR target and pass chain for
    // routes that request effects. The diagnostics are device-observed, so a
    // compositor failure is reported as fallback rather than claimed as a pass.
    // CCR-03-1: `attach.canvas` keys the submitted record/context stores so a
    // second app's compile never overwrites the first's post diagnostics.
    postprocess: builtPostprocess,
    shadow: { ...createProductionRuntimeShadowOptions(snapshot, collectedLights), ...(getRootPerformanceQuality(canvas) ? { size: getRootPerformanceQuality(canvas)!.shadowSize } : {}) },
    environmentFog: compatibility?.source.environmentFog ?? createProductionRuntimeEnvironmentFog(snapshot, collectedLights, canvas.width, canvas.height),
    ...(compatibility?.source.cameraPolicy === "auto-frame" ? {} : { cameraPosition })
  };
  const cameraLike: CameraLike = { viewProjectionMatrix, shaderViewMatrix: cameraMatrices.view, shaderProjectionMatrix: cameraMatrices.projection, ...(snapshot.camera.layers !== undefined ? { layerMask: snapshot.camera.layers >>> 0 } : {}) };
  return {
    source,
    ...(compatibility?.source.cameraPolicy === "auto-frame" ? {} : { camera: cameraLike }),
    metadata: includeRootSourceMetadata(createProductionRuntimeMetadata(actorEntries, primitiveEntries), attachedItems)
  };
}
