import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM tool without types
import { GAME_CHECKS, GU47_CHECK_SEVERITY, resetGitCache, runChecks } from "../../../tools/game-checks/lib/index.mjs";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

// GU47 WP-9 (E-I): the five new game-checks, on throwaway fixture repos.

const REPO = process.cwd();
const dirs: string[] = [];
type Finding = { check: string; severity: string; game: string; file: string; line: number; message: string };

const GAMES = [
  { slug: "alpha-port", appFolder: "showcase-alpha" },
  { slug: "beta-hoops", appFolder: "showcase-beta" }
];

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "gu47-checks-"));
  dirs.push(root);
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  mkdirSync(join(root, "tools/game-checks/data"), { recursive: true });
  copyFileSync(join(REPO, "tools/game-checks/data/terms.json"), join(root, "tools/game-checks/data/terms.json"));
  put("docs/workflows/game-inventory.json", JSON.stringify({
    games: GAMES.map((g) => ({ ...g, title: g.slug, kind: "game", status: "live" }))
  }));
  for (const g of GAMES) put(`apps/${g.appFolder}/index.html`, "<html></html>");
  for (const [rel, content] of Object.entries(files)) put(rel, content);
  resetGitCache();
  return { root, put };
}

const run = (root: string, only: string[], slugs: string[] = ["alpha-port"]): Finding[] =>
  runChecks({ root, slugs, only, global: false, env: {} }).findings;

const direction = (over: Record<string, unknown> = {}) => ({
  id: "alpha",
  genre: "racing",
  palette: { primary: ["#112233", "#445566", "#778899"], accent: "#ff8800" },
  lighting: { environment: { hdri: "venice_sunset", background: "hdri" } },
  signatureEffect: "copper heat shimmer",
  ...over
});

function withDirection(root: string, appFolder: string, dir: Record<string, unknown>, violations: unknown[] = []) {
  const rel = `apps/${appFolder}/art/direction.ts`;
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), `export default ${JSON.stringify(dir)};\n`);
  writeArtDirectionAudit(rel, { direction: dir, snapshot: {}, violations }, root);
  return rel;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("GU47 game-checks registration", () => {
  it("registers the five checks at warn level until WP-38 flips them", () => {
    expect(GU47_CHECK_SEVERITY).toBe("warn");
    for (const id of ["art-direction", "look-identity", "borrowed-asset", "prop-exclusivity", "luma-band"]) expect(typeof GAME_CHECKS[id]).toBe("function");
  });
});

describe("art-direction check", () => {
  it("warns without art/direction.ts and passes with a fresh, clean audit record", () => {
    const { root } = fixture({});
    const missing = run(root, ["art-direction"]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ check: "art-direction", severity: "warn", file: "apps/showcase-alpha/art/direction.ts" });
    expect(missing[0]!.message).toContain("no art/direction.ts");
    withDirection(root, "showcase-alpha", direction());
    expect(run(root, ["art-direction"])).toEqual([]);
  });

  it("reports a missing audit, a stale audit, violations and an incomplete direction", () => {
    const { root, put } = fixture({});
    put("apps/showcase-alpha/src/art/direction.ts", "export default {};\n");
    expect(run(root, ["art-direction"]).map((f) => f.message)).toEqual([expect.stringContaining("audit.json is missing")]);
    const rel = withDirection(root, "showcase-beta", direction({ signatureEffect: "" }), [{ rule: "background-colour", message: "x" }]);
    const beta = run(root, ["art-direction"], ["beta-hoops"]).map((f) => f.message).join("\n");
    expect(beta).toContain("1 violation(s) (background-colour)");
    expect(beta).toContain("no signatureEffect");
    put(rel, "export default { changed: true };\n");
    expect(run(root, ["art-direction"], ["beta-hoops"]).map((f) => f.message).join("\n")).toContain("stale");
  });
});

