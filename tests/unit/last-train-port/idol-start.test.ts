import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Idol pass first-seconds regression (lessons R2): the Idol tram, town GLBs and rigged walkers stream textures and compile
 * program variants after mount; boot must settle them (warmPrograms) before the loading panel hides and the loop runs.
 */
describe("Lamplight Line Idol start", () => {
  it("awaits warmPrograms after the world is bound and before ready / the loading panel hides", () => {
    const src = readFileSync("examples/last-train-port/main.ts", "utf8");
    expect(src).toMatch(/import \{ warmPrograms \} from "@aura3d\/engine\/game";/);
    const boot = src.slice(src.indexOf("async function boot()"));
    const warm = boot.indexOf("await warmPrograms(app");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(0);
    expect(warm).toBeGreaterThan(boot.indexOf("world.bind(app"));
    expect(warm).toBeLessThan(boot.indexOf("ready = true"));
    expect(warm).toBeLessThan(boot.indexOf('$("loading").classList.add("hidden")'));
    expect(boot.slice(warm, boot.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
  });
});
