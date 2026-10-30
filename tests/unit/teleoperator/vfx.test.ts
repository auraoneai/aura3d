import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { GRID_VFX_PRESETS, TYRE_SPLASH_INTERVAL_S, createGridVfxQueue, installGridVfx, type GridVfxShot } from "../../../apps/showcase-teleoperator/src/vfx";
import { buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";

const drain = (q: ReturnType<typeof createGridVfxQueue>, o = { motionOk: true, lowTier: false }): GridVfxShot[] => {
  const shots: GridVfxShot[] = [];
  q.drain(o, (s) => shots.push(s));
  return shots;
};

describe("grid dispatch GD-14 runtime VFX", () => {
  it("the instanced spark spheres are gone from the scene", () => {
    const app = createAuraApp(undefined, { scene: buildGridDispatchScene("golden"), autoStart: false });
    expect(app.nodes.has("impact-sparks")).toBe(false);
    app.dispose?.();
  });

  it("registers the pack and turns runtime effects on", () => {
    const registered: string[] = [];
    const fx = { runtime: "off" as "on" | "off", registerPreset: (k: string) => void registered.push(k) };
    expect(installGridVfx(fx)).toBe(true);
    expect(fx.runtime).toBe("on");
    expect(registered.sort()).toEqual(Object.keys(GRID_VFX_PRESETS).sort());
    expect(installGridVfx(undefined)).toBe(false);
  });

  it("a collision fires grid-impact with camera:false at the contact point; the queue empties", () => {
    const q = createGridVfxQueue();
    q.impact({ point: [3, 0.8, -40], normal: [1, 0, 0], count: 14, speed: 12 });
    const [shot] = drain(q);
    expect(shot).toMatchObject({ kind: "grid-impact", at: [3, 0.8, -40], options: { camera: false, count: 14 } });
    expect(q.pending).toBe(0);
  });

  it("pickup and drop-off fire the teal objective ring at the kerb beacon", () => {
    const q = createGridVfxQueue();
    q.objective(9.4, -120);
    expect(drain(q)[0]).toMatchObject({ kind: "grid-objective-ring", at: [9.4, 0.12, -120] });
  });

  it("tyre spray only on the wet night street above walking speed, one puff per rear wheel per interval", () => {
    const q = createGridVfxQueue();
    const base = { dt: TYRE_SPLASH_INTERVAL_S, speed: 12, x: 0, z: -10, width: 2, length: 4.6 };
    q.tyres({ ...base, wet: false });
    q.tyres({ ...base, wet: true, speed: 2 });
    expect(q.pending).toBe(0);
    q.tyres({ ...base, wet: true });
    const shots = drain(q);
    expect(shots.map((s) => s.kind)).toEqual(["grid-tyre-splash", "grid-tyre-splash"]);
    expect(shots[0]!.at[0]).toBeLessThan(0);
    expect(shots[1]!.at[0]).toBeGreaterThan(0);
  });

  it("reduced motion halves the particle count, Low tier halves it again (PRD 6.3, 6.4)", () => {
    const counts = [
      { motionOk: true, lowTier: false },
      { motionOk: false, lowTier: false },
      { motionOk: false, lowTier: true }
    ].map((o) => {
      const q = createGridVfxQueue();
      q.impact({ point: [0, 0.8, 0], normal: [0, 0, 1], count: 24, speed: 10 });
      return drain(q, o)[0]!.options.count!;
    });
    expect(counts).toEqual([24, 12, 6]);
  });
});