describe("look-identity check", () => {
  it("flags a shared primary HDRI (same file bytes under another id), signature effect and palette on both games", () => {
    const { root, put } = fixture({});
    put("public/hdri/venice_sunset_1k.hdr", "same-bytes");
    put("public/hdri/copy_of_venice_1k.hdr", "same-bytes");
    withDirection(root, "showcase-alpha", direction());
    withDirection(root, "showcase-beta", direction({
      id: "beta",
      lighting: { environment: { hdri: "/hdri/copy_of_venice_1k.hdr", background: "hdri" } },
      signatureEffect: "Copper heat-shimmer",
      palette: { primary: ["#112233", "#445566", "#778899", "#000000"], accent: "#00ff00" }
    }));
    const both = run(root, ["look-identity"], ["alpha-port", "beta-hoops"]);
    expect(both.filter((f) => f.game === "alpha-port").map((f) => f.message)).toEqual([
      expect.stringMatching(/primary HDRI "venice_sunset" \(sha256 [0-9a-f]{12}\) is also the primary sky of beta-hoops/),
      expect.stringContaining('signatureEffect "copper heat shimmer" is shared with beta-hoops'),
      expect.stringContaining("palette.primary is shared with beta-hoops (#112233 #445566 #778899)")
    ]);
    expect(both.filter((f) => f.game === "beta-hoops")).toHaveLength(3);
    expect(both.every((f) => f.severity === "warn")).toBe(true);
  });

  it("passes distinct looks, ignores IBL-only HDRIs and matches catalogue ids when no file is on disk", () => {
    const { root } = fixture({});
    withDirection(root, "showcase-alpha", direction());
    withDirection(root, "showcase-beta", direction({
      id: "beta",
      lighting: { environment: { hdri: "venice_sunset", background: "sky" } },
      signatureEffect: "ink outline",
      palette: { primary: ["#112233", "#abcdef", "#fedcba"], accent: "#00ff00" }
    }));
    expect(run(root, ["look-identity"], ["alpha-port", "beta-hoops"])).toEqual([]);
    withDirection(root, "showcase-beta", direction({ id: "beta", signatureEffect: "ink outline", palette: { primary: ["#abcdef"], accent: "#000" }, lighting: { environment: { hdri: "venice_sunset_2k", background: "hdri" } } }));
    const dup = run(root, ["look-identity"], ["beta-hoops"]);
    expect(dup.map((f) => f.message)).toEqual([expect.stringContaining('primary HDRI "venice_sunset_2k" is also the primary sky of alpha-port')]);
  });
});

describe("borrowed-asset and prop-exclusivity checks", () => {
  const manifest = JSON.stringify({ assets: [
    { id: "hoopsLamp", source: "artifacts/meshy/x" },
    { id: "corridorPulseRifleMeshy", source: "artifacts/meshy/y" },
    { id: "propBoulder", source: "public/aura-assets/z.glb" },
    { id: "alphaOnlyThing", source: "apps/showcase-alpha/assets/a.glb" },
    { id: "coin", source: "public/aura-assets/coin.glb" }
  ] });

  it("flags another game's key, skips own, generic and marked keys, and ignores another app's local-only ids", () => {
    const { root, put } = fixture({ "aura.assets.json": manifest });
    put("apps/showcase-other/aura.assets.json", JSON.stringify({ assets: [{ id: "boostPad" }] }));
    put("apps/showcase-alpha/src/main.ts", [
      "const lamp = model(assets.hoopsLamp);",
      "const rock = model(assets.propBoulder);",
      "const mine = model(assets.alphaOnlyThing);",
      "const cue = 'boostPad';",
      "const coinCount = 3; const gold = assets.coin;",
      "const ok = model(assets.hoopsLamp); // borrowed-asset: ok"
    ].join("\n"));
    const found = run(root, ["borrowed-asset"]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: "borrowed-asset", severity: "warn", file: "apps/showcase-alpha/src/main.ts", line: 1 });
    expect(found[0]!.message).toContain('"hoopsLamp" belongs to aura-hoops-3d (prefix hoops)');
  });

  it("flags an unowned non-generic key shared by two live games on both, and nothing when only one uses it", () => {
    const { root, put } = fixture({ "aura.assets.json": manifest });
    put("apps/showcase-alpha/src/main.ts", "model(assets.corridorPulseRifleMeshy); model(assets.propBoulder);\n");
    expect(run(root, ["prop-exclusivity"], ["alpha-port", "beta-hoops"])).toEqual([]);
    put("apps/showcase-beta/src/main.ts", "const kit = { rifle: \"corridorPulseRifleMeshy\", rock: \"propBoulder\" };\n");
    const shared = run(root, ["prop-exclusivity"], ["alpha-port", "beta-hoops"]);
    expect(shared.map((f) => [f.game, f.message.slice(0, 61)])).toEqual([
      ["alpha-port", 'asset key "corridorPulseRifleMeshy" is also used by beta-hoops'],
      ["beta-hoops", 'asset key "corridorPulseRifleMeshy" is also used by alpha-port']
    ]);
  });
});

