/**
 * Idol pass first-seconds regression (artifacts/idol/FIRST-SECONDS.md, lessons R2): boot awaits warmPrograms after the
 * park's Idol GLBs load and before the sim ticks (appReady) or the loading screen reports ready; a park switch re-warms
 * with the sim held.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Aura Diamond Idol start", () => {
  const src = readFileSync("apps/showcase-aura-diamond-3d/src/main.ts", "utf8");
  it("warms programs, the HDRI and the Idol texture upgrades before the sim starts and the loading screen hides", () => {
    const ready = src.indexOf('void loading.track(Promise.resolve((app as any).ready?.()), 1, "assets")');
    expect(ready).toBeGreaterThan(0);
    const body = src.slice(ready, src.indexOf("/* ---------- QA hooks", ready));
    const warm = body.indexOf("await warmPrograms(app");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(0);
    expect(warm).toBeLessThan(body.indexOf('loading.done("ready")'));
    expect(warm).toBeLessThan(body.indexOf("appReady = true"));
    expect(body.slice(warm, body.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
  });
  it("re-warms after a park switch with the sim held until the new park's GLBs are warm", () => {
    const setPark = src.slice(src.indexOf("function setPark("), src.indexOf("function setPark(") + 2500);
    const scene = setPark.indexOf("app.setScene(");
    const hold = setPark.indexOf("appReady = false");
    expect(hold).toBeGreaterThan(scene);
    expect(setPark.indexOf("await warmPrograms(app")).toBeGreaterThan(hold);
    expect(setPark.indexOf("appReady = true")).toBeGreaterThan(setPark.indexOf("await warmPrograms(app"));
  });
});
