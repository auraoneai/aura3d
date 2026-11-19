import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** FIRST-SECONDS: every floor's Idol models are warmed before the sim starts and the loading screen hides. */
describe("bunker zero Idol start warm-up", () => {
  it("awaits warmPrograms after mg.ready() and before appReady, loading.done() and hideAllRuntime()", () => {
    const src = readFileSync("apps/showcase-bunker-zero/src/main.ts", "utf8");
    const boot = src.slice(src.indexOf("void mg.ready().then(async () => {"));
    const warm = boot.indexOf("await warmPrograms(app");
    expect(warm).toBeGreaterThan(0);
    expect(warm).toBeLessThan(boot.indexOf("appReady = true"));
    expect(warm).toBeLessThan(boot.indexOf("loading.done()"));
    expect(warm).toBeLessThan(boot.indexOf("hideAllRuntime()"));
  });
});
