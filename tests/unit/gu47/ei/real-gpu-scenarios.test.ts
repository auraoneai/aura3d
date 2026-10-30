import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// GU47 WP-9 (E-I): tools/real-gpu/scenarios.json has a scenario per live game (owner-only runs; agents never run it).

const root = resolve(__dirname, "../../../..");
type Step = Record<string, unknown>;
const scenarios = JSON.parse(readFileSync(resolve(root, "tools/real-gpu/scenarios.json"), "utf8")) as Record<string, { path: string; query?: string; settleMs?: number; steps: Step[] }>;
const live = (JSON.parse(readFileSync(resolve(root, "docs/workflows/game-inventory.json"), "utf8")) as { games: { slug: string; url: string; status: string; kind: string }[] })
  .games.filter((g) => g.status === "live" && g.kind === "game");
/** The first seven scenarios predate the slug convention. */
const ALIAS: Record<string, string> = { hoops: "aura-hoops-3d", diamond: "aura-diamond-3d", links: "aura-links-3d", fc: "aura-fc-3d" };
const STEP_KEYS = new Set(["click", "press", "down", "up", "hold", "wait", "shot", "burst", "evaluate"]);

describe("real-GPU scenarios (WP-9 E-I)", () => {
  it("covers every live game at its inventory URL", () => {
    const bySlug = new Map(Object.entries(scenarios).filter(([k]) => !k.endsWith("-vfx")).map(([k, v]) => [ALIAS[k] ?? k, v]));
    expect(live.filter((g) => !bySlug.has(g.slug)).map((g) => g.slug)).toEqual([]);
    expect(bySlug.size).toBe(live.length);
    for (const g of live) expect(bySlug.get(g.slug)!.path, g.slug).toBe(g.url);
  });

  it("uses only the step keys capture.mjs understands (evaluate is recorded once capture.mjs supports it)", () => {
    for (const [key, sc] of Object.entries(scenarios)) {
      expect(sc.path, key).toMatch(/^\/apps\/[a-z0-9-]+\/$/);
      if (sc.query !== undefined) expect(sc.query, key).toMatch(/^\?[\w=&.-]+$/);
      expect(sc.steps.length, key).toBeGreaterThan(0);
      expect(sc.steps.some((s) => s.shot || s.burst), key).toBe(true);
      for (const step of sc.steps) for (const k of Object.keys(step)) expect(STEP_KEYS.has(k), `${key}: ${k}`).toBe(true);
    }
  });

  it("keeps the E-F VFX debug scenarios on FC, Links and Iron Crown", () => {
    for (const key of ["fc-vfx", "links-vfx", "iron-crown-vfx"]) {
      expect(scenarios[key]!.query).toBe("?vfx=on&vfxdebug=1");
      expect(scenarios[key]!.steps.at(-1)).toMatchObject({ shot: "settled", evaluate: "__AURA_VFX_DEBUG__()" });
    }
  });
});
