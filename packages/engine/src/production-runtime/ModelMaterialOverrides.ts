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
 * No /joint/i heuristic, no 0.28 constants, no emissive=baseColor fallback.
 * 4.0 Live Fix E2: this lowering is the ONLY model-material path — the
 * former flag-off legacy tint object (applyMaterialTint) was deleted.
 *
 * GU47 E-D: `rim` (any generated-program PBR material; removed again by an override list without it), `transmission`
 * and `iridescence` (authored keys only), `applyMaterialEmissive` (`AuraModelMaterialHandle.setEmissive`: a live write,
 * no snapshot re-apply) and `applyNodeMaterialExtras` (primitive nodes: spec `rim` and the node's
 * `instanceColorTarget` onto the draw's material).
 */

import { PortableShaderMaterial, type Material, type UniformValue } from "@aura3d/rendering";
import type { AuraColor, AuraMaterialSpec } from "../agent-api/index";
import type { AuraInstanceColorTarget, AuraMaterialRimSpec } from "../agent-api/nodes/types";
import type { AuraModelMaterialOverride } from "../contracts/materials";
import { parseAuraColor } from "../contracts/sceneGraph";

/** GU47 E-D: a lowered `rim` (linear rgb). Same parameter names as `packages/rendering/src/shaders/chunks/rim.glsl.ts`. */
export interface LoweredMaterialRim {
  readonly color: readonly [number, number, number];
  readonly power: number;
  readonly intensity: number;
}

/** The PRD-04 `prd04.rim` forward feature's parameters (it selects iff the strength is > 0). */
export const MATERIAL_RIM_COLOR_PARAM = "u_prd04RimColor";
export const MATERIAL_RIM_POWER_PARAM = "u_prd04RimPower";
export const MATERIAL_RIM_INTENSITY_PARAM = "u_prd04RimStrength";
/** Same name and codes as `packages/rendering/src/shaders/chunks/instance_color_target.glsl.ts` (0 base, 1 emissive, 2 both). */
export const MATERIAL_INSTANCE_COLOR_TARGET_PARAM = "u_a3dInstanceColorTarget";

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
  /** GU47 E-D: fresnel rim (written even when the authored snapshot lacks it; cleared when no override carries one). */
  readonly rim?: LoweredMaterialRim;
  /** GU47 E-D: `u_transmissionFactor`, on materials that carry it. */
  readonly transmission?: number;
  /** GU47 E-D: `u_iridescenceFactor`, on materials that carry it. */
  readonly iridescence?: number;
  /** GU47 pass 4: `u_sheenColorFactor` (linear, already scaled by `sheen`), on materials that carry it. */
  readonly sheenColor?: readonly [number, number, number];
  /** GU47 pass 4: `u_sheenRoughnessFactor`, on materials that carry it. */
  readonly sheenRoughness?: number;
}

