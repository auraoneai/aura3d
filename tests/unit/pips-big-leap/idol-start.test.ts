// FIRST-SECONDS (Idol wow pass): Pip's Big Leap settles shader programs, the HDRI and every Idol texture upgrade before
// the loading screen hides and the sim accepts input, and again after every world swap before `swapping` releases the sim.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("apps/showcase-pips-big-leap/src/main.ts", "utf8");

describe("pips-big-leap Idol start", () => {
  it("awaits warmPrograms (HDRI + textures) before loading.done() and appReady at boot", () => {
    const boot = src.slice(src.indexOf('void loading.track(app.ready()'));
    const warm = boot.indexOf("await loading.track(warmIdolPrograms()");
    expect(warm).toBeGreaterThan(0);
    expect(warm).toBeLessThan(boot.indexOf("loading.done()"));
    expect(warm).toBeLessThan(boot.indexOf("appReady = true"));
    const fn = src.slice(src.indexOf("async function warmIdolPrograms"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/await warmPrograms\(app/);
    expect(fn.slice(0, fn.indexOf("\n}"))).not.toMatch(/waitFor(Environment|Textures): false/);
  });

  it("re-warms after a world swap, before the swap releases the sim", () => {
    const swap = src.slice(src.indexOf(".setScene(built.scene"));
    const warm = swap.indexOf("warmIdolPrograms()");
    expect(warm).toBeGreaterThan(0);
    expect(warm).toBeLessThan(swap.indexOf("swapping = false"));
  });
});
