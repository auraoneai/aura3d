/**
 * Idol pass first-seconds regression (FIRST-SECONDS.md): boot loads every Idol body's skeleton driver and awaits
 * warmPrograms (programs, IBL, Idol texture upgrades) before play starts (`appReady = true`); a venue rebuild re-warms.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Aura FC 3D Idol start", () => {
  it("preloads the Idol drivers and awaits warmPrograms before appReady, and re-warms after a venue rebuild", () => {
    const src = readFileSync("apps/showcase-aura-fc-3d/src/main.ts", "utf8");
    const boot = src.slice(src.indexOf("const readyPromise = Promise.resolve"));
    const preload = boot.indexOf("await preloadIdolDrivers()");
    const warm = boot.indexOf("await warmPrograms(app");
    const ready = boot.indexOf("appReady = true");
    expect(preload, "boot preloads the Idol skeleton drivers").toBeGreaterThan(0);
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(preload);
    expect(warm).toBeLessThan(ready);
    expect(boot.slice(warm, boot.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
    const rebuild = src.slice(src.indexOf("const rebuildForVenue"), src.indexOf("const sim = createSim()"));
    expect(rebuild).toMatch(/setScene[\s\S]*warmPrograms\(app/);
  });
});
