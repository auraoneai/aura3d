// BATCH-1 compiler auto-instancing: coalesces strictly static, non-addressable
// leaf triangle primitives that share geometry buffers and material into one
// instanced RenderItem per frame (with per-scene instanced-material and batch
// caches). Extracted unchanged from compileScene.ts (max-file-lines gate).

import type { AuraPrimitiveNode, AuraSceneNode } from "../nodes/types.js";
import type { RenderItem, RenderSource } from "@aura3d/rendering";
import { InstancedPBRMaterial, InstancedUnlitMaterial, PBRMaterial, UnlitMaterial, packedLoopMemberFor } from "@aura3d/rendering";
import { mountedRootOf } from "./mountedRoots.js";
import { applyNodeMaterialExtras } from "../../production-runtime/ModelMaterialOverrides.js";
import { withAdvancedLightingOrigin } from "./advancedLightingBridge.js";
import { createProductionPrimitiveMaterial } from "./primitives.js";
import type { CompiledSceneImpl } from "./compileScene.js";

const COMPILER_AUTO_INSTANCED_SYMBOL = Symbol.for("aura3d.compilerAutoInstanced");
const AUTO_INSTANCED_IDENTITY_MATRIX = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);
const AUTO_INSTANCED_SENTINEL_TRANSFORMS = [{}] as const;

interface AutoInstancedBatchRecord {
  transforms: Float32Array;
  item: RenderItem;
  geometry: RenderItem["geometry"];
  material: InstancedPBRMaterial | InstancedUnlitMaterial;
}

interface AutoInstancedSceneState {
  readonly materials: Map<PBRMaterial | UnlitMaterial, InstancedPBRMaterial | InstancedUnlitMaterial>;
  readonly batches: Map<string, AutoInstancedBatchRecord>;
  readonly objectIds: WeakMap<object, number>;
  nextId: number;
}

const autoInstancedSceneStates = new WeakMap<object, AutoInstancedSceneState>();

function getAutoInstancedSceneState(owner: object): AutoInstancedSceneState {
  let state = autoInstancedSceneStates.get(owner);
  if (!state) {
    state = {
      materials: new Map(),
      batches: new Map(),
      objectIds: new WeakMap(),
      nextId: 1
    };
    autoInstancedSceneStates.set(owner, state);
  }
  return state;
}

function autoInstancedObjectId(state: AutoInstancedSceneState, target: object | null | undefined): number {
  if (!target) return 0;
  let id = state.objectIds.get(target);
  if (id === undefined) {
    id = state.nextId;
    state.nextId += 1;
    state.objectIds.set(target, id);
  }
  return id;
}

export function clearAutoInstancedBatches(owner: object): void {
  autoInstancedSceneStates.get(owner)?.batches.clear();
}

export function disposeAutoInstancedSceneState(owner: object): void {
  const state = autoInstancedSceneStates.get(owner);
  if (!state) return;
  autoInstancedSceneStates.delete(owner);
  state.batches.clear();
  const failures: unknown[] = [];
  for (const instanced of state.materials.values()) {
    try {
      instanced.dispose();
    } catch (error) {
      failures.push(error);
    }
  }
  state.materials.clear();
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Auto-instanced material cleanup failed");
}

function matrix3x3Determinant(m: readonly number[] | Float32Array): number {
  const m00 = m[0] ?? 0, m01 = m[4] ?? 0, m02 = m[8] ?? 0;
  const m10 = m[1] ?? 0, m11 = m[5] ?? 0, m12 = m[9] ?? 0;
  const m20 = m[2] ?? 0, m21 = m[6] ?? 0, m22 = m[10] ?? 0;
  return m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
}

function isFiniteMat4WithPositiveDet(m: readonly number[] | Float32Array | undefined): m is readonly number[] | Float32Array {
  if (!m || m.length !== 16) return false;
  for (let i = 0; i < 16; i += 1) {
    const v = m[i]!;
    if (!Number.isFinite(v)) return false;
  }
  const det = matrix3x3Determinant(m);
  return Number.isFinite(det) && det > 1e-12;
}

function isAutoBatchableMaterial(material: RenderItem["material"]): material is PBRMaterial | UnlitMaterial {
  if (!material) return false;
  const proto = Object.getPrototypeOf(material);
  if (proto !== PBRMaterial.prototype && proto !== UnlitMaterial.prototype) return false;
  const stdMat = material as PBRMaterial | UnlitMaterial;
  if (stdMat.disposed) return false;
  if (stdMat.renderState.blend) return false;
  if (stdMat.renderState.blendMode !== undefined && stdMat.renderState.blendMode !== "opaque") return false;
  if ((stdMat as { readonly clipping?: unknown }).clipping !== undefined) return false;
  if (stdMat instanceof PBRMaterial) {
    if (stdMat.requiredAttributes.includes("a_uv")) return false;
    if (Number(stdMat.getParameter("u_transmissionFactor") ?? 0) > 0) return false;
    if (Number(stdMat.getParameter("u_diffuseTransmissionFactor") ?? 0) > 0) return false;
    if (Number(stdMat.getParameter("u_volumeThicknessFactor") ?? 0) > 0) return false;
  }
  return true;
}

