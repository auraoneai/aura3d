import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd03";
import { MockRenderDevice, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { temporalReprojection } from "../../../packages/rendering/src/TemporalMath";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { VelocityHistory, bindVelocityUniforms } from "../../../packages/rendering/src/forward/Velocity";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { WEBGPU_TAA_FRAGMENT } from "../../../packages/rendering/src/webgpu/WebGPUTemporal";

function matrixAt(x: number): Float32Array {
  return Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]);
}

function item(key: object, x: number): RenderItem {
  return { geometry: {} as RenderItem["geometry"], temporalObjectKey: key, modelMatrix: matrixAt(x) };
}

function previousX(item: RenderItem): number {
  const uniforms = new Map<string, UniformValue>();
  bindVelocityUniforms!(item, uniforms);
  return (uniforms.get("u_previousModel") as Float32Array)[12]!;
}

function deviceWithGeneration(): MockRenderDevice & { generation: number } {
  const device = new MockRenderDevice() as MockRenderDevice & { generation: number };
  Object.defineProperty(device, "generation", { value: 1, writable: true });
  setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
  return device;
}

describe("temporal device generations and late frame passes", () => {
  it("retains objects first seen after a frame commit as the next frame baseline", () => {
    const history = new VelocityHistory(), a = {}, b = {};
    history.prepare(matrixAt(0), [0, 0], 1);
    history.prepareItem(item(a, 1));
    history.prepareItem(item(b, 10));
    history.commit(1);

    history.prepare(matrixAt(0), [0, 0], 2);
    expect(previousX(history.prepareItem(item(a, 2), true))).toBe(1);
    history.commit(2);
    expect(previousX(history.prepareItem(item(b, 20), true))).toBe(10);
    history.commit(2);

    history.prepare(matrixAt(0), [0, 0], 3);
    expect(previousX(history.prepareItem(item(a, 3), true))).toBe(2);
    expect(previousX(history.prepareItem(item(b, 30), true))).toBe(20);
    expect(history.coverage).toEqual({ items: 2, withVelocity: 2, moving: 2, movingWithHistory: 2 });
  });

  it("predicts and allocates a fresh history after one device changes generation", () => {
    const device = deviceWithGeneration(), otherDevice = deviceWithGeneration();
    const history = new TemporalHistory(), otherHistory = new TemporalHistory();
    const options = { viewId: "view", jitter: true };
    device.beginFrame(8, 8);
    otherDevice.beginFrame(8, 8);
    try {
      const seed = history.prepare(device, 8, 8, [], matrixAt(0), { ...options, frameId: 1 });
      const otherSeed = otherHistory.prepare(otherDevice, 8, 8, [], matrixAt(4), { ...options, frameId: 1 });
      history.commit("view", 1);
      otherHistory.commit("view", 1);
      device.endFrame();
      device.generation++;
      device.beginFrame(8, 8);

      const nextOptions = { ...options, frameId: 2 };
      const plan = history.planFrame(device, 8, 8, matrixAt(3), nextOptions);
      expect(plan.jitterClip).toEqual([0, 0]);
      expect(seed.history.disposed).toBe(false);
      const next = history.preparePlanned(plan, device, 8, 8, [], matrixAt(3), nextOptions);
      expect(next.historyValid).toBe(false);
      expect(next.history).not.toBe(seed.historyOutput);
      expect(next.v2!.previous[12]).toBe(3);
      expect(seed.history.disposed).toBe(true);
      expect(seed.historyOutput.disposed).toBe(true);
      expect(seed.v2!.linZ.disposed).toBe(true);
      expect(seed.v2!.linZOutput.disposed).toBe(true);

      const otherNext = otherHistory.prepare(otherDevice, 8, 8, [], matrixAt(5), { ...options, frameId: 2 });
      expect(otherNext.historyValid).toBe(true);
      expect(otherNext.history).toBe(otherSeed.historyOutput);
      expect(otherNext.v2!.previous[12]).toBe(4);
      expect(otherSeed.history.disposed).toBe(false);
    } finally {
      history.dispose();
      otherHistory.dispose();
      device.dispose();
      otherDevice.dispose();
    }
  });

  it("does not return or commit stale same-frame attachments after device generation changes", () => {
    const device = deviceWithGeneration(), history = new TemporalHistory();
    const options = { viewId: "view", frameId: 1 };
    try {
      const seed = history.prepare(device, 8, 8, [], matrixAt(0), options);
      device.generation++;
      expect(() => history.commit("view", 1)).toThrow(/device|generation/i);
      expect(seed.history.disposed).toBe(true);
      const restarted = history.prepare(device, 8, 8, [], matrixAt(2), options);
      expect(restarted.historyValid).toBe(false);
      expect(restarted.history).not.toBe(seed.history);
      expect(restarted.v2!.previous[12]).toBe(2);
    } finally {
      history.dispose();
      device.dispose();
    }
  });

  it("does not reuse a same-frame cache or promote history while the device is lost", () => {
    const device = deviceWithGeneration(), history = new TemporalHistory();
    const options = { viewId: "view", frameId: 1 };
    try {
      const seed = history.prepare(device, 8, 8, [], matrixAt(0), options);
      device.contextLost = true;
      expect(() => history.prepare(device, 8, 8, [], matrixAt(0), options)).toThrow(/device|lost/i);
      expect(seed.history.disposed).toBe(true);
      device.contextLost = false;
      const restarted = history.prepare(device, 8, 8, [], matrixAt(2), options);
      expect(restarted.historyValid).toBe(false);
      expect(restarted.history).not.toBe(seed.history);
      device.contextLost = true;
      expect(() => history.commit("view", 1)).toThrow(/device|lost/i);
      expect(restarted.history.disposed).toBe(true);
    } finally {
      history.dispose();
      device.dispose();
    }
  });

  it("rejects disposed color attachments even when their target wrappers remain live", () => {
    const device = deviceWithGeneration(), history = new TemporalHistory();
    const input = device.createRenderTarget({ width: 8, height: 8 });
    try {
      input.colorTexture.dispose();
      expect(input.disposed).toBe(false);
      expect(() => history.prepare(device, 8, 8, [], matrixAt(0), { frameId: 1, velocity: input })).toThrow(/live/);
      const seed = history.prepare(device, 8, 8, [], matrixAt(0), { frameId: 1 });
      seed.v2!.linZOutput.colorTexture.dispose();
      expect(seed.v2!.linZOutput.disposed).toBe(false);
      expect(() => history.commit(undefined, 1)).toThrow(/disposed/);
      const next = history.prepare(device, 8, 8, [], matrixAt(1), { frameId: 2 });
      expect(next.historyValid).toBe(false);
      expect(next.v2!.linZOutput.colorTexture.disposed).toBe(false);
      expect(next.v2!.linZOutput).not.toBe(seed.v2!.linZOutput);
      expect(seed.v2!.linZOutput.disposed).toBe(true);
    } finally {
      history.dispose();
      input.dispose();
      device.dispose();
    }
  });

  it("retires a committed frame when the same frame is committed after loss", () => {
    const device = deviceWithGeneration(), history = new TemporalHistory();
    try {
      const seed = history.prepare(device, 8, 8, [], matrixAt(0), { frameId: 1 });
      history.commit(undefined, 1);
      device.contextLost = true;
      expect(() => history.commit(undefined, 1)).toThrow(/device|lost/i);
      expect(seed.history.disposed).toBe(true);
      device.contextLost = false;
      expect(history.prepare(device, 8, 8, [], matrixAt(0), { frameId: 2 }).historyValid).toBe(false);
    } finally {
      history.dispose();
      device.dispose();
    }
  });

  it("rejects legacy WebGPU history exactly beyond the right or bottom texture edge", () => {
    expect(temporalReprojection([0.75, 0.5], [-0.25, 0]).historyInBounds).toBe(false);
    expect(temporalReprojection([0.5, 0.75], [0, -0.25]).historyInBounds).toBe(false);
    expect(WEBGPU_TAA_FRAGMENT).toMatch(/all\(previousUV < vec2<f32>\(1\.0\)\)/);
  });

  it("rejects borrowed motion and reactive targets owned by a different device without losing valid history", () => {
    const device = deviceWithGeneration(), otherDevice = deviceWithGeneration();
    const history = new TemporalHistory(), otherHistory = new TemporalHistory();
    const foreignVelocity = otherDevice.createRenderTarget({ width: 8, height: 8 });
    const foreignReactive = otherDevice.createRenderTarget({ width: 8, height: 8 });
    const velocity = device.createRenderTarget({ width: 8, height: 8 });
    const reactive = device.createRenderTarget({ width: 8, height: 8 });
    device.beginFrame(8, 8);
    otherDevice.beginFrame(8, 8);
    try {
      const seed = history.prepare(device, 8, 8, [], matrixAt(0), { viewId: "view", frameId: 1 });
      const otherSeed = otherHistory.prepare(otherDevice, 8, 8, [], matrixAt(4), { viewId: "view", frameId: 1 });
      history.commit("view", 1);
      otherHistory.commit("view", 1);
      const base = { viewId: "view", frameId: 2 };
      for (const invalid of [
        { ...base, velocity: foreignVelocity },
        { ...base, reactive: foreignReactive },
        { ...base, reconstruction: "temporal" as const, velocity: foreignVelocity, reactive },
        { ...base, reconstruction: "temporal" as const, velocity, reactive: foreignReactive }
      ]) {
        expect(() => history.planFrame(device, 8, 8, matrixAt(1), invalid)).toThrow(/same device/i);
        expect(() => history.prepare(device, 8, 8, [], matrixAt(1), invalid)).toThrow(/same device/i);
      }
      const next = history.prepare(device, 8, 8, [], matrixAt(1), base);
      expect(next.historyValid).toBe(true);
      expect(next.history).toBe(seed.historyOutput);
      const otherNext = otherHistory.prepare(otherDevice, 8, 8, [], matrixAt(5), base);
      expect(otherNext.historyValid).toBe(true);
      expect(otherNext.history).toBe(otherSeed.historyOutput);
      expect(foreignVelocity.disposed).toBe(false);
      expect(foreignReactive.disposed).toBe(false);
    } finally {
      history.dispose();
      otherHistory.dispose();
      velocity.dispose();
      reactive.dispose();
      foreignVelocity.dispose();
      foreignReactive.dispose();
      device.dispose();
      otherDevice.dispose();
    }
  });

  it("retires every view and attachment when one history disposer fails", () => {
    const device = deviceWithGeneration(), history = new TemporalHistory();
    const left = history.prepare(device, 8, 8, [], matrixAt(0), { viewId: "left", frameId: 1 });
    const right = history.prepare(device, 8, 8, [], matrixAt(0), { viewId: "right", frameId: 1 });
    const dispose = left.history.dispose.bind(left.history);
    let attempts = 0;
    left.history.dispose = () => {
      attempts++;
      dispose();
      throw new Error("temporal retirement failure");
    };
    try {
      expect(() => history.dispose()).toThrow();
      expect(attempts).toBe(1);
      for (const frame of [left, right]) {
        expect([frame.velocity, frame.history, frame.historyOutput, frame.v2!.linZ, frame.v2!.linZOutput]
          .every(target => target.disposed)).toBe(true);
      }
      expect(() => history.dispose()).not.toThrow();
      expect(attempts).toBe(1);
    } finally {
      left.history.dispose = dispose;
      history.dispose();
      device.dispose();
    }
  });

  it("rejects a same-frame transition between v2 and legacy attachment layouts", () => {
    const device = deviceWithGeneration(), history = new TemporalHistory();
    const options = { viewId: "view", frameId: 1 };
    try {
      const frame = history.prepare(device, 8, 8, [], matrixAt(0), options);
      expect(frame.v2).toBeDefined();
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: false }), device);
      expect(() => history.prepare(device, 8, 8, [], matrixAt(0), options)).toThrow(/frame|view|attachments/i);
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
      expect(history.prepare(device, 8, 8, [], matrixAt(0), options)).toBe(frame);
    } finally {
      history.dispose();
      device.dispose();
    }
  });
});
