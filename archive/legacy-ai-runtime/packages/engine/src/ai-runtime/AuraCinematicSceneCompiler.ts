import {
  createCinematicLightingRig,
  createCinematicMaterialPreset,
  createCinematicPostProcessStack,
  createEmissivePracticalLightSystem,
  createFogVolumeSystem,
  createGlowCardSystem,
  createRainParticleSystem,
  createRendererOwnedEvidenceFlag,
  resolveCinematicMaterialPresetId,
  selectCinematicLightingRig,
  validateRendererOwnedCinematicEvidence,
  type CinematicEvidenceFeature,
  type CinematicRendererEvidenceFlag,
  type CinematicRuntimeLight,
  type RenderItem
} from "@aura3d/rendering";
import {
  compileSceneIRToRuntime as compileAISceneIRToRuntime,
  type AuraCompiledSceneRuntime,
  type AuraSceneIR
} from "@aura3d/ai-scene";
import { selectAuraCinematicBackend, type AuraCinematicBackendAvailability, type AuraCinematicBackendPreference } from "./AuraCinematicBackendSelector.js";
import { createAuraCharacterBlockingRuntime, type AuraCharacterBlockingRuntime } from "./AuraCharacterBlockingRuntime.js";
import { createAuraCinematicRenderEvidence, type AuraCinematicRenderEvidence } from "./AuraCinematicRenderEvidence.js";
import { createAuraCinematicTimelineRuntime, type AuraCinematicTimelineRuntime } from "./AuraCinematicTimelineRuntime.js";
import { disposeAuraCinematicScene, type AuraCinematicSceneDisposalReport } from "./AuraCinematicSceneDisposal.js";

export interface AuraCinematicSceneCompilerOptions {
  readonly backendPreference?: AuraCinematicBackendPreference;
  readonly backendAvailability?: AuraCinematicBackendAvailability;
  readonly overlayEvidenceFlags?: readonly CinematicRendererEvidenceFlag[];
  readonly requiredEvidenceFeatures?: readonly CinematicEvidenceFeature[];
}

export interface AuraCinematicSceneDiagnostics {
  readonly backend: string;
  readonly drawCalls: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly assetCount: number;
  readonly renderItemCount: number;
  readonly rendererOwnedEvidenceCount: number;
  readonly domOverlayEvidenceCount: number;
  readonly diagnostics: readonly string[];
}

export interface AuraCinematicCompiledSceneRuntime {
  readonly kind: "aura3d-cinematic-compiled-scene";
  readonly sceneId: string;
  readonly ir: AuraSceneIR;
  readonly baseRuntime: AuraCompiledSceneRuntime;
  readonly backend: string;
  readonly renderItems: readonly RenderItem[];
  readonly lights: readonly CinematicRuntimeLight[];
  readonly timeline: AuraCinematicTimelineRuntime;
  readonly blocking: AuraCharacterBlockingRuntime;
  readonly evidence: AuraCinematicRenderEvidence;
  readonly diagnostics: AuraCinematicSceneDiagnostics;
  dispose(): AuraCinematicSceneDisposalReport;
}

export interface AuraCinematicSceneCompiler {
  compile(scene: AuraSceneIR): Promise<AuraCinematicCompiledSceneRuntime>;
}

