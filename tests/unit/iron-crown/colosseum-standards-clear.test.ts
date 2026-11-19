import { describe, expect, it } from "vitest";
import { COLOSSEUM_STANDARD_Z } from "../../../apps/showcase-iron-crown/src/game/stages";

/** owner pass-through pass: a knocked-down fighter sprawled into the battle-standard plinth (it stood 1.4 m behind the lane) */
describe("Colosseum battle standards stand clear of the fight lane", () => {
  it("the plinth's nearest corner is at least 1.6 m behind the lane centre (fighters live in z +-0.2, a KO sprawl reaches ~1.2 m)", () => {
    const halfW = 1.728 / 2, halfD = 0.642 / 2, yaw = 0.22;
    const frontZ = COLOSSEUM_STANDARD_Z + Math.abs(Math.sin(yaw)) * halfW + Math.cos(yaw) * halfD;
    expect(frontZ).toBeLessThanOrEqual(-1.6);
  });
});
