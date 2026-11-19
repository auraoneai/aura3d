import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** FIRST-SECONDS: Idol GLB textures/programs are settled before play, at boot and after every arena remount. */
describe("iron crown Idol start warm-up", () => {
  const src = readFileSync("apps/showcase-iron-crown/src/main.ts", "utf8");
  it("boot awaits warmPrograms after the first presented frame and before the loading screen hides", () => {
    const boot = src.slice(src.indexOf("void app.ready().then(async () => {"));
    const warm = boot.indexOf("await warmPrograms(leaseSafeWarmApp(app), IC_WARM)");
    expect(warm).toBeGreaterThan(boot.indexOf("await fightingGame.ready()"));
    expect(warm).toBeLessThan(boot.indexOf('loadingProgress.done("Ready")'));
  });
  it("re-warms after setScene brings in a new venue or new fighters, before the bout state is rebuilt", () => {
    const bout = src.slice(src.indexOf("async function configureBout"));
    const set = bout.indexOf("await fightingGame.setScene(");
    const warm = bout.indexOf("await warmPrograms(leaseSafeWarmApp(app), IC_WARM)");
    expect(set).toBeGreaterThan(0);
    expect(warm).toBeGreaterThan(set);
    expect(warm).toBeLessThan(bout.indexOf("P1 = makeFighter("));
    // The swap runs through game/venueSwap.ts: the old venue frozen on screen until the new one is warm.
    const swap = bout.indexOf("await swapVenue({");
    expect(swap).toBeGreaterThan(0);
    expect(swap).toBeLessThan(set);
  });
});
