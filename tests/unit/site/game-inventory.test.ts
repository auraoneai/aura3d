import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const inventory = JSON.parse(readFileSync(resolve(root, "docs/workflows/game-inventory.json"), "utf8")) as {
  liveGameCount: number;
  liveVariantCount: number;
  genreCounts: Record<string, number>;
  games: Array<{ slug: string; appFolder: string; title: string; url: string; status: string; genre: string }>;
  /** Retired with the V2 builds in 4.3.7 (0dbfb13e3); kept optional so a reintroduced list is still checked. */
  variants?: Array<{ appFolder: string; parent: string; status: string }>;
};

function run(script: string, ...args: string[]) {
  return spawnSync(process.execPath, [resolve(root, "tools/site", script), ...args], { encoding: "utf8" });
}

describe("game inventory (single source of the public game count)", () => {
  it("is fresh and every stated count agrees with it", () => {
    expect(run("gen-game-inventory.mjs", "--check").status).toBe(0);
    expect(run("gen-showcase-index.mjs", "--check").status).toBe(0);
    expect(run("check-game-count.mjs").status).toBe(0);
  });

  it("counts a game only when the production build serves it, and never counts V2 builds", () => {
    const routes = readFileSync(resolve(root, "marketing/scripts/build-showcase-routes.mjs"), "utf8");
    const served = [...(routes.match(/const showcaseRoutes = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const live = inventory.games.filter((g) => g.status === "live");
    expect(live.length).toBe(inventory.liveGameCount);
    for (const game of live) expect(served).toContain(game.appFolder);
    for (const variant of inventory.variants ?? []) expect(live.some((g) => g.appFolder === variant.parent)).toBe(true);
    expect(Object.values(inventory.genreCounts).reduce((a, b) => a + b, 0)).toBe(inventory.liveGameCount);
  });

  it("lists every live game once on the showcase index, with its own title", () => {
    const html = readFileSync(resolve(root, "apps/showcase-index/index.html"), "utf8");
    const cards = [...html.matchAll(/<a class="showcase-card is-game" href="([^"]+)"/g)].map((m) => m[1]);
    expect(cards.length).toBe(inventory.liveGameCount);
    expect(new Set(cards).size).toBe(cards.length);
    for (const game of inventory.games.filter((g) => g.status === "live")) expect(cards).toContain(game.url);
    expect(html).not.toMatch(/Aura3D port|\bport\b of a/i);
  });

  it("ships a 1x and a 2x card image under 200 KB for every live game", () => {
    for (const game of inventory.games.filter((g) => g.status === "live")) {
      for (const name of [`${game.slug}.webp`, `${game.slug}@2x.webp`]) {
        const file = join(root, "public/previews/showcase-index", name);
        expect(existsSync(file), name).toBe(true);
        expect(statSync(file).size, name).toBeLessThanOrEqual(200 * 1024);
      }
    }
  });

  it("rewrites every renamed slug and redirects the old port roots", () => {
    const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
      rewrites: Array<{ source: string }>;
      redirects: Array<{ source: string }>;
    };
    const rewrites = vercel.rewrites.map((r) => r.source);
    const redirects = vercel.redirects.map((r) => r.source);
    for (const game of inventory.games.filter((g) => g.status === "live" && !g.url.startsWith("/apps/showcase-"))) {
      const base = game.url.replace(/\/$/, "");
      expect(rewrites.some((s) => s === game.url || s === base || s.startsWith(`${base}/`)), game.url).toBe(true);
      const old = `/apps/${game.appFolder}`;
      expect(redirects.some((s) => s.startsWith(old)), old).toBe(true);
    }
  });

  it("keeps the homepage count tokenized instead of hand-typed", () => {
    const home = readFileSync(resolve(root, "marketing/index.html"), "utf8");
    expect(home).toContain("{{GAME_COUNT}}");
    expect(home).not.toMatch(/<strong>\d+<\/strong><span>playable games/);
  });
});
