import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { countCodemodRows, countUnresolvedAuditRows, evaluateGate, formatReport, gateExitCode, parseClaims } from "../../../tools/bench-vs-threejs/gate.mjs";
import { computeTally, verdict } from "../../../tools/bench-vs-threejs/harness/tally.mjs";
import { classifyRenderer, equalAaPair, pickAuraArm, assertRealGpu } from "../../../tools/bench-vs-threejs/shared/arms.mjs";

const REPO = resolve(__dirname, "../../..");
const SCENES = ["baseline", "pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"];
const GPU = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)";
const SWIFTSHADER = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";

const stat = (n: number, mean = n) => ({ n: 60, mean, median: n, p95: n, min: n, max: n });

/** One arm's run: every numeric metric equals `v`, a few requests of `bytes` each. */
function run(v: number, extra: Record<string, unknown> = {}): any {
  return {
    build: { bundle: { raw: v, gzip: v, brotli: v, largestChunk: { raw: v, gzip: v }, jsFiles: 1 } },
    requests: Array.from({ length: Math.max(1, Math.round(v / 25)) }, (_, i) => ({ path: `/assets/f${i}.js`, status: 200, bytes: v })),
    ttffMs: { median: v },
    totalMs: stat(v),
    cpuMs: stat(v),
    perFrame: { draws: v, tris: v, programs: v },
    console: [],
    ...extra
  };
}

/** Fixture where every target passes and Aura3D is better in every numeric row. */
function passingFixture(auraKey = "aura-auto"): { results: any; statics: any } {
  const scenes: any = {};
  for (const s of SCENES) {
    const aura = run(50);
    scenes[s] = { env: { renderer: SWIFTSHADER }, results: { three: run(100), "three-msaa": run(100), [auraKey]: aura } };
  }
  const base = scenes.baseline.results[auraKey];
  scenes.baseline.results.three = run(200);
  base.totalMs = stat(3);
  base.cpuMs = stat(0.4);
  base.ttffMs = { median: 400 };
  base.perFrame = { draws: 1, tris: 12, programs: 2 };
  base.requests = Array.from({ length: 6 }, (_, i) => ({ path: `/assets/f${i}.js`, status: 200, bytes: 10 }));
  scenes["pbr-viewer"].results[auraKey].perFrame = { draws: 20, tris: 50, programs: 50 };
  scenes.forest.results[auraKey].wallMs = 120000;
  scenes.forest.results[auraKey].totalMs = stat(90);
  scenes.baseline.results.three.ttffMs = { median: 900 };
  scenes.baseline.results["three-msaa"].ttffMs = { median: 900 };
  scenes["skinned-character"].correctness = { meanLuma: { three: [150, 150], aura: [155, 155] } };
  for (const s of ["pbr-viewer", "forest", "game-loop", "shader-water"]) scenes[s].correctness = { meanLuma: { three: [100], aura: [100] } };
  const apps: any = {};
  for (const s of SCENES) {
    apps[`${s}/three`] = { scene: { loc: 100, tokens: 1000, distinctModules: 2, distinctSymbols: 10 } };
    apps[`${s}/aura`] = { scene: { loc: 50, tokens: 500, distinctModules: 1, distinctSymbols: 5 } };
  }
  apps["baseline/aura"].scene = { loc: 12, tokens: 200, distinctModules: 1, distinctSymbols: 5 };
  apps["shader-water/aura"].scene = { loc: 70, tokens: 1300, distinctModules: 1, distinctSymbols: 5 };
  apps["shader-water/three"].scene = { loc: 100, tokens: 2000, distinctModules: 2, distinctSymbols: 10 };
  return { results: { env: { renderer: SWIFTSHADER }, scenes }, statics: { apps } };
}

const auditOk = "| Capability | Label | Code | Evidence |\n|---|---|---|---|\n| `createAuraApp` | shipped | x | y |\n| Root `createGame` | experimental | x | removed from public copy |\n";
const mappingsOk = 'export const T = [\n { construct: "A", mapping: "exact", note: "" },\n { construct: "B", mapping: "approximate", note: "" },\n];\n';

const evaluate = (fx = passingFixture(), over: Record<string, unknown> = {}) =>
  evaluateGate({ results: fx.results, statics: fx.statics, auditMarkdown: auditOk, mappingsSource: mappingsOk, extra: { silentNoOps: 0 }, ...over });
