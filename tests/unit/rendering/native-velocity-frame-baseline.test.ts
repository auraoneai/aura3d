import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd03";
import { MockRenderDevice, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { VelocityHistory, bindVelocityUniforms } from "../../../packages/rendering/src/forward/Velocity";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

function matrixAt(x: number): Float32Array {
  return Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]);
}

// Velocity preparation only retains the geometry identity; the mock temporal
// path does not draw it, so no GPU resource is needed for these tests.
const geometry = {} as RenderItem["geometry"];
function item(key: object, currentX: number, previous?: Float32Array): RenderItem {
  return {
    geometry, label: "same label", temporalObjectKey: key, modelMatrix: matrixAt(currentX),
    ...(previous === undefined ? {} : { previousModelMatrix: previous })
  };
}

function previousX(prepared: RenderItem): number {
  const uniforms = new Map<string, UniformValue>();
  expect(bindVelocityUniforms).toBeDefined();
  bindVelocityUniforms!(prepared, uniforms);
  const previous = uniforms.get("u_previousModel");
  expect(previous).toBeInstanceOf(Float32Array);
  return (previous as Float32Array)[12]!;
}

describe("velocity history previous model per authored frame", () => {
  it("cancels only an uncommitted frame while preserving the last successful model and camera", () => {
    const history = new VelocityHistory(), key = {};
    history.prepare(matrixAt(4), [0, 0], "seed");
    history.prepareItem(item(key, 3), true);
    history.commit("seed");
    expect(history.cancel("seed")).toBe(false);
    history.prepare(matrixAt(8), [0, 0], "pending");
    const abandoned = history.prepareItem(item(key, 5), true);
    expect(previousX(abandoned)).toBe(3);
    expect(history.cancel("other")).toBe(false);
    expect(history.cancel("pending")).toBe(true);
    expect(history.cancel("pending")).toBe(false);
    const stale = new Map<string, UniformValue>();
    bindVelocityUniforms!(abandoned, stale);
    expect(stale.size).toBe(0);
    expect(history.prepare(matrixAt(9), [0, 0], "retry").previous[12]).toBe(4);
    expect(previousX(history.prepareItem(item(key, 6), true))).toBe(3);
    history.commit("retry");
    history.prepare(matrixAt(10), [0, 0], "next");
    expect(previousX(history.prepareItem(item(key, 7), true))).toBe(6);
  });

  it("rejects conflicting explicit previous matrices without changing coverage or the committed model", () => {
    const history = new VelocityHistory(), key = {};
    history.prepare(matrixAt(0), [0, 0], "first");
    const first = history.prepareItem(item(key, 1, matrixAt(1)), true);
    expect(previousX(first)).toBe(1);
    const coverage = { items: 1, withVelocity: 1, moving: 0, movingWithHistory: 0 };
    expect(history.coverage).toEqual(coverage);

    expect(() => history.prepareItem(item(key, 1, matrixAt(0)), true)).toThrow(/conflicting previous transforms/);
    expect(history.coverage).toEqual(coverage);
    expect(previousX(first)).toBe(1);
    // Equal matrices need not be the same array, and a failed pass can retry.
    expect(previousX(history.prepareItem(item(key, 1, matrixAt(1)), true))).toBe(1);
    expect(history.coverage).toEqual(coverage);
    history.commit("first");

    history.prepare(matrixAt(0), [0, 0], "second");
    expect(previousX(history.prepareItem(item(key, 2), true))).toBe(1);
    expect(history.coverage).toEqual({ items: 1, withVelocity: 1, moving: 1, movingWithHistory: 1 });
  });

  it.each([false, true])("accepts equal explicit and committed baselines in either order (explicit first: %s)", (explicitFirst) => {
    const history = new VelocityHistory(), key = {};
    history.prepare(matrixAt(0), [0, 0], 0);
    history.prepareItem(item(key, 3));
    history.commit(0);
    history.prepare(matrixAt(0), [0, 0], 1);

    const implicit = item(key, 5), explicit = item(key, 5, matrixAt(3));
    const [first, second] = explicitFirst ? [explicit, implicit] : [implicit, explicit];
    expect(previousX(history.prepareItem(first!, true))).toBe(3);
    expect(previousX(history.prepareItem(second!, true))).toBe(3);
    expect(history.coverage).toEqual({ items: 1, withVelocity: 1, moving: 1, movingWithHistory: 1 });
  });

  it.each([false, true])("rejects different explicit and committed baselines in either order (explicit first: %s)", (explicitFirst) => {
    const history = new VelocityHistory(), key = {};
    history.prepare(matrixAt(0), [0, 0], 0);
    history.prepareItem(item(key, 3));
    history.commit(0);
    history.prepare(matrixAt(0), [0, 0], 1);

    const implicit = item(key, 5), explicit = item(key, 5, matrixAt(4));
    const [first, second] = explicitFirst ? [explicit, implicit] : [implicit, explicit];
    const accepted = history.prepareItem(first!, true);
    const firstPrevious = explicitFirst ? 4 : 3;
    expect(previousX(accepted)).toBe(firstPrevious);
    const coverage = history.coverage;
    expect(() => history.prepareItem(second!, true)).toThrow(/conflicting previous transforms/);
    expect(history.coverage).toEqual(coverage);
    expect(previousX(accepted)).toBe(firstPrevious);
    expect(previousX(history.prepareItem(first!, true))).toBe(firstPrevious);
  });

  it.each([false, true])("distinguishes missing history from an equal explicit model (explicit first: %s)", (explicitFirst) => {
    const history = new VelocityHistory(), key = {};
    history.prepare(matrixAt(0), [0, 0], 1);
    const implicit = item(key, 2), explicit = item(key, 2, matrixAt(2));
    const [first, second] = explicitFirst ? [explicit, implicit] : [implicit, explicit];
    const accepted = history.prepareItem(first!, true);
    expect(previousX(accepted)).toBe(2);
    expect(history.coverage).toEqual(explicitFirst
      ? { items: 1, withVelocity: 1, moving: 0, movingWithHistory: 0 }
      : { items: 1, withVelocity: 0, moving: 1, movingWithHistory: 0 });
    const coverage = history.coverage;
    expect(() => history.prepareItem(second!, true)).toThrow(/conflicting previous transforms/);
    expect(history.coverage).toEqual(coverage);
  });

  it("retains frame-start history after commit for repeated and late object passes", () => {
    const history = new VelocityHistory(), a = {}, b = {};
    history.prepare(matrixAt(0), [0, 0], "seed");
    history.prepareItem(item(a, 3));
    history.prepareItem(item(b, 8));
    history.commit("seed");

    history.prepare(matrixAt(0), [0, 0], "frame");
    const beforeCommit = history.prepareItem(item(a, 5), true);
    expect(previousX(beforeCommit)).toBe(3);
    history.commit("frame");
    history.prepare(matrixAt(0), [0, 0], "frame");
    expect(previousX(history.prepareItem(item(a, 5), true))).toBe(3);
    // B was in the previous frame but was first encountered after this commit.
    expect(previousX(history.prepareItem(item(b, 10), true))).toBe(8);
    expect(history.coverage).toEqual({ items: 2, withVelocity: 2, moving: 2, movingWithHistory: 2 });
  });

  it("does not invent history for a first-frame pass repeated after commit", () => {
    const history = new VelocityHistory(), key = {};
    history.prepare(matrixAt(0), [0, 0], 1);
    expect(previousX(history.prepareItem(item(key, 7), true))).toBe(7);
    history.commit(1);
    expect(previousX(history.prepareItem(item(key, 7), true))).toBe(7);
    expect(history.coverage).toEqual({ items: 1, withVelocity: 0, moving: 1, movingWithHistory: 0 });
  });

  it("copies matrix inputs and does not let returned uniform arrays rewrite the pending baseline", () => {
    const history = new VelocityHistory(), key = {}, previous = matrixAt(1), current = matrixAt(2);
    history.prepare(matrixAt(0), [0, 0], 1);
    const first = history.prepareItem({ geometry, temporalObjectKey: key, modelMatrix: current, previousModelMatrix: previous }, true);
    previous[12] = 9;
    current[12] = 8;
    expect(previousX(first)).toBe(1);
    expect(() => history.prepareItem(item(key, 2, previous), true)).toThrow(/conflicting previous transforms/);
    const uniforms = new Map<string, UniformValue>();
    bindVelocityUniforms!(first, uniforms);
    (uniforms.get("u_previousModel") as Float32Array)[12] = 99;
    expect(previousX(history.prepareItem(item(key, 2, matrixAt(1)), true))).toBe(1);
    history.commit(1);
    history.prepare(matrixAt(0), [0, 0], 2);
    expect(previousX(history.prepareItem(item(key, 4), true))).toBe(2);
  });

  it("keeps distinct keys independent and clears frame-local conflicts on reset and new frames", () => {
    const history = new VelocityHistory(), a = {}, b = {};
    history.prepare(matrixAt(0), [0, 0], 1);
    expect(previousX(history.prepareItem(item(a, 2, matrixAt(1)), true))).toBe(1);
    expect(previousX(history.prepareItem(item(b, 2, matrixAt(7)), true))).toBe(7);
    expect(history.coverage).toEqual({ items: 2, withVelocity: 2, moving: 2, movingWithHistory: 2 });
    history.commit(1);
    history.prepare(matrixAt(0), [0, 0], 2);
    expect(previousX(history.prepareItem(item(a, 3, matrixAt(10)), true))).toBe(10);
    history.reset("camera-cut");
    history.prepare(matrixAt(0), [0, 0], 2);
    expect(previousX(history.prepareItem(item(a, 3, matrixAt(11)), true))).toBe(11);
    expect(history.coverage).toEqual({ items: 1, withVelocity: 1, moving: 1, movingWithHistory: 1 });
  });

  it("unions disjoint passes, retains their frame-start models and rejects conflicting keys", () => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), a = {}, b = {}, late = {};
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    const opts = { viewId: "view", frameId: 1, jitter: true };
    try {
      history.prepare(device, 8, 8, [item(a, 1), item(b, 10)], matrixAt(0), opts);
      history.commit("view", 1);
      const first = history.prepare(device, 8, 8, [item(a, 2)], matrixAt(0), { ...opts, frameId: 2 });
      const second = history.prepare(device, 8, 8, [item(b, 20)], matrixAt(0), { ...opts, frameId: 2 });
      expect(previousX(first.renderItems[0]!)).toBe(1);
      expect(previousX(second.renderItems[0]!)).toBe(10);
      expect(second.history).toBe(first.history);
      expect(second.historyOutput).toBe(first.historyOutput);
      expect(second.v2!.coverage).toEqual({ items: 2, withVelocity: 2, moving: 2, movingWithHistory: 2 });
      expect(() => history.prepare(device, 8, 8, [item(a, 3)], matrixAt(0), { ...opts, frameId: 2 })).toThrow(/conflicting object/);
      history.commit("view", 2);
      const afterCommit = history.prepare(device, 8, 8, [item(late, 30)], matrixAt(0), { ...opts, frameId: 2 });
      expect(afterCommit.history).toBe(first.history);
      expect(afterCommit.historyOutput).toBe(first.historyOutput);
      expect(previousX(afterCommit.renderItems[0]!)).toBe(30);
      const next = history.prepare(device, 8, 8, [item(a, 4), item(b, 21), item(late, 31)], matrixAt(0), { ...opts, frameId: 3 });
      expect(next.renderItems.map(previousX)).toEqual([2, 20, 30]);
      expect(next.history).toBe(first.historyOutput);
    } finally { history.dispose(); device.dispose(); }
  });

  it("unions expected-depth passes across separately completed device frames", () => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), a = {}, b = {};
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f" });
    const reactive = device.createRenderTarget({ width: 8, height: 8, format: "rgba8" });
    const options = { viewId: "view", frameId: 1, velocity, reactive, expectedPreviousDepth: "velocity-alpha" as const };
    try {
      device.beginFrame(8, 8);
      history.prepare(device, 8, 8, [item(a, 1), item(b, 10)], matrixAt(0), options);
      history.endDeviceFrame(device, "view", 1, true); history.commit("view", 1);
      device.beginFrame(8, 8);
      const left = history.prepare(device, 8, 8, [item(a, 2)], matrixAt(0), { ...options, frameId: 2 });
      history.endDeviceFrame(device, "view", 2, true);
      device.beginFrame(8, 8);
      const right = history.prepare(device, 8, 8, [item(b, 20)], matrixAt(0), { ...options, frameId: 2 });
      expect(previousX(left.renderItems[0]!)).toBe(1);
      expect(previousX(right.renderItems[0]!)).toBe(10);
      expect(right.history).toBe(left.history);
      expect(right.historyOutput).toBe(left.historyOutput);
      expect(right.v2!.coverage.items).toBe(2);
      history.endDeviceFrame(device, "view", 2, true); history.commit("view", 2);
      device.beginFrame(8, 8);
      const next = history.prepare(device, 8, 8, [item(a, 3), item(b, 21)], matrixAt(0), { ...options, frameId: 3 });
      expect(next.renderItems.map(previousX)).toEqual([2, 20]);
      expect(next.history).toBe(left.historyOutput);
    } finally { history.dispose(); velocity.dispose(); reactive.dispose(); device.dispose(); }
  });

  it("invalidates partially prepared temporal history before a same-frame retry", () => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), key = {};
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    try {
      history.prepare(device, 8, 8, [item(key, 0)], matrixAt(0), { viewId: "view", frameId: 1 });
      history.commit("view", 1);
      const first = item(key, 1, matrixAt(0)), conflicting = item(key, 1, matrixAt(2));
      expect(() => history.prepare(device, 8, 8, [first, conflicting], matrixAt(0), { viewId: "view", frameId: 2 }))
        .toThrow(/conflicting previous transforms/);
      const retry = history.prepare(device, 8, 8, [item(key, 2)], matrixAt(0), { viewId: "view", frameId: 2 });
      expect(retry.historyValid).toBe(false);
      expect(retry.v2!.coverage).toEqual({ items: 1, withVelocity: 0, moving: 1, movingWithHistory: 0 });
    } finally {
      history.dispose();
      device.dispose();
    }
  });
});
