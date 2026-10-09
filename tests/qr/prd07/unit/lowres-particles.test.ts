// PRD-07 P6-T4 — optional half-resolution particle target for `lowRes` batches:
// off by default, auto-enabled when measured particle GPU ms exceeds the tier
// budget (EWMA, 75% hysteresis), and skipped when the device cannot report its
// bound target (needed to restore after the mid-frame divert).

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import { PARTICLE_GPU_BUDGET_MS, particleGpuBudgetMs } from "../../../../packages/rendering/src/vfx/LowResParticles";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { ParticleBatchDescriptor } from "../../../../packages/rendering/src/contracts/particles";
import { Texture } from "../../../../packages/rendering/src/Texture";

const atlas = new Texture({ width: 1, height: 1, label: "t", data: new Uint8Array([255, 255, 255, 255]) });

function ctxFor(device: MockRenderDevice) {
  return {
    device,
    width: 320,
    height: 200,
    camera: null,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
    blackboard: new Map(),
    tier: QUALITY_TIERS.high
  } as never as FrameContributorContext;
}

function batch(key: string, lowRes: boolean): ParticleBatchDescriptor {
  return {
    key,
    capacity: 8,
    source: "cpu",
    atlas,
    blend: "alpha",
    shading: "unlit",
    softDepth: false,
    stretch: false,
    frameBlend: false,
    ...(lowRes ? { lowRes: true } : {})
  };
}

function instances(): Float32Array {
  // One live particle per instance record (16 floats).
  const data = new Float32Array(16);
  data[0] = 0; data[1] = 0; data[2] = 0; // position
  data[4] = 1; // size
  data[8] = 1; data[9] = 1; data[10] = 1; data[11] = 1; // color
  return data;
}

function renderFrame(pass: ParticleBatchPass, device: MockRenderDevice, ctx: FrameContributorContext) {
  const queue = pass.transparentItems(ctx);
  device.beginFrame(320, 200);
  for (const item of queue) item.draw(ctx);
  device.endFrame();
  return queue;
}

describe("P6-T4 half-resolution particle target", () => {
  it("off by default: a lowRes batch draws exactly like a normal batch", () => {
    const device = new MockRenderDevice();
    const pass = new ParticleBatchPass(device);
    const h = pass.upsertBatch(batch("a", true));
    pass.writeInstances(h, instances(), 1);
    const ctx = ctxFor(device);
    const queue = renderFrame(pass, device, ctx);
    expect(queue.length).toBe(1);
    expect(pass.diagnostics.drawCalls).toBe(1);
    expect(device.drawCommands.every((c) => c.label === "prd07.particles.a")).toBe(true);
    expect(pass.diagnostics.lowRes).toBeUndefined();
    pass.dispose();
  });

  it("enabled: lowRes batches divert to the half-res RT and composite once", () => {
    const device = new MockRenderDevice();
    const pass = new ParticleBatchPass(device);
    pass.setLowResEnabled(true);
    const lo = pass.upsertBatch(batch("lo", true));
    const hi = pass.upsertBatch(batch("hi", false));
    pass.writeInstances(lo, instances(), 1);
    pass.writeInstances(hi, instances(), 1);
    const ctx = ctxFor(device);
    const queue = renderFrame(pass, device, ctx);
    // Items: offscreen divert + the full-res batch + the composite.
    expect(queue.length).toBe(3);
    const labels = device.drawCommands.map((c) => c.label);
    expect(labels.filter((l) => l === "prd07.particles.lo").length).toBe(1);
    expect(labels.filter((l) => l === "prd07.particles.hi").length).toBe(1);
    expect(labels.filter((l) => l === "prd07.particles.lowresComposite").length).toBe(1);
    // The composite is the last draw and its RT was bound at half size.
    expect(labels.at(-1)).toBe("prd07.particles.lowresComposite");
    expect(pass.diagnostics.lowRes).toEqual({ active: true, batches: 1 });
    pass.dispose();
  });

  it("auto-enables when measured GPU ms exceeds the tier budget and disables under hysteresis", () => {
    const device = new MockRenderDevice();
    const pass = new ParticleBatchPass(device);
    const budget = PARTICLE_GPU_BUDGET_MS.high;
    expect(pass.lowResActive).toBe(false);
    // Under-budget frames never engage the path.
    for (let i = 0; i < 16; i += 1) pass.noteGpuMs(budget * 0.5, budget);
    expect(pass.lowResActive).toBe(false);
    // Sustained over-budget frames engage it after the warmup window.
    for (let i = 0; i < 16; i += 1) pass.noteGpuMs(budget * 2, budget);
    expect(pass.lowResActive).toBe(true);
    // Sustained cheap frames pull it back under the 75% hysteresis band.
    for (let i = 0; i < 40; i += 1) pass.noteGpuMs(budget * 0.1, budget);
    expect(pass.lowResActive).toBe(false);
    pass.dispose();
  });

  it("devices without getRenderTarget keep the draw list identical (full res)", () => {
    const device = new MockRenderDevice();
    // Strip the optional accessor to emulate a backend that cannot restore.
    (device as { getRenderTarget?: unknown }).getRenderTarget = undefined;
    const pass = new ParticleBatchPass(device);
    pass.setLowResEnabled(true);
    const h = pass.upsertBatch(batch("a", true));
    pass.writeInstances(h, instances(), 1);
    const ctx = ctxFor(device);
    const queue = renderFrame(pass, device, ctx);
    expect(queue.length).toBe(1);
    expect(device.drawCommands.every((c) => c.label === "prd07.particles.a")).toBe(true);
    expect(pass.diagnostics.errors.some((e) => e.code === "LOWRES_UNSUPPORTED")).toBe(true);
    pass.dispose();
  });

  it("particleGpuBudgetMs resolves tier settings objects (default = high)", () => {
    expect(particleGpuBudgetMs(QUALITY_TIERS.low)).toBe(0.8);
    expect(particleGpuBudgetMs(QUALITY_TIERS.ultra)).toBe(3.0);
    expect(particleGpuBudgetMs({ ...QUALITY_TIERS.ultra })).toBe(3.0); // custom object, matched by budget
    expect(particleGpuBudgetMs({ ...QUALITY_TIERS.high, particleBudget: 1 })).toBe(2.0);
  });
});
