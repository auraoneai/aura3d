import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkS10, formatS10 } from "./lib/assets-admitted";
import { ROOT } from "./lib/serve";

/**
 * PRD-14 §16.1 S10 "Assets admitted" for every selected route (A3D_QR_ROUTES,
 * default all 18): every art/direction.ts `assets[]` role resolves to an
 * admitted asset id (route or root aura.assets.json) AND that id's kit file in
 * apps/showcase-kits/<Kn>/kit.json carries an `accept` look-dev verdict on the
 * three r185 pane (T3.2).
 *
 * Node-only (no page): this acceptance gate runs in the lane browser job.
 * Pending or missing look-dev verdicts remain failures; the fixture tests in
 * unit/s10-assets.test.ts validate the checker, not the current route assets.
 */

const games = (JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games;
const wanted = (process.env.A3D_QR_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const selected = games.filter((g) => wanted.length === 0 || wanted.includes(g.appDir ?? g.id) || wanted.includes(g.id));

test.describe("S10 assets admitted (PRD-14 §16.1)", () => {
  test("selected route IDs exist in games.json", () => {
    expect(selected.length, "No routes selected for S10").toBeGreaterThan(0);
    expect(wanted.filter((id) => !games.some((g) => id === g.id || id === g.appDir))).toEqual([]);
  });
  for (const entry of selected) {
    const appDir = entry.appDir ?? entry.id;

    test(`${appDir}: every asset role is admitted`, () => {
      const lines = formatS10(appDir, checkS10(ROOT, appDir).filter((v) => v.half === "admitted"));
      expect(lines, `S10 admitted half:\n${lines.join("\n")}`).toEqual([]);
    });

    test(`${appDir}: every asset role's kit file has an accept look-dev verdict`, () => {
      const lines = formatS10(appDir, checkS10(ROOT, appDir).filter((v) => v.half === "kit"));
      expect(lines, `S10 kit half:\n${lines.join("\n")}`).toEqual([]);
    });
  }
});
