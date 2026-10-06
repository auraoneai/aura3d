// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectType, AuraEffectNode, AuraEnvironmentNode, AuraSceneCategory, AuraRendererColorManagementPreset, AuraSceneExposurePreset, AuraRendererQualityPreset, AuraRendererQualityProfileId, AuraRendererQualityProfile, AuraCreateAppRendererOptions, AuraRendererDiagnosticReport, AuraRendererRuntimeObservation, AuraSceneSnapshot } from "../nodes/types.js";
import { AuraSceneBuilder, scene } from "../nodes/scene.js";
import { analyzeProductionBridgeEligibility, normalizeSceneSnapshot } from "../compiler/observations.js";
import { city } from "../nodes/city.js";
import { colorToClearColor } from "../compiler/color.js";
import { createAuraApp } from "../app/createAuraApp.js";
import { createMaterialCapabilityDiagnostics } from "../nodes/materialTools.js";
import { effects } from "../nodes/effects.composite.js";
import { flattenSceneSnapshot } from "../index.js";
import { game } from "../nodes/game/index.js";
import { groups } from "../nodes/groups.js";
import { labels } from "../nodes/labels.js";
import { material } from "../nodes/material.js";
import { neon } from "../nodes/neon.js";
import { normalizeCreateAppRendererOptions, normalizeTextureBudgetBytes, rendererQualityPresets, rendererQualityProfiles, resolveRendererQualityProfile } from "../app/rendererOptions.js";
import { physics } from "../nodes/physics.js";
import { primitive } from "../nodes/primitives.js";
import { product } from "../nodes/product.js";
import { rendererColorManagementPreset, sceneExposurePresets } from "../app/colorManagement.js";
import { shadows } from "../nodes/shadows.js";
import { solar } from "../nodes/solar.js";
import { text3D } from "../nodes/text3d.js";

export const renderer = {
  colorManagementPreset: (): AuraRendererColorManagementPreset => rendererColorManagementPreset,
  exposurePresets: (): Readonly<Record<AuraSceneCategory, AuraSceneExposurePreset>> => sceneExposurePresets,
  exposureFor: (category: AuraSceneCategory): AuraSceneExposurePreset => sceneExposurePresets[category],
  qualityPresets: (): Readonly<Record<"interactive" | "screenshot", AuraRendererQualityPreset>> => rendererQualityPresets,
  qualityProfiles: (): Readonly<Record<AuraRendererQualityProfileId, AuraRendererQualityProfile>> => rendererQualityProfiles,
  qualityProfile: (id: AuraRendererQualityProfileId): AuraRendererQualityProfile => resolveRendererQualityProfile(id),
  screenshotQuality: (): AuraRendererQualityPreset => rendererQualityPresets.screenshot,
  diagnostics: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, options?: AuraCreateAppRendererOptions): AuraRendererDiagnosticReport =>
    createRendererDiagnosticReport(flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue)), undefined, options)
} as const;

