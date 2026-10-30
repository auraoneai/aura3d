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
    expect(variants("aura-diamond-3d").sort()).toEqual(ids(src("apps/showcase-aura-diamond-3d/src/rules.ts"), "ParkId").sort());
    expect(variants("aura-fc-3d").sort()).toEqual(ids(src("apps/showcase-aura-fc-3d/src/game/types.ts"), "VenueId").sort());
    expect(variants("aura-links-3d").sort()).toEqual(ids(src("apps/showcase-aura-links-3d/src/game/types.ts"), "CourseId").sort());
    expect(variants("iron-crown").sort()).toEqual(ids(src("apps/showcase-iron-crown/src/game/stages.ts"), "StageId").sort());
    const worlds = [...src("apps/showcase-pips-big-leap/src/game/worlds.ts").matchAll(/^ {4}id: "([^"]+)",/gm)].map((m) => m[1]!);
    expect(variants("pips-big-leap").sort()).toEqual(worlds.sort());
    const themes = [...src("apps/showcase-cross-hop/src/game/themes.ts").matchAll(/^ {4}id: "([^"]+)",/gm)].length;
    expect(variants("cross-hop").length).toBe(themes);
    const skies = [...src("apps/showcase-teleoperator/index.html").matchAll(/data-tod="([^"]+)"/g)].map((m) => m[1]!);
    expect(variants("teleoperator").sort()).toEqual([...new Set(skies)].sort());
    const levelsSrc = src("examples/roadster-hours-port/data.ts");
    const levels = [...levelsSrc.slice(levelsSrc.indexOf("export const LEVELS")).matchAll(/\{ id: `([a-z]+)`, name:/g)].map((m) => m[1]!);
    expect(levels.length).toBeGreaterThan(0);
    expect(variants("roadster-hours-port")).toEqual(levels);
    expect(GAME_LUMA_TARGETS.filter((t) => t.slug === "roadster-hours-port").map((t) => t.url)).toEqual(levels.map((_, i) => `/apps/showcase-roadster-hours-port/?level=${i}&autostart=1&autopilot=1`));
  });
});

describe("GU47 variant targets (WP-9 E-I)", () => {
  const src = (p: string) => readFileSync(resolve(root, p), "utf8");
  const groupNo = (t: { group: string }) => Number(t.group.slice(1));

  // 68 on the GU47 base (4.6.1; the PRD's "64" predates the teleoperator, Saltwind, noenv and gauntlet-run rows).
  it("keeps the 68 pre-GU47 targets in @g1..@g8 and appends the variant rows in groups of their own", async () => {
    const { GU47_FIRST_GROUP } = await import("../browser/game-luma-targets");
    expect(GU47_FIRST_GROUP).toBe(9);
    const before = GAME_LUMA_TARGETS.filter((t) => groupNo(t) < GU47_FIRST_GROUP);
    expect(before).toHaveLength(68);
    expect(GAME_LUMA_TARGETS.slice(0, 68)).toEqual(before);
    expect(before.slice(0, 3).map((t) => t.name)).toEqual(["top-tennis--default", "roadster-rush--default", "heatsink--default"]);
    expect(before.at(-1)!.name).toBe("cloud-runner-port--default");
    expect(GAME_LUMA_TARGETS.length - before.length).toBeGreaterThanOrEqual(45);
  });

  it("drives every GU47 row through the game's declared variant param", async () => {
    const { GU47_FIRST_GROUP, VARIANT_PARAMS } = await import("../browser/game-luma-targets");
    const params = VARIANT_PARAMS as Record<string, string>;
    const rows = GAME_LUMA_TARGETS.filter((t) => groupNo(t) >= GU47_FIRST_GROUP);
    for (const t of rows) {
      const param = params[t.slug];
      expect(param, t.name).toBeDefined();
      const query = new URLSearchParams(t.url.slice(t.url.indexOf("?") + 1));
      expect(query.get(param!), t.name).toBeTruthy();
      expect(t.prepare, t.name).toBeUndefined();
    }
    // one row per distinct param value per game: no two rows of a game load the same URL
    const urls = rows.map((t) => t.url);
    expect(new Set(urls).size).toBe(urls.length);
    const perGame = (slug: string) => rows.filter((t) => t.slug === slug).map((t) => t.variant);
    expect(perGame("bunker-zero")).toEqual(["floor1", "floor2", "floor3", "floor4", "floor5", "floor6", "killhouse"]);
    expect(perGame("last-train-port")).toEqual(["band-a", "band-b", "band-c", "band-d", "band-e"]);
    expect(rows.filter((t) => t.slug === "drift-and-deliver-port").map((t) => t.url)).toEqual(
      [10, 120, 170].map((s) => `/apps/showcase-drift-and-deliver-port/?at=${s}`));
    expect(rows.filter((t) => t.slug === "slingshot-siege").map((t) => t.url.split("?")[1])).toEqual(
      ["level=0", "level=5", "level=10", "level=15", "level=20", "level=25"]);
  });

  it("matches the variant ids the game sources declare", async () => {
    const m = await import("../browser/game-luma-targets");
    const union = (text: string, typeName: string) =>
      [...(text.match(new RegExp(`type ${typeName} =([^;]+);`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
    expect([...m.TENNIS_VENUES]).toEqual(union(src("examples/aura-slam/contract/venues.ts"), "VenueId").filter((v) => v !== "hard"));
    expect([...m.HEATSINK_CIRCUITS]).toEqual(union(src("apps/showcase-heatsink/src/data.ts"), "CircuitId").filter((c) => c !== "grand"));
    const mazes = src("apps/showcase-dot-dash-3d/src/game/mazes.ts").match(/MAZE_ORDER = \[([^\]]+)\]/)?.[1] ?? "";
    expect([...m.DOT_DASH_MAZES]).toEqual([...mazes.matchAll(/"([^"]+)"/g)].map((x) => x[1]!));
    const sim = src("examples/saiyan-snake-way-port/sim.ts");
    const stages = sim.slice(sim.indexOf("export const STAGES"), sim.indexOf("];", sim.indexOf("export const STAGES")));
    expect(m.SERPENTINE_STAGES).toHaveLength([...stages.matchAll(/^ {2}\{ from: /gm)].length);
    expect(m.SLINGSHOT_CHAPTERS).toHaveLength([...src("apps/showcase-slingshot-siege/src/game/levels.ts").matchAll(/^\s+id: \d+, name: "/gm)].length);
    expect(m.SILT_CHAPTERS).toHaveLength([...src("examples/silt-and-signal-port/chapters-data.ts").matchAll(/^ {2}"id": "/gm)].length);
    expect(src("examples/silt-and-signal-port/main.ts")).toMatch(/intParam\("chapter", 0, 0, 6\)/);
    expect(src("examples/aura-slam/shell/boot.ts")).toMatch(/params\.get\("venue"\)/);
    expect(src("apps/showcase-slingshot-siege/src/main.ts")).toMatch(/params\.get\("level"\)/);
    expect(src("apps/showcase-dot-dash-3d/src/main.ts")).toMatch(/params\.get\("maze"\)/);
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
