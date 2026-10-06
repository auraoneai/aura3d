// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCompiledPromptPlan, AuraInteractionNode, AuraPromptCameraPreset, AuraPromptEffectId, AuraPromptInteractionMode, AuraPromptLightingPreset, AuraPromptPlan, AuraPromptResolvedSubject, AuraPromptSceneType } from "../../index.js";
import { AuraNodeBuilder, effects, interactions, promptSubjectIsResolved, scene } from "../../index.js";
import { camera } from "../camera.js";
import { promptRecipes } from "./promptRecipes.js";

export function definePromptPlan<const TPlan extends AuraPromptPlan>(plan: TPlan): TPlan {
  return plan;
}

export function compilePromptPlan(plan: AuraPromptPlan): AuraCompiledPromptPlan {
  const subject = requireResolvedPromptSubject(plan);
  const sceneBuilder = promptRecipes[plan.sceneType](subject.asset, plan);
  return {
    scene: sceneBuilder,
    report: {
      schema: "aura3d-prompt-plan-report/1.0",
      sceneType: plan.sceneType,
      subjectAssetId: subject.asset.id,
      recipe: plan.sceneType,
      cameraPreset: plan.camera?.preset ?? defaultCameraPreset(plan.sceneType),
      lightingPreset: plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType),
      effects: plan.effects ?? defaultPromptEffects(plan.sceneType),
      acceptanceCriteria: plan.acceptanceCriteria,
      negativeCriteria: plan.negativeCriteria ?? [
        "Do not ship a lone GLB on a grid as product-quality prompt proof.",
        "Do not rely on labels or diagnostics to explain missing visual intent."
      ],
      warnings: promptPlanWarnings(plan),
      visualSystems: visualSystemsForPromptPlan(plan),
      repairHints: repairHintsForPromptPlan(plan)
    }
  };
}

export function requireResolvedPromptSubject(plan: AuraPromptPlan): AuraPromptResolvedSubject {
  if (!promptSubjectIsResolved(plan.subject)) {
    throw new Error(
      `Cannot compile a prompt plan whose subject is still an unresolved intent ("${plan.subject.intent}"). ` +
        "Resolve the prompt-plan subject first via resolvePromptPlanSubject(...) or the CLI `assets search`; " +
        "compile needs a concrete typed asset."
    );
  }
  return plan.subject;
}

export function interactionNode(mode: AuraPromptInteractionMode, target?: string): AuraNodeBuilder<AuraInteractionNode> {
  if (mode === "keyboard") return interactions.keyboard({ target });
  if (mode === "pointer") return interactions.pointer({ target });
  return interactions.orbit({ target });
}

export function defaultCameraPreset(sceneType: AuraPromptSceneType): AuraPromptCameraPreset {
  if (sceneType === "cinematic-scene") return "cinematic-dolly";
  if (sceneType === "mini-game") return "game-board";
  if (sceneType === "material-studio") return "material-inspection";
  return "product-orbit";
}

export function defaultLightingPreset(sceneType: AuraPromptSceneType): AuraPromptLightingPreset {
  if (sceneType === "cinematic-scene") return "neon-practicals";
  if (sceneType === "mini-game") return "game-readable";
  if (sceneType === "material-studio") return "material-studio";
  return "studio-softbox";
}

export function defaultPromptEffects(sceneType: AuraPromptSceneType): readonly AuraPromptEffectId[] {
  if (sceneType === "cinematic-scene") return ["rain", "fog", "bloom", "wet-reflection"];
  if (sceneType === "mini-game") return ["motion-trail", "hud", "bloom"];
  if (sceneType === "material-studio") return ["bloom"];
  return ["bloom"];
}

export function visualSystemsForPromptPlan(plan: AuraPromptPlan): readonly string[] {
  const systems = [
    `${plan.sceneType} recipe`,
    `${plan.camera?.preset ?? defaultCameraPreset(plan.sceneType)} camera`,
    `${plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType)} lighting`
  ];
  for (const effect of plan.effects ?? defaultPromptEffects(plan.sceneType)) {
    systems.push(`${effect} effect`);
  }
  return systems;
}

