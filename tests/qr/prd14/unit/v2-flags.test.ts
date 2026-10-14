// tests/qr/prd14/unit/v2-flags.test.ts — T0-29 (#1232): v2 boots must not
// force engine lane flags through createGame's `qualityRebuild.flags`.
// Programmatic options win first-write, so a hard-coded list made every lane
// flag ON on every v2 route and the capture harness's `none` / `-<flag>` arms
// were silently ignored (leave-one-out bisects measured nothing). A route
// may only arm its own route token and `game` (the real C-24 shell).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const games = [...new Set((JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games.map((g) => g.appDir ?? g.id))].sort();

function qualityRebuildFlags(boot: string): string[] | null {
  const m = /qualityRebuild:\s*\{[\s\S]*?flags:\s*\[([^\]]*)\]/.exec(boot);
  return m ? [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!) : null;
}

describe("v2 boots arm only their route + game flags (T0-29, #1232)", () => {
  it("covers every games.json route", () => {
    expect(games.length).toBeGreaterThanOrEqual(18);
  });

  for (const appDir of games) {
    it(`${appDir}: qualityRebuild.flags is [route_<id>, game]`, () => {
      const boot = readFileSync(join(ROOT, "apps", appDir, "src", "v2", "boot.ts"), "utf8");
      const flags = qualityRebuildFlags(boot);
      expect(flags, `${appDir}: no qualityRebuild.flags in v2/boot.ts`).not.toBeNull();
      const forced = flags!.filter((f) => !f.startsWith("route_") && f !== "game");
      expect(forced, `${appDir}: v2 boot forces engine lane flags`).toEqual([]);
      expect(flags!.filter((f) => f.startsWith("route_"))).toHaveLength(1);
      expect(flags).toContain("game");
    });
  }
});
