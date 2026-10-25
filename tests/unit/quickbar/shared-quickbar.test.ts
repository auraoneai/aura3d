import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");
const css = read("apps/showcase-port-shared/quickbar.css");

const barGames: Array<{ slug: string; main: string }> = [
  { slug: "top-tennis", main: "apps/showcase-top-tennis/src/main.ts" },
  { slug: "iron-crown", main: "apps/showcase-iron-crown/src/main.ts" },
  { slug: "pips-big-leap", main: "apps/showcase-pips-big-leap/src/main.ts" },
  { slug: "dot-dash-3d", main: "apps/showcase-dot-dash-3d/src/main.ts" },
  { slug: "heatsink", main: "apps/showcase-heatsink/src/main.ts" },
  { slug: "bunker-zero", main: "apps/showcase-bunker-zero/src/main.ts" }
];

describe("shared quick-switcher bar", () => {
  it("is one non-wrapping, sideways-scrolling row that reserves its own height", () => {
    const bar = css.slice(css.indexOf(".aura3d-top-bar {"), css.indexOf("}", css.indexOf(".aura3d-top-bar {")));
    expect(bar).toMatch(/flex-wrap:\s*nowrap/);
    expect(bar).toMatch(/overflow-x:\s*auto/);
    expect(css).toMatch(/--a3d-bar-space:\s*calc\(var\(--a3d-bar-h\)/);
    expect(css).toMatch(/--quick-bar-space:\s*var\(--a3d-bar-space\)/);
  });

  it("is imported by every game that shows it, and no game draws its own copy", () => {
    for (const game of barGames) {
      expect(read(game.main), `${game.slug} imports the shared bar`).toContain("showcase-port-shared/quickbar.css");
      const html = read(`apps/showcase-${game.slug}/index.html`);
      expect(html, `${game.slug} has no per-game bar block`).not.toMatch(/\.aura3d-top-bar\s*\{[^}]*position:/);
      expect(html, `${game.slug} has no engine chip`).not.toContain("AURA3D ENGINE");
    }
  });

  it("keeps the engine chip and stale versions out of the other game pages", () => {
    for (const slug of ["aura-diamond-3d", "aura-links-3d", "aura-hoops-3d", "red-zone-3d", "teleoperator", "bunker-zero"]) {
      const html = read(`apps/showcase-${slug}/index.html`);
      expect(html, `${slug} engine chip`).not.toContain("AURA3D ENGINE");
      expect(html, `${slug} stale version`).not.toMatch(/Aura3D 4\.0\.[0-9]/);
    }
    expect(read("apps/showcase-teleoperator/index.html")).not.toContain("LOADING AURA3D");
    expect(read("apps/showcase-bunker-zero/src/main.ts")).not.toMatch(/Aura3D 4\.0\.[0-9]/);
  });
});
