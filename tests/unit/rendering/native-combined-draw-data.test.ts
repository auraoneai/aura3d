import { describe, expect, it, vi } from "vitest";
import { batched, createBatchedLoopItems } from "../../../packages/engine/src/agent-api/nodes/batched";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { packedLoopMemberFor } from "../../../packages/rendering/src/batching/BatchMembers";
import { isExactDrawDataInteger, isSafeDrawDataGeometryId, stageCombinedDrawData } from "../../../packages/rendering/src/batching/CombinedDrawData";
import { planCombinedDrawRuns } from "../../../packages/rendering/src/batching/CombinedDrawPlanner";
import { unpackDrawDataFlags } from "../../../packages/rendering/src/batching/DrawDataTexture";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translated = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];

function runFor(items: readonly RenderItem[]) {
  const key = {};
  return planCombinedDrawRuns(items.map((item) => {
    const packet = packedLoopMemberFor(item)!;
    return { compatibilityKey: key, indexType: packet.packedGeometry.indexBuffer!.type,
      firstIndex: packet.packedRange.start, indexCount: packet.packedRange.count };
  }))[0]!;
}

describe("combined draw-data staging", () => {
  it("accepts only integer metadata exactly representable in float32", () => {
    expect([0, 0xffffff, 0x1000000, 0x1000001, 0x1000002, -1, 1.5, Infinity, NaN]
      .map(isExactDrawDataInteger)).toEqual([true, true, true, false, true, false, false, false, false]);
    expect([0, 0x3fffff, 0x400000, -1, 1.5].map(isSafeDrawDataGeometryId)).toEqual([true, true, false, false, false]);
    // GLSL arithmetic is float32: at 2^23 an odd visibility bit can round
    // away when the shader adds 0.5, even though the flag itself is exact.
    expect(Math.trunc(Math.fround(Math.fround(0x7fffff) + 0.5)) & 1).toBe(1);
    expect(Math.trunc(Math.fround(Math.fround(0x800001) + 0.5)) & 1).toBe(0);
  });

  it("rebuilds each run's rows in submitted order with member transforms, tint and ranges", () => {
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 3, multiDraw: "multi-draw" });
    const material = new UnlitMaterial({ color: [0.5, 0.25, 0.75, 0.5] });
    let release = () => {};
    let dispose = () => {};
    try {
      const a = batch.addGeometry(firstGeometry), b = batch.addGeometry(secondGeometry);
      const first = batch.addInstance(a), middle = batch.addInstance(a), last = batch.addInstance(b);
      batch.setMatrixAt(first, translated(2)); batch.setMatrixAt(middle, translated(7)); batch.setMatrixAt(last, translated(-3));
      batch.setColorAt(first, [0.25, 0.5, 0.75, 0.5]);
      batch.setColorAt(middle, [1, 0.5, 0.25, 1]);
      batch.setColorAt(last, [0.75, 1, 0.5, 0.25]);
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material,
        undefined, undefined, false, "multi-draw");
      release = prepared.release;
      // This deliberately differs from the producer's dense slot order, as a
      // sorted visible queue can do before each separate native call.
      const ordered = [prepared.items[2]!, prepared.items[0]!, prepared.items[1]!];
      const run = runFor(ordered);
      expect(stageCombinedDrawData(ordered, run, 17)).toBeUndefined();
      const staged = stageCombinedDrawData(ordered, run, 18)!;
      dispose = () => staged.drawData.dispose();
      expect([0, 1, 2].map((row) => staged.drawData.drawTexels(row)[12])).toEqual([-3, 2, 7]);
      expect([0, 1, 2].map((row) => Array.from(staged.drawData.drawTexels(row).slice(16, 20))))
        .toEqual([[0.75, 1, 0.5, 0.25], [0.25, 0.5, 0.75, 0.5], [1, 0.5, 0.25, 1]]);
      expect([0, 1, 2].map((row) => unpackDrawDataFlags(staged.drawData.drawTexels(row)[23]!)))
        .toEqual([{ visible: true, geometryId: b }, { visible: true, geometryId: a }, { visible: true, geometryId: a }]);
      expect(staged.members.map((member) => [member.firstIndex, member.indexCount]))
        .toEqual(ordered.map((item) => { const range = packedLoopMemberFor(item)!.packedRange; return [range.start, range.count]; }));
      expect(Array.from(material.getParameter("u_baseColor") as ArrayLike<number>)).toEqual([0.5, 0.25, 0.75, 0.5]);

      batch.setColorAt(first, [1, 1, 1, 1]);
      expect(stageCombinedDrawData(ordered, run, 18)).toBeUndefined();
      // A previously staged row is a snapshot, not a view of mutable slots.
      expect(Array.from(staged.drawData.drawTexels(1).slice(16, 20))).toEqual([0.25, 0.5, 0.75, 0.5]);
    } finally { dispose(); release(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); }
  });

  it("rejects stale bytes, changed ranges, foreign generations and missing intent", () => {
    const geometry = Geometry.triangle(), otherGeometry = Geometry.triangle();
    const material = new UnlitMaterial(), otherMaterial = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "multi-draw" });
    const otherBatch = batched.mesh({ maxInstances: 1, multiDraw: "multi-draw" });
    const releases: Array<() => void> = [];
    try {
      const id = batch.addGeometry(geometry);
      batch.addInstance(id); batch.addInstance(id);
      otherBatch.addInstance(otherBatch.addGeometry(otherGeometry));
      const make = (target: typeof batch, mat: UnlitMaterial, intent: "loop" | "multi-draw" = "multi-draw") => {
        const prepared = createBatchedLoopItems(target.state, target.toJSON(), identity, mat,
          undefined, undefined, false, intent);
        releases.push(prepared.release);
        return prepared.items;
      };
      const items = make(batch, material);
      const run = runFor(items);
      const wrongRange = { ...run, members: [{ ...run.members[0]!, firstIndex: run.members[0]!.firstIndex + 1 }, run.members[1]!] };
      expect(stageCombinedDrawData(items, wrongRange, 64)).toBeUndefined();
      const pool = packedLoopMemberFor(items[0])!.pool;
      const entryFor = pool.entryFor.bind(pool);
      const inexactBase = vi.spyOn(pool, "entryFor").mockImplementation((source) => {
        const entry = entryFor(source);
        return entry && { ...entry, baseVertex: 0x1000001 };
      });
      try { expect(stageCombinedDrawData(items, run, 64)).toBeUndefined(); }
      finally { inexactBase.mockRestore(); }
      const differentMaterial = make(batch, otherMaterial);
      const mixedMaterials = [items[0]!, differentMaterial[1]!];
      expect(stageCombinedDrawData(mixedMaterials, runFor(mixedMaterials), 64)).toBeUndefined();
      const foreign = make(otherBatch, material);
      const mixedPools = [items[0]!, foreign[0]!];
      expect(stageCombinedDrawData(mixedPools, runFor(mixedPools), 64)).toBeUndefined();
      const loop = make(batch, material, "loop");
      expect(stageCombinedDrawData(loop, runFor(loop), 64)).toBeUndefined();
      geometry.vertexBuffer.floats[0] += 0.25; // No revision bump: byte comparison must still invalidate it.
      expect(stageCombinedDrawData(items, run, 64)).toBeUndefined();
    } finally {
      releases.forEach((release) => release());
      batch.dispose(); otherBatch.dispose(); geometry.dispose(); otherGeometry.dispose(); material.dispose(); otherMaterial.dispose();
    }
  });
});
