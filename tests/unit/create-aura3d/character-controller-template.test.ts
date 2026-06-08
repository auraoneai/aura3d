import { describe, expect, it } from "vitest";
import { defaultCharacterControllerTuning, stepCharacterSpeed } from "../../../packages/create-aura3d/templates/character-controller/src/controller";
import { createLocomotionKit } from "../../../packages/animation/src";

describe("character-controller template", () => {
  const t = defaultCharacterControllerTuning;

  it("accelerates from rest toward the walk target while a move key is held", () => {
    let s = { speed: 0 };
    for (let i = 0; i < 60; i += 1) s = stepCharacterSpeed(s, { move: true, run: false }, 1 / 60, t);
    expect(s.speed).toBeCloseTo(t.walkSpeed, 2);
  });

  it("accelerates to the run target with the run modifier", () => {
    let s = { speed: 0 };
    for (let i = 0; i < 120; i += 1) s = stepCharacterSpeed(s, { move: true, run: true }, 1 / 60, t);
    expect(s.speed).toBeCloseTo(t.runSpeed, 2);
  });

  it("decelerates to a full stop when input is released", () => {
    let s = { speed: t.runSpeed };
    for (let i = 0; i < 120; i += 1) s = stepCharacterSpeed(s, { move: false, run: false }, 1 / 60, t);
    expect(s.speed).toBe(0);
  });

  it("is deterministic and never negative", () => {
    const run = () => {
      let s = { speed: 0 };
      const out: number[] = [];
      const inputs = [true, true, true, false, false, true, false];
      for (const move of inputs) {
        s = stepCharacterSpeed(s, { move, run: true }, 1 / 30, t);
        out.push(Number(s.speed.toFixed(4)));
      }
      return out;
    };
    expect(run()).toEqual(run());
    expect(run().every((v) => v >= 0)).toBe(true);
  });

  it("feeds a coherent state into the locomotion kit (rest -> idle, walk target -> walk)", () => {
    const kit = createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run", walkSpeed: t.walkSpeed, runSpeed: t.runSpeed });
    expect(kit.sample(0).state).toBe("idle");
    expect(kit.sample(t.walkSpeed).state).toBe("walk");
    expect(kit.sample(t.runSpeed).state).toBe("run");
  });
});
