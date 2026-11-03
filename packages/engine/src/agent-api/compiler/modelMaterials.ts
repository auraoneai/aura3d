// C-15 model-material bridge (PRD-04 P2-3).
// 4.0 Live Fix E2: the A3D_QR_MATERIALS flag-off branch (legacy `tint`
// object with replaceSurfaceTextures:true, which disabled baseColor+MR
// textures and forced uniform plastic values in TypedGLBActor) is deleted.
// `node.material`/`node.materialOverrides` always lower to C-15 overrides,
// independent of flag resolution order or whether setTypedGLBActorQrFlags
// has run yet.
import type { AuraMaterialSpec, AuraModelNode } from "../nodes/types.js";
import type { AuraModelMaterialOverride } from "../../contracts/materials.js";
import { PortableShaderMaterial, type Material } from "@aura3d/rendering";
import { lowerModelMaterialOverrides } from "../../production-runtime/ModelMaterialOverrides.js";
import { assertAuraCustomMaterialSpec, createCustomShaderMaterial } from "./customMaterial.js";
import { createModelCustomMaterialTextureWork, hasCustomMaterialTextureAssets, type ModelCustomMaterialTextureOptions, type ModelCustomMaterialTextureWork } from "./customTextures.js";

export interface ModelCustomMaterialFactoryContext extends ModelCustomMaterialTextureOptions {
  readonly adoptTextureWork: (work: ModelCustomMaterialTextureWork) => void;
  readonly skinned?: boolean;
}

/** Load-time selection; the actor owns every resulting material and its texture work. */
export interface ModelCustomMaterialSlotOverride {
  readonly target: (materialName: string) => boolean;
  readonly factory: (context: ModelCustomMaterialFactoryContext) => Material;
  readonly replaceTextures: boolean;
  readonly requiresInstanceColors?: boolean;
}

type ModelNodeMaterialSeams = AuraModelNode & {
  readonly materialOverrides?: readonly AuraModelMaterialOverride[];
  readonly variant?: string;
};

function modelOptionError(message: string): never {
  const error = new Error(`MODEL_OPTION_UNSUPPORTED: ${message}`);
  Object.assign(error, { code: "MODEL_OPTION_UNSUPPORTED" });
  throw error;
}