function getOrCreateAutoInstancedMaterial(
  state: AutoInstancedSceneState,
  sourceMaterial: PBRMaterial | UnlitMaterial,
  node: AuraPrimitiveNode
): InstancedPBRMaterial | InstancedUnlitMaterial | undefined {
  const existing = state.materials.get(sourceMaterial);
  if (existing && !existing.disposed) return existing;
  const created = createProductionPrimitiveMaterial({
    ...node,
    name: undefined,
    instances: AUTO_INSTANCED_SENTINEL_TRANSFORMS
  });
  if (!(created instanceof InstancedPBRMaterial || created instanceof InstancedUnlitMaterial)) {
    created.dispose();
    return undefined;
  }
  applyNodeMaterialExtras(created, node.material, node.instanceColorTarget);
  state.materials.set(sourceMaterial, created);
  return created;
}

/**
 * BATCH-1 Step A2–A3: Coalesce K >= 2 strictly static, non-addressable leaf
 * triangle primitives sharing `(Geometry buffers, Material, castShadow,
 * receiveShadow, layerMask, renderOrder, bloomWeight)` into a single instanced
 * `RenderItem` while keeping every runtime-handle node (`app.nodes`) unbatched.
 * `hasRuntimeHandle` is supplied by the caller (compiler/ may not value-import app/).
 */
