import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd03";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import * as velocityContract from "../../../packages/rendering/src/contracts/velocity";
import {
  resetTemporalHistory,
  type TemporalHistoryLike, type TemporalResetTarget
} from "../../../packages/rendering/src/contracts/velocity";
import {
  createScopedVelocityHistory, VelocityHistory, velocityHistorySlot
} from "../../../packages/rendering/src/forward/Velocity";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

const enabled = createTrustedQrFlags({ A3D_QR_POST: true });
const disabled = createTrustedQrFlags({ A3D_QR_POST: false });

function matrixAt(x: number): Float32Array {
  return Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]);
}

function seed(history: TemporalHistoryLike, x: number): void {
  history.prepare(matrixAt(x), [0, 0], 1);
  history.commit?.(1);
}

describe("velocity histories: no shared compatibility history, owner-scoped resets only", () => {
  it("exposes no module-global history or unscoped reset registration", () => {
    expect("history" in velocityHistorySlot.get(enabled)).toBe(false);
    expect("history" in velocityHistorySlot.get(disabled)).toBe(false);
    expect("history" in velocityHistorySlot.stub).toBe(false);
    expect("setTemporalHistoryImpl" in velocityContract).toBe(false);
  });

  it("isolates two scoped histories and rejects a reset without an explicit target", () => {
    const first = createScopedVelocityHistory(enabled);
    const second = createScopedVelocityHistory(enabled);
    expect(first).toBeInstanceOf(VelocityHistory);
    expect(second).toBeInstanceOf(VelocityHistory);
    expect(first).not.toBe(second);

    seed(first, 10);
    seed(second, 20);
    resetTemporalHistory("camera-cut", first);
    expect(first.prepare(matrixAt(11), [0, 0], 2).previous[12]).toBe(11);
    expect(second.prepare(matrixAt(21), [0, 0], 2).previous[12]).toBe(20);

    first.commit?.(2);
    second.commit?.(2);
    expect(() => resetTemporalHistory("resize", undefined as never)).toThrow(/explicit renderer, device or view/);
    expect(() => resetTemporalHistory("resize", {} as never)).toThrow(/explicit renderer, device or view/);
    expect(first.prepare(matrixAt(12), [0, 0], 3).previous[12]).toBe(11);
    expect(second.prepare(matrixAt(22), [0, 0], 3).previous[12]).toBe(21);
    first.reset("explicit-reset");
    second.reset("explicit-reset");
  });

  it("creates separate flag-off stubs from the flag-off slot factory", () => {
    const first = createScopedVelocityHistory(disabled);
    const second = createScopedVelocityHistory(disabled);
    const stub = velocityHistorySlot.get(disabled);
    expect(stub.kind).toBe("legacy");
    expect(first).not.toBe(second);
    expect(first.prepare(matrixAt(1), [0, 0], 1).previous[12]).toBe(1);
    expect(first.prepare(matrixAt(2), [0, 0], 2).previous[12]).toBe(2);
    expect(second.prepare(matrixAt(7), [0, 0], 1).previous[12]).toBe(7);
    resetTemporalHistory("camera-cut", first);
    expect(second.prepare(matrixAt(8), [0, 0], 2).previous[12]).toBe(8);
  });

  it("resets explicit targets; a targetless reset never selects a history implicitly", () => {
    const scoped = createScopedVelocityHistory(enabled);
    seed(scoped, 5);
    expect(() => resetTemporalHistory("resize", undefined as never)).toThrow(/explicit/); // scoped history remains intact
    expect(scoped.prepare(matrixAt(6), [0, 0], 2).previous[12]).toBe(5);
    scoped.commit?.(2);
    resetTemporalHistory("camera-cut", scoped);
    expect(scoped.prepare(matrixAt(7), [0, 0], 3).previous[12]).toBe(7);
  });

  it("accepts a renderer-owned temporal history and a single-view reset adapter", () => {
    const device = new MockRenderDevice();
    const first = new TemporalHistory(), second = new TemporalHistory();
    setRendererQrFlags(enabled, device);
    try {
      first.prepare(device, 8, 8, [], matrixAt(1), { viewId: "left", frameId: 1 });
      first.prepare(device, 8, 8, [], matrixAt(10), { viewId: "right", frameId: 1 });
      second.prepare(device, 8, 8, [], matrixAt(20), { viewId: "left", frameId: 1 });
      first.commit("left", 1);
      first.commit("right", 1);
      second.commit("left", 1);

      const leftOnly: TemporalResetTarget = { reset: reason => first.reset(reason, "left") };
      resetTemporalHistory("camera-cut", leftOnly);
      const left = first.prepare(device, 8, 8, [], matrixAt(2), { viewId: "left", frameId: 2 });
      const right = first.prepare(device, 8, 8, [], matrixAt(11), { viewId: "right", frameId: 2 });
      const other = second.prepare(device, 8, 8, [], matrixAt(21), { viewId: "left", frameId: 2 });
      expect(left.historyValid).toBe(false);
      expect(right.historyValid).toBe(true);
      expect(right.v2!.previous[12]).toBe(10);
      expect(other.historyValid).toBe(true);
      expect(other.v2!.previous[12]).toBe(20);

      first.commit("right", 2);
      second.commit("left", 2);
      // TemporalHistory has a different prepare signature but is a reset target.
      const ownerTarget: TemporalResetTarget = first;
      resetTemporalHistory("scene-swap", ownerTarget);
      expect(first.prepare(device, 8, 8, [], matrixAt(12), { viewId: "right", frameId: 3 }).historyValid).toBe(false);
      const unaffected = second.prepare(device, 8, 8, [], matrixAt(22), { viewId: "left", frameId: 3 });
      expect(unaffected.historyValid).toBe(true);
      expect(unaffected.v2!.previous[12]).toBe(21);
    } finally {
      first.dispose();
      second.dispose();
      device.dispose();
    }
  });

  it("rejects a custom provider without a scoped factory", () => {
    const custom = { kind: "v2" as const } as unknown as ReturnType<typeof velocityHistorySlot.get>;
    const lookup = vi.spyOn(velocityHistorySlot, "get").mockReturnValue(custom);
    try {
      expect(velocityHistorySlot.get(enabled)).toBe(custom);
      expect(() => createScopedVelocityHistory(enabled)).toThrow(/does not support scoped history/);
    } finally {
      lookup.mockRestore();
    }
  });

  it("uses a custom provider's factory and requires independent valid histories", () => {
    const custom = {
      kind: "v2" as const,
      calls: 0,
      createHistory() {
        this.calls += 1;
        return new VelocityHistory();
      }
    };
    const lookup = vi.spyOn(velocityHistorySlot, "get").mockReturnValue(custom);
    try {
      const first = createScopedVelocityHistory(enabled), second = createScopedVelocityHistory(enabled);
      expect(custom.calls).toBe(2);
      expect(first).not.toBe(second);

      const shared = new VelocityHistory();
      lookup.mockReturnValue({ kind: "v2", createHistory: () => shared });
      expect(createScopedVelocityHistory(enabled)).toBe(shared);
      expect(() => createScopedVelocityHistory(enabled)).toThrow(/fresh history/);
      const repeated = new VelocityHistory();
      lookup.mockReturnValue({ kind: "v2", createHistory: () => repeated });
      expect(createScopedVelocityHistory(enabled)).toBe(repeated);
      expect(() => createScopedVelocityHistory(enabled)).toThrow(/fresh history/);
      lookup.mockReturnValue({ kind: "v2", createHistory: () => null as unknown as TemporalHistoryLike });
      expect(() => createScopedVelocityHistory(enabled)).toThrow(/history object/);
    } finally {
      lookup.mockRestore();
    }
  });
});
