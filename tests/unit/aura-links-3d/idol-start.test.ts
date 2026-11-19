/**
 * Idol wow pass (artifacts/idol/FIRST-SECONDS.md): the Idol GLBs stream in after the mount, so boot must settle their
 * programs and texture upgrades (warmPrograms) before the game loop runs and the loading bar completes, and re-settle after
 * a course switch or a studio golfer change mounts new Idol models.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("apps/showcase-aura-links-3d/src/main.ts", "utf8");

describe("Aura Links Idol start", () => {
  it("awaits warmPrograms after the mount and before the loop runs and the loading bar completes", () => {
    const ready = src.slice(src.indexOf("void (auraApp as any).ready?.()?.then(async () => {"));
    const warm = ready.indexOf("await warmPrograms(auraApp");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(0);
    expect(warm).toBeLessThan(ready.indexOf("appReady = true;"));
    expect(warm).toBeLessThan(ready.indexOf('courseLoading.done("ready")'));
    expect(ready.slice(warm, ready.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
    // the game loop does nothing until then (and while a re-warm runs)
    expect(src).toMatch(/if \(!appReady \|\| qaHold \|\| warming\) return;/);
  });

  it("re-warms after every scene swap that can bring in new Idol models (course switch, studio golfer)", () => {
    const swaps = [...src.matchAll(/\.setScene\(next\);/g)].length;
    const rewarms = [...src.matchAll(/rewarmIdolModels\((true|pendingForce)?\)/g)].length;
    expect(swaps).toBe(3);
    expect(rewarms).toBe(3);
    expect(src).toMatch(/function rewarmIdolModels\(force = false\)[\s\S]*?warmPrograms\(auraApp/);
  });
});
