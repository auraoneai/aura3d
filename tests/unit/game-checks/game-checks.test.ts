import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM tool without types
import { resetGitCache, runChecks } from "../../../tools/game-checks/lib/index.mjs";

const REPO = process.cwd();
const dirs: string[] = [];

function fixture(files: Record<string, string>, opts: { slug?: string; screens?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "game-checks-"));
  dirs.push(root);
  const slug = opts.slug ?? "demo-port";
  const put = (rel: string, content: string) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  mkdirSync(join(root, "tools/game-checks/data"), { recursive: true });
  copyFileSync(join(REPO, "tools/game-checks/data/terms.json"), join(root, "tools/game-checks/data/terms.json"));
  put(
    "docs/workflows/game-inventory.json",
    JSON.stringify({
      liveGameCount: 26,
      games: [
        {
          slug,
          appFolder: "showcase-demo",
          title: "Demo Game",
          kind: "game",
          status: "live",
          screens: { dir: "evidence/demo/screens/final", card: "card.jpg" }
        }
      ]
    })
  );
  for (const [rel, content] of Object.entries(files)) put(rel, content);
  if (opts.screens) put("evidence/demo/screens/final/card.jpg", "x");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  resetGitCache();
  return root;
}

const run = (root: string, only: string[]) => runChecks({ root, slugs: ["demo-port"], only, global: false, env: {} }).findings;
const runGlobal = (root: string, only: string[]) => runChecks({ root, slugs: ["demo-port"], only, global: true, env: { MESHY_LEDGER: "/nonexistent", MESHY_HELPER: "/nonexistent" } }).findings;

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("game-checks", () => {
  it("names: flags an old game name, port wording, stale version and the engine chip in visible text", () => {
    const root = fixture(
      {
        "apps/showcase-demo/index.html": '<h1>Last Train</h1><p>A port of a Crayon game</p><span>AURA3D ENGINE</span><i>Aura3D 4.0.2</i>',
        "apps/showcase-demo/src/main.ts": 'const x = 1;\n// Last Train in a comment is fine\nconst id = "a3d-crayon-capture/1";\n'
      },
      { slug: "last-train-port" }
    );
    const f = runChecks({ root, slugs: ["last-train-port"], only: ["names"], global: false, env: {} }).findings;
    const msgs = f.map((x: { message: string }) => x.message).join("|");
    expect(msgs).toContain('old game name "Last Train"');
    expect(msgs).toContain("wording");
    expect(msgs).toContain("engine chip");
    expect(f.some((x: { severity: string; message: string }) => x.severity === "warn" && /stale version/.test(x.message))).toBe(true);
    // identifier-like schema ids and comments are not visible text
    expect(f.every((x: { file: string; line: number }) => !(x.file.endsWith("main.ts")))).toBe(true);
  });

  it("names: clean visible text passes", () => {
    const root = fixture({ "apps/showcase-demo/index.html": "<h1>Demo Game</h1><p>Collect shards.</p>" });
    expect(run(root, ["names"])).toEqual([]);
  });

  it("canvas-resize: flags canvas size assigned after app.ready()", () => {
    const bad = fixture({ "apps/showcase-demo/src/main.ts": "const app = createAuraApp('#a', {});\nawait app.ready();\ncanvas.width = innerWidth * 2;\n" });
    expect(run(bad, ["canvas-resize"]).length).toBe(1);
    const ok = fixture({ "apps/showcase-demo/src/main.ts": "canvas.width = 1280;\nconst app = createAuraApp('#a', {});\nawait app.ready();\n" });
    expect(run(ok, ["canvas-resize"])).toEqual([]);
  });

  it("fixed-step-presenter: errors when a fixed-step loop has no presenter or interpolator", () => {
    const bad = fixture({ "apps/showcase-demo/src/main.ts": "const loop = createFixedStepLoop({ step: 1/60 });\n" });
    const f = run(bad, ["fixed-step-presenter"]);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("error");
    const ok = fixture({ "apps/showcase-demo/src/main.ts": "const loop = createFixedStepLoop({ step: 1/60 });\nconst pres = createFixedStepPresenter(loop);\n" });
    expect(run(ok, ["fixed-step-presenter"])).toEqual([]);
    const variable = fixture({ "apps/showcase-demo/src/main.ts": "app.onFrame((dt) => sim.step(dt));\n" });
    expect(run(variable, ["fixed-step-presenter"])).toEqual([]);
  });

  it("hitstop-time: flags a freeze timer counted down on dt unless createHitStop is used", () => {
    const bad = fixture({ "apps/showcase-demo/src/main.ts": "hitStop -= dt;\n" });
    expect(run(bad, ["hitstop-time"]).length).toBe(1);
    const ok = fixture({ "apps/showcase-demo/src/main.ts": "const hs = createHitStop();\nhitStop -= dt;\n" });
    expect(run(ok, ["hitstop-time"])).toEqual([]);
  });

  it("pose-array: flags array bone poses near a bones object, ignores other arrays", () => {
    const bad = fixture({ "apps/showcase-demo/src/main.ts": "const bones = {\n  RightHand: { rotation: [0, 0, 0, 1] }\n};\nhandle.pose(bones);\n" });
    expect(run(bad, ["pose-array"]).length).toBe(1);
    const ok = fixture({ "apps/showcase-demo/src/main.ts": "const bones = {};\nhandle.pose(bones);\n\n\n\n\n\n\nconst p = { position: [1, 2, 3] };\n" });
    expect(run(ok, ["pose-array"])).toEqual([]);
  });

  it("likeness: flags real brand and lore terms in visible text but not in paths or comments", () => {
    const root = fixture({
      "apps/showcase-demo/index.html": "<p>Drive the Waymo to Mount Paozu</p>",
      "apps/showcase-demo/src/main.ts": 'import x from "../../examples/saiyan-snake-way-port/sim";\n// Goku\nconst url = "/aura-assets/teleopWaymoHero.glb";\n'
    });
    const f = run(root, ["likeness"]);
    expect(f.map((x: { message: string }) => x.message).join("|")).toMatch(/Waymo/);
    expect(f.some((x: { file: string }) => x.file.endsWith("main.ts"))).toBe(false);
  });

  it("asset-provenance: errors when urls outnumber sha256 fields or a raw remote GLB is used", () => {
    const bad = fixture({
      "apps/showcase-demo/src/aura-assets.ts": 'export const assets = { a: { url: "/aura-assets/a.glb" }, b: { url: "/aura-assets/b.glb", sha256: "x" } };\n',
      "apps/showcase-demo/src/main.ts": 'load("https://example.com/x.glb");\n'
    });
    const f = run(bad, ["asset-provenance"]);
    expect(f).toHaveLength(2);
    const ok = fixture({ "apps/showcase-demo/src/aura-assets.ts": 'export const assets = { a: { url: "/aura-assets/a.glb", sha256: "x" } };\n' });
    expect(run(ok, ["asset-provenance"])).toEqual([]);
  });

  it("kits: warns on hand-assigned beacon and QA hook, accepts the library kits", () => {
    const bad = fixture({ "apps/showcase-demo/src/main.ts": "window.__AURA3D_GAME__ = evidence;\nwindow.__AURA_DEMO__ = hook;\nnew AudioContext();\n" });
    expect(run(bad, ["kits"]).length).toBe(3);
    const ok = fixture({ "apps/showcase-demo/src/main.ts": "installGameBeacon();\ninstallQaHooks('demo', {});\ncreateCueBank({});\n" });
    expect(run(ok, ["kits"])).toEqual([]);
  });

  it("no-three: errors on a three import", () => {
    const bad = fixture({ "apps/showcase-demo/src/main.ts": 'import * as THREE from "three";\n' });
    expect(run(bad, ["no-three"]).length).toBe(1);
  });

  it("runtime-masking: errors when borrowed terms are hidden by runtime text replacement", () => {
    const bad = fixture({ "apps/showcase-demo/src/labels.ts": 'installNeutralLabels([["Goku", "Runner"]]);\n' });
    expect(run(bad, ["runtime-masking"]).length).toBe(1);
  });

  it("quickbar: warns on own bar markup without the shared stylesheet", () => {
    const bad = fixture({ "apps/showcase-demo/index.html": '<div class="mode-bar">x</div>' });
    expect(run(bad, ["quickbar"]).length).toBe(1);
    const ok = fixture({ "apps/showcase-demo/index.html": '<link rel="stylesheet" href="../showcase-port-shared/quickbar.css"><div class="aura3d-top-bar mode-bar">x</div>' });
    expect(run(ok, ["quickbar"])).toEqual([]);
  });

  it("screens-tracked: errors when no screenshot is tracked, passes when the card is", () => {
    const bad = fixture({ "apps/showcase-demo/index.html": "<p>x</p>" });
    expect(run(bad, ["screens-tracked"])).toHaveLength(1);
    const ok = fixture({ "apps/showcase-demo/index.html": "<p>x</p>" }, { screens: true });
    expect(run(ok, ["screens-tracked"])).toEqual([]);
  });

  it("vercelignore: errors when an unanchored pattern also excludes a source directory, passes when anchored", () => {
    const bad = fixture({
      ".vercelignore": "evidence/\n",
      "packages/game/src/evidence/beacon.ts": "export {};\n",
      "apps/showcase-demo/index.html": "<p>x</p>"
    });
    const f = runGlobal(bad, ["vercelignore"]);
    expect(f.some((x: { severity: string }) => x.severity === "error")).toBe(true);
    const ok = fixture({
      ".vercelignore": "/evidence/\n",
      "packages/game/src/evidence/beacon.ts": "export {};\n",
      "apps/showcase-demo/index.html": "<p>x</p>"
    });
    expect(runGlobal(ok, ["vercelignore"])).toEqual([]);
  });

  it("counts: flags a hand-typed game count that differs from the inventory", () => {
    const bad = fixture({ "README.md": "Aura3D ships 15 games.\n", "apps/showcase-demo/index.html": "<p>x</p>" });
    expect(runGlobal(bad, ["counts"]).length).toBe(1);
    const ok = fixture({ "README.md": "Aura3D ships 26 games.\n", "apps/showcase-demo/index.html": "<p>x</p>" });
    expect(runGlobal(ok, ["counts"])).toEqual([]);
  });

  it("rejects an unknown game slug", () => {
    const root = fixture({ "apps/showcase-demo/index.html": "<p>x</p>" });
    expect(() => runChecks({ root, slugs: ["nope"], global: false, env: {} })).toThrow(/unknown game/);
  });
});
