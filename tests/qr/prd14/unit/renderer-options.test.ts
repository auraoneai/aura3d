// tests/qr/prd14/unit/renderer-options.test.ts — T0-29: no game route passes
// the PRD-15 T4.5-removed `renderer.mode` / `renderer.fallback` options. Under
// strict (on with `?a3d-qr=all`) createAuraApp throws AuraMigrationError for
// them, so the route never draws (skyline-runner legacy, track0 L4 run
// 38145358999: createAuraApp.ts:92 from legacy/main.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const games = [...new Set((JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games.map((g) => g.appDir ?? g.id))].sort();

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** `renderer: { ... }` option literals that still name a removed key. */
function removedRendererKeys(src: string): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(/renderer:\s*\{([^{}]*)\}/g)) {
    const keys = [...m[1]!.matchAll(/\b(mode|fallback)\s*:/g)].map((k) => k[1]!);
    if (keys.length > 0) hits.push(`line ${src.slice(0, m.index).split("\n").length}: ${keys.join(", ")}`);
  }
  return hits;
}

describe("game routes use renderer.qualityProfile, not the removed mode/fallback (T0-29)", () => {
  it("covers every games.json route", () => {
    expect(games.length).toBeGreaterThanOrEqual(18);
  });

  for (const appDir of games) {
    it(`${appDir}: no renderer.mode / renderer.fallback`, () => {
      const offenders = tsFiles(join(ROOT, "apps", appDir, "src")).flatMap((file) =>
        removedRendererKeys(readFileSync(file, "utf8")).map((hit) => `${file.slice(ROOT.length)} ${hit}`)
      );
      expect(offenders).toEqual([]);
    });
  }
});