describe("luma-band check", () => {
  const row = (target: string, id: string, over: Record<string, unknown> = {}) =>
    ({ target, slug: "alpha-port", variant: target.split("--")[1], id, mean: 90, darkFrac: 0.1, clipFrac: 0.01, ...over });
  const capture = (rows: unknown[]) => JSON.stringify(rows);
  const bands = (variants: Record<string, unknown>) => JSON.stringify({ schema: "aura3d.luma-bands/1", slug: "alpha-port", variants });

  it("warns when nothing is committed, and when bands exist without a capture", () => {
    const { root, put } = fixture({});
    expect(run(root, ["luma-band"]).map((f) => f.message)).toEqual([expect.stringContaining("no committed steady-state capture (luma-after.json) and no declared luma-bands.json")]);
    put("evidence/game-upgrades-47/alpha-port/luma-bands.json", bands({}));
    expect(run(root, ["luma-band"]).map((f) => f.message)).toEqual([expect.stringContaining("declared but no steady-state capture")]);
  });

  it("passes in-band steady shots, reports misses per target and shot, and ignores the warm-up shot", () => {
    const { root, put } = fixture({});
    put("evidence/game-upgrades-47/alpha-port/luma-bands.json", bands({ default: { mean: [80, 110] }, dusk: { mean: [40, 60] } }));
    put("evidence/game-upgrades-47/alpha-port/luma-after.json", capture([
      row("alpha-port--default", "settle-3s", { mean: 10 }),
      row("alpha-port--default", "settle-25s"),
      row("alpha-port--default", "settle-60s"),
      row("alpha-port--dusk", "settle-25s", { mean: 50 }),
      row("beta-hoops--default", "settle-25s", { mean: 500, slug: "beta-hoops" })
    ]));
    expect(run(root, ["luma-band"])).toEqual([]);
    put("evidence/game-upgrades-47/alpha-port/luma-after.json", capture([
      row("alpha-port--default", "settle-25s", { mean: 130 }),
      row("alpha-port--dusk", "settle-60s", { mean: 50, blank: true })
    ]));
    const misses = run(root, ["luma-band"]).map((f) => f.message);
    expect(misses).toEqual([
      expect.stringContaining("alpha-port--default settle-25s: mean=130 not in [80, 110]"),
      expect.stringContaining("alpha-port--dusk settle-60s: blank=true (blank frame")
    ]);
  });

  it("falls back to the PRD default band without luma-bands.json and says so", () => {
    const { root, put } = fixture({});
    put("evidence/game-upgrades-47/alpha-port/luma-after.json", capture([row("alpha-port--default", "settle-25s", { darkFrac: 0.7 })]));
    const out = run(root, ["luma-band"]).map((f) => f.message);
    expect(out[0]).toContain("darkFrac=0.7 not in [, 0.6]");
    expect(out[1]).toContain("no luma-bands.json");
    put("evidence/game-upgrades-47/alpha-port/luma-bands.json", "{ not json");
    expect(run(root, ["luma-band"]).map((f) => f.message)).toEqual([expect.stringContaining("not valid aura3d.luma-bands/1")]);
  });
});
