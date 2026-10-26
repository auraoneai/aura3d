// Particle emission and life are measured in seconds, not frames: the same effect at 30, 60 and 120 fps spawns the same
// number of particles per second, and one-shot presets are gone by their design life at every frame rate.

import { describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";
import { createEmitter, stepEmitter } from "../../../../packages/engine/src/production-runtime/effects/CpuEmitter";

const RATES = [30, 60, 120, 144] as const;

function mount() {
  const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
  return { app, system: prd07SystemFor(app)! };
}

describe("emitter frame-rate invariance", () => {
  it("a continuous emitter holds the same live count (particles per second x life) at every frame rate", () => {
    const means: number[] = [];
    for (const fps of RATES) {
      const state = createEmitter({ capacity: 4096, emissionRate: 50, life: [1, 1], speed: [0, 0], spread: 0, direction: [0, 1, 0], gravity: 0, drag: 0, size: [0.1, 0.1], origin: [0, 0, 0], seed: 7 } as never);
      let sum = 0;
      let n = 0;
      const dt = 1 / fps;
      for (let t = 0; t < 8; t += dt) {
        stepEmitter(state, dt);
        if (t > 3) { sum += state.live; n++; }
      }
      means.push(sum / n);
    }
    for (const m of means) expect(Math.abs(m - means[0]!) / means[0]!).toBeLessThan(0.05); // 50 per second x 1 s life = 50 live
    expect(means[0]).toBeGreaterThan(45);
    expect(means[0]).toBeLessThan(55);
  });

  it("the runtime system spawns the same particles per second at 30, 60, 120 and 144 fps", () => {
    const means: number[] = [];
    for (const fps of RATES) {
      const { app, system } = mount();
      app.effects!.spawn({ name: "dust", layers: [] } as never, [0, 1, 0], {}); // a looping spec: rate = count x 2 per second
      const dt = 1 / fps;
      let sum = 0;
      let n = 0;
      for (let t = 0; t < 8; t += dt) {
        app.step(dt);
        if (t > 4) { sum += system.liveCount(); n++; }
      }
      means.push(sum / n);
      app.dispose();
    }
    for (const m of means) expect(Math.abs(m - means[0]!) / means[0]!).toBeLessThan(0.1);
  });

  for (const kind of ["spark", "dust", "ring", "aura-burst", "streak"] as const) {
    it(`${kind}: a one-shot has the same peak at every frame rate and nothing lives past its design life`, () => {
      const peaks: number[] = [];
      for (const fps of RATES) {
        const { app, system } = mount();
        app.effects!.burst(kind, [0, 1, 0], { count: 40 });
        app.effects!.spawn(kind, [1, 1, 0], { color: "#ffd76a" });
        const dt = 1 / fps;
        let peak = 0;
        let t = 0;
        for (; t < 1.8; t += dt) {
          app.step(dt);
          peak = Math.max(peak, system.liveCount());
        }
        expect(system.liveCount()).toBe(0);
        peaks.push(peak);
        app.dispose();
      }
      for (const p of peaks) expect(p).toBe(peaks[0]);
    });
  }
});