export function createRendererDiagnosticReport(
  snapshot: AuraSceneSnapshot,
  runtime?: AuraRendererRuntimeObservation,
  rendererOptions?: AuraCreateAppRendererOptions
): AuraRendererDiagnosticReport {
  const flattened = groups.flatten(snapshot.nodes);
  const names = flattened.map((node) => "name" in node ? node.name?.toLowerCase() ?? "" : "");
  const rendererSelection = normalizeCreateAppRendererOptions(rendererOptions);
  const productionEligibility = analyzeProductionBridgeEligibility(flattened);
  const sceneCategory = resolveRendererSceneCategory(snapshot, names);
  const exposure = sceneExposurePresets[sceneCategory];
  const bloom = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "bloom");
  const fog = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && (node.effect === "fog" || node.effect === "volumetric-fog"));
  const environment = flattened.find((node): node is AuraEnvironmentNode => node.kind === "environment");
  const contactShadows = names.filter((name) => name.includes("contact shadow") || name.includes("footprint") || name.includes("glow pool")).length;
  const ambientOcclusion = flattened.some((node) => node.kind === "effect" && node.effect === "ambient-occlusion");
  const contactOcclusion = flattened.some((node) => node.kind === "effect" && node.effect === "contact-occlusion") || contactShadows > 0;
  // Authored temporal intent is separate from device-observed execution.
  // Missing submissions remain visible without claiming an unmounted scene rendered.
  const colorGradeNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "color-grade");
  const antiAliasNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "anti-alias");
  const outlineNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "outline");
  const ssrNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "screen-space-reflections");
  const dofNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "depth-of-field");
  const motionBlurNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "motion-blur");
  const flipbookNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "flipbook-sprite");
  const beamNode = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "light-beam");
  const sdfTextRequested = flattened.some((node) => node.kind === "primitive" && node.text3D?.backend === "sdf");
  const fxaaRequested = (antiAliasNode?.mode ?? "fxaa") === "fxaa" && Boolean(antiAliasNode);
  const taaRequested = (antiAliasNode?.mode ?? "fxaa") === "taa";
  const taaWithheld = taaRequested && Boolean(runtime?.mounted) && !(runtime?.postprocess?.actualPasses ?? []).includes("taa");
  const motionBlurWithheld = Boolean(motionBlurNode) && Boolean(runtime?.mounted) && !(runtime?.postprocess?.actualPasses ?? []).includes("motion-blur");
  const runtimePostprocess = runtime?.postprocess;
  const runtimePasses = runtimePostprocess?.actualPasses ?? [];
  const postprocessRequested = Boolean(bloom) || ambientOcclusion || contactOcclusion
    || Boolean(colorGradeNode) || Boolean(antiAliasNode) || Boolean(outlineNode)
    || Boolean(ssrNode) || Boolean(dofNode) || Boolean(motionBlurNode) || runtimePasses.length > 0;
  const requestedPasses = runtimePasses.length > 0
    ? runtimePasses
    : requestedRendererPostProcessPasses(
      Boolean(bloom),
      ambientOcclusion,
      contactOcclusion,
      {
        colorGrade: Boolean(colorGradeNode),
        fxaa: fxaaRequested,
        outline: Boolean(outlineNode),
        ssr: Boolean(ssrNode),
        depthOfField: Boolean(dofNode),
        motionBlurWithheld: Boolean(motionBlurNode),
        taaWithheld: taaRequested
      }
    );
  const runtimeStatus = !postprocessRequested
    ? "disabled"
    : runtime?.mounted
      ? runtimePostprocess?.pixelBacked
        ? "active"
        : "fallback"
      : "not-mounted";
  const warnings: string[] = [];
  if (!environment && (sceneCategory === "product" || sceneCategory === "material")) warnings.push("product/material scene has no explicit IBL environment node");
  if (!contactOcclusion) warnings.push("scene has no contact shadow or contact-occlusion grounding cue");
  if (bloom && (bloom.intensity ?? 0) > 0.95 && bloom.antiBlowout !== true) warnings.push("bloom is high without anti-blowout safeguards");
  if (motionBlurWithheld) warnings.push("TEMPORAL_INPUTS_UNAVAILABLE: motion-blur has no native submission");
  if (flipbookNode) warnings.push("flipbook-sprite is recorded but withheld: root has no native sprite-sheet sampler yet, so no flipbook pass is submitted");
  if (beamNode) warnings.push("light-beam is recorded but withheld: root has no native beam target yet, so no beam pass is submitted");
  // G1: the baked-SDF sampler mounts synchronously on the production bridge.
  // Warn only when the SDF request cannot be pixel-backed (non-production
  // mount, or the sampler fell back to the extruded mesh at runtime).
  if (sdfTextRequested && (!runtime?.mounted || !(runtime.text?.textPixelBacked ?? false))) {
    warnings.push(runtime?.mounted
      ? `text3D sdf backend fell back to the extruded mesh (${runtime.text?.reason ?? "sampler failed"}); textPixelBacked stays false`
      : "text3D sdf backend is recorded but unmounted: the production bridge samples the SDF atlas at mount, so textPixelBacked stays false until render");
  }
  if (taaWithheld) warnings.push("TEMPORAL_INPUTS_UNAVAILABLE: taa has no native submission");
  if (colorGradeNode && (colorGradeNode.exposure ?? 1) !== 1) warnings.push("color-grade exposure is recorded but has no native grade target yet; contrast/saturation execute");
  if (colorGradeNode && (colorGradeNode.shadows !== undefined || colorGradeNode.highlights !== undefined)) warnings.push("color-grade shadows/highlights are recorded but have no native grade target yet; contrast/saturation execute");
  if (colorGradeNode?.lut !== undefined) warnings.push("color-grade lut is recorded but LUT samplers are not bound yet; the lut is ignored");
  if (postprocessRequested && !runtime?.mounted) warnings.push("renderer diagnostics are a scene plan only; call createAuraApp(...).diagnostics() after the first render for pixel-backed pass status");
  if (postprocessRequested && runtime?.mounted && !runtimePostprocess?.pixelBacked) warnings.push("postprocess was requested but the runtime composer did not initialize a pixel-backed pass");
  if (rendererSelection.mode === "production" && !runtime?.mounted && productionEligibility.eligible) {
    warnings.push(`Renderer profile "${rendererSelection.profile.id}" will use the production renderer after createAuraApp mounts; inspect app.diagnostics().renderer.runtime for pixel-backed status.`);
  }
  if (rendererSelection.mode === "production" && !productionEligibility.eligible) {
    warnings.push(`Renderer profile "${rendererSelection.profile.id}" cannot mount this scene on the production renderer: ${productionEligibility.reasons.join("; ")}.`);
  }
  if (rendererSelection.profile.status === "fallback-only") {
    warnings.push(`Renderer profile "${rendererSelection.profile.id}" is a request profile; public claims require route-specific runtime diagnostics and screenshot proof.`);
  }
  if (rendererSelection.profile.id === "experimental-webgpu") {
    warnings.push("Experimental WebGPU profile cannot claim native WebGPU without adapter, backend, dispatch, render, and pixel evidence.");
  }
  warnings.push(...(runtime?.warnings ?? []));
  const environmentStatus = runtime?.environment ?? {
    enabled: Boolean(environment),
    preset: environment?.environment,
    intensity: environment?.intensity,
    evidence: environment
      ? `${environment.environment} IBL requested at intensity ${environment.intensity}`
      : "procedural fallback environment requested only; runtime environment prefilter status is unavailable until render"
  };
  const postprocessEvidence = !postprocessRequested
    ? "no renderer postprocess effects requested"
    : runtimeStatus === "not-mounted"
      ? "postprocess is requested in the scene graph but no runtime composer has mounted yet"
      : runtimePostprocess?.pixelBacked
        ? `runtime initialized pixel-backed pass chain: ${runtimePostprocess.actualPasses.join(", ") || "contact receiver only"}`
        : `runtime fell back without a pixel-backed composer: ${runtimePostprocess?.fallbackPasses.join(", ") || "direct render"}`;
  return {
    kind: "aura-renderer-diagnostics",
    colorManagement: rendererColorManagementPreset,
    rendererMode: rendererSelection.mode,
    fallbackMode: rendererSelection.fallback,
    qualityProfile: rendererSelection.profile,
    sceneCategory,
    exposure,
    toneMapping: "aces-filmic",
    outputColorSpace: "srgb",
    linearWorkflow: true,
    bloom: {
      enabled: Boolean(bloom),
      rendered: runtimePostprocess?.bloomPass ?? false,
      intensity: bloom?.intensity ?? 0,
      threshold: bloom?.threshold ?? 0,
      radius: bloom?.radius ?? 0,
      antiBlowout: bloom?.antiBlowout ?? true,
      ...(bloom?.quality !== undefined ? { quality: bloom.quality } : {})
    },
    shadows: {
      // Never a source-authored `true`. When the runtime is mounted this is the
      // device-observed shadow-map state; when it is not mounted the scene has
      // only requested shadows and nothing has been proven yet.
      enabled: runtime?.mounted ? Boolean(runtime.shadow?.mapSampled) : false,
      requested: runtime?.shadow?.requested ?? false,
      mapRendered: runtime?.shadow?.mapRendered ?? false,
      mapSampled: runtime?.shadow?.mapSampled ?? false,
      mapSize: runtime?.shadow?.mapSize,
      label: runtime?.shadow?.label,
      nativeShadowMapBindings: runtime?.shadow?.nativeShadowMapBindings ?? 0,
      shadowRenderTargetsAllocated: runtime?.shadow?.shadowRenderTargetsAllocated ?? 0,
      observed: runtime?.mounted ? runtime.shadow?.observed ?? null : null,
      contactShadows,
      mapType: "pcf-soft",
      ...(runtime?.shadow?.spot === undefined ? {} : { spot: runtime.shadow.spot })
    },
    occlusion: {
      enabled: ambientOcclusion || contactOcclusion,
      ambientOcclusion,
      contactOcclusion,
      evidence: ambientOcclusion
        ? "ambient occlusion effect node is present"
        : contactOcclusion
          ? "contact shadows/contact-occlusion provide grounding"
          : "no grounding occlusion detected"
    },
    fog: {
      enabled: Boolean(fog),
      density: fog?.density ?? 0,
      // A5: a volumetric-fog node labels "volumetric" because it submits the
      // distinct inscatter pass; plain fog keeps the legacy intensity label.
      preset: fog ? (fog.effect === "volumetric-fog" || (fog.intensity ?? 0) > 0.65 ? "volumetric" : "depth") : "none"
    },
    postprocess: {
      enabled: runtimePostprocess?.pixelBacked ?? false,
      requested: postprocessRequested,
      renderPass: runtimePostprocess?.renderPass ?? false,
      outputPass: runtimePostprocess?.outputPass ?? false,
      bloomPass: runtimePostprocess?.bloomPass ?? false,
      ambientOcclusionPass: runtimePostprocess?.ambientOcclusionPass ?? false,
      contactOcclusionReceiver: runtimePostprocess?.contactOcclusionReceiver ?? false,
      pixelBacked: runtimePostprocess?.pixelBacked ?? false,
      runtimeStatus,
      requestedPasses,
      actualPasses: runtimePostprocess?.actualPasses ?? [],
      fallbackPasses: runtimePostprocess?.fallbackPasses ?? [],
      targetFormat: runtimePostprocess?.targetFormat,
      executionMode: runtimePostprocess?.executionMode ?? "unknown",
      evidence: postprocessEvidence
    },
    runtime: {
      mounted: runtime?.mounted ?? false,
      backend: runtime?.backend ?? "scene-plan",
      postprocessVerified: runtimePostprocess?.pixelBacked ?? false,
      passNames: runtimePostprocess?.actualPasses ?? [],
      warnings: runtime?.warnings ?? [],
      nativeInstancedSubmissions: runtime?.deviceDiagnostics?.nativeInstancedSubmissions ?? 0,
      nativeTemporalPasses: runtime?.deviceDiagnostics?.nativeTemporalPasses ?? 0,
      nativeTemporalBindings: runtime?.deviceDiagnostics?.nativeTemporalBindings ?? 0,
      submittedObjects: runtime?.deviceDiagnostics?.submittedObjects ?? 0,
      visibleObjects: runtime?.deviceDiagnostics?.visibleObjects ?? 0,
      culledObjects: runtime?.deviceDiagnostics?.culledObjects ?? 0,
      frustumTestedObjects: runtime?.deviceDiagnostics?.frustumTestedObjects ?? 0,
      bloom: runtime?.deviceDiagnostics?.bloom ?? null,
      samplerAnisotropyUploads: runtime?.deviceDiagnostics?.samplerAnisotropyUploads ?? 0,
      maxTextureAnisotropy: runtime?.deviceDiagnostics?.maxTextureAnisotropy ?? 1,
      lodSelections: runtime?.lodSelections ?? [],
      texturedMaterials: runtime?.texturedMaterials ?? []
    },
    environment: {
      enabled: environmentStatus.enabled,
      preset: environmentStatus.preset as AuraEnvironmentNode["environment"] | undefined,
      intensity: environmentStatus.intensity,
      evidence: environmentStatus.evidence,
      // B3: pass through the HDRI upgrade observation; the unmounted default
      // reports not-pixel-backed so static diagnostics never claim HDRI proof.
      iblPixelBacked: environmentStatus.iblPixelBacked ?? false,
      hdriStatus: environmentStatus.hdriStatus ?? "none",
      ...(environmentStatus.dualProbe === undefined ? {} : { dualProbe: environmentStatus.dualProbe }),
      ...(environmentStatus.hdriRotation === undefined ? {} : { hdriRotation: environmentStatus.hdriRotation })
    },
    text: runtime?.text ?? {
      sdfTexts: flattened.filter((node) => node.kind === "primitive" && node.text3D?.backend === "sdf").length,
      textPixelBacked: false,
      quadCount: 0,
      lastOpacity: 1,
      reason: "SDF text requested in the scene graph but no runtime has mounted yet"
    },
    textures: runtime?.textures ?? {
      budgetBytes: normalizeTextureBudgetBytes(rendererOptions?.textureBudgetBytes),
      usedBytes: 0,
      requestedBytes: 0,
      overBudget: false,
      overBudgetBytes: 0,
      residentEntries: 0,
      evictedEntries: []
    },
    antialiasing: rendererQualityPresets.screenshot.antialiasing,
    screenshotQuality: rendererQualityPresets.screenshot,
    materialCapabilities: createMaterialCapabilityDiagnostics(snapshot),
    warnings
  };
}

