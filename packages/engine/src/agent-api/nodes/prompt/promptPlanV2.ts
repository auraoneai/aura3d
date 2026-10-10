// PRD-13 T1.10 — prompt plan v2 (PRD §6.3, §7.3). `compilePromptPlanV2` honours
// every plan field by applying it to the compiled scene or listing it in
// `report.rejected`; `visualSystems` is a census of the compiled snapshot and
// `repairHints` come from `lookLint`, never from the plan text. The 1.0 types
// stay in index.ts (owner 15); v2 extends them here so no CCR is needed.

import type { QrFlags } from "@aura3d/rendering/contracts";
import type {
  AuraCompiledPromptPlan,
  AuraEffectNode,
  AuraPromptCameraPreset,
  AuraPromptEffectId,
  AuraPromptPlan,
  AuraPromptPlanReport,
  AuraSceneNode
} from "../../index.js";
import { effects, groups, scene } from "../../index.js";
import { pixelBackedEffectsAvailable, promptContractAvailable } from "../../looks/contractAvailability.js";
import { resolveQrFlags } from "../../../contracts/flags.js";
import type { AuraLookId } from "../../../contracts/looks.js";
import { lookLint, type AuraLookLintContext } from "../../../contracts/looks.js";
import { postPresets } from "../../../contracts/post.js";
import { resolveLookExpansion } from "../../looks/looks.js";
import {
  PROMPT_PLAN_CAMERA_TO_RIG,
  PROMPT_PLAN_EFFECT_MAP,
  PROMPT_PLAN_ENVIRONMENT_KEYWORDS,
  PROMPT_PLAN_LIGHTING_TO_LOOK,
  PROMPT_PLAN_SCENE_DEFAULT_LOOK,
  PROMPT_PLAN_STYLE_TO_GRADE
} from "./promptPlanMappings.js";
import {
  defaultCameraPreset,
  defaultLightingPreset,
  defaultPromptEffects,
  promptPlanWarnings,
  requireResolvedPromptSubject
} from "./promptPlan.js";
import { promptRecipes } from "./promptRecipes.js";

// ---------------------------------------------------------------------------
// Types (§7.3)
// ---------------------------------------------------------------------------

export interface AuraPromptPlanV2 extends AuraPromptPlan {
  /** Explicit look wins over environment/lighting mapping. */
  readonly look?: AuraLookId;
}

export interface AuraCompilePromptPlanOptions {
  /** "reject" throws AuraPromptPlanError on any field it cannot apply.
   *  Default "warn" in 3.x; A3D_QR_LOOKS_PROMPT_STRICT=1 (alias
   *  A3D_PROMPT_PLAN_STRICT) makes "reject" the default in CI. */
  readonly unsupported?: "reject" | "warn";
}

export type AuraPromptPlanErrorCode =
  | "unmapped-environment" | "unmapped-style" | "unsupported-effect" | "unsupported-camera" | "hud-is-dom";

export class AuraPromptPlanError extends Error {
  constructor(
    public readonly code: AuraPromptPlanErrorCode,
    public readonly field: "environment" | "style" | "effects" | "camera" | "lighting",
    public readonly value: string,
    detail?: string
  ) {
    super(`${code}:${field}=${value}${detail ? ` — ${detail}` : ""}`);
    this.name = "AuraPromptPlanError";
  }
}

export interface AuraPromptPlanReportV2 extends Omit<AuraPromptPlanReport, "schema"> {
  readonly schema: "aura3d-prompt-plan-report/2.0";
  readonly look: {
    readonly id: AuraLookId;
    readonly from: "plan.look" | "plan.environment" | "plan.lighting" | "sceneType-default";
    readonly expansion: "v1-contracts" | "v0-current-engine";
  };
  readonly camera: { readonly preset: AuraPromptCameraPreset; readonly rig: string };
  readonly appliedEffects: readonly AuraPromptEffectId[];
  readonly rejected: readonly { readonly field: string; readonly value: string; readonly code: AuraPromptPlanErrorCode }[];
  readonly styleGrade: { readonly contrast: number; readonly saturation: number; readonly lift: number } | null;
}

