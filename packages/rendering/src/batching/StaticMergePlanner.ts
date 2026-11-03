/**
 * PRD 11 Phase 3 (§6.6) — `planBatches(items, options)` reduces a frame's
 * explicit `RenderItem` list into instanced batches, multi-draw groups and a
 * passthrough list. Runs at scene mount and on structural change only — never
 * per frame — and is pure: it reads Geometry/Material state through the
 * content keys and produces descriptors the submit path consumes.
 *
 * Layers (applied in order):
 *   1. Content-keyed dedupe/instancing — items sharing
 *      `(geometryContentKey, materialSpecKey, castShadow, renderStateKey)`
 *      become one instanced draw; per-node colour rides `instanceColors` with
 *      the merged material's `u_baseColor` forced to white so
 *      `baseColor × instanceColor` reproduces the original per-node colour
 *      (sRGB→linear already happened engine-side).
 *   2. Multi-draw — leftover static opaque scalar-PBR items group by
 *      `(programKey, renderStateKey, vertexLayoutKey)` for
 *      `WEBGL_multi_draw` / the `u_drawId` loop fallback. Skipped entirely
 *      while the C-02 generator is a stub (`multi-draw-generator-pending`).
 *
 * Transparent, skinned, morph, vertex-coloured, engine-instanced and
 * `batch:false` items pass through with a `reasonsNotBatched` count.
 */

import type { Geometry } from "../Geometry";
import { Material } from "../Material";
import { MaterialInstance } from "../MaterialInstance";
import { InstancedPBRMaterial } from "../InstancedPBRMaterial";
import { DEFAULT_INSTANCED_PBR_SHADER_NAME } from "../ShaderLibraryCore";
import { DEFAULT_PBR_SHADER_NAME } from "../PBRMaterial";
import type { RenderItem } from "../contracts/renderItem";
import type { RenderMaterial } from "../ForwardPass";
import type { UniformValue } from "../RenderDevice";
import { isTextureBinding } from "../TextureBinding";
import { renderStateSignature, resolveBlendMode } from "../contracts/blend";
import { geometryContentKey, materialSpecKey, vertexFormatKey } from "./ContentKeys";

/** MAX_GPU_INSTANCES on the legacy instance path (ForwardPass.ts). */
export const MAX_GPU_INSTANCES = 64;

export interface PlanBatchesOptions {
  /** Layer 1+2 content-keyed instancing (default true). */
  readonly instancing?: boolean;
  /** Layer 3 multi-draw packing (default true, no-ops without `multiDrawAvailable`). */
  readonly multiDraw?: boolean;
  /** The generated shader path can splice `prd11.drawId` (C-02 real). */
  readonly multiDrawAvailable?: boolean;
  /** Per-draw instance cap while C-07's stub instance buffer is active. */
  readonly maxInstancesPerDraw?: number;
}

export interface InstancedBatch {
  /** `${geometryKey}|${materialKey}|${renderState}|${castShadow}` */
  readonly key: string;
  readonly geometry: Geometry;
  readonly material: RenderMaterial;
  readonly castShadow: boolean;
  readonly members: readonly RenderItem[];
  /** Member matrices, 16 floats each, in member order. */
  readonly instanceTransforms: Float32Array;
  /** Member linear RGBA colours, 4 floats each (white when member has none). */
  readonly instanceColors: Float32Array;
  /** `members` sliced into `maxInstancesPerDraw` chunks. */
  readonly chunks: readonly InstancedBatchChunk[];
}

export interface InstancedBatchChunk {
  readonly members: readonly RenderItem[];
  readonly instanceTransforms: Float32Array;
  readonly instanceColors: Float32Array;
}

export interface MultiDrawGroup {
  /** `${programKey}|${renderState}|${vertexLayout}` */
  readonly key: string;
  readonly programKey: string;
  readonly vertexLayoutKey: string;
  readonly members: readonly RenderItem[];
}

export interface BatchPlan {
  readonly instancedBatches: readonly InstancedBatch[];
  readonly multiDrawGroups: readonly MultiDrawGroup[];
  readonly passthrough: readonly RenderItem[];
  /** reason → item count; keys from the fixed §16.0 vocabulary. */
  readonly reasonsNotBatched: Readonly<Record<string, number>>;
  readonly stats: {
    readonly inputItems: number;
    readonly instancedDraws: number;
    readonly multiDrawMembers: number;
    readonly passthroughItems: number;
  };
}