function customMaterialError(message: string): never {
  const error = new Error(`MODEL_CUSTOM_MATERIAL_UNSUPPORTED: ${message}`);
  Object.assign(error, { code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED" });
  throw error;
}

// The imported-material bridge lowers scalar overrides, not replacement maps
// or sampler/UV settings. Do not pretend these were applied to the glTF slots.
const UNSUPPORTED_MODEL_TEXTURE_OPTIONS: readonly (keyof AuraMaterialSpec)[] = [
  "texture", "normal", "normalScale", "roughnessMap", "diffuseRoughnessMap", "bumpMap", "bumpFactor",
  "metalnessMap", "occlusionMap", "occlusionStrength", "emissiveMap", "clearcoatMap",
  "clearcoatRoughnessMap", "clearcoatNormalMap", "clearcoatNormalScale", "sheenColorMap",
  "sheenRoughnessMap", "iridescenceMap", "iridescenceThicknessMap", "anisotropyMap",
  "specularIntensityMap", "specularColorMap", "transmissionMap", "thicknessMap",
  "texCoords", "texTransforms", "sampling", "slotSampling", "textureAnisotropy", "envMap"
];

const MODEL_OVERRIDE_KEYS = new Set([
  "target", "color", "colorMode", "replaceTextures", "roughness", "metallic", "emissive",
  "emissiveIntensity", "clearcoat", "clearcoatRoughness", "envMapIntensity", "opacity", "rim",
  "transmission", "iridescence", "sheen", "sheenColor", "sheenRoughness"
]);

const CUSTOM_MODEL_SHADER_KEYS = new Set([
  "glsl", "wgsl", "uniforms", "uniformAliases", "defines", "transparent", "depthWrite",
  "depthTest", "side", "blending", "fog", "patch", "receiveShadow", "castShadow",
  // The graph adapter supplies these paired programs internally.
  "graphDepth", "graphSkinning", "graphStorage"
]);

/**
 * Each material name is an independent match. RegExp.test otherwise advances
 * lastIndex for /g and /y targets, causing repeated applications and variant
 * changes to select different slots. Clone the expression so the caller's
 * RegExp is never mutated. The intrinsic source getter also accepts regexps
 * originating in another browser realm without accepting regex-like objects.
 */
function modelMaterialTarget(target: unknown, index: number): ((name: string) => boolean) | undefined {
  if (target === undefined) return undefined;
  const entries: readonly unknown[] = Array.isArray(target) ? target : [target];
  const matchers = Array.from(entries, (entry): ((name: string) => boolean) => {
    if (typeof entry === "string") return (name) => name === entry;
    let expression: RegExp;
    try {
      const source = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")!.get!.call(entry) as string;
      const flags = Object.getOwnPropertyDescriptor(RegExp.prototype, "flags")!.get!.call(entry) as string;
      expression = new RegExp(source, flags);
    } catch {
      return modelOptionError(`model.materialOverrides[${index}].target must contain only material names or regular expressions`);
    }
    return (name) => {
      expression.lastIndex = 0;
      return expression.test(name);
    };
  });
  return (name) => matchers.some((match) => match(name));
}

function lowerImportedModelMaterials(node: AuraModelNode, overrides: readonly AuraModelMaterialOverride[] | undefined) {
  const material = node.material;
  for (const key of UNSUPPORTED_MODEL_TEXTURE_OPTIONS) {
    if (material?.[key] !== undefined) {
      modelOptionError(`model.material.${key} cannot replace or configure imported texture slots`);
    }
  }
  const targets = Array.from(overrides ?? [], (override, index) => {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      modelOptionError(`model.materialOverrides[${index}] must be an override object`);
    }
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined && !MODEL_OVERRIDE_KEYS.has(key)) {
        modelOptionError(`model.materialOverrides[${index}].${key} is not supported for an imported material override`);
      }
    }
    if (override.colorMode !== undefined && override.colorMode !== "multiply" && override.colorMode !== "replace") {
      modelOptionError(`model.materialOverrides[${index}].colorMode must be 'multiply' or 'replace'`);
    }
    if (override.colorMode !== undefined && override.color === undefined) {
      modelOptionError(`model.materialOverrides[${index}].colorMode requires color`);
    }
    return modelMaterialTarget(override.target, index);
  });
  const lowered = lowerModelMaterialOverrides(material, overrides);
  const firstOverride = lowered.length - (overrides?.length ?? 0);
  for (const [index, override] of (overrides ?? []).entries()) {
    const slot = firstOverride + index;
    lowered[slot] = {
      ...lowered[slot],
      ...(targets[index] ? { target: targets[index] } : {}),
      // The actor folds fields independently. Clear the other colour mode so
      // the last matching colour wins even when modes change between entries.
      ...(override.color === undefined ? {}
        : override.colorMode === "replace" ? { baseColorMultiply: undefined } : { baseColorReplace: undefined })
    };
  }
  return lowered;
}

