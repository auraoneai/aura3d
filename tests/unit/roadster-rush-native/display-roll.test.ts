import { describe, expect, it } from "vitest";
import { DISPLAY_LEAN_MAX, displayRoll } from "../../../apps/showcase-roadster-rush/src/native/presentation";
import { FreewayWorld, Player, RoadsterGame, Traffic } from "../../../apps/showcase-roadster-rush/src/native";

describe("Apex Overdrive hero lean (GU47 AO-AN1)", () => {
  it("caps the lane-change lean at 6 degrees and keeps barrel rolls whole", () => {
    expect(DISPLAY_LEAN_MAX).toBeCloseTo((6 * Math.PI) / 180, 9);
    expect(displayRoll(0.38, false)).toBeCloseTo(DISPLAY_LEAN_MAX, 9);
    expect(displayRoll(-0.38, false)).toBeCloseTo(-DISPLAY_LEAN_MAX, 9);
    expect(displayRoll(0.05, false)).toBe(0.05);
    expect(displayRoll(Math.PI, true)).toBe(Math.PI);
    expect(displayRoll(Number.NaN, false)).toBe(0);
  });

  it("keeps the lean's sign tied to lateral velocity on a real run (>= 95% of moving samples)", () => {
    const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams("seed=42"), storage: null });
    game.boot();
    game.start();
    game.manual = true;
    let moving = 0;
    let agree = 0;
    for (let i = 0; i < 1800 && game.mode === "playing"; i++) {
      if (i % 90 === 0) game.triggerAction(i % 180 === 0 ? "left" : "right");
      game.simStep(1 / 60);
      const p = game.player as unknown as { _laneVel: number; rolling: boolean; pivot: { rotation: { z: number } } };
      if (p.rolling || Math.abs(p._laneVel) < 1) continue;
      moving++;
      const roll = displayRoll(p.pivot.rotation.z, p.rolling);
      if (Math.sign(roll) === -Math.sign(p._laneVel)) agree++;
    }
    expect(moving).toBeGreaterThan(20);
    expect(agree / moving).toBeGreaterThanOrEqual(0.95);
  });
});