/** A failed plan retains only its unfinished, internally owned material cleanup. */
export class BatchPlanBuildError extends AggregateError {
  private readonly pendingCleanup: Set<InstancedPBRMaterial>;
  private cleaning = false;

  constructor(readonly originalError: unknown, errors: readonly unknown[], pending: readonly InstancedPBRMaterial[]) {
    let detail = "";
    // Planning can throw any value, including an Error with an unsafe message getter.
    try { if (originalError instanceof Error) detail = `: ${originalError.message}`; } catch { /* retain the original as cause */ }
    super([originalError, ...errors], `Batch plan construction and cleanup failed${detail}`, { cause: originalError });
    this.pendingCleanup = new Set(pending);
  }

  /** Retry unfinished cleanup; completed or reentrantly disposed materials are not touched again. */
  retryCleanup(): void {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const errors: unknown[] = [];
      for (const material of [...this.pendingCleanup]) {
        if (!this.pendingCleanup.delete(material) || material.disposed) continue;
        try { material.dispose(); } catch (error) {
          if (!material.disposed) this.pendingCleanup.add(material);
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Batch plan cleanup retry failed");
    } finally {
      this.cleaning = false;
    }
  }
}

export const REASONS_NOT_BATCHED = [
  "transparent", "textured-unique", "skinned", "morph", "batch:false",
  "dynamic-material", "emissive-varies", "vertex-colors",
  "multi-draw-generator-pending", "caster-variant-pending", "unsupported-vertex-streams"
] as const;

export type NotBatchedReason = typeof REASONS_NOT_BATCHED[number];

const IDENTITY4 = [1, 1, 1, 1] as const;

const BASIC_BATCH_FIELDS: ReadonlySet<PropertyKey> = new Set(["geometry", "material", "modelMatrix"]);
// These built-in methods are unrelated to a draw. Other Object.prototype
// properties may be inherited item metadata (including render callbacks).
const OBJECT_PROTOTYPE_BUILTINS: ReadonlySet<PropertyKey> = new Set([
  "constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__",
  "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"
]);

const UNKNOWN_BATCH_PROPERTY = Symbol("unknown batch property");

/** Inspect inherited data without invoking accessors; unknown properties fail closed. */
function batchDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const visited = new Set<object>();
    for (let object: object | null = value; object; object = Object.getPrototypeOf(object) as object | null) {
      if (visited.has(object)) return UNKNOWN_BATCH_PROPERTY;
      visited.add(object);
      const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
      if (descriptor) return "value" in descriptor ? descriptor.value : UNKNOWN_BATCH_PROPERTY;
    }
    return undefined;
  } catch {
    return UNKNOWN_BATCH_PROPERTY;
  }
}

/** Source clipping is resolved after collect, so none of its items may merge. */
export function sourceMayHaveBatchClipping(source: object): boolean {
  return batchDataProperty(source, "globalClipping") != null || batchDataProperty(source, "materialClippingFor") != null;
}

function itemMayHaveMaterialClipping(item: RenderItem): boolean {
  let material = batchDataProperty(item, "material");
  if (material == null) return false;
  if (material === UNKNOWN_BATCH_PROPERTY || (typeof material !== "object" && typeof material !== "function")) return true;
  try {
    if (material instanceof MaterialInstance) material = batchDataProperty(material, "baseMaterial");
  } catch {
    return true;
  }
  if (material === UNKNOWN_BATCH_PROPERTY || material == null || (typeof material !== "object" && typeof material !== "function")) return true;
  return batchDataProperty(material, "clipping") != null;
}

/**
 * Unknown item properties cannot survive a synthesized draw. A caller may
 * opt into castShadow only when it partitions and carries that field itself.
 * Accessor properties are rejected without invoking them. JavaScript Proxy
 * traps can run during descriptor/prototype inspection, so callers that need
 * trap-free preflight must provide independently trusted item identities.
 */
