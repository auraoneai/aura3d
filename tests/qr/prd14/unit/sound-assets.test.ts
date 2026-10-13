// tests/qr/prd14/unit/sound-assets.test.ts — T0-29: v2 `sound.cues[*].asset`
// must be the typed asset entry (`assets.<id>`), not the bare id string.
// GameAudio's assetRefOf() treats a string as a URL, so `{ asset: "fooSfx" }`
// fetched `/apps/<dir>/fooSfx` and 404'd for every cue (track0 L4 run
// 38147217711: gravity-post 10x 404, courier-rush the same).
//
// Route shape is derived from the filesystem: dual-path routes declare
// cues in `src/v2/boot.ts`; single-path rebuilt routes (no v2 tree)
// declare them in `src/main.ts`. The same `{ asset: "<id>" }` extractor
// runs on both — a single-path route using `{ url: sfxUrl(...) }` cue
// objects simply yields no string-asset matches.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const ASSET_IDS = new Set(
  [...readFileSync(join(ROOT, "src/aura-assets.ts"), "utf8").matchAll(/^ {2}"?([A-Za-z0-9]+)"?: \{/gm)].map((m) => m[1]!)
);
const games = [...new Set((JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games.map((g) => g.appDir ?? g.id))].sort();

/** The route's createGame boot source: `src/v2/boot.ts` when the route
 * keeps the dual-path dispatcher, else the single-path `src/main.ts`. */
function routeBootFile(appDir: string): string {
  const v2Boot = join(ROOT, "apps", appDir, "src", "v2", "boot.ts");
  return existsSync(v2Boot) ? v2Boot : join(ROOT, "apps", appDir, "src", "main.ts");
}

describe("v2 sound cues reference typed assets, not id strings (T0-29)", () => {
  it("reads the typed asset map", () => {
    expect(ASSET_IDS.size).toBeGreaterThan(100);
  });

  for (const appDir of games) {
    it(`${appDir}: no { asset: "<admitted id>" } string cue`, () => {
      const boot = readFileSync(routeBootFile(appDir), "utf8");
      const stringIds = [...boot.matchAll(/\{ asset: "([A-Za-z0-9-]+)"/g)].map((m) => m[1]!);
      expect(stringIds.filter((id) => ASSET_IDS.has(id))).toEqual([]);
    });
  }
});
