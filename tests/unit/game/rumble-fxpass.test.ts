import { describe, expect, it } from "vitest";
import { createRumbleDriver } from "../../../packages/game/src/juice/rumble";
import { createFxParticlePass } from "../../../packages/game/src/juice/fxParticlePass";

describe("juice/rumble (PRD-09 1751)", () => {
  it("routes to gamepad-rumble when an actuator exists; navigator-vibrate else; none on iOS", async () => {
    const withActuator = createRumbleDriver({
      navigatorLike: {},
      actuator: () => ({ playEffect: async () => "complete" })
    });
    expect(withActuator({ ms: 50, strong: 1 })).toEqual({ via: "gamepad-rumble" });

    const buzzes: number[] = [];
    const navOnly = createRumbleDriver({ navigatorLike: { vibrate: (p) => (buzzes.push(Number(p)), true) } });
    expect(navOnly({ ms: 60, weak: 0.5 })?.via).toBe("navigator-vibrate");
    await new Promise((r) => setTimeout(r, 0));
    expect(buzzes).toEqual([60]);

    const none = createRumbleDriver({ navigatorLike: {}, actuator: () => undefined });
    expect(none({ ms: 60 })?.via).toBe("none");
  });

  it("honors the settings toggle", () => {
    const d = createRumbleDriver({ navigatorLike: { vibrate: () => true }, enabled: () => false });
    expect(d({ ms: 10 })?.via).toBe("none");
  });
});

describe("juice/fxParticlePass backend B (PRD-09 1752)", () => {
  it("forwards burst/trail verbatim and reports liveCount", () => {
    const calls: unknown[] = [];
    const effects = {
      liveCount: 3,
      burst: (...a: unknown[]) => void calls.push(["burst", ...a]),
      trail: (t: unknown, o: unknown) => (calls.push(["trail", t, o]), { stop: () => calls.push(["stop"]) })
    };
    const fx = createFxParticlePass(effects);
    expect(fx.backend).toBe("particle-pass");
    fx.burst("spark", [1, 2, 3], { count: 12, seed: 7, color: "#fff" });
    const t = fx.trail("node-9", { width: 0.2, life: 0.5 });
    const t2 = fx.trail({ id: "n7", position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, setPosition() {}, setRotation() {}, setScale() {} }, { width: 1, life: 1 });
    t.stop();
    t2.stop();
    expect(fx.liveCount).toBe(3);
    expect(calls).toEqual([
      ["burst", "spark", [1, 2, 3], { count: 12, seed: 7, color: "#fff" }],
      ["trail", "node-9", { width: 0.2, life: 0.5 }],
      ["trail", { node: "n7" }, { width: 1, life: 1 }],
      ["stop"],
      ["stop"]
    ]);
  });
});
