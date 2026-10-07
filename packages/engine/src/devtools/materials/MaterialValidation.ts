import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { GAME_READY_MATERIAL_PRESETS, type GameReadyMaterialPreset } from "./GameReadyMaterialLibrary";
import { listThreeCompatMaterialProofChannels, listThreeCompatPbrMaterials, THREE_COMPAT_REQUIRED_MATERIAL_CLASSES } from "./PBRMaterialLibrary";
import { findThreeCompatTextureSet, THREE_COMPAT_TEXTURE_SETS } from "./TextureSet";

export interface ThreeCompatMaterialLibrarySummary {
  readonly materialCount: number;
  readonly textureBackedMaterialCount: number;
  readonly textureSetCount: number;
  readonly checkedInTextureSetCount: number;
  readonly classes: readonly string[];
  readonly proofChannels: readonly string[];
  readonly missingRequiredClasses: readonly string[];
  readonly missingProofChannels: readonly string[];
  readonly missingTextureSetIds: readonly string[];
  readonly missingTextureSourcePaths: readonly string[];
}

export interface GameReadyMaterialValidationResult {
  readonly id: string;
  readonly kind: string;
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export interface GameReadyMaterialLibraryValidation {
  readonly presetCount: number;
  readonly passingCount: number;
  readonly failingIds: readonly string[];
  readonly results: readonly GameReadyMaterialValidationResult[];
}

function gameReadyNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function gameReadyColor(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === "number") ? value as readonly number[] : undefined;
}

/**
 * Validates one game-ready preset against its kind contract: required
 * features present, parameters in range, snippet + tunables shipped, and the
 * skin approximation never presented as physical scattering.
 */
export function validateGameReadyMaterialPreset(preset: GameReadyMaterialPreset): GameReadyMaterialValidationResult {
  const issues: string[] = [];
  const params = preset.parameters;
  const inRange = (name: string, low: number, high: number): void => {
    const value = gameReadyNumber(params[name]);
    if (value === undefined || value < low || value > high) issues.push(`${String(name)} must be within ${low}..${high}`);
  };

  switch (preset.kind) {
    case "carPaint": {
      inRange("clearcoat", 0.9, 1);
      inRange("clearcoatRoughness", 0, 0.15);
      inRange("flakeNormalScale", 0, 1);
      if ((gameReadyNumber(params.flakeNormalScale) ?? 0) <= 0) issues.push("flakeNormalScale must be positive for the flake normal");
      inRange("flakeDensity", 0, 1);
      if ((gameReadyNumber(params.metallic) ?? 0) <= 0) issues.push("metallic must be positive for the base coat");
      break;
    }
    case "skinSSS-approx": {
      inRange("wrapDiffuse", 0, 1);
      if ((gameReadyNumber(params.wrapDiffuse) ?? 0) <= 0) issues.push("wrapDiffuse must be positive for wrapped diffuse");
      if (!gameReadyColor(params.thicknessTint)) issues.push("thicknessTint must be an [r, g, b] triple");
      break;
    }
    case "glassThin": {
      inRange("transmission", 0.5, 1);
      inRange("thickness", 0, 0.05);
      inRange("ior", 1, 2.5);
      inRange("roughness", 0, 0.15);
      break;
    }
    case "brushedMetal": {
      if (gameReadyNumber(params.metalness) !== 1) issues.push("metalness must equal 1 for brushed metal");
      inRange("anisotropy", 0.5, 1);
      if (gameReadyNumber(params.anisotropyRotation) === undefined) issues.push("anisotropyRotation must be a finite radian value");
      inRange("roughness", 0, 1);
      break;
    }
    case "foliage": {
      if (params.alphaMode !== "mask") issues.push('alphaMode must equal "mask" for alpha-cutout foliage');
      inRange("alphaCutoff", 0, 1);
      if ((gameReadyNumber(params.alphaCutoff) ?? 0) <= 0) issues.push("alphaCutoff must be positive for the cutout");
      inRange("translucency", 0, 1);
      if (!gameReadyColor(params.translucencyColor)) issues.push("translucencyColor must be an [r, g, b] triple");
      break;
    }
    case "concreteAsphalt": {
      inRange("roughness", 0.6, 1);
      inRange("roughnessVariation", 0, 0.5);
      if ((gameReadyNumber(params.roughnessVariation) ?? 0) <= 0) issues.push("roughnessVariation must be positive for ground breakup");
      inRange("normalScale", 0, 1.5);
      break;
    }
  }

  if (!preset.exampleSnippet.includes("material.")) issues.push("exampleSnippet must demonstrate the root material API");
  if (preset.tunables.length === 0) issues.push("tunables table must ship at least one tunable");
  if (!preset.probe.screenshot) issues.push("probe screenshot path must be set");
  const claimText = `${preset.label}\n${preset.note}\n${preset.exampleSnippet}`;
  if (/true\s+sss|real\s+sss|actual\s+sss|physical\s+subsurface\s+scattering/i.test(claimText)) {
    issues.push("skin approximation must never be presented as physical scattering");
  }
  if (preset.kind === "skinSSS-approx" && !/approx/i.test(claimText)) {
    issues.push("skin preset must be labeled as an approximation");
  }
  return { id: preset.id, kind: preset.kind, ok: issues.length === 0, issues };
}

/** Validates the full game-ready library: six kinds, unique ids, all passing. */
export function validateGameReadyMaterialLibrary(
  presets: readonly GameReadyMaterialPreset[] = GAME_READY_MATERIAL_PRESETS
): GameReadyMaterialLibraryValidation {
  const results = presets.map(validateGameReadyMaterialPreset);
  const failingIds = results.filter((result) => !result.ok).map((result) => result.id);
  const ids = presets.map((preset) => preset.id);
  if (new Set(ids).size !== ids.length) failingIds.push("(duplicate-ids)");
  const kinds = new Set(presets.map((preset) => preset.kind));
  for (const kind of ["carPaint", "skinSSS-approx", "glassThin", "brushedMetal", "foliage", "concreteAsphalt"] as const) {
    if (!kinds.has(kind)) failingIds.push(`(missing-kind:${kind})`);
  }
  return { presetCount: presets.length, passingCount: results.filter((result) => result.ok).length, failingIds, results };
}

export function summarizeThreeCompatMaterialLibrary(): ThreeCompatMaterialLibrarySummary {
  const materials = listThreeCompatPbrMaterials();
  const classes = [...new Set(materials.map((material) => material.class))].sort();
  const proofChannels = [...new Set(materials.flatMap((material) => material.proofChannels))].sort();
  const missingTextureSetIds = materials
    .filter((material) => material.textureSetId && !findThreeCompatTextureSet(material.textureSetId))
    .map((material) => material.id);
  const missingTextureSourcePaths = THREE_COMPAT_TEXTURE_SETS.filter((textureSet) => !existsSync(resolve(textureSet.sourcePath))).map((textureSet) => textureSet.sourcePath);
  return {
    materialCount: materials.length,
    textureBackedMaterialCount: materials.filter((material) => material.textureSetId).length,
    textureSetCount: THREE_COMPAT_TEXTURE_SETS.length,
    checkedInTextureSetCount: THREE_COMPAT_TEXTURE_SETS.length - missingTextureSourcePaths.length,
    classes,
    proofChannels,
    missingRequiredClasses: THREE_COMPAT_REQUIRED_MATERIAL_CLASSES.filter((materialClass) => !classes.includes(materialClass)),
    missingProofChannels: listThreeCompatMaterialProofChannels().filter((channel) => !proofChannels.includes(channel)),
    missingTextureSetIds,
    missingTextureSourcePaths
  };
}
