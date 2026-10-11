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
 * Node-only (no page): it lives in the lane browser job, not the T1.x unit
 * job, because on main both halves fail for all 18 routes — no direction
 * assetKey is admitted yet and apps/showcase-kits/ is pending (14-KITS). It is
 * an honest red, not a skip: it turns green per route as kits are accepted and
 * admitted (`aura3d assets add`). The validator itself is unit-tested in
 * tests/qr/prd14/unit/s10-assets.test.ts.
 */

const games = (JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games;
const wanted = (process.env.A3D_QR_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const selected = games.filter((g) => wanted.length === 0 || wanted.includes(g.appDir ?? g.id) || wanted.includes(g.id));

test.describe("S10 assets admitted (PRD-14 §16.1)", () => {
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
