import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHitStop } from "../../../packages/game/src/motion";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

describe("Aura Hoops hit-stop", () => {
  it("counts down on the frame clock: game time resumes after the freeze (it used to stand still forever)", () => {
    const hitStop = createHitStop(0);
    let gameTime = 0;
    const frame = (dtRaw: number) => {
      const frozen = hitStop.active;
      hitStop.update(dtRaw);
      if (!frozen) gameTime += dtRaw;
    };
    for (let i = 0; i < 10; i += 1) frame(1 / 60);
    const before = gameTime;
    hitStop.trigger(90);
    for (let i = 0; i < 4; i += 1) frame(1 / 60);
    expect(gameTime).toBe(before); // frozen
    for (let i = 0; i < 30; i += 1) frame(1 / 60);
    expect(gameTime).toBeGreaterThan(before + 0.3); // and running again
  });

  it("the game binds juice hit-stop to the real-time clock, not to game time", () => {
    expect(MAIN).toContain("createHitStop(0)");
    expect(MAIN).toContain("hitStop.trigger(seconds * 1000)");
    expect(MAIN).not.toContain("hitStopUntil");
  });
});
