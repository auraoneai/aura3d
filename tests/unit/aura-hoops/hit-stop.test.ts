import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRealtimeHitStop } from "../../../apps/showcase-aura-hoops-3d/src/hitStop";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

/** The loop shape of `frame(dtRaw)`: game time advances only on frames that are not frozen. */
function simulate(freezeFor: (gameTime: number) => number | undefined, frames: number, dtRaw = 1 / 60): { gameTime: number; frozenFrames: number } {
  const hitStop = createRealtimeHitStop();
  let gameTime = 0;
  let frozenFrames = 0;
  for (let i = 0; i < frames; i += 1) {
    const seconds = freezeFor(gameTime);
    if (seconds !== undefined) hitStop.trigger(seconds);
    const frozen = hitStop.advance(dtRaw);
    if (frozen) frozenFrames += 1;
    else gameTime += dtRaw;
  }
  return { gameTime, frozenFrames };
}

describe("Aura Hoops hit-stop", () => {
  it("a made basket (90 ms dunk hit-stop) freezes for about 90 ms of real time and then game time runs again", () => {
    let fired = false;
    const out = simulate((t) => { if (!fired && t >= 1) { fired = true; return 0.09; } return undefined; }, 120);
    expect(out.frozenFrames).toBeGreaterThanOrEqual(5);
    expect(out.frozenFrames).toBeLessThanOrEqual(7);
    expect(out.gameTime).toBeGreaterThan(1.7); // 120 frames = 2 s of real time, minus the freeze
  });

  it("the old game-time countdown never ends: this is the freeze this fix removes", () => {
    // Old code: hitStopUntil = game_.time + seconds; frozen = hitStopUntil > game_.time; dt = frozen ? 0 : dt.
    let gameTime = 0;
    let until = 0;
    let fired = false;
    for (let i = 0; i < 600; i += 1) {
      if (!fired && gameTime >= 1) { fired = true; until = gameTime + 0.09; }
      const frozen = until > gameTime;
      if (!frozen) gameTime += 1 / 60;
    }
    expect(gameTime).toBeLessThan(1.1); // 10 s of real time later the game clock is still stuck
  });

  it("a longer pending freeze wins and a shorter one does not shorten it", () => {
    const hs = createRealtimeHitStop();
    hs.trigger(0.11);
    hs.trigger(0.06);
    expect(hs.remaining).toBeCloseTo(0.11, 6);
  });

  it("main.ts binds the juice hit-stop to the real-time clock and no longer to game time", () => {
    expect(MAIN).toContain("createRealtimeHitStop()");
    expect(MAIN).toContain("hitStop.trigger(seconds)");
    expect(MAIN).toContain("hitStop.advance(dtRaw)");
    expect(MAIN).not.toContain("hitStopUntil");
  });
});