export interface AuraCompiledPromptPlanV2 {
  readonly scene: ReturnType<typeof scene>;
  readonly report: AuraPromptPlanReportV2;
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

function resolveFlags(): QrFlags {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const url = typeof location !== "undefined" ? location.href : undefined;
  return resolveQrFlags({ url, env });
}

function strictByDefault(): boolean {
  const env = typeof process !== "undefined" ? process.env : undefined;
  return env?.A3D_QR_LOOKS_PROMPT_STRICT === "1" || env?.A3D_PROMPT_PLAN_STRICT === "1";
}

interface Rejection { readonly field: string; readonly value: string; readonly code: AuraPromptPlanErrorCode }

/** Warn-mode records and carries on; reject-mode throws. */
function fieldGate(
  mode: "reject" | "warn",
  rejected: Rejection[],
  warnings: string[],
  code: AuraPromptPlanErrorCode,
  field: Rejection["field"],
  value: string,
  message: string
): void {
  if (mode === "reject") throw new AuraPromptPlanError(code, field as AuraPromptPlanError["field"], value, message);
  rejected.push({ field, value, code });
  warnings.push(message);
}

/** environment free string → look id through the ordered keyword table. */
function environmentToLook(environment: string): AuraLookId | null {
  const text = environment.toLowerCase();
  for (const row of PROMPT_PLAN_ENVIRONMENT_KEYWORDS) {
    if (row.keywords.some((keyword) => text.includes(keyword))) return row.look;
  }
  return null;
}

function resolvePlanLook(
  plan: AuraPromptPlanV2,
  mode: "reject" | "warn",
  rejected: Rejection[],
  warnings: string[]
): { readonly id: AuraLookId; readonly from: AuraPromptPlanReportV2["look"]["from"] } {
  if (plan.look !== undefined) return { id: plan.look, from: "plan.look" };
  const environment = plan.environment?.trim();
  if (environment) {
    const mapped = environmentToLook(environment);
    if (mapped !== null) return { id: mapped, from: "plan.environment" };
    fieldGate(mode, rejected, warnings, "unmapped-environment", "environment", environment,
      `PromptPlan environment "${environment}" maps to no look; using the scene-type default.`);
  }
  if (plan.lighting?.preset !== undefined) {
    const mapped = PROMPT_PLAN_LIGHTING_TO_LOOK[plan.lighting.preset];
    if (mapped !== undefined) return { id: mapped.look, from: "plan.lighting" };
  }
  return { id: PROMPT_PLAN_SCENE_DEFAULT_LOOK[plan.sceneType], from: "sceneType-default" };
}

/** style free string → grade row (or null). */
function styleToGrade(style: string | undefined): (typeof PROMPT_PLAN_STYLE_TO_GRADE)[number] | null {
  const text = style?.trim().toLowerCase();
  if (!text) return null;
  for (const row of PROMPT_PLAN_STYLE_TO_GRADE) {
    if (row.keywords.some((keyword) => text.includes(keyword))) return row;
  }
  return null;
}

// C-20 emitters are accepted only when the slot is real and its flag is on —
// the stub's primitive-pool bursts are the fake-sphere pattern §6.3 removes.
// The slot probes live in looks/contractAvailability.ts (layering gate).

/** The look group's fog node, when the look already carries one. */
function findLookFog(builder: ReturnType<typeof scene>): AuraEffectNode | undefined {
  const snapshot = builder.toJSON();
  for (const node of snapshot.nodes) {
    const children: readonly AuraSceneNode[] = node.kind === "group" ? node.children : [node];
    for (const child of children) {
      if (child.kind === "effect" && child.effect === "fog") return child;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// compilePromptPlanV2
// ---------------------------------------------------------------------------

export function compilePromptPlanV2(
  plan: AuraPromptPlanV2,
  options?: AuraCompilePromptPlanOptions
): AuraCompiledPromptPlanV2 {
  const mode = options?.unsupported ?? (strictByDefault() ? "reject" : "warn");
  const flags = resolveFlags();
  const subject = requireResolvedPromptSubject(plan);
  const rejected: Rejection[] = [];
  const warnings: string[] = [...promptPlanWarnings(plan)];

  // 1. Look: plan.look > environment > lighting > sceneType default.
  const look = resolvePlanLook(plan, mode, rejected, warnings);
  const expansion = resolveLookExpansion({ flags }).expansion;

  // 2. Recipe (flag-on bodies get the look; §6.3).
  const builder = promptRecipes[plan.sceneType](subject.asset, plan, look.id);

  // 3. Camera rig (C-22 factories or the tuned fallback while the slot is a stub).
  const cameraPreset = plan.camera?.preset ?? defaultCameraPreset(plan.sceneType);
  const cameraRow = PROMPT_PLAN_CAMERA_TO_RIG[cameraPreset];
  const rigName = cameraRow ? cameraRow.rig : cameraPreset;
  if (cameraRow === undefined) {
    fieldGate(mode, rejected, warnings, "unsupported-camera", "camera", cameraPreset,
      `PromptPlan camera preset "${cameraPreset}" maps to no rig; using the recipe camera.`);
  }
  // The compiled camera follows the recipe's tuned fallback today; the C-22
  // rig factory takes over once prd08 provides it (PROMPT_PLAN_CAMERA_TO_RIG.rig).

  // 4. Style → post grade (and optional post preset).
  let styleGrade: AuraPromptPlanReportV2["styleGrade"] = null;
  const style = plan.style?.trim();
  if (style) {
    const row = styleToGrade(style);
    if (row === null) {
      fieldGate(mode, rejected, warnings, "unmapped-style", "style", style,
        `PromptPlan style "${style}" maps to no post grade; leaving the look's grade as-is.`);
    } else {
      styleGrade = { contrast: row.grade.contrast, saturation: row.grade.saturation, lift: row.grade.lift };
      if (row.post !== undefined) {
        // C-13 preset effects (stub is empty today; real presets land with prd03).
        builder.addMany([...postPresets[row.post].effects]);
      }
      if (row.grade.contrast !== 1 || row.grade.saturation !== 1 || row.grade.lift !== 0) {
        builder.add(effects.colorGrade({
          name: "prompt style grade",
          contrast: row.grade.contrast,
          saturation: row.grade.saturation,
          ...(row.grade.lift !== 0 ? { shadows: row.grade.lift } : {})
        }));
      }
    }
  }

  // 5. Effects — applied to the scene or rejected, never echo-only.
  const appliedEffects: AuraPromptEffectId[] = [];
  for (const effect of plan.effects ?? defaultPromptEffects(plan.sceneType)) {
    const mapping = PROMPT_PLAN_EFFECT_MAP[effect];
    if (mapping === undefined) {
      fieldGate(mode, rejected, warnings, "unsupported-effect", "effects", effect,
        `PromptPlan effect "${effect}" maps to nothing.`);
      continue;
    }
    switch (mapping.kind) {
      case "post":
        // bloom rides the look's post pipeline — it is present by census.
        appliedEffects.push(effect);
        break;
      case "look-fog": {
        const fogNode = findLookFog(builder);
        if (fogNode) {
          // The look already fogs: density × densityScale on the authored node.
          (fogNode as { density?: number }).density = (fogNode.density ?? 0.12) * (mapping.densityScale ?? 1);
        } else {
          builder.add(effects.fog({ name: "prompt fog", density: 0.1 }));
        }
        appliedEffects.push(effect);
        break;
      }
      case "pixel-backed":
        if (pixelBackedEffectsAvailable(flags)) {
          if (effect === "rain") builder.add(effects.rain({ name: "prompt rain" }));
          if (effect === "particles") builder.add(effects.particles({ name: "prompt particles" }));
          // motion-trail is a C-20 runtime trail (app.effects.trail) — accepted,
          // the trail attaches to the subject at run time; no scene node.
          appliedEffects.push(effect);
        } else {
          fieldGate(mode, rejected, warnings, mapping.rejectCode ?? "unsupported-effect", "effects", effect,
            `Effect "${effect}" needs C-20 pixel-backed emitters (sim ≠ primitive-pool); the current provider reports primitive-pool bursts.`);
        }
        break;
      case "contract":
        if ((mapping.requires ?? []).every((contract) => promptContractAvailable(contract, flags))) {
          if (effect === "wet-reflection") {
            builder.add(effects.screenSpaceReflections({ name: "prompt wet reflection" }));
          }
          appliedEffects.push(effect);
        } else {
          fieldGate(mode, rejected, warnings, mapping.rejectCode ?? "unsupported-effect", "effects", effect,
            `Effect "${effect}" needs ${(mapping.requires ?? []).join(" + ")} real; emissive boxes are never a substitute.`);
        }
        break;
      case "reject":
        fieldGate(mode, rejected, warnings, mapping.rejectCode ?? "unsupported-effect", "effects", effect,
          mapping.rejectMessage ?? `Effect "${effect}" is rejected.`);
        break;
    }
  }

  const snapshot = builder.toJSON();

  // 6. visualSystems — census of the compiled snapshot (§6.3, never the plan).
  const flattened = groups.flatten(snapshot.nodes);
  const visualSystems: string[] = [
    `${plan.sceneType} recipe`,
    `look:${look.id}`,
    `${cameraPreset} camera`,
    `${rigName} rig`
  ];
  const environmentNode = flattened.find((node) => node.kind === "environment");
  if (environmentNode) {
    visualSystems.push(`environment:${String((environmentNode as { environment?: string }).environment ?? "hdri")}`);
  }
  const shadowCasters = flattened.filter(
    (node) => node.kind === "light" && (node.shadow === true || (typeof node.shadow === "object" && node.shadow !== null))
  ).length;
  if (shadowCasters > 0) visualSystems.push(`shadows:${shadowCasters} caster${shadowCasters === 1 ? "" : "s"}`);
  const postEffects = flattened.filter(
    (node): node is AuraEffectNode =>
      node.kind === "effect" &&
      ["bloom", "ambient-occlusion", "color-grade", "anti-alias", "screen-space-reflections"].includes(node.effect)
  );
  for (const post of postEffects) visualSystems.push(`post:${post.effect}`);
  const emitters = flattened.filter(
    (node): node is AuraEffectNode => node.kind === "effect" && ["rain", "particles", "snow"].includes(node.effect)
  );
  for (const emitter of emitters) visualSystems.push(`effect:${emitter.effect}`);
  if (flattened.some((node) => node.kind === "effect" && node.effect === "fog")) visualSystems.push("atmosphere:fog");

  // 7. repairHints — lookLint on the compiled snapshot + unmet criteria (§6.3).
  const lintContext: AuraLookLintContext = {
    devicePixelRatio: typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1,
    tierCap: 2,
    production: false,
    capabilities: {
      ambientAdditive: false,
      effectsPixelBacked: pixelBackedEffectsAvailable(flags) ? ["rain", "particles", "motion-trail"] : []
    }
  };
  const repairHints: string[] = [
    ...lookLint(snapshot, lintContext).map((finding) => finding.message)
  ];
  for (const rejection of rejected) {
    repairHints.push(`rejected ${rejection.field} "${rejection.value}": ${rejection.code}`);
  }

  return {
    scene: builder,
    report: {
      schema: "aura3d-prompt-plan-report/2.0",
      sceneType: plan.sceneType,
      subjectAssetId: subject.asset.id,
      recipe: plan.sceneType,
      cameraPreset,
      lightingPreset: plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType),
      effects: appliedEffects,
      acceptanceCriteria: plan.acceptanceCriteria,
      negativeCriteria: plan.negativeCriteria ?? [
        "Do not ship a lone GLB on a grid as product-quality prompt proof.",
        "Do not rely on labels or diagnostics to explain missing visual intent."
      ],
      warnings,
      visualSystems,
      repairHints,
      look: { id: look.id, from: look.from, expansion },
      camera: { preset: cameraPreset, rig: rigName },
      appliedEffects,
      rejected,
      styleGrade
    }
  };
}

/** v2-aware scene shortcut (the `options` param reaches the v2 compiler; the
 *  index.ts 1.0 `promptPlanToScene` keeps its single-arg signature — Q-15-6). */
export function promptPlanToSceneV2(
  plan: AuraPromptPlanV2,
  options?: AuraCompilePromptPlanOptions
): ReturnType<typeof scene> {
  return compilePromptPlanV2(plan, options).scene;
}

/**
 * Flag-on `compilePromptPlan` (§7.3): runs the v2 pipeline and narrows the
 * report to the 1.0 shape — honest visualSystems/effects/repairHints under
 * the 1.0 schema literal.
 */
export function compilePromptPlanAsV1(
  plan: AuraPromptPlan | AuraPromptPlanV2,
  options?: AuraCompilePromptPlanOptions
): AuraCompiledPromptPlan {
  const compiled = compilePromptPlanV2(plan, options);
  const { look: _look, camera: _camera, appliedEffects: _applied, rejected: _rejected, styleGrade: _style, ...rest } = compiled.report;
  return {
    scene: compiled.scene,
    report: { ...rest, schema: "aura3d-prompt-plan-report/1.0" }
  };
}
