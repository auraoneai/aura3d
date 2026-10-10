import { describe, expect, it } from "vitest";

import "../../../../packages/rendering/src/lanes/index"; // lane barrels self-register on import
import { frameContributors, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { renderTargetPoolSlot } from "../../../../packages/rendering/src/contracts/device";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { MockRenderDevice, type RenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { PostResources } from "../../../../packages/rendering/src/post/PostResources";
import { sharedResourceRegistry } from "../../../../packages/rendering/src/resources/ResourceRegistry";
import {
  PRD11_LIVE_GAUGE_SAMPLE_INTERVAL,
  WebGL2Counters,
  installPrd11DeviceCounters,
  prd11LiveGaugeSamples,
  registerWebGL2DeviceHost
} from "../../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";

/**
 * PRD-16 T0-35 (lane 11 flag-on hazards): T11-POOL, T11-COUNTERS, T11-RESET.
 * T11-TIMING lives in renderer-timing.test.ts next to its fake GL.
 */

const FLAGS_ON: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };

function ctx(device: RenderDevice): FrameContributorContext {
  return {
    device,
    width: 640,
    height: 360,
    frameIndex: 0,
    timeSeconds: 0,
    camera: null,
    source: {},
    items: [],
    tier: {} as never,
    flags: FLAGS_ON,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  };
}

function liveRenderTargets(device: MockRenderDevice): number {
  return device.getDiagnostics().renderTargets ?? 0;
}

describe("T11-POOL: one RenderTargetPool per device", () => {
  it("factory(d) === factory(d) and registers the pool once", () => {
    const device = new MockRenderDevice();
    const factory = renderTargetPoolSlot.get(FLAGS_ON);
    const registry = sharedResourceRegistry() as unknown as { entries: Map<object, unknown> };
    const before = registry.entries.size;
    const pool = factory(device);
    expect(factory(device)).toBe(pool);
    expect(factory(device)).toBe(pool);
    expect(registry.entries.size).toBe(before + 1);
    expect(factory(new MockRenderDevice())).not.toBe(pool);
  });

  it("100 resize cycles keep live render targets flat", () => {
    const device = new MockRenderDevice();
    const post = new PostResources(device, FLAGS_ON);
    const sizes = [[320, 180], [640, 360]] as const;
    const counts: number[] = [];
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const [width, height] = sizes[cycle % 2]!;
      // resize() hands mismatched targets back to the device pool; with a
      // fresh pool per factory call they were ignored and leaked.
      post.resize(width, height);
      const target = post.acquire({ width, height, format: "rgba8", samples: 1, depth: false });
      post.releaseAll();
      post.trim(4);
      counts.push(liveRenderTargets(device));
      void target;
    }
    // After warm-up both sizes are pooled; the live count stays flat.
    expect(Math.max(...counts.slice(10))).toBeLessThanOrEqual(2);
    expect(counts[99]).toBe(counts[10]);
  });

  it("unregisters the pool from the shared registry when the device is disposed", () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry() as unknown as { entries: Map<object, unknown> };
    const pool = renderTargetPoolSlot.get(FLAGS_ON)(device);
    expect(registry.entries.has(pool)).toBe(true);
    device.dispose();
    expect(registry.entries.has(pool)).toBe(false);
  });
});

/** Minimal WebGL2-like device with a registered host, so Counters takes the host path. */
function hostedDevice(): { device: RenderDevice; host: WebGL2DeviceHost; diagnosticsCalls: () => number } {
  let diagnosticsCalls = 0;
  const counters = new WebGL2Counters();
  const device = {
    kind: "webgl2",
    disposed: false,
    draw() { counters.drawCalls += 1; },
    readPixels() { counters.readbacks += 1; return new Uint8Array(4); },
    createBuffer() { return { dispose() {} }; },
    counters() {
      diagnosticsCalls += 1; // native counters() runs the full diagnostics walk
      return { drawCalls: counters.drawCalls, readbacks: counters.readbacks, programCompiles: 0 };
    },
    resetFrameCounters() { counters.drawCalls = 0; counters.readbacks = 0; },
    getDiagnostics() { diagnosticsCalls += 1; return { buffers: 3, textureBytes: 64, gpuTargetBytes: 0 }; }
  } as unknown as RenderDevice;
  const host = { device, counters, drawBinder: { vertexArrayCache: new Map([[1, 1]]) } } as unknown as WebGL2DeviceHost;
  registerWebGL2DeviceHost(host);
  return { device, host, diagnosticsCalls: () => diagnosticsCalls };
}

describe("T11-COUNTERS: per-frame counters() is O(1)", () => {
  it("does not walk getDiagnostics() every frame; live gauges are sampled", () => {
    const { device, diagnosticsCalls } = hostedDevice();
    installPrd11DeviceCounters(device);
    const frames = 300;
    for (let frame = 0; frame < frames; frame += 1) {
      device.draw({} as never);
      device.counters!();
    }
    expect(diagnosticsCalls()).toBeLessThanOrEqual(Math.ceil(frames / PRD11_LIVE_GAUGE_SAMPLE_INTERVAL) + 1);
    expect(prd11LiveGaugeSamples(device)).toBeGreaterThan(0);
    const counters = device.counters!();
    expect(counters.liveBuffers).toBe(3);
    expect(counters.textureBytes).toBe(64);
    expect(counters.liveVertexArrays).toBe(1);
  });

  it("a wrapped create call refreshes the gauges on the next read", () => {
    const { device } = hostedDevice();
    installPrd11DeviceCounters(device);
    device.counters!();
    const samples = prd11LiveGaugeSamples(device);
    device.createBuffer("vertex" as never, 16);
    device.counters!();
    expect(prd11LiveGaugeSamples(device)).toBe(samples + 1);
  });
});

describe("T11-RESET: the frameStats contributor never resets host counters", () => {
  it("host drawCalls/readbacks for a frame equal the flag-off count with tiers on", () => {
    const { device, host } = hostedDevice();
    const contributor = frameContributors(FLAGS_ON).find((c) => c.id === "prd11.frameStats")!;
    // Frame begins (lane-01 zeroes drawCalls), two draws and a readback happen
    // before the contributor's collect runs, then one more draw after it.
    host.counters.drawCalls = 0;
    device.draw({} as never);
    device.draw({} as never);
    device.readPixels(0, 0, 1, 1);
    contributor.collect!([], ctx(device));
    device.draw({} as never);
    expect(host.counters.drawCalls).toBe(3);
    expect(host.counters.readbacks).toBe(1);
    // The lane's per-frame view counts only what happened after its frame begin.
    expect(device.counters!().drawCalls).toBe(1);
    expect(device.counters!().readbacks).toBe(0);
  });
});
