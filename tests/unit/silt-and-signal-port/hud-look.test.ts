import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SILT_HUD_CSS, SILT_HUD_FAMILIES } from "../../../examples/silt-and-signal-port/hud-look";

/** GU47 DG-H1: the poster HUD uses the licensed E-J faces byte-identical to packages/game/src/fonts (NOTICE.txt). */
describe("Duneglide poster HUD (DG-H1)", () => {
  const notice = readFileSync("packages/game/src/fonts/NOTICE.txt", "utf8");
  for (const file of ["canela-400.woff2", "graphik-400.woff2", "graphik-500.woff2"]) {
    it(`${file} matches the E-J NOTICE sha256`, () => {
      const sha = createHash("sha256").update(readFileSync(`examples/silt-and-signal-port/fonts/${file}`)).digest("hex");
      expect(notice).toContain(`${file} |`);
      expect(notice).toContain(sha);
    });
  }
  it("scopes every rule to the inked look, drops the cyan compass and keeps labels at 13 px or more", () => {
    expect(SILT_HUD_CSS.toLowerCase()).not.toContain("19e6ff");
    for (const line of SILT_HUD_CSS.trim().split("\n")) expect(line).toMatch(/html\[data-silt-look="inked"\]/);
    for (const m of SILT_HUD_CSS.matchAll(/(?:--hud-meta|font-size):\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(13);
    expect(SILT_HUD_CSS).toContain(SILT_HUD_FAMILIES.display);
  });
});