function customModelMaterialFactory(materialSpec: AuraMaterialSpec, name: string, slot: boolean) {
  const spec = materialSpec.custom;
  assertAuraCustomMaterialSpec(spec, name);
  for (const [key, value] of Object.entries(spec)) {
    if (value !== undefined && !CUSTOM_MODEL_SHADER_KEYS.has(key)) {
      customMaterialError(`custom shader field '${key}' is not supported on imported models`);
    }
  }
  if (spec.blending === "subtractive") {
    customMaterialError("subtractive custom blending is not supported; the portable shader currently falls back to alpha blending");
  }
  for (const [key, value] of Object.entries(materialSpec)) {
    // Whole-model clipping is attached to the render item separately; a slot
    // does not yet have a corresponding clipping attachment.
    if (value !== undefined && key !== "kind" && key !== "custom" && key !== "name" && (slot || key !== "clipping")) {
      customMaterialError(`model custom material field '${key}' is not applied; configure the shader through material.custom instead`);
    }
  }
  if (materialSpec.name !== undefined && (typeof materialSpec.name !== "string" || materialSpec.name.length === 0)) {
    customMaterialError("model custom material name must be a non-empty string");
  }
  return (context?: ModelCustomMaterialFactoryContext): Material => {
    const hasTextureAssets = hasCustomMaterialTextureAssets(materialSpec);
    if (hasTextureAssets && typeof context?.adoptTextureWork !== "function") {
      const error = new Error("MODEL_CUSTOM_TEXTURE_CONTEXT_REQUIRED: custom model texture asset refs require an actor-owned texture work context");
      Object.assign(error, { code: "MODEL_CUSTOM_TEXTURE_CONTEXT_REQUIRED" });
      throw error;
    }
    const material = createCustomShaderMaterial(spec, materialSpec.name ?? name);
    if (context?.skinned && (!material.graphMaterial || !PortableShaderMaterial.hasGraphClippingContract(material))) {
      const error = new Error("MODEL_CUSTOM_MATERIAL_UNSUPPORTED: skinned custom shaders require certified paired forward/depth skinning variants with live palette bindings");
      Object.assign(error, { code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED" });
      try { material.dispose(); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Model custom material setup and cleanup failed");
      }
      throw error;
    }
    if (!hasTextureAssets) return material;
    let work: ModelCustomMaterialTextureWork | undefined;
    try {
      work = createModelCustomMaterialTextureWork(name, material, materialSpec, context);
      context!.adoptTextureWork(work);
      return material;
    } catch (error) {
      const failures = [error];
      void work?.ready.catch(() => undefined);
      try { work?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
      try { material.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
      if (failures.length > 1) throw new AggregateError(failures, "Model custom material setup and cleanup failed");
      throw error;
    }
  };
}

export function applyModelTintBridge(node: AuraModelNode): Record<string, unknown> {
  const seams = node as ModelNodeMaterialSeams;
  const lod = node.lod !== undefined ? { lod: node.lod } : {};
  // The resource loader treats an empty string as "no variant". Reject it
  // instead of silently rendering the authored default.
  if (seams.variant !== undefined && (typeof seams.variant !== "string" || seams.variant.length === 0)) {
    modelOptionError("model.variant must be a non-empty material variant name");
  }
  if (seams.materialOverrides !== undefined && !Array.isArray(seams.materialOverrides)) {
    modelOptionError("model.materialOverrides must be an array");
  }
  if (node.material?.kind === "depth-preview") {
    throw new Error("DEPTH_PREVIEW_MODEL_UNSUPPORTED: depth previews currently support primitives, not imported models");
  }
  if (node.material?.kind === "custom") {
    const name = `model(${node.name ?? node.asset.id}).material`;
    const factory = customModelMaterialFactory(node.material, name, false);
    if ((seams.materialOverrides?.length ?? 0) > 0) {
      customMaterialError("PBR materialOverrides cannot be combined with a custom shader; encode the desired values in its uniforms");
    }
    return {
      // Defer allocation until the actor owns the loaded asset; actor disposal
      // releases the material, including its registered shader sources.
      customMaterialFactory: factory,
      ...lod,
      ...(seams.variant !== undefined ? { materialVariant: seams.variant } : {})
    };
  }
  const customMaterialOverrides: ModelCustomMaterialSlotOverride[] = [];
  const pbrOverrides: AuraModelMaterialOverride[] = [];
  for (const [index, override] of (seams.materialOverrides ?? []).entries()) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      modelOptionError(`model.materialOverrides[${index}] must be an override object`);
    }
    if (override.material === undefined) {
      pbrOverrides.push(override);
      continue;
    }
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined && key !== "target" && key !== "material" && key !== "replaceTextures") {
        customMaterialError(`model.materialOverrides[${index}].${key} cannot be applied to a custom shader`);
      }
    }
    if (!override.material || typeof override.material !== "object" || override.material.kind !== "custom") {
      customMaterialError(`model.materialOverrides[${index}].material must be a custom material`);
    }
    if (override.target === undefined || (Array.isArray(override.target) && override.target.length === 0)) {
      customMaterialError(`model.materialOverrides[${index}].material requires a non-empty target`);
    }
    if (override.replaceTextures !== undefined && typeof override.replaceTextures !== "boolean") {
      modelOptionError(`model.materialOverrides[${index}].replaceTextures must be a boolean`);
    }
    const target = modelMaterialTarget(override.target, index)!;
    if (node.instanceColorTarget && node.instanceColorTarget !== "base") {
      customMaterialError("custom slot shaders cannot apply the model's instanceColorTarget mode");
    }
    customMaterialOverrides.push({
      target,
      factory: customModelMaterialFactory(override.material, `model(${node.name ?? node.asset.id}).materialOverrides[${index}]`, true),
      replaceTextures: override.replaceTextures === true,
      ...(node.instanceColors?.length ? { requiresInstanceColors: true } : {})
    });
  }
  const materialOverrides = lowerImportedModelMaterials(node, pbrOverrides);
  return {
    ...(materialOverrides.length > 0 ? { materialOverrides } : {}),
    ...(customMaterialOverrides.length > 0 ? { customMaterialOverrides } : {}),
    ...lod,
    // C-15: `node.variant` selects a declared KHR_materials_variants material at load (R11).
    ...(seams.variant !== undefined ? { materialVariant: seams.variant } : {})
  };
}