const byId = (report: any, id: string) => report.targets.find((t: any) => t.id === id);

describe("bench gate: 4.1.2 baseline", () => {
  const results = JSON.parse(readFileSync(join(REPO, "evidence/vs-threejs/results.json"), "utf8"));
  const statics = JSON.parse(readFileSync(join(REPO, "evidence/vs-threejs/static-metrics.json"), "utf8"));

  it("reproduces the published tally of RESULTS.md (18 / 76 / 10 / 20 over 124 rows)", () => {
    const { tally, totalRows } = computeTally(results, statics);
    expect(tally).toEqual({ "Aura3D better": 18, "three.js better": 76, tie: 10, unmeasurable: 20 });
    expect(totalRows).toBe(124);
  });

  it("fails T1 and every speed target, and reports the measured 4.1.2 values", () => {
    const report = evaluateGate({
      results,
      statics,
      auditMarkdown: readFileSync(join(REPO, "docs/comparisons/aura3d-capability-audit.md"), "utf8"),
      mappingsSource: readFileSync(join(REPO, "packages/aura3d-cli/src/migrate-three/mappings.ts"), "utf8")
    });
    expect(byId(report, "T1")).toMatchObject({ status: "FAIL", measured: "76 of 124" });
    expect(byId(report, "P1")).toMatchObject({ status: "FAIL", measured: "623.2 ms", basis: "software WebGL2" });
    expect(byId(report, "P2").measured).toBe("3.5 ms");
    expect(byId(report, "P4").measured).toBe("2 / 33");
    expect(byId(report, "P5").measured).toBe("26");
    expect(byId(report, "P6").status).toBe("FAIL");
    expect(byId(report, "P7").status).toBe("NO-DATA");
    expect(byId(report, "Q1").status).toBe("FAIL");
    expect(byId(report, "Q2").status).toBe("FAIL");
    expect(byId(report, "D1").measured).toBe("18 / 278");
    expect(byId(report, "D2").measured).toBe("87 / 1554");
    expect(byId(report, "D3").status).toBe("NO-DATA");
    expect(byId(report, "M1").measured).toBe("174 / 47 / 3");
    expect(gateExitCode(report.targets).code).toBe(1);
  });

  it("the CLI prints PASS/FAIL per target and exits 1 on the 4.1.2 results", () => {
    const res = spawnSync("node", [join(REPO, "tools/bench-vs-threejs/gate.mjs"), "--results", join(REPO, "evidence/vs-threejs/results.json"), "--static", join(REPO, "evidence/vs-threejs/static-metrics.json")], { encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/FAIL\s+T1 /);
    expect(res.stdout).toContain("GATE FAILED: T1");
  });
});

describe("bench gate: targets", () => {
  it("passes every target on a fixture that meets them, with the claim list satisfied", () => {
    const fx = passingFixture();
    const gpu = passingFixture();
    gpu.results.env.renderer = GPU;
    const report = evaluate(fx, { gpuResults: gpu.results });
    for (const t of report.targets) expect(t, `${t.id}: ${t.detail}`).toMatchObject({ status: "PASS" });
    expect(report.auraArm).toBe("aura-auto");
    expect(gateExitCode(report.targets, parseClaims("all", report.targets)).code).toBe(0);
    expect(formatReport(report)).toContain("PASS 15  FAIL 0  NO-DATA 0");
  });

  it("uses the legacy `aura` arm when `aura-auto` is absent, and prefers `aura-auto` when both exist", () => {
    expect(pickAuraArm({ aura: {}, three: {} })).toBe("aura");
    expect(pickAuraArm({ aura: {}, "aura-auto": {}, "aura-production": {} })).toBe("aura-auto");
    expect(pickAuraArm({ three: {} })).toBeNull();
    expect(byId(evaluate(passingFixture("aura")), "P1").status).toBe("PASS");
  });

  it("checks the boundary of each numeric target", () => {
    const at = (mutate: (r: any) => void, id: string) => {
      const fx = passingFixture();
      mutate(fx.results);
      return byId(evaluate(fx), id).status;
    };
    const base = (r: any) => r.scenes.baseline.results["aura-auto"];
    expect(at((r) => (base(r).totalMs = stat(5)), "P1")).toBe("PASS");
    expect(at((r) => (base(r).totalMs = stat(5.01)), "P1")).toBe("FAIL");
    expect(at((r) => (base(r).cpuMs = stat(0.5)), "P2")).toBe("PASS");
    expect(at((r) => (base(r).cpuMs = stat(0.51)), "P2")).toBe("FAIL");
    expect(at((r) => (base(r).ttffMs = { median: 500 }), "P3")).toBe("PASS");
    expect(at((r) => (base(r).ttffMs = { median: 501 }), "P3")).toBe("FAIL");
    expect(at((r) => (base(r).perFrame.draws = 2), "P4")).toBe("FAIL");
    expect(at((r) => (r.scenes["pbr-viewer"].results["aura-auto"].perFrame.draws = 26), "P4")).toBe("FAIL");
    expect(at((r) => (base(r).requests = Array.from({ length: 9 }, (_, i) => ({ path: `/a${i}.js`, status: 200, bytes: 1 }))), "P5")).toBe("FAIL");
    expect(at((r) => (base(r).requests = [...base(r).requests, { path: "/missing.js", status: 404, bytes: 0 }]), "P5")).toBe("PASS");
  });

  it("P6 needs a completed forest, <= 5 minutes and <= 3x three.js 4x MSAA", () => {
    const forest = (r: any) => r.scenes.forest.results["aura-auto"];
    const at = (mutate: (r: any) => void) => {
      const fx = passingFixture();
      mutate(fx.results);
      return byId(evaluate(fx), "P6").status;
    };
    expect(at((r) => (forest(r).totalMs = stat(300)))).toBe("PASS");
    expect(at((r) => (forest(r).totalMs = stat(301)))).toBe("FAIL");
    expect(at((r) => (forest(r).wallMs = 300001))).toBe("FAIL");
    expect(at((r) => delete r.scenes.forest.results["aura-auto"])).toBe("FAIL");
    expect(at((r) => (forest(r).failed = true))).toBe("FAIL");
  });

  it("Q1 uses a relative 10% window on mean luma, in either direction", () => {
    const at = (aura: number) => {
      const fx = passingFixture();
      fx.results.scenes["skinned-character"].correctness.meanLuma = { three: [150], aura: [aura] };
      return byId(evaluate(fx), "Q1").status;
    };
    expect(at(165)).toBe("PASS");
    expect(at(135)).toBe("PASS");
    expect(at(165.1)).toBe("FAIL");
    expect(at(120)).toBe("FAIL");
  });

  it("Q2 counts Aura3D warnings and errors but not Chrome's readPixels driver notices", () => {
    const fx = passingFixture();
    fx.results.scenes["pbr-viewer"].results["aura-auto"].console = [{ type: "warning", text: "[.WebGL-0x1]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels" }, { type: "log", text: "hello" }];
    expect(byId(evaluate(fx), "Q2").status).toBe("PASS");
    fx.results.scenes["game-loop"].results["aura-auto"].console = [{ type: "warning", text: "POSTPROCESS_V2_UNMIGRATED: x" }];
    const q2 = byId(evaluate(fx), "Q2");
    expect(q2.status).toBe("FAIL");
    expect(q2.measured).toBe("1 message(s), 1 kind(s)");
  });

  it("D1 and D2 check both lines and tokens", () => {
    const at = (key: string, loc: number, tokens: number, id: string) => {
      const fx = passingFixture();
      fx.statics.apps[`${key}/aura`].scene = { ...fx.statics.apps[`${key}/aura`].scene, loc, tokens };
      return byId(evaluate(fx), id).status;
    };
    expect(at("baseline", 12, 210, "D1")).toBe("PASS");
    expect(at("baseline", 13, 210, "D1")).toBe("FAIL");
    expect(at("baseline", 12, 211, "D1")).toBe("FAIL");
    expect(at("shader-water", 80, 1386, "D2")).toBe("PASS");
    expect(at("shader-water", 80, 1387, "D2")).toBe("FAIL");
  });

  it("D3 is NO-DATA without the option-coverage count and FAIL above zero", () => {
    expect(byId(evaluate(passingFixture(), { extra: {} }), "D3").status).toBe("NO-DATA");
    expect(byId(evaluate(passingFixture(), { extra: { silentNoOps: 2 } }), "D3").status).toBe("FAIL");
  });

  it("C1 counts partial and experimental rows unless they are marked removed from public copy", () => {
    const md = "| Capability | Label | Code | Evidence |\n|---|---|---|---|\n| a | partial | x | y |\n| **b** | **Experimental** | x | y |\n| c | partial | x | removed from public copy |\n| d | shipped (static checks) | x | y |\n";
    const audit = countUnresolvedAuditRows(md);
    expect(audit.total).toBe(3);
    expect(audit.unresolved.map((r: any) => r.capability)).toEqual(["a", "**b**"]);
    expect(byId(evaluate(passingFixture(), { auditMarkdown: md }), "C1").measured).toBe("2 of 3 unresolved");
    expect(byId(evaluate(passingFixture(), { auditMarkdown: null }), "C1").status).toBe("NO-DATA");
  });

  it("M1 counts mapping rows and ignores the type declaration; fidelity is read when mapping is absent", () => {
    const src = 'interface M { readonly mapping: "exact" | "approximate" | "none" | "pending"; }\nconst r = [{ mapping: "none", note: "" }, { mapping: "pending", note: "" }, { mapping: "exact" }];';
    expect(countCodemodRows(src)).toEqual({ exact: 1, approximate: 0, none: 1, pending: 1 });
    expect(countCodemodRows('[{ fidelity: "approximate" }, { fidelity: "approximate" }]')).toEqual({ exact: 0, approximate: 2, none: 0, pending: 0 });
    const real = readFileSync(join(REPO, "packages/aura3d-cli/src/migrate-three/mappings.ts"), "utf8");
    expect(countCodemodRows(real)).toEqual({ exact: 21, approximate: 174, none: 47, pending: 3 });
  });
});

describe("bench gate: real-GPU column", () => {
  it("never labels a software run as a GPU run", () => {
    expect(classifyRenderer(SWIFTSHADER)).toBe("software");
    expect(classifyRenderer("Mesa llvmpipe (LLVM 15)")).toBe("software");
    expect(classifyRenderer(GPU)).toBe("gpu");
    expect(classifyRenderer("")).toBe("unknown");
    expect(classifyRenderer(undefined)).toBe("unknown");
    expect(() => assertRealGpu({ env: { renderer: SWIFTSHADER } })).toThrow(/software/);
    expect(assertRealGpu({ env: { renderer: GPU } })).toBe(GPU);
  });

  it("P7 is NO-DATA without GPU results and refuses a software file passed as GPU results", () => {
    expect(byId(evaluate(), "P7").status).toBe("NO-DATA");
    const soft = passingFixture();
    const refused = byId(evaluate(passingFixture(), { gpuResults: soft.results }), "P7");
    expect(refused.status).toBe("NO-DATA");
    expect(refused.detail).toMatch(/refused: renderer is software/);
  });

  it("P7 fails when Aura3D is slower than three.js 4x MSAA on any of the five scenes", () => {
    const gpu = passingFixture();
    gpu.results.env.renderer = GPU;
    gpu.results.scenes["shader-water"].results["aura-auto"].totalMs = stat(101);
    const p7 = byId(evaluate(passingFixture(), { gpuResults: gpu.results }), "P7");
    expect(p7.status).toBe("FAIL");
    expect(p7.detail).toContain("shader-water");
    expect(p7.basis).toContain("real GPU");
  });

  it("pairs every Aura3D arm with the 4x MSAA three.js arm (equal antialiasing)", () => {
    for (const arm of ["aura", "aura-auto", "aura-production"]) expect(equalAaPair(arm)).toBe("three-msaa");
    expect(() => equalAaPair("three")).toThrow();
  });
});

describe("bench gate: T1 and exit codes", () => {
  /** Rows are 6 per metric group; p95, cpu, draws, tris and programs each add exactly 6 three.js-better rows. */
  const worsen = (r: any, fields: Array<(run: any) => void>) => {
    for (const s of SCENES) for (const f of fields) f(r.scenes[s].results["aura-auto"]);
  };
  const groups: Array<(run: any) => void> = [
    (a) => (a.totalMs = { ...a.totalMs, p95: 500 }),
    (a) => (a.cpuMs = stat(500)),
    (a) => (a.perFrame = { ...a.perFrame, draws: 500 }),
    (a) => (a.perFrame = { ...a.perFrame, tris: 500 }),
    (a) => (a.perFrame = { ...a.perFrame, programs: 500 })
  ];

  it("the all-Aura3D-better fixture has zero three.js-better rows", () => {
    const fx = passingFixture();
    const { tally, totalRows, rows } = computeTally(fx.results, fx.statics);
    expect(rows.filter((r: any) => r.verdict === "three.js better")).toEqual([]);
    expect(totalRows).toBe(124 + 1);
  });

  it("passes at exactly 30 three.js-better rows and fails at 31", () => {
    const thirty = passingFixture();
    worsen(thirty.results, groups);
    expect(computeTally(thirty.results, thirty.statics).tally["three.js better"]).toBe(30);
    expect(byId(evaluate(thirty), "T1").status).toBe("PASS");

    const thirtyOne = passingFixture();
    worsen(thirtyOne.results, groups);
    thirtyOne.statics.apps["baseline/aura"].scene.loc = 500;
    expect(computeTally(thirtyOne.results, thirtyOne.statics).tally["three.js better"]).toBe(31);
    const t1 = byId(evaluate(thirtyOne), "T1");
    expect(t1.status).toBe("FAIL");
    expect(gateExitCode(evaluate(thirtyOne).targets).failures).toEqual(["T1"]);
  });

  it("exit code: T1 always gates; claimed targets must be PASS; NO-DATA is not a pass; unknown claims fail", () => {
    const ok = evaluate();
    expect(gateExitCode(ok.targets).code).toBe(0);
    expect(gateExitCode(ok.targets, ["P1", "Q1"]).code).toBe(0);
    expect(gateExitCode(ok.targets, ["P99"]).failures).toEqual(["P99 (unknown target)"]);

    const slow = passingFixture();
    slow.results.scenes.baseline.results["aura-auto"].totalMs = stat(40);
    const report = evaluate(slow);
    expect(gateExitCode(report.targets).code).toBe(0);
    expect(gateExitCode(report.targets, ["P1"])).toEqual({ code: 1, failures: ["P1"] });

    const noData = evaluate(passingFixture(), { extra: {} });
    expect(gateExitCode(noData.targets, ["D3"])).toEqual({ code: 1, failures: ["D3"] });
  });

  it("the CLI exits 0 on a passing fixture, 1 on a failed claim and 2 on bad input", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-gate-"));
    try {
      const fx = passingFixture();
      writeFileSync(join(dir, "results.json"), JSON.stringify(fx.results));
      writeFileSync(join(dir, "static.json"), JSON.stringify(fx.statics));
      writeFileSync(join(dir, "extra.json"), JSON.stringify({ silentNoOps: 0 }));
      const gate = join(REPO, "tools/bench-vs-threejs/gate.mjs");
      const common = [gate, "--results", join(dir, "results.json"), "--static", join(dir, "static.json"), "--extra", join(dir, "extra.json")];
      expect(spawnSync("node", [...common, "--claim", "P1,P2,P3,P4,P5,P6,Q1,Q2,D1,D2,D3"], { encoding: "utf8" }).status).toBe(0);
      const failed = spawnSync("node", [...common, "--claim", "P7"], { encoding: "utf8" });
      expect(failed.status).toBe(1);
      expect(failed.stdout).toContain("GATE FAILED: P7");
      const missing = spawnSync("node", [gate, "--results", join(dir, "nope.json"), "--static", join(dir, "static.json")], { encoding: "utf8" });
      expect(missing.status).toBe(2);
      expect(spawnSync("node", [gate], { encoding: "utf8" }).status).toBe(2);
      execFileSync("node", [...common, "--json", join(dir, "out.json")]);
      expect(JSON.parse(readFileSync(join(dir, "out.json"), "utf8")).targets).toHaveLength(15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("verdict keeps the benchmark rules: ties inside the tolerance, unmeasurable on missing data", () => {
    expect(verdict(100, 104)).toBe("tie");
    expect(verdict(100, 106)).toBe("three.js better");
    expect(verdict(100, 90)).toBe("Aura3D better");
    expect(verdict(100, undefined)).toBe("unmeasurable");
    expect(verdict(2, 3, 0)).toBe("three.js better");
  });
});
