// tests/qr/prd14/unit/stand-ins.test.ts — PRD-14 §16.1 S12 (stand-ins tracked).
// Every route-local stand-in is listed in its art/direction.ts `standIns[]`
// with an R-14-NN request that maps to a filed issue, the listed file exists,
// and every R-14-NN a route's v2 code cites as a stand-in is in that list.
// Issue state (open/closed) is audited by the P-64 ledger check (#370); this
// validator keeps the code and the ledger from drifting apart.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APPS = join(ROOT, "apps");

/** R-14-NN → filed issue(s). Source: evidence/prd14/qr-requests.md + PRD-14 §12A.6. */
const R14_ISSUES: Readonly<Record<string, readonly number[]>> = {
  "R-14-01": [73], "R-14-02": [74], "R-14-03": [75], "R-14-04": [65], "R-14-05": [66],
  "R-14-06": [67], "R-14-07": [68], "R-14-08": [69], "R-14-09": [70], "R-14-10": [76],
  "R-14-11": [77], "R-14-12": [78], "R-14-13": [79],
  "R-14-14": [80, 81, 82, 83, 84, 85, 86, 87, 88], "R-14-15": [805], "R-14-16": [807]
};
/** Process/tooling requests that code may cite without being a route stand-in. */
const NON_STAND_IN = new Set(["R-14-01", "R-14-02", "R-14-03", "R-14-04", "R-14-08"]);

interface StandIn { feature: string; file: string; request: string }

function standInsOf(directionSrc: string): StandIn[] {
  const out: StandIn[] = [];
  const re = /\{\s*feature:\s*"([^"]*)",\s*file:\s*"([^"]*)",\s*request:\s*"([^"]*)"/g;
  for (let m = re.exec(directionSrc); m !== null; m = re.exec(directionSrc)) {
    out.push({ feature: m[1]!, file: m[2]!, request: m[3]! });
  }
  return out;
}

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const games = (JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games.map((g) => g.appDir ?? g.id);

describe("S12 stand-ins tracked (PRD-14 §16.1)", () => {
  it("covers all 18 games", () => {
    expect(games).toHaveLength(18);
  });

  for (const appDir of games) {
    const directionPath = join(APPS, appDir, "art", "direction.ts");
    const standIns = existsSync(directionPath) ? standInsOf(readFileSync(directionPath, "utf8")) : [];

    it(`${appDir}: every standIns[] entry cites a filed R-14-NN and an existing file`, () => {
      expect(existsSync(directionPath), `${appDir} has no art/direction.ts`).toBe(true);
      const problems: string[] = [];
      for (const s of standIns) {
        if (!(s.request in R14_ISSUES)) problems.push(`${s.feature}: ${s.request} maps to no filed issue`);
        if (!existsSync(join(APPS, appDir, s.file))) problems.push(`${s.feature}: ${s.file} does not exist`);
      }
      expect(problems).toEqual([]);
    });

    it(`${appDir}: every R-14-NN cited in route source is listed in standIns[]`, () => {
      const listed = new Set(standIns.map((s) => s.request));
      const unlisted = new Set<string>();
      const v2Dir = join(APPS, appDir, "src", "v2");
      const scanDir = existsSync(v2Dir) ? v2Dir : join(APPS, appDir, "src");
      for (const file of tsFiles(scanDir)) {
        for (const code of readFileSync(file, "utf8").match(/R-14-\d{2}/g) ?? []) {
          if (!NON_STAND_IN.has(code) && !listed.has(code)) unlisted.add(`${code} (${file.slice(APPS.length + 1)})`);
        }
      }
      expect([...unlisted]).toEqual([]);
    });
  }
});
