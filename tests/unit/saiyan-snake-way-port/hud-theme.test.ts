import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srgbOf } from "../../../examples/saiyan-snake-way-port/art/colorScript";

const root = new URL("../../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, root), "utf8");

/** WCAG relative luminance of an sRGB hex colour. */
function luminance(hex: string): number {
  const [r, g, b] = srgbOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("serpentine-sky-run HUD theme (SSR-16)", () => {
  it("ships Canela byte for byte from the licensed E-J set and registers it under the theme family", () => {
    const local = readFileSync(new URL("apps/showcase-serpentine-sky-run-port/public/fonts/canela-400.woff2", root));
    const source = readFileSync(new URL("packages/game/src/fonts/canela-400.woff2", root));
    expect(createHash("sha256").update(local).digest("hex")).toBe(createHash("sha256").update(source).digest("hex"));
    expect(read("apps/showcase-serpentine-sky-run-port/public/fonts/serpent.css")).toContain('font-family: "A3G Canela"');
    expect(read("apps/showcase-serpentine-sky-run-port/index.html")).toContain('href="./fonts/serpent.css"');
  });

  it("scopes the theme to html.serpent-hud in both pages, set only in colour-script mode", () => {
    for (const page of ["apps/showcase-serpentine-sky-run-port/index.html", "examples/saiyan-snake-way-port/index.html"]) {
      const html = read(page);
      expect(html).toContain(".serpent-hud #ki-bar");
      expect(html).toContain(".serpent-hud #progress .track i::after");
    }
    expect(read("examples/saiyan-snake-way-port/main.ts")).toMatch(/look\.mode === "script"\) document\.documentElement\.classList\.add\("serpent-hud"\)/);
  });

  it("keeps HUD text at >= 4.5:1 on the indigo lacquer panel", () => {
    const panel = "#1c1640"; // rgba(28, 22, 64, 0.86) over a dark scene reads at least this dark
    for (const fg of ["#fbf3e4", "#d9cfe8", "#7fe0c4", "#ff7a6b", "#f2b33d"]) expect(contrast(fg, panel), fg).toBeGreaterThanOrEqual(4.5);
    // button label on the gold button
    expect(contrast("#1c1640", "#f2b33d")).toBeGreaterThanOrEqual(4.5);
  });
});
