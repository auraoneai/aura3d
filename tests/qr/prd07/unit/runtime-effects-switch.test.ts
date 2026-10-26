// `app.effects.runtime = "off"` drops runtime-spawned particles (burst, spawn, game effects) and keeps everything else
// working; the URL's `?vfx=on|off` overrides the app setting either way.

import { afterEach, describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function step(app: ReturnType<typeof createAuraApp>, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) app.step(1 / 60);
}

const make = () => createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });

afterEach(() => {
  delete (globalThis as { location?: unknown }).location;
});

describe("runtime effects switch", () => {
  it("defaults to on and spawns particles", () => {
    const app = make();
    expect(app.effects!.runtime).toBe("on");
    app.effects!.burst("spark", [0, 1, 0], { count: 16 });
    step(app, 0.05);
    expect(prd07SystemFor(app)!.liveCount()).toBeGreaterThan(0);
    app.dispose();
  });

  it("off: burst, spawn and presets create no emitters and throw nothing", () => {
    const app = make();
    app.effects!.runtime = "off";
    expect(app.effects!.runtime).toBe("off");
    const system = prd07SystemFor(app)!;
    for (const kind of ["spark", "aura-burst", "ring", "dust", "impact-flash"] as const) {
      expect(() => app.effects!.burst(kind, [0, 1, 0], { count: 24 })).not.toThrow();
      const handle = app.effects!.spawn(kind, [1, 1, 0], {});
      expect(() => handle.stop({ immediate: true })).not.toThrow();
    }
    step(app, 0.5);
    expect(system.liveCount()).toBe(0);
    expect(app.effects!.liveCount).toBe(0);
    app.dispose();
  });

  it("off, then back on: effects spawn again", () => {
    const app = make();
    app.effects!.runtime = "off";
    app.effects!.burst("spark", [0, 1, 0], { count: 16 });
    app.effects!.runtime = "on";
    app.effects!.burst("spark", [0, 1, 0], { count: 16 });
    step(app, 0.05);
    expect(prd07SystemFor(app)!.liveCount()).toBeGreaterThan(0);
    app.dispose();
  });

  it("?vfx=on overrides an app that set runtime off", () => {
    (globalThis as { location?: unknown }).location = { search: "?vfx=on" };
    const app = make();
    app.effects!.runtime = "off";
    expect(app.effects!.runtime).toBe("on");
    app.effects!.burst("spark", [0, 1, 0], { count: 16 });
    step(app, 0.05);
    expect(prd07SystemFor(app)!.liveCount()).toBeGreaterThan(0);
    app.dispose();
  });

  it("?vfx=off overrides an app that left runtime on", () => {
    (globalThis as { location?: unknown }).location = { search: "?vfx=off" };
    const app = make();
    expect(app.effects!.runtime).toBe("off");
    app.effects!.burst("spark", [0, 1, 0], { count: 16 });
    step(app, 0.5);
    expect(prd07SystemFor(app)!.liveCount()).toBe(0);
    app.dispose();
  });
});
