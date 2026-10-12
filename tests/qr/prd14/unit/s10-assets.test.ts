// PRD-14 S10 validator fixture tests and authored direction input parsing.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { checkS10, formatS10 } from "../browser/lib/assets-admitted";
import { parseDirectionAssets, parseDirectionAudio, readDirection } from "../browser/lib/direction";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APPS = join(ROOT, "apps");
const GAMES = (JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games.map((g) => g.appDir ?? g.id);

const fixtures = mkdtempSync(join(tmpdir(), "qr14-s10-"));
afterAll(() => rmSync(fixtures, { recursive: true, force: true }));

let fixtureCount = 0;
function fixtureRepo(files: Record<string, unknown>): string {
  const repo = join(fixtures, `repo-${fixtureCount++}`);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), typeof body === "string" ? body : JSON.stringify(body));
  }
  return repo;
}

const ROLES = [
  { role: "hero", assetKey: "bank-table", kit: "K4" },
  { role: "prop", assetKey: "cue", kit: "K4" }
];
const kit = (verdicts: Record<string, string>) => ({
  files: Object.entries(verdicts).map(([id, verdict]) => ({ id, licence: "CC0-1.0", lookdev: { runId: "r1", reviewer: "x", verdict } }))
});

describe("S10 validator (PRD-14 §16.1)", () => {
  it("passes when every role is admitted and its kit file is accepted", () => {
    const repo = fixtureRepo({
      "apps/route/aura.assets.json": { assets: [{ id: "bank-table" }] },
      "aura.assets.json": { assets: [{ id: "cue" }] },
      "apps/showcase-kits/K4/kit.json": kit({ "bank-table": "accept", cue: "accept" })
    });
    expect(checkS10(repo, "route", ROLES)).toEqual([]);
  });

  it("fails the admitted half for an id in no manifest", () => {
    const repo = fixtureRepo({
      "aura.assets.json": { assets: [{ id: "bank-table" }] },
      "apps/showcase-kits/K4/kit.json": kit({ "bank-table": "accept", cue: "accept" })
    });
    const v = checkS10(repo, "route", ROLES);
    expect(v.map((x) => [x.half, x.assetKey])).toEqual([["admitted", "cue"]]);
  });

  it("fails the kit half when the kit manifest is missing (no skip)", () => {
    const repo = fixtureRepo({ "aura.assets.json": { assets: [{ id: "bank-table" }, { id: "cue" }] } });
    const v = checkS10(repo, "route", ROLES);
    expect(v.map((x) => x.half)).toEqual(["kit", "kit"]);
    expect(v[0]!.reason).toContain("no kit manifest apps/showcase-kits/K4/kit.json");
  });

  it("fails the kit half for a missing file or a non-accept verdict", () => {
    const repo = fixtureRepo({
      "aura.assets.json": { assets: [{ id: "bank-table" }, { id: "cue" }, { id: "rug" }] },
      "apps/showcase-kits/K4/kit.json": kit({ "bank-table": "revise" })
    });
    const v = checkS10(repo, "route", [...ROLES, { role: "set-dressing", assetKey: "rug", kit: null }]);
    expect(formatS10("route", v)).toEqual([
      'route: [kit] hero bank-table: kit K4 file "bank-table" look-dev verdict is revise, not accept',
      'route: [kit] prop cue: kit K4 lists no file for "cue"',
      'route: [kit] set-dressing rug: no apps/showcase-kits/*/kit.json lists "rug"'
    ]);
  });

  it("resolves a route-specific role (no shared kit) through any staged kit.json", () => {
    const roles = [{ role: "hero", assetKey: "arcade-cabinet", kit: null }];
    const none = fixtureRepo({ "aura.assets.json": { assets: [{ id: "arcade-cabinet" }] } });
    expect(formatS10("route", checkS10(none, "route", roles))).toEqual([
      "route: [kit] hero arcade-cabinet: apps/showcase-kits/ does not exist (no kit manifest lists it)"
    ]);
    const staged = fixtureRepo({
      "aura.assets.json": { assets: [{ id: "arcade-cabinet" }] },
      "apps/showcase-kits/route-blockfall/kit.json": kit({ "arcade-cabinet": "accept" })
    });
    expect(checkS10(staged, "route", roles)).toEqual([]);
  });
});

describe("S10/S11 inputs parse for all 18 games", () => {
  it("games.json lists 18 routes", () => {
    expect(GAMES).toHaveLength(18);
  });

  for (const appDir of GAMES) {
    it(`${appDir}: art/direction.ts assets[] and audio[] parse`, () => {
      const src = readDirection(APPS, appDir);
      const roles = parseDirectionAssets(src);
      expect(roles.length, `${appDir} has no assets[] roles`).toBeGreaterThan(0);
      for (const r of roles) expect(r.kit === null || /^K\d$/.test(r.kit), `${appDir} ${r.assetKey} kit "${r.kit}"`).toBe(true);
      expect(parseDirectionAudio(src).length, `${appDir} has no audio[] cues`).toBeGreaterThan(0);
    });


  }
});