export function createAuraCinematicSceneCompiler(options: AuraCinematicSceneCompilerOptions = {}): AuraCinematicSceneCompiler {
  return {
    async compile(scene) {
      const backendSelection = selectAuraCinematicBackend({
        requested: options.backendPreference ?? scene.backendPreference,
        availability: options.backendAvailability
      });
      const baseRuntime = await compileAISceneIRToRuntime(scene, { backend: backendSelection.backend });
      const ir = baseRuntime.ir;
      const moodTags = [...ir.mood, ...ir.environment.moodTags, ir.environment.kind, ir.environment.timeOfDay ?? ""];
      const lightingRig = createCinematicLightingRig(selectCinematicLightingRig(moodTags));
      const materialPresets = ir.materials.map((material) => createCinematicMaterialPreset(resolveCinematicMaterialPresetId([material.label, material.id, ...ir.mood])));
      const postprocess = createCinematicPostProcessStack({
        fogOrHaze: ir.vfx.some((cue) => cue.kind === "fog" || cue.kind === "rain" || cue.kind === "particles"),
        glow: ir.materials.some((material) => material.emissive)
      });
      const rainSystems = ir.vfx
        .filter((cue) => cue.kind === "rain" || cue.kind === "particles")
        .map((cue) => createRainParticleSystem({ id: cue.id, particleCount: Math.round(256 + cue.intensity * 512) }));
      const fogSystems = ir.vfx
        .filter((cue) => cue.kind === "fog")
        .map((cue) => createFogVolumeSystem({ id: cue.id, density: cue.intensity }));
      const glowCards = ir.materials
        .filter((material) => material.emissive)
        .map((material) => ({ id: `glow:${material.id}`, targetId: material.id, color: [...material.emissive!, Math.min(0.82, material.emissiveStrength ?? 0.55)] as [number, number, number, number], radiusMeters: 0.8 }));
      const glowSystem = glowCards.length > 0 ? createGlowCardSystem(glowCards) : undefined;
      const practicalSystem = glowCards.length > 0
        ? createEmissivePracticalLightSystem(glowCards.map((card) => ({ id: card.id, sourceObjectId: card.targetId, color: [card.color[0], card.color[1], card.color[2]], intensity: 1.8, radiusMeters: card.radiusMeters })))
        : undefined;
      const timeline = createAuraCinematicTimelineRuntime({ cameras: ir.cameras, shots: ir.shots, cues: ir.timeline });
      const blockingCharacters = ir.characters.length > 0 ? ir.characters : ir.objects.filter((object) => object.role === "hero");
      const blocking = createAuraCharacterBlockingRuntime({ characters: blockingCharacters, objects: ir.objects, cues: ir.timeline });
      const renderItems = [
        ...baseRuntime.renderItems,
        ...rainSystems.map((system) => system.renderItem),
        ...(glowSystem?.renderItems ?? [])
      ];
      const flags: CinematicRendererEvidenceFlag[] = [
        lightingRig.rendererOwnedEvidence,
        ...materialPresets.map((preset) => preset.rendererOwnedEvidence),
        ...postprocess.rendererOwnedEvidence,
        ...rainSystems.map((system) => system.rendererOwnedEvidence),
        ...fogSystems.map((system) => system.rendererOwnedEvidence),
        ...(glowSystem ? [glowSystem.rendererOwnedEvidence] : []),
        ...(practicalSystem ? [practicalSystem.rendererOwnedEvidence] : []),
        ...timeline.cameraShots.map((shot) => shot.rendererOwnedEvidence),
        timeline.scrubber.rendererOwnedEvidence,
        blocking.rendererOwnedEvidence,
        createRendererOwnedEvidenceFlag({ id: "asset:compiled-renderables", feature: "asset", label: "Compiled asset/procedural renderables", source: "renderer-scene" }),
        createRendererOwnedEvidenceFlag({ id: "environment:compiled", feature: "environment", label: "Compiled environment/HDR preset", source: "renderer-scene" }),
        ...(options.overlayEvidenceFlags ?? [])
      ];
      const requiredFeatures = options.requiredEvidenceFeatures ?? defaultRequiredEvidenceFeatures(ir);
      const validation = validateRendererOwnedCinematicEvidence(flags, requiredFeatures);
      if (!validation.ok) {
        throw Object.assign(new Error("Cinematic scene compilation rejected DOM/CSS-only required evidence."), validation);
      }
      const evidence = createAuraCinematicRenderEvidence({
        sceneId: ir.sceneId,
        backend: backendSelection.backend,
        flags,
        requiredFeatures
      });
      return {
        kind: "aura3d-cinematic-compiled-scene",
        sceneId: ir.sceneId,
        ir,
        baseRuntime,
        backend: backendSelection.backend,
        renderItems,
        lights: [...lightingRig.lights, ...(practicalSystem?.lights ?? [])],
        timeline,
        blocking,
        evidence,
        diagnostics: {
          backend: backendSelection.backend,
          drawCalls: renderItems.length,
          materialCount: ir.materials.length + materialPresets.length,
          textureCount: 0,
          assetCount: baseRuntime.resolvedAssets.length,
          renderItemCount: renderItems.length,
          rendererOwnedEvidenceCount: evidence.rendererOwnedFlagCount,
          domOverlayEvidenceCount: evidence.domOverlayFlagCount,
          diagnostics: [
            ...backendSelection.diagnostics,
            ...lightingRig.diagnostics,
            ...postprocess.diagnostics,
            ...rainSystems.flatMap((system) => system.diagnostics),
            ...fogSystems.flatMap((system) => system.diagnostics),
            ...(glowSystem?.diagnostics ?? []),
            ...(practicalSystem?.diagnostics ?? []),
            ...evidence.diagnostics
          ]
        },
        dispose() {
          const report = disposeAuraCinematicScene([
            baseRuntime,
            ...renderItems.map((item) => item.material ?? {})
          ]);
          return report;
        }
      };
    }
  };
}

export async function compileAuraCinematicScene(scene: AuraSceneIR, options: AuraCinematicSceneCompilerOptions = {}): Promise<AuraCinematicCompiledSceneRuntime> {
  return await createAuraCinematicSceneCompiler(options).compile(scene);
}

function defaultRequiredEvidenceFeatures(scene: AuraSceneIR): readonly CinematicEvidenceFeature[] {
  return [
    "asset",
    "environment",
    "material",
    "lighting",
    "postprocess",
    "camera",
    "timeline",
    "blocking",
    ...(scene.vfx.length > 0 ? ["vfx" as const] : [])
  ];
}