export function hasOnlyPreservedBatchFields(item: RenderItem, preserveCastShadow = false): boolean {
  for (let object: object | null = item; object; object = Object.getPrototypeOf(object) as object | null) {
    for (const key of Reflect.ownKeys(object)) {
      if (object === Object.prototype && OBJECT_PROTOTYPE_BUILTINS.has(key)) continue;
      if (key === "constructor" && object !== item) continue;
      const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
      // Do not invoke user-provided accessors while deciding eligibility.
      if (!descriptor || !("value" in descriptor)) return false;
      if (BASIC_BATCH_FIELDS.has(key) || (preserveCastShadow && key === "castShadow")) continue;
      if (descriptor.value !== undefined) return false;
    }
  }
  return !itemMayHaveMaterialClipping(item);
}

function materialBase(material: RenderMaterial | undefined): Material | null {
  if (!material) return null;
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}

function materialHasTextures(material: RenderMaterial | undefined): boolean {
  if (!material) return false;
  for (const value of material.getParameters().values()) {
    if (isTextureBinding(value) && value.texture) return true;
  }
  return false;
}

// These scalar fields exist on PBRMaterial but not on the synthesized
// InstancedPBRMaterial or its legacy shader. Only their neutral defaults can
// be dropped without silently changing the original surface.
const UNSUPPORTED_PHYSICAL_DEFAULTS: Readonly<Record<string, number | readonly number[]>> = {
  u_clearcoatFactor: 0, u_clearcoatRoughnessFactor: 0,
  u_transmissionFactor: 0, u_diffuseTransmissionFactor: 0, u_diffuseTransmissionColorFactor: [1, 1, 1],
  u_transmissionFallbackEnergy: 0.08, u_volumeThicknessFactor: 0, u_volumeAttenuationDistance: 1_000_000,
  u_volumeAttenuationColor: [1, 1, 1], u_transmissionParallaxStrength: 0,
  u_transmissionParallaxBoxMin: [-1, -1, -1], u_transmissionParallaxBoxMax: [1, 1, 1],
  u_transmissionBounceCount: 0, u_transmissionCausticStrength: 0, u_ior: 1.5,
  u_specularFactor: 1, u_specularColorFactor: [1, 1, 1],
  u_sheenColorFactor: [0, 0, 0], u_sheenRoughnessFactor: 0,
  u_anisotropyStrength: 0, u_anisotropyRotation: 0,
  u_iridescenceFactor: 0, u_iridescenceIor: 1.3,
  u_iridescenceThicknessMinimum: 100, u_iridescenceThicknessMaximum: 400, u_dispersion: 0
};

function hasUnsupportedPhysicalParameters(material: RenderMaterial): boolean {
  const parameters = material.getParameters();
  for (const [name, expected] of Object.entries(UNSUPPORTED_PHYSICAL_DEFAULTS)) {
    const value = parameters.get(name);
    if (value === undefined) continue;
    if (typeof expected === "number") {
      if (typeof value !== "number" || value !== expected) return true;
    } else {
      if (typeof value === "number" || isTextureBinding(value) || value.length !== expected.length ||
          expected.some((component, index) => value[index] !== component)) return true;
    }
  }
  return false;
}

/**
 * §6.6: batched materials are restricted to scalar PBR. On the legacy path the
 * merged draw renders through `aura3d/instanced-pbr` (the only shader carrying
 * `u_instanceAttributeMode`/`a_instanceMatrix*` or the `u_instanceMatrices`
 * uniform fallback), so any other `shaderKey` — or a PBR material carrying a
 * real texture — cannot merge.
 */
function isScalarPbrMaterial(material: RenderMaterial | undefined): boolean {
  if (!material) return false;
  const base = materialBase(material);
  if (!base) return false;
  if (base.shaderKey !== DEFAULT_PBR_SHADER_NAME && base.shaderKey !== DEFAULT_INSTANCED_PBR_SHADER_NAME) return false;
  // The synthesized InstancedPBRMaterial does not carry graph/variant
  // identity. Keep those materials on their original draw path.
  if (base.shaderVariant !== undefined) return false;
  return !materialHasTextures(material) && !hasUnsupportedPhysicalParameters(material);
}

function materialTransparent(material: RenderMaterial | undefined): boolean {
  const base = materialBase(material);
  if (!base) return false;
  return resolveBlendMode(base.renderState) !== "opaque" || Boolean(base.renderState.blend);
}

