/**
 * Idol wow pass (first-seconds stall): boot awaits warmPrograms (programs, HDRI and every Idol texture upload settled)
 * after the world is bound and before play can begin, so the first seconds never skip draws while programs compile.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("saiyan-snake-way-port Idol start", () => {
  it("awaits warmPrograms after binding the world and before play is enabled", () => {
    const src = readFileSync("examples/saiyan-snake-way-port/main.ts", "utf8");
    const boot = src.slice(src.indexOf("async function boot()"));
    const warm = boot.indexOf("await warmPrograms(app");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(0);
    expect(warm).toBeGreaterThan(boot.indexOf("world.bind(app)"));
    expect(warm).toBeLessThan(boot.indexOf("ready = true"));
    expect(warm).toBeLessThan(boot.indexOf('$("loading").classList.add("hidden")'));
  });
});