function requestedRendererPostProcessPasses(
  hasBloom: boolean,
  ambientOcclusion: boolean,
  contactOcclusion: boolean,
  extra: {
    readonly colorGrade?: boolean;
    readonly fxaa?: boolean;
    readonly outline?: boolean;
    readonly ssr?: boolean;
    readonly depthOfField?: boolean;
    readonly motionBlurWithheld?: boolean;
    readonly taaWithheld?: boolean;
  } = {}
): readonly string[] {
  if (!hasBloom && !ambientOcclusion && !contactOcclusion && !extra.colorGrade && !extra.fxaa
    && !extra.outline && !extra.ssr && !extra.depthOfField && !extra.motionBlurWithheld && !extra.taaWithheld) return [];
  const passes = ["render"];
  if (ambientOcclusion || contactOcclusion) passes.push("ssao");
  if (hasBloom) passes.push("bloom");
  if (extra.colorGrade) passes.push("color-grade");
  if (extra.ssr) passes.push("ssr");
  if (extra.depthOfField) passes.push("depth-of-field");
  if (extra.outline) passes.push("outline");
  if (extra.fxaa) passes.push("fxaa");
  // Withheld intents stay visible in the request list with an explicit suffix
  // so requested-vs-actual never silently agrees on an unexecuted pass.
  if (extra.motionBlurWithheld) passes.push("motion-blur");
  if (extra.taaWithheld) passes.push("taa");
  passes.push("output");
  return passes;
}

