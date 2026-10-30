import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FC_HUD_FONT, FC_HUD_FONT_FACES, registerFcHudFonts } from "../../../apps/showcase-aura-fc-3d/src/game/hud";

/** GU47 WP-19 FC47-H1 (lane g09): licensed broadcast face, no system-ui, ident and goal lower third wired. */
describe("aura-fc-3d TV match package (FC47-H1)", () => {
  it("no system-ui anywhere in the route's HUD and menus; Calibre leads every stack", () => {
    for (const f of ["src/game/hud.ts", "src/game/modes.ts", "src/main.ts", "index.html"]) {
      expect(readFileSync(`apps/showcase-aura-fc-3d/${f}`, "utf8")).not.toMatch(/system-ui/);
    }
    const hud = readFileSync("apps/showcase-aura-fc-3d/src/game/hud.ts", "utf8");
    expect(hud).toMatch(/\.fc-hud \{[^}]*font-family: "A3G Calibre"/);
    expect(FC_HUD_FONT).toBe("A3G Calibre");
  });

  it("ships the unmodified E-J sports-broadcast cuts beside the route", () => {
    for (const f of FC_HUD_FONT_FACES) {
      expect(readFileSync(`apps/showcase-aura-fc-3d/public/fc-fonts/${f.file}`)).toEqual(readFileSync(`packages/game/src/fonts/${f.file}`));
    }
    expect(readFileSync("apps/showcase-aura-fc-3d/public/fc-fonts/NOTICE.txt", "utf8")).toMatch(/Klim Type Foundry/);
    expect(registerFcHudFonts("/fc-fonts/", undefined)).toBe(0);
  });

  it("text stays >= 12 px and main.ts fires the ident on venue changes and the lower third on goals", () => {
    const hud = readFileSync("apps/showcase-aura-fc-3d/src/game/hud.ts", "utf8");
    const sizes = [...hud.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    const main = readFileSync("apps/showcase-aura-fc-3d/src/main.ts", "utf8");
    expect(main).toMatch(/hud\.ident\(VENUES\[s\.venue\]\.label, VENUE_LOOKS\[s\.venue\]\.timeOfDay\)/);
    expect(main).toMatch(/hud\.goalLowerThird\(ev\.team, sim\.state\)/);
  });
});