const clampRange = (value: number | undefined, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const loweredRims = new WeakMap<AuraMaterialRimSpec, LoweredMaterialRim>();

/** `rim: { color, power?, intensity? }` → linear colour, power 0.1..16 (default 3), intensity 0..16 (default 1). */
export function lowerMaterialRim(rim: AuraMaterialRimSpec | undefined): LoweredMaterialRim | undefined {
  if (!rim) return undefined;
  const cached = loweredRims.get(rim);
  if (cached) return cached;
  const [r, g, b] = parseAuraColor(rim.color);
  const lowered: LoweredMaterialRim = { color: [r, g, b], power: clampRange(rim.power, 3, 0.1, 16), intensity: clampRange(rim.intensity, 1, 0, 16) };
  loweredRims.set(rim, lowered);
  return lowered;
}

/** Custom shaders own their whole program (`PortableShaderMaterial.setParameter` rejects undeclared names). */
const acceptsPbrExtras = (material: Material): boolean => !material.disposed && !(material instanceof PortableShaderMaterial);

const sameVec3 = (value: UniformValue | undefined, expected: readonly number[]): boolean =>
  value !== undefined && typeof value !== "number" && "length" in value && value.length === 3
  && (value as ArrayLike<number>)[0] === expected[0] && (value as ArrayLike<number>)[1] === expected[1] && (value as ArrayLike<number>)[2] === expected[2];

/**
 * Writes the rim parameters (or clears them: intensity 0, so the `prd04.rim` feature stops selecting and the program is
 * the no-rim one again). Writes only on change, so calling it every frame does not bump the material revision. Returns
 * true when it wrote.
 */
export function setMaterialRimParameters(material: Material, rim: LoweredMaterialRim | undefined): boolean {
  if (!acceptsPbrExtras(material)) return false;
  const current = material.getParameter(MATERIAL_RIM_INTENSITY_PARAM);
  if (!rim) {
    if (typeof current !== "number" || current === 0) return false;
    material.setParameter(MATERIAL_RIM_INTENSITY_PARAM, 0);
    return true;
  }
  let wrote = false;
  if (!sameVec3(material.getParameter(MATERIAL_RIM_COLOR_PARAM), rim.color)) {
    material.setParameter(MATERIAL_RIM_COLOR_PARAM, [rim.color[0], rim.color[1], rim.color[2]]);
    wrote = true;
  }
  if (material.getParameter(MATERIAL_RIM_POWER_PARAM) !== rim.power) {
    material.setParameter(MATERIAL_RIM_POWER_PARAM, rim.power);
    wrote = true;
  }
  if (current !== rim.intensity) {
    material.setParameter(MATERIAL_RIM_INTENSITY_PARAM, rim.intensity);
    wrote = true;
  }
  return wrote;
}

const INSTANCE_COLOR_TARGET_CODES: Readonly<Record<AuraInstanceColorTarget, number>> = { base: 0, emissive: 1, both: 2 };

/** Writes `u_a3dInstanceColorTarget` (only on change; "base"/absent clears a previous target). */
export function setMaterialInstanceColorTarget(material: Material, target: AuraInstanceColorTarget | undefined): boolean {
  if (!acceptsPbrExtras(material)) return false;
  const code = INSTANCE_COLOR_TARGET_CODES[target ?? "base"] ?? 0;
  const current = material.getParameter(MATERIAL_INSTANCE_COLOR_TARGET_PARAM);
  if (current === code || (current === undefined && code === 0)) return false;
  material.setParameter(MATERIAL_INSTANCE_COLOR_TARGET_PARAM, code);
  return true;
}

/**
 * Per-frame glue for primitive nodes (`compiler/renderInput.ts`): the spec's `rim` and the node's `instanceColorTarget`
 * onto the material the draw uses (plain, textured or LOD level). Two map lookups when neither is set; writes only on
 * change. Custom-shader materials are left alone.
 */
export function applyNodeMaterialExtras(
  material: Material | undefined,
  spec: AuraMaterialSpec | undefined,
  instanceColorTarget: AuraInstanceColorTarget | undefined
): void {
  if (!material || !acceptsPbrExtras(material)) return;
  setMaterialRimParameters(material, lowerMaterialRim(spec?.rim));
  setMaterialInstanceColorTarget(material, instanceColorTarget);
}

/**
 * `AuraModelMaterialHandle.setEmissive(target, color, intensity)`: writes the emissive colour and strength on every
 * material named `target` (`"*"`: every material), on the parameters each material carries. A live write: no snapshot
 * restore, no override re-apply, so it is cheap enough to call every frame (brake lights, blinking signs). A later
 * `setMaterialOverrides` re-applies from the authored snapshot and replaces it. Returns the number of materials written.
 */
export function applyMaterialEmissive(materials: Iterable<Material>, target: string, color: AuraColor, intensity: number): number {
  const [r, g, b] = parseAuraColor(color);
  const strength = Number.isFinite(intensity) ? Math.max(0, intensity) : 0;
  let written = 0;
  for (const material of materials) {
    if (material.disposed || (target !== "*" && material.name !== target)) continue;
    const params = material.getParameters();
    let touched = false;
    for (const name of ["u_emissiveColor", "u_emissiveFactor"]) {
      if (!params.has(name)) continue;
      if (!sameVec3(params.get(name), [r, g, b])) material.setParameter(name, [r, g, b]);
      touched = true;
    }
    if (params.has("u_emissiveStrength")) {
      if (params.get("u_emissiveStrength") !== strength) material.setParameter("u_emissiveStrength", strength);
      touched = true;
    }
    if (touched) written += 1;
  }
  return written;
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
    // GU47 E-D: rim is the one field written outside the authored key set, so it is also cleared explicitly
    // (intensity 0: the rim feature stops selecting) when no override for this material carries it.
    setMaterialRimParameters(material, resolved?.rim);
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
    if (resolved.transmission !== undefined) writeToAuthoredKeys(["u_transmissionFactor"], clampRange(resolved.transmission, 0, 0, 1));
    if (resolved.iridescence !== undefined) writeToAuthoredKeys(["u_iridescenceFactor"], clampRange(resolved.iridescence, 0, 0, 1));
    if (resolved.sheenColor) writeToAuthoredKeys(["u_sheenColorFactor"], [resolved.sheenColor[0], resolved.sheenColor[1], resolved.sheenColor[2]]);
    if (resolved.sheenRoughness !== undefined) writeToAuthoredKeys(["u_sheenRoughnessFactor"], clampRange(resolved.sheenRoughness, 0, 0, 1));
  }
}

