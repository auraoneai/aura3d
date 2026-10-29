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

describe("game-checks meshy-cap reads the CLI ledger", () => {
  const rows = (entries: Array<Record<string, unknown>>) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  const checkLedger = (content: string, env: Record<string, string> = {}) => {
    const root = fixture({});
    const dir = mkdtempSync(join(tmpdir(), "meshy-ledger-"));
    dirs.push(dir);
    const ledger = join(dir, "ledger.jsonl");
    writeFileSync(ledger, content);
    return runChecks({ root, slugs: ["demo-port"], only: ["meshy-cap"], global: true, env: { AURA3D_MESHY_LEDGER: ledger, ...env } }).findings;
  };

  it("merges per reservation like the CLI: failed counts 0, actual beats est, baseline and unattributed never count", () => {
    const ledger = rows([
      { rid: "a", game: "demo", op: "preview", est: 300, status: "reserved" },
      { rid: "a", status: "ok", actual: 250 },
      { rid: "b", game: "demo", op: "preview", est: 400, status: "reserved" },
      { rid: "b", status: "failed" },
      { rid: "baseline-1", kind: "baseline", status: "ok", pool_remaining: 99999 },
      { rid: "config-1", kind: "config", status: "ok", game_cap: 9999 },
      { rid: "reconcile-1", game: "unattributed", op: "adjustment", est: 5000, actual: 5000, status: "ok" }
    ]);
    const f = checkLedger(ledger) as Array<{ severity: string; message: string }>;
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain("demo 250");
    expect(f[0].message).toContain("250 attributed");
  });

  it("never warns: it lists the credits per tag as information, however high", () => {
    const ledger = rows([
      { rid: "a", game: "demo", op: "preview", est: 430, status: "ok" },
      { rid: "b", game: "drift", op: "preview", est: 5000, status: "ok" },
      { rid: "c", game: "ninja", op: "preview", est: 600, status: "ok" }
    ]);
    const f = checkLedger(ledger) as Array<{ severity: string; message: string }>;
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("info");
    expect(f[0].message).toMatch(/uncapped by owner decision/);
    expect(f[0].message).toContain("drift 5000, ninja 600, demo 430");
    expect(f[0].message).toContain("6030 attributed");
  });

  it("an empty or missing ledger is informational too", () => {
    const f = runChecks({ root: fixture({}), slugs: ["demo-port"], only: ["meshy-cap"], global: true, env: { AURA3D_MESHY_LEDGER: "/nonexistent" } }).findings;
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("info");
  });
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

  it("fit-grounding: flags a fitted model placed at half its height or lifted by half its height, allows floor placement and marked lifts", () => {
    const literal = fixture({ "apps/showcase-demo/src/main.ts": 'model(assets.cart, { name: "rack", targetHeight: 1.15 }).position(-8.9, 0.58, 9.4);\n' });
    expect(run(literal, ["fit-grounding"]).length).toBe(1);
    const dynamic = fixture({ "apps/showcase-demo/src/main.ts": 'model(assets.guy, { name: "guy", targetHeight: 1.92, scaleMode: "fit" }).position(0, 0, 6);\nroot.setPosition(a.x, 0.96 + a.y, a.z);\n' });
    expect(run(dynamic, ["fit-grounding"]).length).toBe(1);
    const swapped = fixture({ "apps/showcase-demo/src/main.ts": 'model(assets.guy, { name: "guy", targetHeight: 1.88, scaleMode: "fit" }).position(0, 0, 6);\nroot.setPosition(a.x, a.y + 0.94, a.z);\n' });
    expect(run(swapped, ["fit-grounding"]).length).toBe(1);
    const ok = fixture({ "apps/showcase-demo/src/main.ts": 'model(assets.cart, { name: "rack", targetHeight: 1.15 }).position(-8.9, 0, 9.4);\nmodel(assets.sky, { name: "sky", targetHeight: 40, scaleMode: "world" }).position(0, 20, 0);\nroot.setPosition(a.x, a.y + 0.5, a.z);\naura.setPosition(a.x, 0.95 + a.y, a.z); // fit-grounding: ok\n' });
    expect(run(ok, ["fit-grounding"])).toEqual([]);
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

  it("deployable-assets: errors when a model on disk is not admitted in aura.assets.json, passes once admitted", () => {
    const src = 'const a = { url: "/aura-assets/bldg.0123abcd.glb" };';
    const bad = fixture({ "apps/showcase-demo/src/main.ts": src, "public/aura-assets/bldg.0123abcd.glb": "x", "aura.assets.json": JSON.stringify({ assets: [] }) });
    expect(run(bad, ["deployable-assets"]).map((f: { severity: string }) => f.severity)).toEqual(["error"]);
    const good = fixture({ "apps/showcase-demo/src/main.ts": src, "public/aura-assets/bldg.0123abcd.glb": "x", "aura.assets.json": JSON.stringify({ assets: [{ id: "bldg", url: "/aura-assets/bldg.0123abcd.glb" }] }) });
    expect(run(good, ["deployable-assets"])).toEqual([]);
    const missing = fixture({ "apps/showcase-demo/src/main.ts": src, "aura.assets.json": JSON.stringify({ assets: [{ id: "bldg", url: "/aura-assets/bldg.0123abcd.glb" }] }) });
    expect(run(missing, ["deployable-assets"]).length).toBe(1);
  });

  it("touch-input: warns on keyboard-only gameplay, passes with a touch preset, pointer steering or hold buttons", () => {
    const keysOnly = 'addEventListener("keydown", (e) => { if (e.code === "KeyA") left = true; });\naddEventListener("pointerdown", () => sound.unlock());\n';
    const bad = run(fixture({ "apps/showcase-demo/src/main.ts": keysOnly }), ["touch-input"]);
    expect(bad).toHaveLength(1);
    expect(bad[0].severity).toBe("warn");
    expect(bad[0].message).toMatch(/keyboard-only/);
    const preset = 'createGame({ input: { actions: { left: ["KeyA"], jump: ["Space"] } }, touch: { preset: "dpad-2btn", bindings: { left: "left", jump: "jump" } } });\n';
    expect(run(fixture({ "apps/showcase-demo/src/main.ts": preset }), ["touch-input"])).toEqual([]);
    const steer = keysOnly + 'canvas.addEventListener("pointerdown", (e) => { steerX = e.clientX; });\n';
    expect(run(fixture({ "apps/showcase-demo/src/main.ts": steer }), ["touch-input"])).toEqual([]);
    const hold = keysOnly + 'for (const t of ["pointerup", "pointercancel"]) b.addEventListener(t, () => release());\n';
    expect(run(fixture({ "apps/showcase-demo/src/main.ts": hold }), ["touch-input"])).toEqual([]);
    const optOut = 'addEventListener("keydown", (e) => {}); // touch-input: ok\n';
    expect(run(fixture({ "apps/showcase-demo/src/main.ts": optOut }), ["touch-input"])).toEqual([]);
  });

  it("touch-input: flags a touch binding that names no declared action (Iron Crown IC-01)", () => {
    const src = 'createGame({\n  input: { actions: { moveLeft: ["KeyA"], light: ["KeyJ"] } },\n  touch: {\n    preset: "dpad-4btn",\n    bindings: {\n      left: "left",\n      light: "light"\n    }\n  }\n});\n';
    const f = run(fixture({ "apps/showcase-demo/src/main.ts": src }), ["touch-input"]);
    expect(f.map((x: { message: string }) => x.message)).toEqual([expect.stringContaining('touch binding targets "left"')]);
    expect(f[0].line).toBe(6);
    const fixed = src.replace('left: "left"', 'left: "moveLeft"');
    expect(run(fixture({ "apps/showcase-demo/src/main.ts": fixed }), ["touch-input"])).toEqual([]);
  });

  it("lighting: warns on lights with no environment, passes once an environment or look is authored", () => {
    const lightsOnly = "scene().add(lights.hemisphere({ intensity: 0.6 })).add(lights.directional({ intensity: 2 }));\n";
    const f = run(fixture({ "apps/showcase-demo/src/world.ts": lightsOnly }), ["lighting"]);
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/no environment or look/);
    const withEnv = "scene().add(environments.neutral({ intensity: 0.8 })).add(lights.directional({ intensity: 2 }));\n";
    expect(run(fixture({ "apps/showcase-demo/src/world.ts": withEnv }), ["lighting"])).toEqual([]);
    const noLights = "scene().add(primitives.box({}));\n";
    expect(run(fixture({ "apps/showcase-demo/src/world.ts": noLights }), ["lighting"])).toEqual([]);
  });

  it("lighting: warns on a hemisphere next to a look", () => {
    const src = 'scene().add(looks.preset("outdoor-day")).add(lights.hemisphere({ intensity: 0.4 }));\n';
    const f = run(fixture({ "apps/showcase-demo/src/world.ts": src }), ["lighting"]);
    expect(f.map((x: { message: string }) => x.message)).toEqual([expect.stringMatching(/hemisphere light next to an environment or look/)]);
    const ok = 'scene().add(looks.preset("outdoor-day")).add(lights.hemisphere({ intensity: 0.4 })); // lighting: ok\n';
    expect(run(fixture({ "apps/showcase-demo/src/world.ts": ok }), ["lighting"])).toEqual([]);
  });

  it("lighting: warns on a look added at runtime through app.nodes next to an ambient (Cross Hop LIGHT-04)", () => {
    const src = [
      "function buildLookGroup(id) {",
      "  return looks.preset(id, {});",
      "}",
      "scene().add(buildLookGroup(\"outdoor-day\")).add(lights.ambient({ intensity: 0.42 }));",
      "function swapLook(id) {",
      "  const n0 = app.nodes as unknown as { add(n: never): void };",
      "  n0.add(buildLookGroup(id) as never);",
      "}",
      ""
    ].join("\n");
    const f = run(fixture({ "apps/showcase-demo/src/core.ts": src }), ["lighting"]);
    expect(f).toHaveLength(1);
    expect(f[0].line).toBe(7);
    const noAmbient = src.replace("lights.ambient({ intensity: 0.42 })", "lights.directional({ intensity: 2 })");
    expect(run(fixture({ "apps/showcase-demo/src/core.ts": noAmbient }), ["lighting"])).toEqual([]);
  });

  it("rejects an unknown game slug", () => {
    const root = fixture({ "apps/showcase-demo/index.html": "<p>x</p>" });
    expect(() => runChecks({ root, slugs: ["nope"], global: false, env: {} })).toThrow(/unknown game/);
  });
});
