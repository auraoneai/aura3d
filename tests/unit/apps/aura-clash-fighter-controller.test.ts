import { describe, expect, it } from "vitest";
import {
  defaultFighterControllerTuning,
  updateFighterController,
  type FighterControllerInput
} from "../../../apps/aura-clash-showcase/src/fighters/FighterController";
import { createFighterRuntimeState } from "../../../apps/aura-clash-showcase/src/state/FighterState";

const neutralInput: FighterControllerInput = {
  move: 0,
  jump: false,
  dash: false,
  guard: false,
  light: false,
  heavy: false,
  special: false
};

describe("Aura Clash directional jump", () => {
  it("a vertical jump (no direction) rises with no horizontal momentum", () => {
    const fighter = createFighterRuntimeState("left", "flux", { x: 0, y: 0 }, 1);
    const next = updateFighterController(fighter, { ...neutralInput, jump: true }, 16, 0);
    expect(next.action).toBe("jump");
    expect(next.position.y).toBeGreaterThan(0); // left the ground
    expect(Math.abs(next.velocity.x)).toBeLessThan(1e-6); // no sideways drift
  });

  it("A/D + W jumps diagonally and faces the leap direction", () => {
    // Fighter starts facing left (-1); jumping while holding right should turn it.
    const fighter = createFighterRuntimeState("left", "flux", { x: 0, y: 0 }, -1);
    const right = updateFighterController(fighter, { ...neutralInput, jump: true, move: 1 }, 16, 0);
    expect(right.action).toBe("jump");
    expect(right.facing).toBe(1);
    expect(right.velocity.x).toBeGreaterThan(0); // momentum to the right
    expect(right.position.y).toBeGreaterThan(0); // and it left the ground

    const left = updateFighterController(
      createFighterRuntimeState("left", "flux", { x: 0, y: 0 }, 1),
      { ...neutralInput, jump: true, move: -1 },
      16,
      0
    );
    expect(left.facing).toBe(-1);
    expect(left.velocity.x).toBeLessThan(0);
  });
});
