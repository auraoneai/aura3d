// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraRuntimeNodeRegistry, AuraSceneSnapshot, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry } from "../index.js";
import { applyProductionActorFootPlanting, applyProductionActorMorphTargets, attachProductionActorEvidence, createModelMatrix, createProductionRuntimeMetadata, createSceneLabelOcclusionTest, createViewProjection, geometry, groups, primitive, productionActorModelBounds, productionRenderErrorMessage, resolveCameraFrame, resolveProductionActorRuntimeState, shouldNormalizeModelNode } from "../index.js";
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

export function createProductionRuntimeRendererInput(
  snapshot: AuraSceneSnapshot,
  canvas: HTMLCanvasElement,
  actorEntries: readonly ProductionRuntimeActorEntry[],
  primitiveEntries: readonly ProductionRuntimePrimitiveEntry[],
  time: number,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  runtimeWarnings: Set<string>,
  environmentLighting: EnvironmentLightingOptions,
  collectedLights: readonly CollectedLight[]
): ProductionRendererInput {
  const compatibility = getRootRenderSource(canvas);
  const attachedItems: readonly RenderItem[] = compatibility ? [...(compatibility.source.collectRenderItems?.() ?? compatibility.source.renderItems ?? [])] : [];
  const items: RenderItem[] = [...attachedItems];
  const viewProjectionMatrix = createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time, runtimeNodes);
  const cameraPosition = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes).eye;
  for (const [actorIndex, entry] of actorEntries.entries()) {
    let currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
    let currentNode = currentState.node;
    if (currentNode.visible === false) continue;
    let modelMatrix = [...createModelMatrix(
      currentNode,
      productionActorModelBounds(currentNode.asset, entry.actor),
      shouldNormalizeModelNode(currentNode),
      time
    )];
    // The foot-planting post-pass solves in the same world space this matrix draws into;
    // refresh its matrix before the clip plays so the solve uses this frame, not the last.
    applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings);
    if (currentState.animationPose) {
      try {
        entry.actor.applyRetargetedPose(currentState.animationPose, currentState.animationPoseTime ?? time);
        entry.rootMotionCursors = undefined;
      } catch (error) {
        runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply bound pose: ${productionRenderErrorMessage(error)}`);
      }
    } else applyProductionActorAnimation(entry, currentNode, currentState.animationBinding, time, runtimeWarnings, modelMatrix, () => {
      currentState = resolveProductionActorRuntimeState(entry, runtimeNodes);
      currentNode = currentState.node;
      modelMatrix = [...createModelMatrix(currentNode, productionActorModelBounds(currentNode.asset, entry.actor), shouldNormalizeModelNode(currentNode), time)];
      applyProductionActorFootPlanting(entry, currentState.animationBinding, modelMatrix, runtimeWarnings);
    });
    applyProductionActorMorphTargets(entry, currentState.morphTargets, runtimeWarnings);
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
          instanceTransforms: createProductionModelInstanceTransforms(modelInstances, currentNode, productionActorModelBounds(currentNode.asset, entry.actor), time),
          ...(currentNode.instanceColors
            ? { instanceColors: createProductionInstanceColors(currentNode.instanceColors, modelInstances.length) }
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
      modelMatrix: createModelMatrix(currentState.node, resource.bounds, false, time),
      label: `primitive-${primitiveIndex}:${resource.name}:${currentState.node.name ?? currentState.node.primitive}`,
      castShadow: currentState.node.castShadow,
      includeInAutoFrame: false,
      ...(currentState.node.instances ? { instanceTransforms: createProductionInstanceTransforms(currentState.node.instances, currentState.node), instanceColors: createProductionInstanceColors(currentState.node.instanceColors, currentState.node.instances.length) } : {})
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
