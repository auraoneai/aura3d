import { diagnostic, type AuraSceneValidationIssue } from "./AuraSceneValidator.js";
import { isMajorCinematicAssetIntent, type AuraAssetIntent } from "./AuraAssetIntent.js";
import { AURA_SUPPORTED_CINEMATIC_VFX } from "./AuraVFXIntent.js";
import { hasConcreteCameraMovement } from "./AuraShotSpec.js";
import type { AuraCinematicSceneIntent } from "./AuraCinematicSceneIntent.js";

export const AURA_CINEMATIC_PROMPT_CONTRACT_VERSION = "aura3d.cinematic-prompt-contract/1.0";

export const AURA_CINEMATIC_NEGATIVE_CONSTRAINTS = [
  "No unsupported final-film, production-ready render, or offline-quality claims.",
  "No DOM/CSS-only substitutes for hero objects, environments, VFX, materials, or practical lights.",
  "No placeholder-first public demo output when required cinematic assets are unresolved."
] as const;

export const AURA_CINEMATIC_PROMPT_CONTRACT = [
  "Return valid JSON for aura3d.cinematic-scene-intent/1.0.",
  "Require sceneType, mood, environment, heroSubject, supportingProps, look.lighting, shots, vfx, materials, timeline, assetRequirements, qualityTarget, and backendPreference.",
  "Camera direction must include concrete movement, durationSeconds, startPosition, target, and endPosition for moving shots.",
  "Material intent must describe hero objects and ground/stage surfaces using renderer-owned PBR material descriptors.",
  "Asset requirements must include semanticTags, moodTags, materialDescriptors, fallbackPriority, blocking, and disallowed DOM/CSS substitutes.",
  "When prompted, VFX intent must describe rain, fog, dust, sparks, glow, water, fire, or smoke as renderer-owned effects.",
  ...AURA_CINEMATIC_NEGATIVE_CONSTRAINTS
] as const;

export interface AuraCinematicPromptContractValidation {
  readonly valid: boolean;
  readonly intent?: AuraCinematicSceneIntent;
  readonly diagnostics: readonly AuraSceneValidationIssue[];
}

export function validateCinematicSceneIntent(input: unknown): AuraCinematicPromptContractValidation {
  const diagnostics: AuraSceneValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      diagnostics: [diagnostic("", "AURA_CINEMATIC_INTENT_NOT_OBJECT", "error", "Cinematic scene intent must be an object.", "Return a single structured JSON object.")]
    };
  }

  requireString(input, "sceneType", diagnostics);
  requireStringArray(input.mood, "mood", diagnostics);
  requireRecord(input.environment, "environment", diagnostics);
  requireRecord(input.heroSubject, "heroSubject", diagnostics);
  requireArray(input.supportingProps, "supportingProps", diagnostics);
  requireRecord(input.look, "look", diagnostics);
  requireArray(input.shots, "shots", diagnostics);
  requireArray(input.vfx, "vfx", diagnostics);
  requireArray(input.materials, "materials", diagnostics);
  requireRecord(input.timeline, "timeline", diagnostics);
  requireArray(input.assetRequirements, "assetRequirements", diagnostics);
  requireString(input, "qualityTarget", diagnostics);
  requireString(input, "backendPreference", diagnostics);

  validateShots(input.shots, diagnostics);
  validateMaterials(input.materials, diagnostics);
  validateVFX(input.vfx, input, diagnostics);
  validateAssetRequirements(input.assetRequirements, diagnostics);
  validateTimeline(input.timeline, diagnostics);
  validateNegativeConstraints(input.negativeConstraints, diagnostics);

  return {
    valid: !diagnostics.some((entry) => entry.severity === "error"),
    ...(!diagnostics.some((entry) => entry.severity === "error") ? { intent: input as unknown as AuraCinematicSceneIntent } : {}),
    diagnostics
  };
}

function validateShots(value: unknown, diagnostics: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(diagnostic("shots", "AURA_CINEMATIC_SHOTS_REQUIRED", "error", "At least one cinematic shot is required.", "Add a shot with duration and camera movement."));
    return;
  }
  value.forEach((shot, index) => {
    if (!isRecord(shot)) return;
    if (!hasConcreteCameraMovement(shot as never)) {
      diagnostics.push(diagnostic(`shots[${index}]`, "AURA_CINEMATIC_CAMERA_MOVEMENT_REQUIRED", "error", "Moving cinematic shots require duration and concrete endPosition.", "Add durationSeconds and camera.endPosition for push, dolly, orbit, truck, crane, or handheld moves."));
    }
  });
}

function validateMaterials(value: unknown, diagnostics: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  const hasHero = value.some((entry) => isRecord(entry) && entry.target === "hero-subject" && Array.isArray(entry.descriptors) && entry.descriptors.length > 0);
  const hasGround = value.some((entry) => isRecord(entry) && entry.target === "ground" && Array.isArray(entry.descriptors) && entry.descriptors.length > 0);
  if (!hasHero) diagnostics.push(diagnostic("materials", "AURA_CINEMATIC_HERO_MATERIAL_REQUIRED", "error", "Hero subject material descriptors are required.", "Add a hero-subject material with concrete PBR descriptors."));
  if (!hasGround) diagnostics.push(diagnostic("materials", "AURA_CINEMATIC_GROUND_MATERIAL_REQUIRED", "error", "Ground or stage material descriptors are required.", "Add a ground material such as wet pavement, reflective floor, soil, or stage surface."));
}

