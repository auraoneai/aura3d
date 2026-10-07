/**
 * ModelMaterialOverrides.ts — C-15 real override plumbing (PRD-04 §7.2, P1-4).
 *
 * Pure functions over the production material library:
 *   - `snapshotMaterials` records every material's uniform map at load so
 *     overrides always re-apply from authored state (idempotent; the legacy
 *     `setTint` mutated in place and compounded).
 *   - `applyMaterialOverrides` folds an override list in order (last match
 *     wins per field), restores the snapshot, then writes resolved fields.
 *   - `lowerModelMaterialOverrides` maps the public `AuraModelMaterialOverride`
 *     (string/RegExp targets, AuraColor) onto `TypedGLBActorMaterialOverride`
 *     (predicate targets, linear tuples). `spec.color` lowers first so array
 *     overrides outrank it.
 * No /joint/i heuristic, no 0.28 constants, no emissive=baseColor fallback —
 * those live in the flag-off path (applyMaterialTint) only.
 */

import type { Material, UniformValue } from "@aura3d/rendering";
import type { AuraColor, AuraMaterialSpec } from "../agent-api/index";
import type { AuraModelMaterialOverride } from "../contracts/materials";
import { parseAuraColor } from "../contracts/sceneGraph";

export interface TypedGLBActorMaterialOverride {
  readonly target?: (materialName: string) => boolean;
  readonly baseColorMultiply?: readonly [number, number, number, number];
  readonly baseColorReplace?: readonly [number, number, number, number];
  readonly replaceTextures?: boolean;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number;
  readonly opacity?: number;
}

export type AuthoredMaterialSnapshot = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

/**
 * P2-10 (R15): preset factories stamp the keys they defaulted via `Symbol.for("aura3d.presetDefaults")`
 * on the spec (`agent-api/nodes/material.ts`; looked up by registry identity so this module stays
 * import-free). A flag-on lower reads the marker to ignore preset-defaulted colour and to substitute
 * R15's corrected defaults for legacy preset values.
 */
const PRESET_DEFAULTED_KEYS = Symbol.for("aura3d.presetDefaults");

function presetDefaultedKeys(spec: AuraMaterialSpec | undefined): ReadonlySet<string> | undefined {
  return (spec as { [key: symbol]: ReadonlySet<string> | undefined } | undefined)?.[PRESET_DEFAULTED_KEYS];
}

/** R15: preset-defaulted `emissiveIntensity` maps to the r185-corrected defaults; authored values pass through. */
function resolveEmissiveIntensity(value: number, presetDefaulted: boolean): number {
  if (!presetDefaulted) return value;
  if (value === 2.8) return 2.0; // neon preset default -> r185 default
  if (value === 1.2) return 1.0; // emissive preset default -> r185 default
  return value;
}

const SNAPSHOT_PARAMS: readonly string[] = [
  "u_baseColor", "u_baseColorFactor", "u_roughness", "u_metallic",
  "u_emissiveColor", "u_emissiveFactor", "u_emissiveStrength",
  "u_clearcoatFactor", "u_clearcoatRoughnessFactor",
  "u_environmentIntensity", "u_opacity",
  "u_baseColorTextureEnabled", "u_metallicRoughnessTextureEnabled",
  "u_normalTextureEnabled", "u_occlusionTextureEnabled", "u_emissiveTextureEnabled"
];

export function snapshotMaterials(materials: Iterable<Material>): AuthoredMaterialSnapshot {
  const snapshot = new Map<string, Record<string, unknown>>();
  let index = 0;
  for (const material of materials) {
    const values: Record<string, unknown> = {};
    const params = material.getParameters();
    for (const name of new Set([...SNAPSHOT_PARAMS, ...params.keys()])) {
      if (params.has(name)) values[name] = params.get(name);
    }
    snapshot.set(`${material.name ?? ""}#${index}`, values);
    index += 1;
  }
  return snapshot;
}

function mergeOverride(
  materialName: string,
  overrides: readonly TypedGLBActorMaterialOverride[]
): TypedGLBActorMaterialOverride | undefined {
  let resolved: TypedGLBActorMaterialOverride | undefined;
  for (const override of overrides) {
    if (override.target && !override.target(materialName)) continue;
    resolved = { ...(resolved ?? {}), ...override };
  }
  return resolved;
}

function multiplyVec4(
  base: readonly number[] | undefined,
  factor: readonly [number, number, number, number]
): [number, number, number, number] {
  const b = base ?? [1, 1, 1, 1];
  return [b[0] * factor[0], b[1] * factor[1], b[2] * factor[2], b[3] * factor[3]];
}

function asVec4(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) ? (value as readonly number[]) : undefined;
}

