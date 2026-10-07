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
import { renderStateKey, resolveBlendMode } from "../contracts/blend";
import { geometryContentKey, materialKeyExcludesParameter, materialSpecKey } from "./ContentKeys";

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

export const REASONS_NOT_BATCHED = [
  "transparent", "textured-unique", "skinned", "morph", "batch:false",
  "dynamic-material", "emissive-varies", "vertex-colors",
  "multi-draw-generator-pending", "caster-variant-pending"
] as const;

export type NotBatchedReason = typeof REASONS_NOT_BATCHED[number];

const IDENTITY4 = [1, 1, 1, 1] as const;

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

/**
 * §6.6: batched materials are restricted to scalar PBR. On the legacy path the
 * merged draw renders through `aura3d/instanced-pbr` (the only shader carrying
 * `u_instanceAttributeMode`/`a_instanceMatrix*` or the `u_instanceMatrices`
 * uniform fallback), so any other `shaderKey` — or a PBR material carrying a
 * real texture — cannot merge.
 */
function isScalarPbrMaterial(material: RenderMaterial | undefined): boolean {
  const base = materialBase(material);
  if (!base) return false;
  if (base.shaderKey !== DEFAULT_PBR_SHADER_NAME && base.shaderKey !== DEFAULT_INSTANCED_PBR_SHADER_NAME) return false;
  return !materialHasTextures(material);
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



function emissiveSignature(material: RenderMaterial | undefined): string {
  if (!material) return "";
  const params = material.getParameters();
  const parts: string[] = [];
  for (const name of [...params.keys()].sort()) {
    const bare = name.startsWith("u_") ? name.slice(2) : name;
    if (bare !== "emissive" && bare !== "emissiveColor" && bare !== "emissiveStrength" && bare !== "emissiveIntensity") continue;
    const value: UniformValue | undefined = params.get(name);
    parts.push(`${bare}=${typeof value === "number" ? value : value ? Array.from(value as ArrayLike<number>).join(",") : ""}`);
  }
  return parts.join("|");
}

function colorOf(material: RenderMaterial | undefined): readonly number[] {
  const value = material?.getParameters().get("u_baseColor") ?? material?.getParameters().get("baseColor");
  if (value && typeof value !== "number" && !isTextureBinding(value)) {
    const arr = Array.from(value as ArrayLike<number>);
    if (arr.length >= 4 && arr.every(Number.isFinite)) return [arr[0]!, arr[1]!, arr[2]!, arr[3]!];
    if (arr.length >= 3 && arr.every(Number.isFinite)) return [arr[0]!, arr[1]!, arr[2]!, 1];
  }
  return IDENTITY4;
}

function vertexLayoutKey(geometry: Geometry): string {
  const f = geometry.vertexBuffer.format;
  return `${f.stride}|${f.attributes.map((a) => `${a.semantic}:${a.components}`).join(",")}|${geometry.indexBuffer ? "idx" : "no-idx"}|${geometry.topology}`;
}

function programKey(material: RenderMaterial | undefined): string {
  const base = materialBase(material);
  return `${base?.shaderKey ?? "none"}|${base?.shaderVariant ?? ""}`;
}

function renderStateKeyOf(material: RenderMaterial | undefined): number {
  const state = materialBase(material)?.renderState;
  return state ? renderStateKey(state) : 0;
}

/**
 * Merged draw material: `InstancedPBRMaterial` carrying every shared scalar
 * parameter of the group (colour/emissive excluded — they ride
 * `instanceColors`/`instanceEmissive`), `u_baseColor` forced white so
 * `baseColor × instanceColor` reproduces the member colour.
 */
function mergedMaterial(material: RenderMaterial): InstancedPBRMaterial {
  const base = materialBase(material)!;
  const sourceParams = material.getParameters();
  const merged = new InstancedPBRMaterial({
    name: `a3d-prd11-batched-${base.name ?? "pbr"}`,
    renderState: base.renderState,
    baseColor: IDENTITY4
  });
  for (const name of merged.getParameters().keys()) {
    if (materialKeyExcludesParameter(name, sourceParams)) continue;
    const value = sourceParams.get(name);
    if (value !== undefined) merged.setParameter(name, value);
  }
  return merged;
}

function buildBatch(key: string, members: RenderItem[], maxPerDraw: number): InstancedBatch {
  const first = members[0]!;
  const transforms = new Float32Array(members.length * 16);
  const colors = new Float32Array(members.length * 4);
  members.forEach((item, index) => {
    const model = item.modelMatrix ?? IDENTITY16;
    for (let i = 0; i < 16; i += 1) transforms[index * 16 + i] = model[i] ?? (i % 5 === 0 ? 1 : 0);
    const color = colorOf(item.material);
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
    material: mergedMaterial(first.material!),
    castShadow: first.castShadow !== false,
    members,
    instanceTransforms: transforms,
    instanceColors: colors,
    chunks
  };
}

const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

export function planBatches(items: readonly RenderItem[], options: PlanBatchesOptions = {}): BatchPlan {
  const instancing = options.instancing !== false;
  const multiDraw = options.multiDraw !== false;
  const multiDrawAvailable = options.multiDrawAvailable === true;
  const maxPerDraw = Math.max(1, options.maxInstancesPerDraw ?? MAX_GPU_INSTANCES);
  const reasons: Record<string, number> = {};
  const bump = (reason: NotBatchedReason) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };

  const passthrough: RenderItem[] = [];
  const candidates: RenderItem[] = [];
  for (const item of items) {
    if (item.instanceTransforms) { passthrough.push(item); continue; }       // engine-instanced already
    if (batchOptOut(item)) { bump("batch:false"); passthrough.push(item); continue; }
    if (isSkinnedOrMorphed(item)) { bump(item.skinning ? "skinned" : "morph"); passthrough.push(item); continue; }
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
  const instancedBatches: InstancedBatch[] = [];
  const leftovers: RenderItem[] = [];
  if (instancing) {
    const groups = new Map<string, RenderItem[]>();
    for (const item of candidates) {
      const key = [
        geometryContentKey(item.geometry),
        materialSpecKey(item.material!),
        item.castShadow !== false ? 1 : 0,
        renderStateKeyOf(item.material)
      ].join("|");
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
          if (subset.length >= 2) instancedBatches.push(buildBatch(`${key}|e:${signature}`, subset, maxPerDraw));
          else { bump("emissive-varies"); passthrough.push(subset[0]!); }
        }
        continue;
      }
      instancedBatches.push(buildBatch(key, members, maxPerDraw));
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
      const key = `${programKey(item.material)}|${renderStateKeyOf(item.material)}|${vertexLayoutKey(item.geometry)}`;
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