function validateVFX(value: unknown, root: Record<string, unknown>, diagnostics: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  const promptedTags = [
    ...stringArray(root.mood),
    ...(isRecord(root.environment) ? stringArray(root.environment.semanticTags) : []),
    ...(isRecord(root.environment) && typeof root.environment.weather === "string" ? [root.environment.weather] : [])
  ].map((tag) => tag.toLowerCase());
  for (const kind of AURA_SUPPORTED_CINEMATIC_VFX) {
    if (!promptedTags.includes(kind)) continue;
    const hasKind = value.some((entry) => isRecord(entry) && entry.kind === kind && entry.rendererOwned === true);
    if (!hasKind) {
      diagnostics.push(diagnostic("vfx", "AURA_CINEMATIC_VFX_DESCRIPTOR_REQUIRED", "error", `Prompted ${kind} requires renderer-owned VFX intent.`, `Add a ${kind} VFX descriptor with intensity, density when relevant, and rendererOwned: true.`));
    }
  }
}

function validateAssetRequirements(value: unknown, diagnostics: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(diagnostic("assetRequirements", "AURA_CINEMATIC_ASSET_REQUIREMENTS_REQUIRED", "error", "Cinematic prompts must declare asset requirements.", "Add semantic asset requirements with fallback priorities."));
    return;
  }
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) continue;
    const intent = entry as unknown as AuraAssetIntent;
    if (!Array.isArray(intent.semanticTags) || intent.semanticTags.length === 0) {
      diagnostics.push(diagnostic(`assetRequirements[${index}].semanticTags`, "AURA_CINEMATIC_ASSET_TAGS_REQUIRED", "error", "Asset requirements need semantic tags.", "Add concrete tags such as robot, glowing-flower, rainy-neon-alley, wet-pavement, or neon-practical-light."));
    }
    if (!Array.isArray(intent.fallbackPriority) || intent.fallbackPriority.length === 0) {
      diagnostics.push(diagnostic(`assetRequirements[${index}].fallbackPriority`, "AURA_CINEMATIC_ASSET_FALLBACK_REQUIRED", "error", "Asset requirements need fallback priority.", "Add local-asset, procedural-set, procedural-mesh, or diagnostic-only fallback order."));
    }
    if (isMajorCinematicAssetIntent(intent) && (!Array.isArray(intent.disallowedSubstitutes) || !intent.disallowedSubstitutes.includes("dom-css-only"))) {
      diagnostics.push(diagnostic(`assetRequirements[${index}].disallowedSubstitutes`, "AURA_CINEMATIC_DOM_CSS_DISALLOW_REQUIRED", "error", "Major cinematic assets must reject DOM/CSS-only substitutes.", "Add dom-css-only to disallowedSubstitutes."));
    }
  }
}

function validateTimeline(value: unknown, diagnostics: AuraSceneValidationIssue[]): void {
  if (!isRecord(value)) return;
  if (typeof value.durationSeconds !== "number" || value.durationSeconds <= 0 || !Array.isArray(value.beats) || value.beats.length === 0) {
    diagnostics.push(diagnostic("timeline", "AURA_CINEMATIC_TIMELINE_REQUIRED", "error", "Timeline requires durationSeconds and beats.", "Add a timed beat list matching the cinematic shot duration."));
  }
}

function validateNegativeConstraints(value: unknown, diagnostics: AuraSceneValidationIssue[]): void {
  const constraints = stringArray(value).join(" ").toLowerCase();
  if (!constraints.includes("final-film") && !constraints.includes("offline")) {
    diagnostics.push(diagnostic("negativeConstraints", "AURA_CINEMATIC_FINAL_FILM_CLAIM_CONSTRAINT_REQUIRED", "error", "Negative constraints must reject unsupported final-film claims.", "Add a constraint forbidding final-film/offline-quality claims."));
  }
  if (!constraints.includes("dom") || !constraints.includes("css")) {
    diagnostics.push(diagnostic("negativeConstraints", "AURA_CINEMATIC_DOM_CSS_CONSTRAINT_REQUIRED", "error", "Negative constraints must reject DOM/CSS-only cinematic substitutes.", "Add a constraint forbidding DOM/CSS-only substitutes."));
  }
}

function requireString(root: Record<string, unknown>, key: string, diagnostics: AuraSceneValidationIssue[]): void {
  if (typeof root[key] !== "string" || String(root[key]).trim().length === 0) {
    diagnostics.push(diagnostic(key, "AURA_CINEMATIC_FIELD_REQUIRED", "error", `${key} is required.`, `Add ${key} to the cinematic intent.`));
  }
}

function requireStringArray(value: unknown, path: string, diagnostics: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    diagnostics.push(diagnostic(path, "AURA_CINEMATIC_STRING_ARRAY_REQUIRED", "error", `${path} must be a string array.`, `Add ${path} as an array of cinematic tags.`));
  }
}

function requireRecord(value: unknown, path: string, diagnostics: AuraSceneValidationIssue[]): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(path, "AURA_CINEMATIC_OBJECT_REQUIRED", "error", `${path} is required.`, `Add a structured ${path} object.`));
  }
}

function requireArray(value: unknown, path: string, diagnostics: AuraSceneValidationIssue[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic(path, "AURA_CINEMATIC_ARRAY_REQUIRED", "error", `${path} must be an array.`, `Add ${path} as an array, even if empty.`));
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