export function resolveRendererSceneCategory(snapshot: AuraSceneSnapshot, names: readonly string[]): AuraSceneCategory {
  const hasName = (needle: string) => names.some((name) => name.includes(needle));
  const hasEffect = (effect: AuraEffectType) => snapshot.nodes.some((node) => node.kind === "effect" && node.effect === effect);
  if (hasName("product") || hasName("sneaker") || hasName("turntable")) return "product";
  if (hasName("material") || hasName("swatch") || hasName("chrome") || hasName("clearcoat")) return "material";
  if (hasName("neon tunnel") || hasName("ring") && hasEffect("bloom")) return "neon";
  if (hasName("city") && (hasName("night") || hasName("street lamp") || hasName("moon"))) return "city-night";
  if (hasName("city")) return "city-day";
  if (hasName("solar") || hasName("planet") || hasName("starfield")) return "space";
  if (hasName("physics") || hasName("rigid body") || hasName("contact normal")) return "physics";
  if (hasName("chart") || hasName("data bar") || hasName("axis")) return "chart";
  if (
    hasName("game") ||
    hasName("golf") ||
    hasName("score") ||
    hasName("cup") ||
    hasName("race") ||
    hasName("car") ||
    hasName("circuit") ||
    hasName("runner") ||
    hasName("platform") ||
    hasName("checkpoint") ||
    hasName("arcade") ||
    hasName("blockfall")
  ) return "game";
  const background = colorToClearColor(snapshot.background);
  const luminance = background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722;
  return luminance < 0.08 ? "neon" : "product";
}
