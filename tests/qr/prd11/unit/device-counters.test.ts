import { describe, expect, it } from "vitest";

import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import type { DeviceCounters } from "../../../../packages/rendering/src/contracts/device";
import type { RenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { installPrd11DeviceCounters, prd11CounterState } from "../../../../packages/rendering/src/webgl2/Counters";

const SHADER = {
  vertex: "/* shader */ attribute vec4 a; void main(){ gl_Position = a; } // qr-marker",
  fragment: "/* shader */ void main(){ } // qr-marker",
  marker: "qr-marker",
  label: "test"
};

function drawOnce(device: MockRenderDevice): void {
  const buffer = device.createBuffer("vertex", 16);
  device.beginFrame(2, 2);
  device.draw({
    label: "test-draw",
    topology: "triangles",
    vertexBuffer: buffer,
    vertexCount: 3
  });
  device.endFrame();
}

describe("MockRenderDevice native counters (C-28, prd11)", () => {
  it("each call increments exactly one per-frame counter", () => {
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("vertex", 64);
    expect(device.counters()).toMatchObject({ bufferCreates: 1, drawCalls: 0, readbacks: 0, programCompiles: 0, textureUploads: 0, renderTargetsCreated: 0 });

    device.createShaderProgram(SHADER);
    expect(device.counters()).toMatchObject({ bufferCreates: 1, programCompiles: 1 });

    device.createRenderTarget({ width: 4, height: 4, label: "rt" });
    expect(device.counters()).toMatchObject({ renderTargetsCreated: 1 });

    drawOnce(device);
    expect(device.counters()).toMatchObject({ drawCalls: 1 });

    device.readPixels(0, 0, 1, 1);
    expect(device.counters()).toMatchObject({ readbacks: 1 });
    void buffer;
  });

  it("readFloatPixels is one readback even when it falls back to readPixels", () => {
    const device = new MockRenderDevice();
    device.createRenderTarget({ width: 2, height: 2, label: "rt" });
    device.readFloatPixels(0, 0, 1, 1);
    expect(device.counters().readbacks).toBe(1);
  });

  it("resetFrameCounters zeroes per-frame fields and keeps live gauges", () => {
    const device = new MockRenderDevice();
    device.createBuffer("vertex", 64);
    drawOnce(device);
    device.readPixels(0, 0, 1, 1);
    const before = device.counters();
    expect(before.liveBuffers).toBeGreaterThan(0);
    device.resetFrameCounters();
    const after = device.counters();
    expect(after).toMatchObject({
      drawCalls: 0, bufferCreates: 0, textureUploads: 0,
      readbacks: 0, renderTargetsCreated: 0, programCompiles: 0
    });
    expect(after.liveBuffers).toBe(before.liveBuffers);
  });
});

describe("installPrd11DeviceCounters (flag-gated wrapper)", () => {
  function bareDevice(): RenderDevice {
    const calls = { createBuffer: 0, draw: 0, readPixels: 0, createRenderTarget: 0 };
    const device = {
      kind: "bare" as const,
      disposed: false,
      contextLost: false,
      createBuffer() { calls.createBuffer += 1; return { id: 1, dispose() {} }; },
      createRenderTarget() { calls.createRenderTarget += 1; return { id: 2, dispose() {} }; },
      draw() { calls.draw += 1; },
      readPixels() { calls.readPixels += 1; return new Uint8Array(4); },
      getDiagnostics() { return { drawCalls: calls.draw, buffers: 0, shaders: 0 }; },
      _calls: calls
    } as unknown as RenderDevice;
    return device;
  }

  it("fills the C-28 fields lane-01 devices don't count natively", () => {
    const device = bareDevice();
    installPrd11DeviceCounters(device);
    device.createBuffer("vertex" as never, 16);
    device.createRenderTarget({ width: 2, height: 2 } as never);
    device.draw({} as never);
    device.readPixels(0, 0, 1, 1);
    const counters = device.counters!();
    expect(counters).toMatchObject({
      bufferCreates: 1,
      renderTargetsCreated: 1,
      drawCalls: 1,
      readbacks: 1,
      textureUploads: 0,
      programCompiles: 0
    });
  });

  it("is idempotent and per-frame fields reset without touching live gauges", () => {
    const device = bareDevice();
    installPrd11DeviceCounters(device);
    installPrd11DeviceCounters(device); // no-op
    device.createBuffer("vertex" as never, 16);
    expect(prd11CounterState(device)?.bufferCreates).toBe(1);
    device.resetFrameCounters!();
    expect(device.counters!().bufferCreates).toBe(0);
  });
});
