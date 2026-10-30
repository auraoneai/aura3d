import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/index.html"), "utf8");
const main = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/main.ts"), "utf8");

describe("Apex Overdrive Showcase chip (GU47 AO-H1)", () => {
  it("folds the quick bar into one hidden chip with a hidden panel", () => {
    expect(html).toMatch(/<div class="aura3d-top-bar"[^>]*\bhidden\b/);
    expect(html).toMatch(/id="aura-showcase-chip"[^>]*aria-controls="aura-showcase-panel"/);
    expect(html).toMatch(/<div id="aura-showcase-panel"[^>]*\bhidden\b/);
    // the chip sits top-left, away from the sun disc (top-centre); the bar is no longer centred
    expect(html).not.toMatch(/\.aura3d-top-bar \{[^}]*left: 50%/);
  });

  it("opens only with ?dev=1 or ?capture=1", () => {
    expect(main).toContain('SHOWCASE_CHIP = ["dev", "capture"].some((k) => urlParams.get(k) === "1")');
    expect(main).toContain("bar.hidden = !SHOWCASE_CHIP");
  });

  it("starts with no button stuck active; time-of-day buttons follow the presented time of day", () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.filter((b) => /class="[^"]*\bactive\b/.test(b))).toEqual([]);
    expect(main).toContain("syncTodButtons(tod)");
    // the quick bar no longer writes the simulation's time of day (presentation only, PRD D8)
    expect(main).not.toMatch(/world\?\.setTimeOfDay/);
  });

  it("keeps touch targets at 44 px on coarse pointers, chip included", () => {
    expect(html).toMatch(/@media \(pointer: coarse\)[\s\S]*\.aura3d-top-bar \.aura-chip \{ height: 44px/);
  });
});