/** `sheen` (0..1, default 1) times `sheenColor` (default white), linear. */
function lowerSheenColor(sheen: number | undefined, color: AuraModelMaterialOverride["sheenColor"]): [number, number, number] {
  const scale = clampRange(sheen, 1, 0, 1);
  const [r, g, b] = color !== undefined ? colorToVec4(color) : [1, 1, 1];
  return [r! * scale, g! * scale, b! * scale];
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
  // 4.0 Live Fix E2: spec surface scalars lower too. The deleted legacy
  // tint path forwarded roughness/metallic/clearcoat whenever a color was
  // present; the override path silently dropped them without a color.
  // Authored (non-preset-defaulted) scalars now lower unconditionally so
  // `model(asset, { material: { roughness } })` survives to the actor.
  const authored = (key: string) => presetDefaulted?.has(key) !== true;
  const metallic = spec?.metallic ?? spec?.metalness;
  const surface: TypedGLBActorMaterialOverride = {
    ...(spec?.roughness !== undefined && authored("roughness") ? { roughness: spec.roughness } : {}),
    ...(metallic !== undefined && authored("metallic") && authored("metalness") ? { metallic } : {}),
    ...(spec?.clearcoat !== undefined && authored("clearcoat") ? { clearcoat: spec.clearcoat } : {}),
    ...(spec?.clearcoatRoughness !== undefined && authored("clearcoatRoughness")
      ? { clearcoatRoughness: spec.clearcoatRoughness }
      : {})
  };
  if (Object.keys(surface).length > 0) lowered.push(surface);
  // GU47 E-D: `model(asset, { material: { rim } })`.
  const specRim = authored("rim") ? lowerMaterialRim(spec?.rim) : undefined;
  if (specRim) lowered.push({ rim: specRim });
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
      ...(override.opacity !== undefined ? { opacity: override.opacity } : {}),
      ...(override.rim !== undefined ? { rim: lowerMaterialRim(override.rim) } : {}),
      ...(override.transmission !== undefined ? { transmission: override.transmission } : {}),
      ...(override.iridescence !== undefined ? { iridescence: override.iridescence } : {}),
      ...(override.sheen !== undefined || override.sheenColor !== undefined ? { sheenColor: lowerSheenColor(override.sheen, override.sheenColor) } : {}),
      ...(override.sheenRoughness !== undefined ? { sheenRoughness: override.sheenRoughness } : {})
    });
  }
  return lowered;
}
