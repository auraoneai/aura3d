// GU47 WP-6 (E-F) item 4: registerPreset names resolve in burst/spawn before
// the built-in table; every layer of the registered spec fires.

import { describe, expect, it, vi } from "vitest";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { createAppEffects } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function harness() {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  const onFrame = (cb: (frame: { dt: number }) => void) => { callbacks.push(cb); return () => undefined; };
  const appLike: AppLike = { scene: { nodes: [] }, onFrame };
  const system = new ProductionEffectSystem(appLike, { tier: "high" });
  const added: EffectNodeLike[] = [];
  const addInstance = system.addInstance.bind(system);
  vi.spyOn(system, "addInstance").mockImplementation((id, node) => { added.push(node); return addInstance(id, node); });
  const flashes = vi.spyOn(system, "flashLight");
  const shake = { add: vi.fn(), configure: vi.fn() };
  const fx = createAppEffects({ onFrame, camera: { shake, punch: { trigger: vi.fn() } } } as never, system);
  const step = (dt: number) => { for (const cb of callbacks) cb({ dt }); };
  return { system, fx, added, flashes, shake, step };
}

describe("GU47 E-F item 4: registered presets", () => {
  it("burst resolves a registered name: its emitter layer over the named base preset", () => {
    const { fx, added, system } = harness();
    fx.registerPreset("chalk-puff", { name: "chalk-puff", layers: [{ type: "emitter", preset: "dust", color: [0.9, 0.88, 0.82], count: 18, sprite: "dust-mote", size: [0.2, 0.4] }] });
    fx.burst("chalk-puff", [1, 0, 2]);
    expect(added).toHaveLength(1);
    const node = added[0];
    expect(node).toMatchObject({ effect: "particles", position: [1, 0, 2], burst: 18, particleCount: 18, emissionRate: 0, materialMode: "soft-alpha", sprite: "dust-mote", gravity: -0.4, lifetime: [0.8, 1.6], size: [0.2, 0.4], color: [0.9, 0.88, 0.82] });
    expect(system.liveCount()).toBe(18);
    expect(fx.presets).toHaveProperty("chalk-puff");
  });

  it("a registered name overrides the built-in of the same name; unknown names still fall back to spark", () => {
    const { fx, added } = harness();
    fx.burst("spark", [0, 0, 0]);
    fx.registerPreset("spark", { name: "spark", layers: [{ type: "emitter", color: "#33ccff", intensity: 3 }] });
    fx.burst("spark", [0, 0, 0]);
    fx.burst("no-such-preset", [0, 0, 0]);
    expect(added[0].color).toEqual([4, 2.4, 0.8]);
    expect(added[1].color![0]).toBeCloseTo(0.6, 5);
    expect(added[1].color![1]).toBeCloseTo(2.4, 5);
    expect(added[1].color![2]).toBeCloseTo(3, 5);
    expect(added[1].lifetime).toEqual([0.25, 0.6]); // spark base for the fields the layer leaves out
    expect(added[2].color).toEqual([4, 2.4, 0.8]);
  });

  it("every layer fires: emitters, light, camera; a delayed layer fires after `at` seconds", () => {
    const { fx, added, flashes, shake, step } = harness();
    fx.registerPreset("bat-crack", {
      name: "bat-crack",
      layers: [
        { type: "emitter", preset: "debris", count: 10, sprite: "debris-chips" },
        { type: "light", intensity: 6, range: 5, duration: 0.2, color: "#ffeecc" },
        { type: "camera", shake: 0.3 },
        { type: "emitter", preset: "dust", count: 6, at: 0.1 }
      ]
    });
    const handle = fx.burst("bat-crack", [0, 1, 0], { intensity: 2 });
    expect(added).toHaveLength(1);
    expect(flashes).toHaveBeenCalledTimes(1);
    expect(flashes.mock.calls[0][0]).toMatchObject({ intensity: 12, range: 5, duration: 0.2 });
    expect(shake.add).toHaveBeenCalledWith(0.3);
    step(0.05);
    expect(added).toHaveLength(1);
    step(0.06);
    expect(added).toHaveLength(2);
    expect(added[1]).toMatchObject({ burst: 6, gravity: -0.4 });
    expect(handle.alive).toBe(true);
    handle.stop();
    expect(handle.alive).toBe(false);
  });

  it("stopping before a delayed layer cancels it; camera: false skips camera layers", () => {
    const { fx, added, shake, step } = harness();
    fx.registerPreset("late", { name: "late", layers: [{ type: "camera", shake: 0.5 }, { type: "emitter", at: 0.2 }] });
    const handle = fx.burst("late", [0, 0, 0], { camera: false });
    expect(shake.add).not.toHaveBeenCalled();
    handle.stop();
    step(0.5);
    expect(added).toHaveLength(0);
  });

  it("spawn(name) of a registered preset is one-shot; the burst sprite option overrides the preset's", () => {
    const { fx, added } = harness();
    fx.registerPreset("ember", { name: "ember", layers: [{ type: "emitter", preset: "spark", sprite: "glow" }] });
    fx.spawn("ember", [0, 0, 0]);
    fx.burst("ember", [0, 0, 0], { sprite: "flare" });
    expect(added[0]).toMatchObject({ emissionRate: 0, burst: 24, sprite: "glow", materialMode: "additive-glow" });
    expect(added[1].sprite).toBe("flare");
  });

  it("decal layers place a decal at the burst position facing the burst normal", () => {
    const { fx, added } = harness();
    fx.registerPreset("scorch", { name: "scorch", layers: [{ type: "decal", size: 1.2, lifetime: 4 }] });
    fx.burst("scorch", [3, 0, 3], { normal: [0, 1, 0] });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ effect: "decal", position: [3, 0, 3], decal: { size: [1.2, 1.2], normal: [0, 1, 0], lifetime: 4 } });
  });
});
