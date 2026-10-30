// GU47 WP-6 (E-F) item 7: the stale "recorded but withheld" warnings are gone,
// and effects.lightCone / effects.beam / effects.flipbook really submit draws.

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { BeamPass } from "../../../../packages/rendering/src/vfx/BeamPass";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { effects, renderer, scene } from "../../../../packages/engine/src";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

const ctx = {
  device: null,
  camera: { position: [0, 2, 8], viewMatrix: undefined, viewProjectionMatrix: undefined, near: 0.1 },
  sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
  blackboard: new Map()
} as never as FrameContributorContext;

function systemFor(nodes: EffectNodeLike[]): { system: ProductionEffectSystem; step(dt: number): void } {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  const app: AppLike = { scene: { nodes }, onFrame: (cb) => { callbacks.push(cb); return () => undefined; } };
  return { system: new ProductionEffectSystem(app, { tier: "high" }), step: (dt) => { for (const cb of callbacks) cb({ dt }); } };
}

describe("GU47 E-F item 7: no stale withheld warnings; cones, beams and flipbooks draw", () => {
  it("renderer diagnostics no longer claim flipbook-sprite or light-beam are withheld", () => {
    const report = renderer.diagnostics(scene().add(effects.flipbook()).add(effects.beam()).add(effects.lightCone()));
    expect(report.warnings.filter((warning) => warning.includes("recorded but withheld"))).toEqual([]);
  });

  it("effects.lightCone lowers to the beam pass and submits an indexed cone draw", () => {
    const cone = effects.lightCone({ name: "stage-cone", position: [0, 6, 0], direction: [0, -1, 0], length: 6, coneAngle: 0.4 }).toJSON() as EffectNodeLike;
    const beam = effects.beam({ name: "fence", from: [0, 1, 0], to: [0, 1, -6] }).toJSON() as EffectNodeLike;
    const { system } = systemFor([cone, beam]);
    const specs = system.beamFeed();
    expect(specs.map((spec) => spec.kind).sort()).toEqual(["light-beam", "lightCone"]);
    const device = new MockRenderDevice();
    const pass = new BeamPass(device);
    const items = pass.transparentItems(specs, ctx);
    expect(items).toHaveLength(2);
    device.beginFrame(320, 200);
    for (const item of items) item.draw(ctx);
    device.endFrame();
    const draws = device.drawCommands.filter((draw) => String(draw.label ?? "").startsWith("prd07.beam."));
    expect(draws.map((draw) => draw.label).sort()).toEqual(["prd07.beam.fence", "prd07.beam.stage-cone"]);
    for (const draw of draws) expect(draw.indexCount ?? 0).toBeGreaterThan(0);
    system.dispose();
  });

  it("effects.flipbook submits a particle-pass draw on the built-in sheet", () => {
    const { system, step } = systemFor([effects.flipbook({ name: "boom", seed: 2 }).toJSON() as EffectNodeLike]);
    step(0.1);
    const device = new MockRenderDevice();
    const pass = new ParticleBatchPass(device);
    system.feed(pass);
    const items = pass.transparentItems(ctx);
    device.beginFrame(320, 200);
    for (const item of items) item.draw(ctx);
    device.endFrame();
    const draw = device.drawCommands.find((command) => String(command.label ?? "").startsWith("prd07.particles."));
    expect(draw?.instanceCount).toBe(1);
    expect(draw?.uniforms?.get("u_grid")).toEqual([4, 4]);
    system.dispose();
  });
});