export function applyMaterialOverrides(
  snapshot: AuthoredMaterialSnapshot,
  materials: Iterable<Material>,
  overrides: readonly TypedGLBActorMaterialOverride[]
): void {
  let index = 0;
  for (const material of materials) {
    const key = `${material.name ?? ""}#${index}`;
    const authored = snapshot.get(key) ?? {};
    index += 1;
    for (const [name, value] of Object.entries(authored)) {
      material.setParameter(name, value as never);
    }
    const resolved = mergeOverride(material.name ?? "", overrides);
    if (!resolved) continue;

    // P2-1: writes are filtered to the parameters the authored snapshot actually captured.
    // `setMaterialOverrides([])` restores the authored state exactly — including the
    // parameter KEY SET — so an override must never introduce a param the material did
    // not already carry (e.g. a material with only `u_baseColor` must not gain
    // `u_baseColorFactor`).
    const writeToAuthoredKeys = (names: readonly string[], value: UniformValue): void => {
      for (const name of names) {
        if (name in authored) material.setParameter(name, value);
      }
    };

    if (resolved.baseColorMultiply) {
      const base = asVec4(authored.u_baseColorFactor ?? authored.u_baseColor);
      const color = multiplyVec4(base, resolved.baseColorMultiply);
      writeToAuthoredKeys(["u_baseColor", "u_baseColorFactor"], color);
      // multiply preserves base-colour textures — never touches u_baseColorTextureEnabled
    }
    if (resolved.baseColorReplace) {
      writeToAuthoredKeys(["u_baseColor", "u_baseColorFactor"], resolved.baseColorReplace);
    }
    if (resolved.replaceTextures) {
      writeToAuthoredKeys(["u_baseColorTextureEnabled"], 0);
      writeToAuthoredKeys(["u_metallicRoughnessTextureEnabled"], 0);
    }
    if (resolved.roughness !== undefined) {
      writeToAuthoredKeys(["u_roughness", "u_roughnessFactor"], resolved.roughness);
    }
    if (resolved.metallic !== undefined) {
      writeToAuthoredKeys(["u_metallic", "u_metallicFactor"], resolved.metallic);
    }
    if (resolved.emissiveColor) {
      writeToAuthoredKeys(["u_emissiveColor", "u_emissiveFactor"], resolved.emissiveColor);
    }
    if (resolved.emissiveStrength !== undefined) {
      writeToAuthoredKeys(["u_emissiveStrength"], resolved.emissiveStrength);
    }
    if (resolved.clearcoat !== undefined) {
      writeToAuthoredKeys(["u_clearcoatFactor"], resolved.clearcoat);
    }
    if (resolved.clearcoatRoughness !== undefined) {
      writeToAuthoredKeys(["u_clearcoatRoughnessFactor", "u_clearcoatRoughness"], resolved.clearcoatRoughness);
    }
    if (resolved.envMapIntensity !== undefined) {
      writeToAuthoredKeys(["u_environmentIntensity", "u_envMapIntensity"], resolved.envMapIntensity);
    }
    if (resolved.opacity !== undefined) writeToAuthoredKeys(["u_opacity", "u_alpha"], resolved.opacity);
  }
}

function targetPredicate(
  target: string | RegExp | readonly (string | RegExp)[] | undefined
): ((materialName: string) => boolean) | undefined {
  if (target === undefined) return undefined;
  const matchers = (Array.isArray(target) ? target : [target]).map((entry) =>
    typeof entry === "string" ? (name: string) => name === entry : (name: string) => entry.test(name)
  );
  return (name: string) => matchers.some((match) => match(name));
}

function colorToVec4(color: AuraColor): readonly [number, number, number, number] {
  return parseAuraColor(color);
}

export function lowerModelMaterialOverrides(
  spec: AuraMaterialSpec | undefined,
  overrides: readonly AuraModelMaterialOverride[] | undefined
): TypedGLBActorMaterialOverride[] {
  const lowered: TypedGLBActorMaterialOverride[] = [];
  const presetDefaulted = presetDefaultedKeys(spec);
  // P2-3: a preset-defaulted colour is stock preset chrome, not authored intent — array overrides
  // outrank spec colour, and the preset default itself never reaches the actor.
  if (spec?.color !== undefined && presetDefaulted?.has("color") !== true) {
    lowered.push({ baseColorMultiply: colorToVec4(spec.color) });
  }
  if (spec?.emissive !== undefined || spec?.emissiveIntensity !== undefined) {
    lowered.push({
      ...(spec.emissive !== undefined
        ? { emissiveColor: colorToVec4(spec.emissive).slice(0, 3) as [number, number, number] }
        : {}),
      // R15: `emissive` without `emissiveIntensity` resolves to the r185 default 1.0.
      ...(spec.emissiveIntensity !== undefined
        ? { emissiveStrength: resolveEmissiveIntensity(spec.emissiveIntensity, presetDefaulted?.has("emissiveIntensity") === true) }
        : { emissiveStrength: 1.0 })
    });
  }
  for (const override of overrides ?? []) {
    lowered.push({
      ...(override.target !== undefined ? { target: targetPredicate(override.target) } : {}),
      ...(override.color !== undefined
        ? override.colorMode === "replace"
          ? { baseColorReplace: colorToVec4(override.color) }
          : { baseColorMultiply: colorToVec4(override.color) }
        : {}),
      ...(override.replaceTextures !== undefined ? { replaceTextures: override.replaceTextures } : {}),
      ...(override.roughness !== undefined ? { roughness: override.roughness } : {}),
      ...(override.metallic !== undefined ? { metallic: override.metallic } : {}),
      ...(override.emissive !== undefined
        ? { emissiveColor: colorToVec4(override.emissive).slice(0, 3) as [number, number, number] }
        : {}),
      ...(override.emissiveIntensity !== undefined ? { emissiveStrength: override.emissiveIntensity } : {}),
      ...(override.clearcoat !== undefined ? { clearcoat: override.clearcoat } : {}),
      ...(override.clearcoatRoughness !== undefined
        ? { clearcoatRoughness: override.clearcoatRoughness }
        : {}),
      ...(override.envMapIntensity !== undefined ? { envMapIntensity: override.envMapIntensity } : {}),
      ...(override.opacity !== undefined ? { opacity: override.opacity } : {})
    });
  }
  return lowered;
}
