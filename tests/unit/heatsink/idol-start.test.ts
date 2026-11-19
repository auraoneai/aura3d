/** Idol wow pass (FIRST-SECONDS.md): boot settles programs, the HDRI and the Idol texture upgrades before the frame loop. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Thermal Drift Idol start", () => {
  it("awaits warmPrograms after the mount and before the frame loop, the loading bar and the start screen go live", () => {
    const src = readFileSync("apps/showcase-heatsink/src/main.ts", "utf8");
    const boot = src.slice(src.indexOf("async function boot()"));
    const warm = boot.indexOf("await warmPrograms(auraApp");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(boot.indexOf("auraApp.ready()"));
    expect(warm).toBeLessThan(boot.indexOf("auraApp.onFrame("));
    expect(warm).toBeLessThan(boot.indexOf("loading.done()"));
    expect(warm).toBeLessThan(boot.indexOf("auraApp.resume()"));
    expect(boot.slice(warm, boot.indexOf(";", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
  });
});
