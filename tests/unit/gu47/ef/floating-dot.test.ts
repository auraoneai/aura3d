// GU47 WP-6 (E-F) item 8: engine paths by which runtime particles could outlive
// their effect and hang in the frame ("floating dots") are closed.

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { createAppEffects } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

const ctx = {
  device: null,
  camera: null,
  sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
  blackboard: new Map()
} as never as FrameContributorContext;

function harness() {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  const onFrame = (cb: (frame: { dt: number }) => void) => { callbacks.push(cb); return () => undefined; };
  const mover = { position: [0, 1, 0] as [number, number, number], getWorldPosition: () => mover.position };
  const appLike: AppLike = { scene: { nodes: [] }, onFrame, nodes: { get: (id: string) => (id === "mover" ? mover : undefined) as never } };
  const system = new ProductionEffectSystem(appLike, { tier: "high" });
  const fx = createAppEffects({ onFrame } as never, system);
  const device = new MockRenderDevice();
  const pass = new ParticleBatchPass(device);
  /** One frame: sim step, then the renderer's collect (feed) and transparent phase. */
  const frame = (dt = 1 / 60): number => {
    for (const cb of callbacks) cb({ dt });
    system.feed(pass);
    return pass.transparentItems(ctx).length;
  };
  return { system, fx, pass, frame, mover };
}

describe("GU47 E-F item 8: no runtime particle outlives its effect", () => {
  it("a spent one-shot burst is retired: its emitter and its particle batch are gone after the preset life", () => {
    const h = harness();
    const handle = h.fx.burst("spark", [0, 1, 0]);
    expect(h.frame()).toBe(1);
    expect(h.system.emitterIds()).toContain(handle.id);
    for (let i = 0; i < 40; i++) h.frame(); // spark life <= 0.6 s
    expect(h.system.liveCount()).toBe(0);
    expect(h.system.emitterIds()).not.toContain(handle.id);
    expect(handle.alive).toBe(false);
    expect(h.frame()).toBe(0);
  });

  it("runtime = \"off\" mid-session drops running continuous emitters and runtime trails at once", () => {
    const h = harness();
    const looping = h.fx.spawn({ name: "dust", layers: [] }, [0, 0, 0]);
    const trail = h.fx.trail("mover", { width: 0.2, life: 2 });
    for (let i = 0; i < 30; i++) {
      h.mover.position = [h.mover.position[0] + 0.1, 1, 0];
      h.frame();
    }
    expect(h.system.liveCount()).toBeGreaterThan(0);
    expect(trail.pointCount).toBeGreaterThan(2);
    h.fx.runtime = "off";
    expect(h.system.liveCount()).toBe(0);
    expect(looping.alive).toBe(false);
    expect(trail.alive).toBe(false);
    expect(h.system.ribbonFeed().trailCount).toBe(0);
    expect(h.frame()).toBe(0);
    for (let i = 0; i < 120; i++) h.frame();
    expect(h.system.liveCount()).toBe(0); // the stopped loop does not come back
  });

  it("clear() removes runtime trails as well as emitters", () => {
    const h = harness();
    h.fx.burst("dust", [0, 0, 0]);
    const trail = h.fx.trail("mover", { width: 0.2, life: 2 });
    h.mover.position = [3, 1, 0];
    h.frame();
    h.fx.clear();
    expect(h.system.liveCount()).toBe(0);
    expect(trail.alive).toBe(false);
  });

  it("dispose() takes the system's batches out of the shared per-device particle pass", () => {
    const h = harness();
    h.fx.burst("spark", [0, 1, 0], { count: 40 });
    expect(h.frame()).toBe(1);
    h.system.dispose();
    // The device keeps rendering (pass shared per device): nothing from the disposed system may draw.
    expect(h.pass.transparentItems(ctx)).toHaveLength(0);
  });
});
