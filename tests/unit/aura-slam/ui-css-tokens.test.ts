import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "examples/aura-slam/ui/styles.css"), "utf8");
const wrapper = readFileSync(resolve(process.cwd(), "apps/showcase-top-tennis/index.html"), "utf8");
const quickbar = readFileSync(resolve(process.cwd(), "apps/showcase-port-shared/quickbar.css"), "utf8");
const wrapperMain = readFileSync(resolve(process.cwd(), "apps/showcase-top-tennis/src/main.ts"), "utf8");

describe("aura-slam ui styles", () => {
  it("defines every custom property the rules read (an undefined one silently drops the declaration)", () => {
    const defined = new Set([...(css + wrapper + quickbar).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]!));
    const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,[^)]*)?\)/gi)].filter((m) => !m[2]).map((m) => m[1]!));
    expect([...used].filter((name) => !defined.has(name)).sort()).toEqual([]);
  });

  it("reserves the portrait quick-bar height above the scoreboard, pause and sound buttons", () => {
    expect(css).toMatch(/--score-space:calc\(156px \+ var\(--quick-bar-space,0px\)\)/);
    expect(css).toMatch(/\.scoreboard,\.practice-hud\{top:calc\(6px \+ var\(--quick-bar-space,0px\)/);
    expect(css).toMatch(/\.pause-btn\{top:calc\(6px \+ var\(--quick-bar-space,0px\)/);
    expect(wrapperMain).toContain("showcase-port-shared/quickbar.css");
    expect(quickbar).toMatch(/--quick-bar-space:\s*var\(--a3d-bar-space\)/);
  });
});