function isSkinnedOrMorphed(item: RenderItem): boolean {
  return Boolean(item.skinning) || Boolean(item.morphTargets?.length);
}

function hasVertexColors(geometry: Geometry): boolean {
  return geometry.vertexBuffer.format.attributes.some((a) => a.semantic === "color");
}

function batchOptOut(item: RenderItem): boolean {
  return (item as { readonly batch?: boolean }).batch === false;
}

/** Read an own data property for diagnostics without invoking an accessor. */
function ownDataValue(item: RenderItem, key: PropertyKey): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(item, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}


function emissiveSignature(material: RenderMaterial | undefined): string {
  if (!material) return "";
  const params = material.getParameters();
  const parts: unknown[] = [];
  const numberKey = (value: number) => Object.is(value, -0) ? "-0" : String(value);
  for (const name of [...params.keys()].sort()) {
    const bare = name.startsWith("u_") ? name.slice(2) : name;
    if (bare !== "emissive" && bare !== "emissiveColor" && bare !== "emissiveStrength" && bare !== "emissiveIntensity") continue;
    const value: UniformValue | undefined = params.get(name);
    parts.push([name, typeof value === "number" ? ["number", numberKey(value)]
      : value ? ["array", Array.from(value as ArrayLike<number>, numberKey)] : ["undefined"]]);
  }
  return JSON.stringify(parts);
}

export function batchColorOf(material: RenderMaterial | undefined): readonly number[] {
  const value = material?.getParameters().get("u_baseColor") ?? material?.getParameters().get("baseColor");
  if (value && typeof value !== "number" && !isTextureBinding(value)) {
    const arr = Array.from(value as ArrayLike<number>);
    if (arr.length >= 4 && arr.every(Number.isFinite)) return [arr[0]!, arr[1]!, arr[2]!, arr[3]!];
    if (arr.length >= 3 && arr.every(Number.isFinite)) return [arr[0]!, arr[1]!, arr[2]!, 1];
  }
  return IDENTITY4;
}

function vertexLayoutKey(geometry: Geometry): string {
  return JSON.stringify([vertexFormatKey(geometry.vertexBuffer.format), Boolean(geometry.indexBuffer), geometry.topology]);
}

/** The packed arena contains only per-vertex slot 0 data. */
function supportsPackedVertexLayout(geometry: Geometry): boolean {
  const format = geometry.vertexBuffer.format;
  const stream = format.streams[0];
  return format.streams.length === 1 && stream?.slot === 0 && stream.stepMode === "vertex" && geometry.vertexBuffer.bufferSlot === 0;
}

function programKey(material: RenderMaterial | undefined): string {
  const base = materialBase(material);
  return JSON.stringify([base?.shaderKey ?? null, base?.shaderVariant ?? null]);
}

function renderStateKeyOf(material: RenderMaterial | undefined): string {
  const state = materialBase(material)?.renderState;
  return state ? renderStateSignature(state) : "";
}

/**
 * Merged draw material: `InstancedPBRMaterial` carrying the supported shared
 * parameters, including the emissive value used to partition the group.
 * `u_baseColor` is forced white so `baseColor × instanceColor` reproduces
 * each member's colour.
 */
function mergedMaterial(material: RenderMaterial, synthesized: InstancedPBRMaterial[]): InstancedPBRMaterial {
  const base = materialBase(material)!;
  const sourceParams = material.getParameters();
  const merged = new InstancedPBRMaterial({
    name: `a3d-prd11-batched-${base.name ?? "pbr"}`,
    renderState: base.renderState,
    fog: base.fog,
    baseColor: IDENTITY4
  });
  // Own the new material before initialization or any later batch field can
  // throw, even if no InstancedBatch has been inserted into the plan yet.
  synthesized.push(merged);
  for (const name of merged.getParameters().keys()) {
    // Color is applied per member. Emissive is shared only after grouping by
    // emissiveSignature, so it must be copied rather than reset to black.
    if (name === "u_baseColor" || name === "baseColor") continue;
    const value = sourceParams.get(name);
    if (value !== undefined) merged.setParameter(name, value);
  }
  return merged;
}

