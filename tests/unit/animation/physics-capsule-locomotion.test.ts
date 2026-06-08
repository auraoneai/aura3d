import { describe, expect, it } from "vitest";
import { createLocomotionKit } from "../../../packages/animation/src";
import { createFightingCharacterController } from "../../../packages/physics/src";

// Integration: the physics capsule (@aura3d/physics FightingCharacterController) drives the
// @aura3d/animation locomotion kit — capsule speed -> blended locomotion state/clips. This is the
// physics-backed path the character-controller template documents (kinematic model is the default).
describe("physics capsule -> locomotion kit", () => {
  it("at rest the capsule is idle and the kit selects idle", () => {
    const controller = createFightingCharacterController();
    const speed = Math.abs(controller.snapshot().velocity[0]);
    const kit = createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run", walkSpeed: 1.6, runSpeed: 4.4 });
    expect(speed).toBeLessThan(0.05);
    expect(kit.sample(speed).state).toBe("idle");
  });

  it("walking the capsule produces forward speed that drives the kit into a moving state", () => {
    const controller = createFightingCharacterController();
    for (let i = 0; i < 30; i += 1) {
      controller.walk(1);
      controller.step(1 / 60);
    }
    const speed = Math.abs(controller.snapshot().velocity[0]);
    expect(speed).toBeGreaterThan(0.1);
    const kit = createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run", walkSpeed: 1.6, runSpeed: 4.4 });
    expect(["walk", "run"]).toContain(kit.sample(speed).state);
    // the kit yields blended clip weights summing to ~1 for the capsule's speed
    const weights = kit.blendWeights(speed);
    expect(weights.reduce((acc, w) => acc + w.weight, 0)).toBeCloseTo(1, 5);
  });

  it("the capsule exposes a fighting state machine (idle/walk) consistent with motion", () => {
    const controller = createFightingCharacterController();
    expect(controller.snapshot().state).toBe("idle");
    controller.walk(1);
    controller.step(1 / 60);
    expect(["walk", "dash", "run"]).toContain(controller.snapshot().state);
  });
});
