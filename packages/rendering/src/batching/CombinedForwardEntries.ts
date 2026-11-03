import { UnlitMaterial } from "../UnlitMaterial";
import { PBRMaterial } from "../PBRMaterial";
import { InstancedPBRMaterial } from "../InstancedPBRMaterial";
import type { RenderDevice } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";
import { hasCombinedDrawIntent, packedLoopCandidate, packedLoopMemberFor, type PackedLoopMember } from "./BatchMembers";
import type { CombinedDrawPlanEntry } from "./CombinedDrawPlanner";
import { BatchedGeometryPool } from "./BatchedGeometryPool";

// These are the complete fields on an engine-created member and its ordinary
// camera projection. Unknown fields (including private symbols) can introduce
// item-specific bindings and therefore make an item a run boundary.
const memberFields = new Set<PropertyKey>(["geometry", "material", "label", "drawRange", "modelMatrix", "normalMatrix",
  "modelViewProjectionMatrix", "instanceTransforms", "instanceColors", "temporalObjectKey", "castShadow", "renderOrder",
  "frustumCulled", "layerMask", "userData"]);
const poolPrototype = BatchedGeometryPool.prototype;
const poolDescriptors = Object.getOwnPropertyDescriptors(poolPrototype);
const poolParent = Object.getPrototypeOf(poolPrototype) as object | null;

function ordinaryPool(pool: BatchedGeometryPool): boolean {
  if (Object.getPrototypeOf(pool) !== poolPrototype || Object.getPrototypeOf(poolPrototype) !== poolParent) return false;
  const keys = Reflect.ownKeys(poolDescriptors);
  if (Reflect.ownKeys(poolPrototype).length !== keys.length) return false;
  if (keys.some((key) => {
    const before = Reflect.get(poolDescriptors, key) as PropertyDescriptor;
    const after = Object.getOwnPropertyDescriptor(poolPrototype, key);
    return !after || before.value !== after.value || before.get !== after.get || before.set !== after.set
      || before.writable !== after.writable || before.enumerable !== after.enumerable || before.configurable !== after.configurable;
  })) return false;
  return Reflect.ownKeys(pool).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(pool, key);
    return descriptor !== undefined && !descriptor.get && !descriptor.set && typeof descriptor.value !== "function";
  });
}

/** Mirrored or singular placements need their own face/normal treatment. */
function supportedTransform(packet: PackedLoopMember): boolean {
  const m = packet.modelMatrix;
  if (m.length !== 16 || !m.every(Number.isFinite) || m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) return false;
  const determinant = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!)
    - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!)
    + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
  return Number.isFinite(determinant) && determinant > 1e-10;
}

/** Keep lit inverse-transpose calculations away from singular/unstable bases. */
function supportedLitTransform(packet: PackedLoopMember): boolean {
  const m = packet.modelMatrix;
  const lengths = [Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!)];
  if (lengths.some((value) => !Number.isFinite(value) || value < 0.01 || value > 100)) return false;
  const pairs = [[0, 4], [0, 8], [4, 8]] as const;
  return pairs.every(([a, b], index) => {
    const dot = m[a]! * m[b]! + m[a + 1]! * m[b + 1]! + m[a + 2]! * m[b + 2]!;
    const pair = index === 0 ? [0, 1] : index === 1 ? [0, 2] : [1, 2];
    return Math.abs(dot) <= 1e-6 * lengths[pair[0]!]! * lengths[pair[1]!]!;
  });
}

/** PBR retains constructor options; do not elide getters or resource hooks. */
function ordinaryPbrOptions(material: PBRMaterial | InstancedPBRMaterial): boolean {
  const root = (material as unknown as { readonly prd04Options?: unknown }).prd04Options;
  const seen = new WeakSet<object>();
  let remaining = 128;
  const plain = (value: unknown, depth: number): boolean => {
    if (value === undefined || value === null || typeof value === "boolean" || typeof value === "string") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || depth > 4 || remaining-- <= 0 || seen.has(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
    seen.add(value);
    return Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === "string" && descriptor !== undefined && !descriptor.get && !descriptor.set
        && (key === "length" && Array.isArray(value) || plain(descriptor.value, depth + 1));
    });
  };
  return root !== undefined && plain(root, 0);
}

/**
 * Make bounded planner inputs from already ordered logical items. This is a
 * narrow generated-unlit/PBR shape; the pass must still prove callbacks, feature
 * identity, clipping, device state, resource ownership, and shader bindings.
 * Candidate lookup retains the packed generation in the current frame.
 */
export function combinedForwardEntries(device: RenderDevice, items: readonly RenderItem[]): readonly (CombinedDrawPlanEntry | undefined)[] {
  const keys = new WeakMap<object, WeakMap<object, object>>();
  return items.map((item) => {
    if (!hasCombinedDrawIntent(item)) return undefined;
    try {
      if (Object.getPrototypeOf(item) !== Object.prototype || Reflect.ownKeys(item).some((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return !memberFields.has(key) || !descriptor || !!descriptor.get || !!descriptor.set;
      })) return undefined;
      const material = item.material;
      const prototype = material && Object.getPrototypeOf(material);
      const lit = prototype === PBRMaterial.prototype || prototype === InstancedPBRMaterial.prototype;
      if (!material || (prototype !== UnlitMaterial.prototype && !lit)) return undefined;
      if (lit && !ordinaryPbrOptions(material as PBRMaterial | InstancedPBRMaterial)) return undefined;
      const sourcePacket = packedLoopMemberFor(item);
      if (!sourcePacket || !ordinaryPool(sourcePacket.pool)) return undefined;
      const packet = packedLoopCandidate(device, item);
      if (!packet || packet.logicalItem !== item || !supportedTransform(packet)
        || (lit && !supportedLitTransform(packet))) return undefined;
      const indexType = packet.packedGeometry.indexBuffer?.type;
      if (indexType !== "uint16" && indexType !== "uint32") return undefined;
      let materials = keys.get(packet.packedGeometry);
      if (!materials) keys.set(packet.packedGeometry, materials = new WeakMap());
      let key = materials.get(material);
      if (!key) materials.set(material, key = {});
      return { compatibilityKey: key, indexType, firstIndex: packet.packedRange.start, indexCount: packet.packedRange.count };
    } catch {
      return undefined;
    }
  });
}