function buildBatch(key: string, members: RenderItem[], maxPerDraw: number, synthesized: InstancedPBRMaterial[]): InstancedBatch {
  const first = members[0]!;
  const transforms = new Float32Array(members.length * 16);
  const colors = new Float32Array(members.length * 4);
  members.forEach((item, index) => {
    const model = item.modelMatrix ?? IDENTITY16;
    for (let i = 0; i < 16; i += 1) transforms[index * 16 + i] = model[i] ?? (i % 5 === 0 ? 1 : 0);
    const color = batchColorOf(item.material);
    for (let i = 0; i < 4; i += 1) colors[index * 4 + i] = color[i] ?? 1;
  });
  const chunks: InstancedBatchChunk[] = [];
  for (let start = 0; start < members.length; start += maxPerDraw) {
    const end = Math.min(start + maxPerDraw, members.length);
    chunks.push({
      members: members.slice(start, end),
      instanceTransforms: transforms.subarray(start * 16, end * 16),
      instanceColors: colors.subarray(start * 4, end * 4)
    });
  }
  return {
    key,
    geometry: first.geometry,
    material: mergedMaterial(first.material!, synthesized),
    castShadow: first.castShadow !== false,
    members,
    instanceTransforms: transforms,
    instanceColors: colors,
    chunks
  };
}

const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

/**
 * Plan a batch and transfer synthesized materials to the successful result.
 * When planning and cleanup both fail, the thrown BatchPlanBuildError exposes
 * the original as its cause and a retryCleanup() method. Keep that error for
 * later retries, including when a retry itself throws.
 */
export function planBatches(items: readonly RenderItem[], options: PlanBatchesOptions = {}): BatchPlan {
  const instancedBatches: InstancedBatch[] = [];
  const synthesized: InstancedPBRMaterial[] = [];
  try {
    return buildBatchPlan(items, options, instancedBatches, synthesized);
  } catch (error) {
    // No plan owns these synthesized materials yet. Caller materials and
    // materials belonging to other plans never enter this list.
    const errors: unknown[] = [];
    const pending: InstancedPBRMaterial[] = [];
    for (const material of synthesized) {
      if (material.disposed) continue;
      try { material.dispose(); } catch (cleanupError) {
        if (!material.disposed) pending.push(material);
        errors.push(cleanupError);
      }
    }
    if (errors.length) throw new BatchPlanBuildError(error, errors, pending.filter((material) => !material.disposed));
    throw error;
  }
}

