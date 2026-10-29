import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_LUMA_TARGETS } from "../browser/game-luma-targets";

const root = resolve(__dirname, "../..");
const inventory = JSON.parse(readFileSync(resolve(root, "docs/workflows/game-inventory.json"), "utf8")) as {
  games: { slug: string; appFolder: string; status: string }[];
};
const live = inventory.games.filter((g) => g.status === "live");

describe("game luma capture targets (audit LIGHT-02)", () => {
  it("covers every live game in the inventory", () => {
    const covered = new Set(GAME_LUMA_TARGETS.map((t) => t.slug));
    expect(live.filter((g) => !covered.has(g.slug)).map((g) => g.slug)).toEqual([]);
  });

  it("uses unique names of the form <slug>--<variant>", () => {
    const names = GAME_LUMA_TARGETS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of GAME_LUMA_TARGETS) expect(t.name).toBe(`${t.slug}--${t.variant}`);
  });

  it("points each target at the game's own app folder, which exists", () => {
    const folder = new Map(live.map((g) => [g.slug, g.appFolder]));
    for (const t of GAME_LUMA_TARGETS) {
      const app = folder.get(t.slug);
      expect(app, t.name).toBeDefined();
      expect(t.url.startsWith(`/apps/${app}/`), t.name).toBe(true);
      expect(existsSync(resolve(root, "apps", app!, "index.html")), t.name).toBe(true);
    }
  });

  it("lists every variant the game source declares", () => {
    const src = (p: string) => readFileSync(resolve(root, p), "utf8");
    const ids = (text: string, typeName: string) => {
      const m = text.match(new RegExp(`type ${typeName} =([^;]+);`));
      return [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
    };
    const variants = (slug: string) => GAME_LUMA_TARGETS.filter((t) => t.slug === slug).map((t) => t.variant);
    expect(variants("aura-hoops-3d").sort()).toEqual(ids(src("apps/showcase-aura-hoops-3d/src/main.ts"), "VenueId").sort());
    expect(variants("aura-diamond-3d").sort()).toEqual(ids(src("apps/showcase-aura-diamond-3d/src/main.ts"), "ParkId").sort());
    expect(variants("aura-fc-3d").sort()).toEqual(ids(src("apps/showcase-aura-fc-3d/src/game/types.ts"), "VenueId").sort());
    expect(variants("aura-links-3d").sort()).toEqual(ids(src("apps/showcase-aura-links-3d/src/game/types.ts"), "CourseId").sort());
    expect(variants("iron-crown").sort()).toEqual(ids(src("apps/showcase-iron-crown/src/game/stages.ts"), "StageId").sort());
    const worlds = [...src("apps/showcase-pips-big-leap/src/game/worlds.ts").matchAll(/^ {4}id: "([^"]+)",/gm)].map((m) => m[1]!);
    expect(variants("pips-big-leap").sort()).toEqual(worlds.sort());
    const themes = [...src("apps/showcase-cross-hop/src/game/themes.ts").matchAll(/^ {4}id: "([^"]+)",/gm)].length;
    expect(variants("cross-hop").length).toBe(themes);
  });
});

describe("game luma capture run groups", () => {
  it("splits targets into shell-safe groups of at most nine", async () => {
    const { GROUP_SIZE } = await import("../browser/game-luma-targets");
    const sizes = new Map<string, number>();
    for (const t of GAME_LUMA_TARGETS) {
      expect(t.group).toMatch(/^g\d+$/);
      sizes.set(t.group, (sizes.get(t.group) ?? 0) + 1);
    }
    for (const n of sizes.values()) expect(n).toBeLessThanOrEqual(GROUP_SIZE);
    for (const t of GAME_LUMA_TARGETS) expect(t.name).not.toMatch(/[()|&;<>$`'"\s]/);
  });
});
