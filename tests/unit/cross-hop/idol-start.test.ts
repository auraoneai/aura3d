/**
 * Idol wow pass (first-seconds fix): Cross Hop must not start its loop or hide the loading screen while the Idol GLBs
 * are still streaming in and their programs / texture upgrades are compiling (draws are skipped meanwhile, which froze
 * the first seconds of play on the clear colour).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync("apps/showcase-cross-hop/src/main.ts", "utf8");

describe("Cross Hop Idol start", () => {
  it("waits for the Idol downloads and warms programs before the loop runs and the loading screen hides", () => {
    const ready = main.slice(main.indexOf("async function readyForPlay()"));
    const body = ready.slice(0, ready.indexOf("\n}\n"));
    const warm = body.indexOf("await warmPrograms(app");
    expect(warm, "readyForPlay awaits warmPrograms").toBeGreaterThan(0);
    expect(body.indexOf("await g.ready()")).toBeLessThan(warm);
    expect(body.indexOf("await idolModelsDownloaded(")).toBeGreaterThan(0);
    expect(body.indexOf("await idolModelsDownloaded(")).toBeLessThan(warm);
    // the diorama spectator critters are mounted before the warm-up, not after the loop starts
    expect(body.indexOf("mountSpectators()")).toBeGreaterThan(0);
    expect(body.indexOf("mountSpectators()")).toBeLessThan(warm);
    expect(body.slice(warm, body.indexOf(")", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
    // the loop only runs once appReady is set, which happens after readyForPlay (and so after the warm-up) resolves
    const track = main.indexOf("loading.track(readyForPlay()");
    expect(track).toBeGreaterThan(0);
    expect(main.indexOf("appReady = true", track)).toBeGreaterThan(track);
    expect(main.indexOf("appReady = true")).toBe(main.indexOf("appReady = true", track));
    expect(main).toMatch(/isActive: \(\) => appReady && !st\.paused/);
    expect(main.indexOf('loading.done("Ready")')).toBeGreaterThan(track);
  });

  it("tracks the Idol GLB downloads (not the empty legacy catalog) for the loading bar and the wait", () => {
    expect(main).toContain("modelUrls(idolAssets");
    expect(main).not.toMatch(/import \{ assets \} from "\.\/aura-assets"/);
  });
});
