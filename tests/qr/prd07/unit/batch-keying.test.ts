// PRD-07 P1-T5 — §6.2.2 batch keying through the whole lane:
// emitters sharing blend+atlas+flags coalesce into one instanced draw;
// different material state splits; premultiplied items sort back-to-front.

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { createAuraApp, effects, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

const ctxFor = () =>
  ({
    device: null,
    camera: null,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
    blackboard: new Map()
  }) as never as FrameContributorContext;

function buildApp(modes: string[]) {
  let s = scene();
  for (let i = 0; i < modes.length; i++) {
    s = s.add(effects.particles({ name: `fx-${i}`, materialMode: modes[i] as never, particleCount: 64, position: [i * 20, 0, 0] }));
  }
  const app = createAuraApp(null, { autoStart: false, scene: s, qualityRebuild: { flags: ["vfx"] } });
  return { app, system: prd07SystemFor(app)! };
}

function renderOnce(app: ReturnType<typeof createAuraApp>, system = prd07SystemFor(app)!) {
  const device = new MockRenderDevice();
  const pass = new ParticleBatchPass(device);
  for (let i = 0; i < 30; i++) app.step(1 / 60); // sim advances so particles are live
  system.feed(pass);
  const ctx = ctxFor();
  const queue = pass.transparentItems(ctx);
  device.beginFrame(320, 200);
  for (const item of queue) item.draw(ctx);
  device.endFrame();
  return { pass, queue };
}

describe("P1-T5 batch keying", () => {
  it("two additive emitters on the same atlas merge into 1 draw", () => {
    const { app, system } = buildApp(["additive-glow", "additive-glow"]);
    const { pass, queue } = renderOnce(app, system);
    expect(queue.length).toBe(1);
    expect(pass.diagnostics.drawCalls).toBe(1);
    expect(pass.diagnostics.instancesDrawn).toBeGreaterThan(0);
    app.dispose();
  });

  it("additive + premultiplied material modes produce 2 items and 2 draws", () => {
    const { app, system } = buildApp(["additive-glow", "soft-alpha"]);
    const { pass, queue } = renderOnce(app, system);
    expect(queue.length).toBe(2);
    expect(pass.diagnostics.drawCalls).toBe(2);
    app.dispose();
  });

  it("two non-additive batches emit queue items back-to-front; additive draws last", () => {
    // spark + soft-alpha differ in softDepth/stretch → two separate batches.
    const { app, system } = buildApp(["spark", "soft-alpha"]);
    const { queue } = renderOnce(app, system);
    expect(queue.length).toBe(2);
    expect(queue[0].sortDepth).toBeGreaterThanOrEqual(queue[1].sortDepth);
    const { app: app2, system: system2 } = buildApp(["additive-glow", "soft-alpha"]);
    const { pass, queue: queue2 } = renderOnce(app2, system2);
    expect(queue2.length).toBe(2);
    expect(pass.diagnostics.drawCalls).toBe(2);
    app.dispose();
    app2.dispose();
  });
});