function buildBatchPlan(items: readonly RenderItem[], options: PlanBatchesOptions, instancedBatches: InstancedBatch[], synthesized: InstancedPBRMaterial[]): BatchPlan {
  const instancing = options.instancing !== false;
  const multiDraw = options.multiDraw !== false;
  const multiDrawAvailable = options.multiDrawAvailable === true;
  const requestedMaxPerDraw = options.maxInstancesPerDraw ?? MAX_GPU_INSTANCES;
  if (requestedMaxPerDraw !== Infinity && !Number.isSafeInteger(requestedMaxPerDraw)) {
    throw new RangeError("maxInstancesPerDraw must be a safe integer or Infinity");
  }
  const maxPerDraw = Math.max(1, requestedMaxPerDraw);
  const reasons: Record<string, number> = {};
  const bump = (reason: NotBatchedReason) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };

  const passthrough: RenderItem[] = [];
  const candidates: RenderItem[] = [];
  for (const item of items) {
    if (!hasOnlyPreservedBatchFields(item, true)) {
      if (ownDataValue(item, "batch") === false) bump("batch:false");
      else if (ownDataValue(item, "skinning")) bump("skinned");
      else if ((ownDataValue(item, "morphTargets") as readonly unknown[] | undefined)?.length) bump("morph");
      passthrough.push(item);
      continue;
    }
    if (item.instanceTransforms || item.instanceAttributes || (item.instanceCount !== undefined && item.instanceCount !== 1)) {
      passthrough.push(item); continue; // engine-instanced already
    }
    if (batchOptOut(item)) { bump("batch:false"); passthrough.push(item); continue; }
    if (isSkinnedOrMorphed(item)) { bump(item.skinning ? "skinned" : "morph"); passthrough.push(item); continue; }
    if (!supportsPackedVertexLayout(item.geometry)) { bump("unsupported-vertex-streams"); passthrough.push(item); continue; }
    if (!item.material) { passthrough.push(item); continue; }
    if (materialTransparent(item.material)) { bump("transparent"); passthrough.push(item); continue; }
    // `dynamic-material` is counted where it is observable: `BatchPlanCache`
    // counts members whose material revision churned since the last plan.
    // (Every fresh Material is dirty until first bind — isDirty() is not a
    // static eligibility signal.)
    if (hasVertexColors(item.geometry)) { bump("vertex-colors"); passthrough.push(item); continue; }
    if (materialHasTextures(item.material)) { bump("textured-unique"); passthrough.push(item); continue; }
    // Non-PBR shaders (unlit, custom) cannot ride `aura3d/instanced-pbr`:
    // passthrough silently — the §16.0 reason vocabulary has no slot for them.
    if (!isScalarPbrMaterial(item.material)) { passthrough.push(item); continue; }
    candidates.push(item);
  }

  // Layer 1+2: instancing groups.
  const leftovers: RenderItem[] = [];
  if (instancing) {
    const groups = new Map<string, RenderItem[]>();
    // A geometry can occur hundreds of times in one plan. Its bytes are
    // stable during this call, so hash each object once without retaining a
    // stale key across later calls that may observe mutable geometry.
    const geometryKeys = new Map<Geometry, string>();
    for (const item of candidates) {
      let geometryKey = geometryKeys.get(item.geometry);
      if (geometryKey === undefined) {
        geometryKey = geometryContentKey(item.geometry);
        geometryKeys.set(item.geometry, geometryKey);
      }
      const key = JSON.stringify([
        geometryKey,
        materialSpecKey(item.material!),
        item.castShadow !== false ? 1 : 0,
        renderStateKeyOf(item.material)
      ]);
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
    for (const [key, members] of groups) {
      if (members.length < 2) { leftovers.push(...members); continue; }
      // Emissive that differs per member can only merge on the generated path
      // (prd11.instanceEmissive); on this planner those members split out.
      const emissives = new Set(members.map((m) => emissiveSignature(m.material)));
      if (emissives.size > 1) {
        for (const signature of emissives) {
          const subset = members.filter((m) => emissiveSignature(m.material) === signature);
          if (subset.length >= 2) instancedBatches.push(buildBatch(JSON.stringify([key, signature]), subset, maxPerDraw, synthesized));
          else { bump("emissive-varies"); passthrough.push(subset[0]!); }
        }
        continue;
      }
      instancedBatches.push(buildBatch(key, members, maxPerDraw, synthesized));
    }
  } else {
    leftovers.push(...candidates);
  }

  // Layer 3: multi-draw over leftover static opaque scalar materials.
  const multiDrawGroups: MultiDrawGroup[] = [];
  if (multiDraw && multiDrawAvailable) {
    const groups = new Map<string, RenderItem[]>();
    for (const item of leftovers) {
      if (!isScalarPbrMaterial(item.material)) { passthrough.push(item); continue; }
      const key = JSON.stringify([programKey(item.material), renderStateKeyOf(item.material), vertexLayoutKey(item.geometry)]);
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
    for (const [key, members] of groups) {
      if (members.length < 2) { passthrough.push(...members); continue; }
      multiDrawGroups.push({ key, programKey: members[0]!.material ? programKey(members[0]!.material) : "none", vertexLayoutKey: vertexLayoutKey(members[0]!.geometry), members });
      for (const member of members) if (member.castShadow !== false) bump("caster-variant-pending");
    }
  } else if (multiDraw && leftovers.length > 0) {
    for (const item of leftovers) bump("multi-draw-generator-pending");
    passthrough.push(...leftovers);
  } else {
    passthrough.push(...leftovers);
  }

  return {
    instancedBatches,
    multiDrawGroups,
    passthrough,
    reasonsNotBatched: reasons,
    stats: {
      inputItems: items.length,
      instancedDraws: instancedBatches.reduce((sum, b) => sum + b.chunks.length, 0),
      multiDrawMembers: multiDrawGroups.reduce((sum, g) => sum + g.members.length, 0),
      passthroughItems: passthrough.length
    }
  };
}
