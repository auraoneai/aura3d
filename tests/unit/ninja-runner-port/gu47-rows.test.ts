import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUD_THEMES, hudThemeFontFaces } from "../../../packages/game/src/hud/themes";
import { DISTRICT_SEALS, districtLabel } from "../../../examples/ninja-runner-port/labels";
import { TUNING } from "../../../examples/ninja-runner-port/sim";
import { EVENING_SURFACES, LANTERN_GLOW, lanternGlowAt } from "../../../examples/ninja-runner-port/districtLook";
import { LAYERS } from "../../../examples/ninja-runner-port/scenery";

describe("ninja-runner-port evening surfaces (GU47 NR-11)", () => {
  it("lacquers the tiled roof layers and dampens the rocks, only on real layers", () => {
    const ids = new Set(LAYERS.map((l) => l.id));
    for (const id of Object.keys(EVENING_SURFACES)) expect(ids.has(id)).toBe(true);
    for (const id of ["roofs", "hips", "capcones"]) {
      const coat = EVENING_SURFACES[id]!;
      expect(coat.clearcoat).toBeGreaterThanOrEqual(0.5);
      expect(coat.roughness).toBeLessThan(LAYERS.find((l) => l.id === id)!.roughness);
    }
    expect(EVENING_SURFACES.rocks!.roughness).toBeLessThan(LAYERS.find((l) => l.id === "rocks")!.roughness);
    expect(EVENING_SURFACES.lanterns).toBeUndefined();
  });

  it("splits the lanterns into three glow groups that brighten with the evening", () => {
    expect(lanternGlowAt(100)).toBe("day");
    expect(lanternGlowAt(700)).toBe("day");
    expect(lanternGlowAt(1300)).toBe("dusk");
    expect(lanternGlowAt(1900)).toBe("night");
    expect(lanternGlowAt(2500)).toBe("night");
    expect(LANTERN_GLOW.day.intensity).toBeLessThan(LANTERN_GLOW.dusk.intensity);
    expect(LANTERN_GLOW.dusk.intensity).toBeLessThan(LANTERN_GLOW.night.intensity);
    expect(Object.keys(LANTERN_GLOW)).toHaveLength(3); // +2 draws over the single original lantern layer
  });
});

describe("ninja-runner-port ink-scroll HUD (GU47 NR-19)", () => {
  const html = readFileSync("apps/showcase-ninja-runner-port/index.html", "utf8");
  const css = readFileSync("apps/showcase-ninja-runner-port/public/fonts/ink-scroll.css", "utf8");

  it("ships the theme's licensed faces byte for byte under the theme family names", () => {
    for (const face of hudThemeFontFaces("ink-scroll")) {
      const copy = readFileSync(`apps/showcase-ninja-runner-port/public/fonts/${face.file}`);
      const source = readFileSync(`packages/game/src/fonts/${face.file}`);
      expect(createHash("sha256").update(copy).digest("hex")).toBe(createHash("sha256").update(source).digest("hex"));
      expect(css).toContain(`font-family: "${face.family}"`);
      expect(css).toContain(`./${face.file}`);
    }
    const theme = HUD_THEMES["ink-scroll"];
    expect(html).toContain(`--a3g-font: ${theme["--a3g-font"]}`);
    expect(html).toContain(`--a3g-font-display: ${theme["--a3g-font-display"]}`);
    expect(html).toContain('href="./fonts/ink-scroll.css"');
  });

  it("puts one seal per district on the scroll at the district's start", () => {
    for (const seal of DISTRICT_SEALS) {
      const pct = ((seal.at / TUNING.length) * 100).toFixed(1);
      expect(html).toContain(`<em data-seal="${seal.at}" style="left:${pct === "0.0" ? "0" : pct}%" aria-hidden="true">${seal.letter}</em>`);
      expect(districtLabel(seal.at === 0 ? 0 : seal.at)).toBe(seal.at === 0 ? "Lantern Village" : seal.district);
    }
  });

  it("scopes the theme to the evening look and keeps 44 px controls", () => {
    const start = html.indexOf("GU47 NR-19");
    const rules = html.slice(start, html.indexOf("</style>", start));
    for (const line of rules.split("\n").filter((l) => l.includes("{") && !l.includes("@media") && !l.includes("@font-face"))) {
      const selector = line.trim().split("{")[0]!;
      if (selector.startsWith("#progress > em")) continue; // hidden outside the theme
      if (selector.length > 0 && !selector.startsWith("/*")) expect(selector).toMatch(/\.ink-scroll/);
    }
    expect(rules).toContain(".ink-scroll button { ");
    expect(rules).toMatch(/\.ink-scroll button \{[^}]*min-height: 44px/);
  });
});
