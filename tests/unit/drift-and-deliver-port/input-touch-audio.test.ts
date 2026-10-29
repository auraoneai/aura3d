import { describe, expect, it } from "vitest";
import { createAudio } from "../../../examples/drift-and-deliver-port/audio";
import { REDUCED_FOV_KICK, setReducedMotion, snapChase, stepChase } from "../../../examples/drift-and-deliver-port/chase";
import { codeOf, drivingKey, keyAction } from "../../../examples/drift-and-deliver-port/input";
import { STEER_DEAD_PX, steerKeys } from "../../../examples/drift-and-deliver-port/touch";
import { createFakeContext } from "../audio-synth/mockContext";

describe("keyboard by physical position (C11)", () => {
  it("maps WASD by code, so AZERTY's Z/Q (codes KeyW/KeyA) drive", () => {
    expect(drivingKey({ code: "KeyW", key: "z" })).toBe("w");
    expect(drivingKey({ code: "KeyA", key: "q" })).toBe("a");
    expect(drivingKey({ code: "KeyQ", key: "a" })).toBeUndefined();
    expect(drivingKey({ code: "ShiftRight", key: "Shift" })).toBe("shift");
    expect(drivingKey({ code: "Space", key: " " })).toBe("space");
    expect(drivingKey({ code: "", key: "ArrowUp" })).toBe("w");
  });

  it("holding L toggles the headlights once (repeat events are ignored)", () => {
    expect(keyAction({ code: "KeyL", key: "l", repeat: false })).toBe("headlights");
    expect(keyAction({ code: "KeyL", key: "l", repeat: true })).toBeUndefined();
    expect(keyAction({ code: "Escape", key: "Escape", repeat: false })).toBe("pause");
    expect(keyAction({ code: "KeyR", key: "r", repeat: false })).toBe("restart");
    expect(codeOf({ code: "", key: "m" })).toBe("KeyM");
  });
});

describe("touch steering pad (C1)", () => {
  it("steers past the dead zone and centres inside it", () => {
    expect(steerKeys(0)).toEqual({ a: false, d: false });
    expect(steerKeys(STEER_DEAD_PX - 1)).toEqual({ a: false, d: false });
    expect(steerKeys(-STEER_DEAD_PX - 1)).toEqual({ a: true, d: false });
    expect(steerKeys(40)).toEqual({ a: false, d: true });
  });
});

describe("audio goes quiet on pause and in a hidden tab (C4)", () => {
  it("every bed gain targets 0 after suspend, and update() cannot raise it until resume", async () => {
    const f = createFakeContext("running");
    const audio = createAudio({ context: f.ctx as unknown as AudioContext });
    audio.resume();
    audio.update({ speed: 30, drifting: true, boosting: true, boost: 1 }, true, 1 / 60);
    const live = audio.beds()!;
    expect(live.engine).toBeGreaterThan(0);
    expect(live.squeal).toBeGreaterThan(0);
    expect(live.rush).toBeGreaterThan(0);
    const before = f.calls.length;
    audio.suspend();
    expect(audio.beds()).toEqual({ engine: 0, squeal: 0, rush: 0 });
    const zeroed = f.calls.slice(before).filter((c) => c.method === "setTarget");
    expect(zeroed).toHaveLength(3);
    for (const c of zeroed) expect(c.args[0]).toBe(0);
    audio.update({ speed: 30, drifting: true, boosting: true, boost: 1 }, true, 1 / 60);
    expect(audio.beds()).toEqual({ engine: 0, squeal: 0, rush: 0 });
    await new Promise((r) => setTimeout(r, 200));
    expect(f.ctx.state).toBe("suspended");
    audio.resume();
    expect(f.ctx.resumed).toBeGreaterThan(0);
    audio.update({ speed: 30, drifting: false, boosting: false, boost: 1 }, true, 1 / 60);
    expect(audio.beds()!.engine).toBeGreaterThan(0);
  });
});

describe("reduced motion (C11)", () => {
  it("drops the camera shake and caps the speed FOV kick", () => {
    const input = { x: 0, z: 0, y: 0, heading: 0, speed: 50, boosting: true, shake: 1 };
    const run = () => {
      const cam = snapChase(input);
      let maxFov = 0;
      const eyes: number[] = [];
      for (let i = 0; i < 600; i++) {
        stepChase(cam, { ...input, z: i * (50 / 60) }, 1 / 60);
        maxFov = Math.max(maxFov, cam.fov);
        eyes.push(cam.eye[0]);
      }
      return { maxFov, sway: Math.max(...eyes.slice(300)) - Math.min(...eyes.slice(300)) };
    };
    setReducedMotion(false);
    const full = run();
    setReducedMotion(true);
    const calm = run();
    setReducedMotion(false);
    expect(full.maxFov).toBeGreaterThan(56 + 10);
    expect(calm.maxFov).toBeLessThanOrEqual(56 + REDUCED_FOV_KICK + 1e-6);
    expect(calm.sway).toBeLessThan(1e-6);
    expect(full.sway).toBeGreaterThan(calm.sway);
  });
});
