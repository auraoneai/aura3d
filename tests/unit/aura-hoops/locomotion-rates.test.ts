import { describe, expect, it } from "vitest";
import { CLIP_GROUND_SPEED, pickLocomotion } from "../../../apps/showcase-aura-hoops-3d/src/locomotionRates";

describe("Aura Hoops locomotion rates", () => {
  it("plays each gait at ground speed over clip speed so planted feet match the floor", () => {
    expect(pickLocomotion(3.7, "Run")).toEqual({ clip: "Run", rate: 3.7 / CLIP_GROUND_SPEED.Run });
    expect(pickLocomotion(5.5, "Run").clip).toBe("Sprint_Loop");
    expect(pickLocomotion(1.5, "Walk_Loop")).toEqual({ clip: "Walk_Loop", rate: 1.5 / CLIP_GROUND_SPEED.Walk_Loop });
    for (const speed of [1.3, 2.0, 2.5, 3.2, 3.7, 4.4, 5.2, 5.89]) {
      const p = pickLocomotion(speed, "");
      if (p.clip === "idle") continue;
      const clipSpeed = CLIP_GROUND_SPEED[p.clip];
      // foot speed over the floor stays within 8% of body speed inside the clamp
      expect(Math.abs(clipSpeed * p.rate - speed) / speed).toBeLessThan(0.08);
    }
  });

  it("is idle when nearly still and keeps the current gait through small speed dips", () => {
    expect(pickLocomotion(0.1, "Run").clip).toBe("idle");
    expect(pickLocomotion(2.6, "Run").clip).toBe("Run");
    expect(pickLocomotion(2.6, "Walk_Loop").clip).toBe("Walk_Loop");
    expect(pickLocomotion(4.6, "Sprint_Loop").clip).toBe("Sprint_Loop");
  });

  it("clamps the rate so slow movement never freezes the legs", () => {
    expect(pickLocomotion(0.4, "").rate).toBeGreaterThanOrEqual(0.3);
    expect(pickLocomotion(9, "").rate).toBeLessThanOrEqual(1.35);
  });
});
