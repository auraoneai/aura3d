import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FC_HUD_FONT, FC_HUD_FONT_FACES, registerFcHudFonts } from "../../../apps/showcase-aura-fc-3d/src/game/hud";

/** AuraOne WP-04 TV match package: licensed Whitney + DIN Pro + Monument Grotesk Mono stack, ident and goal lower third wired. */
describe("aura-fc-3d TV match package (FC47-H1)", () => {
  it("no system-ui or retired faces anywhere in the route's HUD and menus; AuraOne Whitney + DIN Pro stack leads", () => {
    for (const f of ["src/game/hud.ts", "src/game/modes.ts", "src/game/touch.ts", "src/main.ts", "index.html"]) {
      const src = readFileSync(`apps/showcase-aura-fc-3d/${f}`, "utf8");
      expect(src).not.toMatch(/(^|[^a-zA-Z])(system-ui|-apple-system|BlinkMacSystemFont|Inter|Roboto|Geist|A3G Calibre)([^a-zA-Z]|$)/);
    }
    const hud = readFileSync("apps/showcase-aura-fc-3d/src/game/hud.ts", "utf8");
    expect(hud).toMatch(/\.fc-hud \{[^}]*font-family: var\(--font-ui/);
    expect(hud).toMatch(/\.fc-bug \.score \{[^}]*font-family: var\(--font-metric/);
    expect(hud).toMatch(/\.fc-bug \.clock \{[^}]*font-family: var\(--font-metric/);
    expect(hud).toMatch(/\.fc-tick \{[^}]*font-family: var\(--font-mono/);
    expect(FC_HUD_FONT).toBe("Whitney");
  });

  it("ships the unmodified E-J sports-broadcast cuts beside the route", () => {
    for (const f of FC_HUD_FONT_FACES) {
      expect(readFileSync(`apps/showcase-aura-fc-3d/public/fc-fonts/${f.file}`)).toEqual(readFileSync(`packages/game/src/fonts/${f.file}`));
    }
    expect(readFileSync("apps/showcase-aura-fc-3d/public/fc-fonts/NOTICE.txt", "utf8")).toMatch(/Klim Type Foundry/);
    expect(registerFcHudFonts("/fc-fonts/", undefined)).toBe(0);
  });

  it("text stays >= 12 px, font-weight <= 600, and main.ts fires the ident on venue changes and the lower third on goals", () => {
    for (const f of ["src/game/hud.ts", "src/game/modes.ts", "src/game/touch.ts", "index.html"]) {
      const src = readFileSync(`apps/showcase-aura-fc-3d/${f}`, "utf8");
      const sizes = [...src.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
      if (sizes.length) expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
      const weights = [...src.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1]));
      if (weights.length) expect(Math.max(...weights)).toBeLessThanOrEqual(600);
    }
    const main = readFileSync("apps/showcase-aura-fc-3d/src/main.ts", "utf8");
    expect(main).toMatch(/hud\.ident\(VENUES\[s\.venue\]\.label, VENUE_LOOKS\[s\.venue\]\.timeOfDay\)/);
    expect(main).toMatch(/hud\.goalLowerThird\(ev\.team, sim\.state\)/);
  });
});
