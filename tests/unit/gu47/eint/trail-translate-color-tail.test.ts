// GU47 pass 4 (g02, g04, g19): AuraTrailHandle.translate for camera-anchored scrolling worlds and AuraTrailOptions.colorTail.
import { describe, expect, it } from "vitest";
import { RIBBON_VERTEX_FLOATS } from "../../../../packages/rendering/src/vfx/RibbonBatch";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { createAppEffects } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function harness() {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  const onFrame = (cb: (frame: { dt: number }) => void) => { callbacks.push(cb); return () => undefined; };
  const car = { position: [0, 0.5, 0] as [number, number, number], getWorldPosition: () => car.position };
  const appLike: AppLike = { scene: { nodes: [] }, onFrame, nodes: { get: (id: string) => (id === "car" ? car : undefined) as never } };
  const system = new ProductionEffectSystem(appLike, { tier: "high" });
  const fx = createAppEffects({ onFrame } as never, system);
  const step = (dt: number) => { for (const cb of callbacks) cb({ dt }); };
  return { system, fx, car, step };
}

describe("trail translate (pass 4)", () => {
  it("a fixed subject in a world scrolling at 20 m/s leaves a ribbon when the game translates the trail", () => {
    const still = harness();
    const idle = still.fx.trail("car", { width: 0.4, life: 1 });
    for (let i = 0; i < 60; i++) still.step(1 / 60);
    expect(idle.length).toBeLessThan(0.1);

    const h = harness();
    const wake = h.fx.trail("car", { width: 0.4, life: 1 });
    for (let i = 0; i < 90; i++) {
      wake.translate(0, 0, 20 / 60);
      h.step(1 / 60);
    }
    expect(wake.length).toBeGreaterThan(15);
    expect(wake.length).toBeLessThanOrEqual(20 * 1 + 1);
  });

  it("ignores a zero or non-finite offset", () => {
    const h = harness();
    const trail = h.fx.trail("car", { width: 0.4, life: 1 });
    trail.translate(0, 0, 0);
    trail.translate(Number.NaN, 0, 1);
    h.step(1 / 60);
    expect(trail.length).toBe(0);
  });
});

describe("trail colorTail (pass 4)", () => {
  it("blends from the head colour to the tail colour; without colorTail every point keeps the head colour", () => {
    const rgbAt = (geometry: { vertices: Float32Array | number[] }, point: number) => {
      const o = point * 2 * RIBBON_VERTEX_FLOATS;
      return [geometry.vertices[o + 8], geometry.vertices[o + 9], geometry.vertices[o + 10]];
    };
    const drive = (h: ReturnType<typeof harness>) => {
      for (let i = 0; i < 72; i++) { h.car.position = [h.car.position[0] + 10 / 60, 0.5, 0]; h.step(1 / 60); }
    };
    const tinted = harness();
    tinted.fx.trail("car", { width: 0.4, life: 1, color: "#00ffff", colorTail: "#ff8000" });
    drive(tinted);
    const [g] = tinted.system.ribbonFeed().buildAll([0, 6, 20]);
    const last = g!.vertexCount / 2 - 1;
    expect(rgbAt(g!, 0)[0]).toBeLessThan(0.1);
    expect(rgbAt(g!, last)[0]).toBeGreaterThan(0.8);

    const plain = harness();
    plain.fx.trail("car", { width: 0.4, life: 1, color: "#00ffff" });
    drive(plain);
    const [p] = plain.system.ribbonFeed().buildAll([0, 6, 20]);
    expect(rgbAt(p!, p!.vertexCount / 2 - 1)[0]).toBeLessThan(0.1);
  });
});
