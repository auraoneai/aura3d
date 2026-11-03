import { describe, expect, it } from "vitest";
import { batched, createBatchedLoopItems } from "../../../packages/engine/src/agent-api/nodes/batched";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { beginPackedLoopFrame, registerPackedLoopDevice } from "../../../packages/rendering/src/batching/BatchMembers";
import { combinedForwardEntries } from "../../../packages/rendering/src/batching/CombinedForwardEntries";
import { planCombinedDrawRuns } from "../../../packages/rendering/src/batching/CombinedDrawPlanner";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("combined forward planner candidates", () => {
  it("only joins adjacent current engine members in the same indexed generation and material", () => {
    const first = Geometry.triangle(), second = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 3, multiDraw: "multi-draw" });
    const device = new MockRenderDevice();
    registerPackedLoopDevice(device);
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(first)); batch.addInstance(batch.addGeometry(second));
      batch.addInstance(0);
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material,
        undefined, undefined, false, "multi-draw");
      release = prepared.release;
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      const entries = combinedForwardEntries(device, prepared.items);
      expect(entries.every(Boolean)).toBe(true);
      expect(entries[0]!.compatibilityKey).toBe(entries[1]!.compatibilityKey);
      expect(planCombinedDrawRuns(entries).map((run) => run.members.map((member) => member.itemIndex))).toEqual([[0, 1, 2]]);
      const secondItem = prepared.items[1]!;
      Object.assign(secondItem, { onBeforeRender: () => {} });
      expect(combinedForwardEntries(device, prepared.items).map(Boolean)).toEqual([true, false, true]);
      Reflect.deleteProperty(secondItem, "onBeforeRender");
      batch.setVisibleAt(0, false);
      expect(combinedForwardEntries(device, prepared.items).every((entry) => entry === undefined)).toBe(true);
      device.endFrame(); frame.finish(() => () => {});
    } finally { release(); batch.dispose(); first.dispose(); second.dispose(); material.dispose(); device.dispose(); }
  });

  it("leaves mirrored, singular, accessor-bearing, and non-intent members on logical draws", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), device = new MockRenderDevice();
    const batch = batched.mesh({ maxInstances: 3, multiDraw: "multi-draw" });
    registerPackedLoopDevice(device);
    const releases: Array<() => void> = [];
    try {
      const id = batch.addGeometry(geometry);
      const positive = batch.addInstance(id), mirror = batch.addInstance(id), singular = batch.addInstance(id);
      batch.setMatrixAt(mirror, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      batch.setMatrixAt(singular, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material,
        undefined, undefined, false, "multi-draw");
      const loop = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      releases.push(prepared.release, loop.release);
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      expect(combinedForwardEntries(device, prepared.items).map(Boolean)).toEqual([true, false, false]);
      expect(combinedForwardEntries(device, loop.items).every((entry) => entry === undefined)).toBe(true);
      const item = prepared.items[positive]!;
      Object.defineProperty(item, "customField", { configurable: true, get() { throw new Error("accessor ran"); } });
      expect(combinedForwardEntries(device, [item])).toEqual([undefined]);
      delete (item as RenderItem & { customField?: unknown }).customField;
      device.endFrame(); frame.finish(() => () => {});
    } finally { releases.forEach((release) => release()); batch.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each([
    ["PBR", () => new PBRMaterial()],
    ["instanced PBR", () => new InstancedPBRMaterial()]
  ] as const)("accepts a rotated nonuniform %s basis and rejects shear and tiny or mirrored scales", (_kind, createMaterial) => {
    const geometry = Geometry.triangle(), material = createMaterial(), device = new MockRenderDevice();
    const batch = batched.mesh({ maxInstances: 4, multiDraw: "multi-draw" });
    registerPackedLoopDevice(device);
    let release = () => {};
    try {
      const id = batch.addGeometry(geometry);
      const rotated = batch.addInstance(id), shear = batch.addInstance(id), tiny = batch.addInstance(id), mirror = batch.addInstance(id);
      batch.setMatrixAt(rotated, [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]);
      batch.setMatrixAt(shear, [1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      batch.setMatrixAt(tiny, [0.001, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      batch.setMatrixAt(mirror, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material,
        undefined, undefined, false, "multi-draw");
      release = prepared.release;
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      expect(combinedForwardEntries(device, prepared.items).map(Boolean)).toEqual([true, false, false, false]);
      let getterCalls = 0;
      const retainedOptions = (material as unknown as { prd04Options: Record<string, unknown> }).prd04Options;
      Object.defineProperty(retainedOptions, "metallic", { configurable: true, get() { getterCalls += 1; return 0; } });
      expect(combinedForwardEntries(device, prepared.items).every((entry) => entry === undefined)).toBe(true);
      expect(getterCalls).toBe(0);
      Reflect.deleteProperty(retainedOptions, "metallic");
      device.endFrame(); frame.finish(() => () => {});
    } finally { release(); batch.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });
});
