// Named impact presets are one-shots that use their own life and size: the app.effects.spawn() path used to start
// a never-ending continuous emitter on the default 1.2 to 2.4 s life, which left glowing bubbles hanging over the scene.

import { describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function step(app: ReturnType<typeof createAuraApp>, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) app.step(1 / 60);
}

describe("preset one-shots die with their own life", () => {
  for (const kind of ["spark", "aura-burst", "ring", "dust", "impact-flash"] as const) {
    it(`${kind}: spawn() and burst() leave no live particles after the preset life`, () => {
      const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
      const system = prd07SystemFor(app)!;
      app.effects!.spawn(kind, [0, 1, 0], { color: "#ffd76a" });
      app.effects!.burst(kind, [1, 1, 0], { count: 24 });
      step(app, 0.05);
      expect(system.liveCount()).toBeGreaterThan(0);
      step(app, 2.5);
      expect(system.liveCount()).toBe(0);
      app.dispose();
    });
  }

  it("an authored spec object is still a looping effect the caller stops", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const system = prd07SystemFor(app)!;
    const handle = app.effects!.spawn({ name: "spark", layers: [] } as never, [0, 1, 0], {});
    step(app, 4);
    expect(system.liveCount()).toBeGreaterThan(0);
    handle.stop({ immediate: true });
    step(app, 3);
    expect(system.liveCount()).toBe(0);
    app.dispose();
  });
});
