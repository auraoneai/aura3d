import type { RenderItem } from "../contracts/renderItem";
import { hasCombinedDrawIntent, packedLoopMemberFor, packedLoopProducerMemberCurrent, type PackedLoopMember } from "./BatchMembers";
import { DRAW_DATA_TEXELS_PER_DRAW, DrawDataTexture, packDrawDataFlags } from "./DrawDataTexture";
import { MAX_COMBINED_DRAW_MEMBERS, type CombinedDrawPlanRun } from "./CombinedDrawPlanner";
import type { PackedGeometryEntry } from "./BatchedGeometryPool";

/** Integer metadata lives in RGBA32F rows and must survive that conversion. */
export function isExactDrawDataInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && Math.fround(value) === value;
}

/** The shader adds 0.5 before converting flags to uint; odd bits must survive it. */
export function isSafeDrawDataGeometryId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0x3fffff;
}

/**
 * CPU-staged rows for exactly one already-ordered run. The recipient owns
 * `drawData`: after uploading or submitting its texture, keep it immutable and
 * alive until that device confirms completion (or its resources are retired on
 * loss). Dispose immediately if the run is discarded before submission.
 * Staging does not prove a device, shader, callback state, or draw is safe.
 */
export interface StagedCombinedDrawData {
  readonly drawData: DrawDataTexture;
  readonly members: CombinedDrawPlanRun["members"];
}

/**
 * Rebuild rows in actual run order because gl_DrawID begins at zero for every
 * native call. This only accepts current engine producer packets sharing the
 * same indexed packed generation and material identity. A caller still must
 * verify all pass/shader/uniform/state compatibility and revalidate immediately
 * before any native submission. `maxTextureSize` is the live device's width
 * limit, and must be checked again if the context changes.
 */
export function stageCombinedDrawData(
  items: readonly RenderItem[],
  run: CombinedDrawPlanRun,
  maxTextureSize: number
): StagedCombinedDrawData | undefined {
  const { members, indexType } = run;
  if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1 ||
      members.length < 2 || members.length > MAX_COMBINED_DRAW_MEMBERS ||
      members.length * DRAW_DATA_TEXELS_PER_DRAW > maxTextureSize ||
      (indexType !== "uint16" && indexType !== "uint32")) return undefined;
  const packets: PackedLoopMember[] = [];
  const memberSnapshots: Array<CombinedDrawPlanRun["members"][number]> = [];
  let entries: PackedGeometryEntry[];
  let first: PackedLoopMember | undefined;
  let priorIndex = -1;
  try {
    for (const member of members) {
      const { itemIndex, firstIndex, indexCount } = member;
      if (!Number.isSafeInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length ||
          (priorIndex >= 0 && itemIndex !== priorIndex + 1)) return undefined;
      priorIndex = itemIndex;
      const item = items[itemIndex]!;
      if (!hasCombinedDrawIntent(item) || !packedLoopProducerMemberCurrent(item)) return undefined;
      const packet = packedLoopMemberFor(item)!;
      if (packet.logicalItem !== item || packet.packedGeometry.indexBuffer?.type !== indexType ||
          packet.packedRange.start !== firstIndex || packet.packedRange.count !== indexCount ||
          !isExactDrawDataInteger(firstIndex) || !isExactDrawDataInteger(indexCount) ||
          !isSafeDrawDataGeometryId(packet.geometryId)) return undefined;
      if (first && (packet.pool !== first.pool || packet.packedGeometry !== first.packedGeometry ||
          packet.lease.generation !== first.lease.generation || packet.logicalMaterial !== first.logicalMaterial)) return undefined;
      first ??= packet;
      packets.push(packet);
      memberSnapshots.push(Object.freeze({ itemIndex, firstIndex, indexCount }));
    }
    // Earlier checks can call producer-owned resource readers; do not publish
    // a mixture if any member changed during staging.
    if (packets.some((packet) => !packedLoopProducerMemberCurrent(packet.logicalItem))) return undefined;
    const foundEntries = packets.map((packet) => packet.pool.entryFor(packet.sourceGeometry));
    if (foundEntries.some((entry) => entry === undefined || !isExactDrawDataInteger(entry.baseVertex))) return undefined;
    entries = foundEntries as PackedGeometryEntry[];
    if (packets.some((packet) => !packedLoopProducerMemberCurrent(packet.logicalItem))) return undefined;
  } catch {
    // Staging is optional. Invalid or concurrently changed inputs fall back
    // to their logical draws; this helper never submits a partial run.
    return undefined;
  }
  const drawData = new DrawDataTexture(packets.length);
  try {
    packets.forEach((packet, index) => drawData.setDraw(index, {
      model: packet.modelMatrix,
      baseColor: packet.color,
      meta: [packet.packedRange.start, entries[index]!.baseVertex, packet.packedRange.count,
        packDrawDataFlags(true, packet.geometryId)]
    }));
    return { drawData, members: Object.freeze(memberSnapshots) };
  } catch (error) {
    try { drawData.dispose(); } catch { /* preserve the staging error */ }
    throw error;
  }
}
