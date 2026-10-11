// tests/qr/prd14/unit/s10-assets.test.ts — PRD-14 §16.1 S10 (assets admitted)
// validator + the static half of S11 (route audio proof wiring).
//
// Structure (why the 18-game S10 gate is not in this file): on main no
// direction `assetKey` is admitted yet (0 of 86 roles resolve in any
// aura.assets.json) and apps/showcase-kits/ does not exist (14-KITS, T3.2), so
// a per-game S10 assertion here would turn the lane unit job red for every
// lane-14 PR. The per-game gate is tests/qr/prd14/browser/s10-assets.spec.ts,
// which the lane capture job always selects (select-specs.mjs: no APP_DIR) and
// which FAILS today for both halves — it is not skipped. This file proves the
// validator itself (fixture repos) and that all 18 directions parse into roles
// and cues it can check.
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

    it(`${appDir}: S11 audio proof maps only to direction audio[] events and is published`, () => {
      const events = new Set(parseDirectionAudio(readDirection(APPS, appDir)).map((a) => a.event));
      const proofSrc = readFileSync(join(APPS, appDir, "src/v2/audio-proof.ts"), "utf8");
      const mapBody = /const DIRECTION_EVENT[^=]*=\s*\{([^}]*)\}/.exec(proofSrc)?.[1];
      expect(mapBody, `${appDir} audio-proof.ts has no DIRECTION_EVENT map`).toBeDefined();
      for (const m of mapBody!.matchAll(/"[^"]+":\s*"([^"]+)"/g)) {
        expect(events.has(m[1]!), `${appDir} maps to unknown direction event "${m[1]}"`).toBe(true);
      }
      const evidenceSrc = readFileSync(join(APPS, appDir, "src/v2/evidence/index.ts"), "utf8");
      expect(evidenceSrc).toMatch(/get audio\(\)[^\n]*\n?[^\n]*\.\.\.audioProof\.snapshot\(\)/);
    });
  }
});
