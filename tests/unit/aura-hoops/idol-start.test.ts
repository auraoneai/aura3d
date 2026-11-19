/**
 * Idol pass first-seconds regression (FIRST-SECONDS.md): boot loads the mounted Idol bodies' skeleton drivers and awaits
 * warmPrograms (programs, IBL, Idol texture upgrades) before play starts (`appReady = true`); both scene rebuilds re-warm.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Aura Hoops 3D Idol start", () => {
  it("preloads the Idol drivers and awaits warmPrograms before appReady, and re-warms after every scene rebuild", () => {
    const src = readFileSync("apps/showcase-aura-hoops-3d/src/main.ts", "utf8");
    const boot = src.slice(src.indexOf("void Promise.resolve(auraApp.ready()).then(async"));
    const preload = boot.indexOf("await preloadIdolDrivers(");
    const warm = boot.indexOf("await warmPrograms(auraApp");
    const ready = boot.indexOf("appReady = true");
    expect(preload, "boot preloads the Idol skeleton drivers").toBeGreaterThan(0);
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(preload);
    expect(warm).toBeLessThan(ready);
    const rebuilds = src.split("auraApp.setScene(buildScene(venue));").slice(1);
    expect(rebuilds.length).toBe(2);
    for (const after of rebuilds) expect(after.slice(0, 700)).toMatch(/warmPrograms\(auraApp/);
  });
});