export function repairHintsForPromptPlan(plan: AuraPromptPlan): readonly string[] {
  const shared = [
    "If the screenshot reads as one asset plus decoration, add foreground, midground, and background structure before promoting it.",
    "If the subject is small or off-center, use a tighter camera preset, move the subject into the focal area, and recapture the screenshot.",
    "If lighting is flat, add a key, fill, and rim light with visibly different color or intensity.",
    "If the prompt effect is only symbolic, replace it with layered scene geometry, reflections, fog, glow, or state feedback that is visible in the screenshot."
  ];
  if (plan.sceneType === "product-viewer") {
    return [
      ...shared,
      "For product viewers, add plinth/table contact, reflection cards, a clean backdrop, and inspection/orbit controls.",
      "Do not mark product quality until the asset reads as a deliberate product hero without diagnostics text."
    ];
  }
  if (plan.sceneType === "cinematic-scene") {
    return [
      ...shared,
      "For cinematic scenes, add depth layers, practical light sources, wet floor response, fog/haze separation, and a composed dolly camera.",
      "Do not mark product quality if rain is only a few lines over a centered model."
    ];
  }
  if (plan.sceneType === "mini-game") {
    return [
      ...shared,
      "For mini-games, add visible player state, HUD-like score/health cues, hazards, collectibles, a goal, and interaction feedback.",
      "Do not mark product quality if the scene is just a character plus random primitive obstacles."
    ];
  }
  return [
    ...shared,
    "For material studios, add controlled swatches, labels or layout cues, reflection environment, texture previews, and consistent inspection lighting.",
    "Do not mark product quality until material differences are visible without reading code."
  ];
}

export function promptPlanWarnings(plan: AuraPromptPlan): readonly string[] {
  const warnings: string[] = [];
  const acceptanceCriteria = plan.acceptanceCriteria.map((item) => item.trim()).filter(Boolean);
  if (!promptSubjectIsResolved(plan.subject)) {
    warnings.push(
      `PromptPlan subject is still an unresolved intent ("${plan.subject.intent}"); resolve it via resolvePromptPlanSubject(...) ` +
        "or the CLI `assets search` to a concrete typed asset before compiling."
    );
  }
  if (!plan.subject.label?.trim()) {
    warnings.push("PromptPlan subject is missing a human-readable label; add one so reports and diagnostics describe the visible subject.");
  }
  if (!plan.style?.trim()) {
    warnings.push("PromptPlan style is missing; specify the visual tone so the recipe does not rely only on defaults.");
  }
  if (!plan.environment?.trim()) {
    warnings.push("PromptPlan environment is missing; specify the surrounding space so the output is not a lone asset.");
  }
  if (!plan.camera?.preset) {
    warnings.push(`PromptPlan camera preset is missing; defaulted to ${defaultCameraPreset(plan.sceneType)}.`);
  }
  if (!plan.lighting?.preset) {
    warnings.push(`PromptPlan lighting preset is missing; defaulted to ${defaultLightingPreset(plan.sceneType)}.`);
  }
  if (!plan.effects || plan.effects.length === 0) {
    warnings.push(`PromptPlan effects are missing; defaulted to ${defaultPromptEffects(plan.sceneType).join(", ")}.`);
  }
  if (!plan.interaction) {
    warnings.push("PromptPlan interaction is missing; defaulted to the recipe interaction.");
  }
  if (acceptanceCriteria.length < 3) {
    warnings.push("PromptPlan needs at least three concrete screenshot acceptance criteria before it can be used as product-quality proof.");
  }
  if ((plan.negativeCriteria ?? []).map((item) => item.trim()).filter(Boolean).length === 0) {
    warnings.push("PromptPlan negative criteria are missing; default anti-patterns were applied.");
  }
  return warnings;
}