export function coalesceStaticPrimitiveRenderItems(
  impl: Pick<CompiledSceneImpl, "primitiveEntries" | "actorEntries" | "itemCache"> & Partial<Pick<CompiledSceneImpl, "batchSceneClipping" | "mountCtx" | "liveNodes">>,
  source: RenderSource,
  items: readonly RenderItem[],
  hasRuntimeHandle: (node: AuraSceneNode) => boolean,
  isVolatile: (node: AuraSceneNode) => boolean
): RenderItem[] {
  if (items.length < 2 || impl.primitiveEntries.length < 2) return items as RenderItem[];
  if (source.staticBatching === false || impl.batchSceneClipping) return items as RenderItem[];
  if (impl.mountCtx && !impl.mountCtx.flags.on("A3D_QR_CORE_GENERATOR")) return items as RenderItem[];
  if (impl.liveNodes?.some((n) => n.kind === "effect" && (n.effect === "motion-blur" || (n.effect === "anti-alias" && n.mode === "taa")))) {
    return items as RenderItem[];
  }

  const state = getAutoInstancedSceneState(impl);
  interface CandidateMember {
    readonly itemIndex: number;
    readonly item: RenderItem;
    readonly node: AuraPrimitiveNode;
    readonly material: PBRMaterial | UnlitMaterial;
  }
  const groups = new Map<string, CandidateMember[]>();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    const label = item.label ?? "";
    const match = /^primitive-(\d+):/.exec(label);
    if (!match) continue;
    const entry = impl.primitiveEntries[Number(match[1])];
    const node = entry?.node;
    if (!entry || !node || node.kind !== "primitive") continue;
    if (
      node.runtime?.id !== undefined ||
      hasRuntimeHandle(node) ||
      mountedRootOf(node) !== undefined ||
      (node as { readonly visible?: boolean }).visible === false ||
      node.instances !== undefined ||
      node.instanceColors !== undefined ||
      node.lod !== undefined ||
      node.text3D !== undefined ||
      node.animation !== undefined ||
      node.interaction !== undefined ||
      node.physics !== undefined ||
      isVolatile(node) ||
      isVolatileItem(item)
    ) {
      continue;
    }
    const lightingNode = node as {
      readonly lightmap?: unknown;
      readonly reflectionProbe?: unknown;
      readonly irradianceVolume?: unknown;
    };
    if (
      lightingNode.lightmap !== undefined ||
      lightingNode.reflectionProbe !== undefined ||
      lightingNode.irradianceVolume !== undefined
    ) {
      continue;
    }
    if (
      item.instanceTransforms !== undefined ||
      item.instanceColors !== undefined ||
      item.instanceAttributes !== undefined ||
      item.instanceEmissive !== undefined ||
      item.onBeforeRender !== undefined ||
      item.drawRange !== undefined ||
      item.geometryMatrix !== undefined ||
      item.frustumCulled === false ||
      item.globalClipping !== undefined ||
      item.materialClipping !== undefined ||
      item.cubeCameraEnvMap !== undefined ||
      item.environmentCube !== undefined ||
      item.shadowGeometry !== undefined ||
      packedLoopMemberFor(item) !== undefined
    ) {
      continue;
    }
    const geo = item.geometry;
    if (
      !geo ||
      geo.topology !== "triangles" ||
      (geo.groups?.length ?? 0) > 0 ||
      geo.drawRange !== undefined ||
      (geo.morphTargets?.length ?? 0) > 0 ||
      geo.additionalVertexBuffers.length > 0 ||
      !isFiniteMat4WithPositiveDet(item.modelMatrix) ||
      !isAutoBatchableMaterial(item.material)
    ) {
      continue;
    }

    const vbId = autoInstancedObjectId(state, geo.vertexBuffer);
    const ibId = autoInstancedObjectId(state, geo.indexBuffer);
    const matId = autoInstancedObjectId(state, item.material);
    const groupKey = `${vbId}:${ibId}:${matId}:${item.castShadow !== false ? 1 : 0}:${item.receiveShadow !== false ? 1 : 0}:${item.layerMask ?? 1}:${item.renderOrder ?? 0}:${item.bloomWeight ?? 1}:${item.includeInAutoFrame === true ? 1 : 0}`;
    let bucket = groups.get(groupKey);
    if (!bucket) {
      bucket = [];
      groups.set(groupKey, bucket);
    }
    bucket.push({ itemIndex: i, item, node, material: item.material });
  }

  let hasMergedGroup = false;
  for (const bucket of groups.values()) {
    if (bucket.length >= 2) {
      hasMergedGroup = true;
      break;
    }
  }
  if (!hasMergedGroup) return items as RenderItem[];

  const skipIndices = new Uint8Array(items.length);
  const replacements = new Map<number, RenderItem>();

  for (const [groupKey, bucket] of groups) {
    if (bucket.length < 2) continue;
    const leader = bucket[0]!;
    const instancedMaterial = getOrCreateAutoInstancedMaterial(state, leader.material, leader.node);
    if (!instancedMaterial) continue;

    const count = bucket.length;
    const prevRecord = state.batches.get(groupKey);
    let transforms: Float32Array;
    if (prevRecord && prevRecord.transforms.length === count * 16) {
      let unchanged = true;
      for (let mIdx = 0; mIdx < count && unchanged; mIdx += 1) {
        const src = bucket[mIdx]!.item.modelMatrix!;
        const base = mIdx * 16;
        for (let k = 0; k < 16; k += 1) {
          if (prevRecord.transforms[base + k] !== Math.fround(src[k]!)) {
            unchanged = false;
            break;
          }
        }
      }
      if (unchanged) {
        transforms = prevRecord.transforms;
      } else {
        transforms = new Float32Array(count * 16);
        for (let mIdx = 0; mIdx < count; mIdx += 1) {
          transforms.set(bucket[mIdx]!.item.modelMatrix!, mIdx * 16);
        }
      }
    } else {
      transforms = new Float32Array(count * 16);
      for (let mIdx = 0; mIdx < count; mIdx += 1) {
        transforms.set(bucket[mIdx]!.item.modelMatrix!, mIdx * 16);
      }
    }

    let batchedItem: RenderItem;
    if (
      prevRecord &&
      prevRecord.transforms === transforms &&
      prevRecord.geometry === leader.item.geometry &&
      prevRecord.material === instancedMaterial
    ) {
      batchedItem = prevRecord.item;
    } else {
      batchedItem = withAdvancedLightingOrigin({
        geometry: leader.item.geometry,
        material: instancedMaterial,
        modelMatrix: AUTO_INSTANCED_IDENTITY_MATRIX,
        instanceTransforms: transforms,
        label: leader.item.label,
        castShadow: leader.item.castShadow,
        receiveShadow: leader.item.receiveShadow,
        includeInAutoFrame: leader.item.includeInAutoFrame,
        ...(leader.item.renderOrder === undefined ? {} : { renderOrder: leader.item.renderOrder }),
        ...(leader.item.layerMask === undefined ? {} : { layerMask: leader.item.layerMask }),
        ...(leader.item.bloomWeight === undefined ? {} : { bloomWeight: leader.item.bloomWeight }),
        ...(leader.item.userData === undefined ? {} : { userData: leader.item.userData }),
        [COMPILER_AUTO_INSTANCED_SYMBOL]: true
      } as RenderItem, leader.node);
      state.batches.set(groupKey, {
        transforms,
        item: batchedItem,
        geometry: leader.item.geometry,
        material: instancedMaterial
      });
    }

    replacements.set(leader.itemIndex, batchedItem);
    for (let mIdx = 1; mIdx < count; mIdx += 1) {
      skipIndices[bucket[mIdx]!.itemIndex] = 1;
    }
  }

  if (replacements.size === 0) return items as RenderItem[];
  const output: RenderItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    if (skipIndices[i]) continue;
    output.push(replacements.get(i) ?? items[i]!);
  }
  return output;
}

/** Items whose content changes every frame without a node version bump. */
export function isVolatileItem(item: RenderItem): boolean {
  return item.skinning !== undefined || (item.morphTargets?.length ?? 0) > 0 || (item.morphWeights?.length ?? 0) > 0;
}
