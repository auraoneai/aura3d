import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Idol wow pass: Glint Courier settles programs and Idol texture upgrades before the loop runs (no frozen first seconds). */
describe("dot-dash-3d Idol start", () => {
  it("awaits warmPrograms after the app is ready and before the loading screen hides and the frame loop runs", () => {
    const src = readFileSync("apps/showcase-dot-dash-3d/src/main.ts", "utf8");
    const ready = src.indexOf('loading.track(g.ready()');
    const warm = src.indexOf("await warmPrograms(app", ready);
    expect(ready).toBeGreaterThan(0);
    expect(warm, "awaits warmPrograms after g.ready()").toBeGreaterThan(ready);
    expect(warm).toBeLessThan(src.indexOf('loading.done("Ready")', ready));
    expect(warm).toBeLessThan(src.indexOf("appReady = true", ready));
    // the frame loop does nothing until appReady
    expect(src).toMatch(/app\.onFrame\(\(\{ dt \}\) => \{\n\s+if \(!appReady\) return;/);
    expect(src.slice(warm, src.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
  });
});
