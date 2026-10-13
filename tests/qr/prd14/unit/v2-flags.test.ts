// tests/qr/prd14/unit/v2-flags.test.ts — T0-29 (#1232): v2 boots must not
// force engine lane flags through createGame's `qualityRebuild.flags`.
// Programmatic options win first-write, so a hard-coded list made every lane
// flag ON on every v2 route and the capture harness's `none` / `-<flag>` arms
// were silently ignored (leave-one-out bisects measured nothing). A route
// may only arm its own route token and `game` (the real C-24 shell).
//
// Route shape is derived from the filesystem: dual-path routes boot
// `src/v2/boot.ts` behind a dispatcher and arm `[route_<id>, game]`;
// single-path rebuilt routes (no v2 tree) boot `src/main.ts` at every URL,
// have no dispatcher consuming a route token, and arm exactly `["game"]`.
import { existsSync, readFileSync } from "node:fs";
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

/** The route's createGame boot source: `src/v2/boot.ts` when the route
 * keeps the dual-path dispatcher, else the single-path `src/main.ts`. */
function routeBoot(appDir: string): { file: string; label: string; singlePath: boolean } {
  const v2Boot = join(ROOT, "apps", appDir, "src", "v2", "boot.ts");
  if (existsSync(v2Boot)) return { file: v2Boot, label: "v2/boot.ts", singlePath: false };
  return { file: join(ROOT, "apps", appDir, "src", "main.ts"), label: "src/main.ts", singlePath: true };
}

describe("v2 boots arm only their route + game flags (T0-29, #1232)", () => {
  it("covers every games.json route", () => {
    expect(games.length).toBeGreaterThanOrEqual(18);
  });

  for (const appDir of games) {
    const singlePath = !existsSync(join(ROOT, "apps", appDir, "src", "v2", "boot.ts"));
    it(`${appDir}: qualityRebuild.flags is ${singlePath ? "[game] (single-path)" : "[route_<id>, game]"}`, () => {
      const { file, label } = routeBoot(appDir);
      const boot = readFileSync(file, "utf8");
      const flags = qualityRebuildFlags(boot);
      expect(flags, `${appDir}: no qualityRebuild.flags in ${label}`).not.toBeNull();
      const forced = flags!.filter((f) => !f.startsWith("route_") && f !== "game");
      expect(forced, `${appDir}: boot forces engine lane flags`).toEqual([]);
      if (singlePath) {
        // No dispatcher consumes a route token on a single-path route.
        expect(flags).toEqual(["game"]);
      } else {
        expect(flags!.filter((f) => f.startsWith("route_"))).toHaveLength(1);
        expect(flags).toContain("game");
      }
    });
  }
});
