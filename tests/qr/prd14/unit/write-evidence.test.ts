// tests/qr/prd14/unit/write-evidence.test.ts — the S1..S11 evidence writer
// (tests/qr/prd14/write-evidence.mjs) marks rows from one run's outputs and
// fails the step when any row is not "pass".
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRIPT = join(ROOT, "tests/qr/prd14/write-evidence.mjs");
const RUN_ID = "990000001";
const EVIDENCE = join(ROOT, "docs/project/aura3d-quality-rebuild/evidence/prd14/showcase-bank-shot", RUN_ID);

const passed = (title: string) => ({ title, tests: [{ results: [{ status: "passed" }] }] });
function browserReport(overrides: Record<string, string> = {}) {
  const spec = (file: string, titles: string[]) => ({
    file,
    specs: titles.map((t) => ({ ...passed(t), tests: [{ results: [{ status: overrides[t] ?? "passed" }] }] }))
  });
  return {
    suites: [
      spec("bank-shot-dispatch.spec.ts", ["flag off boots legacy with its evidence global and no console errors"]),
      spec("showcase-bank-shot-v2.spec.ts", [
        "boots to playing, scripted timeline clean, conditions met, look parity",
        "appliedLook identical between play URL and every scenario URL",
        "showcase-bank-shot: S11 audio — synthCues 0, every audio[] event played"
      ]),
      spec("showcase-bank-shot-framing.spec.ts", ["subjectHeightFraction within band at 1920x1080"]),
      spec("art-direction-audit.spec.ts", ["route showcase-bank-shot: no auditArtDirection/lookLint violations"]),
      spec("budgets.spec.ts", ["showcase-bank-shot: S8 Medium draws ≤ budget, 0 readbacks; S9 p95 rAF ≤ 50 ms"]),
      spec("s10-assets.spec.ts", [
        "showcase-bank-shot: every asset role is admitted",
        "showcase-bank-shot: every asset role's kit file has an accept look-dev verdict",
        "showcase-courier-rush: every asset role is admitted"
      ])
    ]
  };
}
const capture = { games: [{ id: "showcase-bank-shot", runs: [{ run: "desktop", blankShots: [], missingShots: [] }] }] };

function run(browser: unknown, staticOutcome = "success"): { code: number; report: { summary: string; s: Record<string, { status: string }> } } {
  const dir = mkdtempSync(join(tmpdir(), "prd14-ev-"));
  writeFileSync(join(dir, "capture.json"), JSON.stringify(capture));
  writeFileSync(join(dir, "browser.json"), JSON.stringify(browser));
  let code = 0;
  try {
    execFileSync("node", [SCRIPT, "--capture", join(dir, "capture.json"), "--browser", join(dir, "browser.json"),
      "--static", staticOutcome, "--run-id", RUN_ID, "--sha", "deadbeef", "--routes", "showcase-bank-shot"], { stdio: "pipe" });
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  rmSync(dir, { recursive: true, force: true });
  return { code, report: JSON.parse(readFileSync(join(EVIDENCE, "report.json"), "utf8")) };
}

const EVIDENCE_SP = join(ROOT, "docs/project/aura3d-quality-rebuild/evidence/prd14/showcase-blockfall-reactor", RUN_ID);
const SP_TITLES = {
  boot: "boots framed with a sized canvas and no console errors",
  s2: "boots to playing: framed snapshot with an active falling piece",
  s6: "appliedLook resolves to neon-arcade on the live page",
  s7: "framing holds at desktop and mobile viewports"
};
function singlePathBrowserReport(overrides: Record<string, string> = {}) {
  const spec = (file: string, titles: string[]) => ({
    file,
    specs: titles.map((t) => ({ title: t, tests: [{ results: [{ status: overrides[t] ?? "passed" }] }] }))
  });
  return {
    suites: [
      spec("blockfall-reactor-dispatch.spec.ts", [SP_TITLES.boot, SP_TITLES.s2, SP_TITLES.s6, SP_TITLES.s7]),
      spec("art-direction-audit.spec.ts", ["route showcase-blockfall-reactor: no auditArtDirection/lookLint violations"]),
      spec("budgets.spec.ts", ["showcase-blockfall-reactor: S8 Medium draws ≤ budget, 0 readbacks; S9 p95 rAF ≤ 50 ms"]),
      spec("s10-assets.spec.ts", [
        "showcase-blockfall-reactor: every asset role is admitted",
        "showcase-blockfall-reactor: every asset role's kit file has an accept look-dev verdict"
      ])
    ]
  };
}

/** Runs the writer for the single-path blockfall route against a fixture
 *  apps root (check-art-direction.test.ts style): shape derivation reads
 *  `--apps-root`, so no real apps/ tree is needed. `withV2` flips the
 *  fixture to the dual-path shape. */
function runSinglePath(browser: unknown, withV2 = false): { code: number; report: { summary: string; s: Record<string, { status: string }> } } {
  const dir = mkdtempSync(join(tmpdir(), "prd14-ev-sp-"));
  const route = join(dir, "apps/showcase-blockfall-reactor");
  mkdirSync(join(route, "art"), { recursive: true });
  mkdirSync(join(route, "src"), { recursive: true });
  writeFileSync(join(route, "art/direction.ts"), "export {};\n");
  writeFileSync(join(route, "src/main.ts"), "export {};\n");
  if (withV2) mkdirSync(join(route, "src/v2"), { recursive: true });
  writeFileSync(join(dir, "capture.json"), JSON.stringify({
    games: [{ id: "showcase-blockfall-reactor", runs: [{ run: "desktop", blankShots: [], missingShots: [] }] }]
  }));
  writeFileSync(join(dir, "browser.json"), JSON.stringify(browser));
  let code = 0;
  try {
    execFileSync("node", [SCRIPT, "--capture", join(dir, "capture.json"), "--browser", join(dir, "browser.json"),
      "--static", "success", "--run-id", RUN_ID, "--sha", "deadbeef", "--routes", "showcase-blockfall-reactor",
      "--apps-root", join(dir, "apps")], { stdio: "pipe" });
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  rmSync(dir, { recursive: true, force: true });
  return { code, report: JSON.parse(readFileSync(join(EVIDENCE_SP, "report.json"), "utf8")) };
}

afterEach(() => {
  rmSync(EVIDENCE, { recursive: true, force: true });
  rmSync(EVIDENCE_SP, { recursive: true, force: true });
});

describe("write-evidence.mjs (14-S1..S11)", () => {
  it("writes S1-S11 pass and exits 0 when every source passed", () => {
    const { code, report } = run(browserReport());
    expect(report.summary).toBe("S1-S11 pass");
    expect(Object.keys(report.s)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11"]);
    expect(Object.values(report.s).map((r) => r.status)).toEqual(Array(11).fill("pass"));
    expect(code).toBe(0);
  });

  it("a red S11 audio test fails S11 only, not S2", () => {
    const { code, report } = run(browserReport({ "showcase-bank-shot: S11 audio — synthCues 0, every audio[] event played": "failed" }));
    expect(report.s.S11?.status).toBe("fail");
    expect(report.s.S2?.status).toBe("pass");
    expect(code).toBe(1);
  });

  it("S10 counts only this route's s10-assets tests", () => {
    const { report } = run(browserReport({ "showcase-courier-rush: every asset role is admitted": "failed" }));
    expect(report.s.S10?.status).toBe("pass");
    const kitRed = run(browserReport({ "showcase-bank-shot: every asset role's kit file has an accept look-dev verdict": "failed" }));
    expect(kitRed.report.s.S10?.status).toBe("fail");
  });

  it("does not report S10 pass when either acceptance half is absent", () => {
    for (const absent of ["every asset role is admitted", "every asset role's kit file has an accept look-dev verdict"]) {
      const browser = browserReport();
      const suite = browser.suites.find((s) => s.file === "s10-assets.spec.ts")!;
      suite.specs = suite.specs.filter((s) => s.title !== `showcase-bank-shot: ${absent}`);
      const { code, report } = run(browser);
      expect(report.s.S10?.status).toBe("missing");
      expect(code).toBe(1);
    }
  });

  it("reports missing S11 instead of accepting a route with no playback-evidence test", () => {
    const browser = browserReport();
    const suite = browser.suites.find((s) => s.file === "showcase-bank-shot-v2.spec.ts")!;
    suite.specs = suite.specs.filter((s) => !s.title.includes("S11 audio"));
    const { code, report } = run(browser);
    expect(report.s.S11?.status).toBe("missing");
    expect(code).toBe(1);
  });

  it("marks the failing row and exits 1", () => {
    const { code, report } = run(browserReport({ "subjectHeightFraction within band at 1920x1080": "failed" }));
    expect(report.s.S7?.status).toBe("fail");
    expect(code).toBe(1);
  });

  it("marks rows with no producing test as missing and exits 1", () => {
    const { code, report } = run({ suites: [] }, "skipped");
    expect(report.s.S1?.status).toBe("missing");
    expect(report.s.S4?.status).toBe("missing");
    expect(code).toBe(1);
  });
});

describe("write-evidence.mjs single-path route shape", () => {
  it("maps S2/S6/S7 from dispatch-spec titles; S11 stays missing (no honest producer)", () => {
    const { code, report } = runSinglePath(singlePathBrowserReport());
    expect(report.s.S2?.status).toBe("pass");
    expect(report.s.S6?.status).toBe("pass");
    expect(report.s.S7?.status).toBe("pass");
    for (const row of ["S1", "S3", "S4", "S5", "S8", "S9", "S10"]) {
      expect(report.s[row]?.status, row).toBe("pass");
    }
    // S11's claim (synthCues 0, every audio[] event played) has no
    // single-path playback evidence; the row must not be silently passed.
    expect(report.s.S11?.status).toBe("missing");
    expect(code).toBe(1);
  });

  it("a red single-path appliedLook test fails S6, not missing", () => {
    const { code, report } = runSinglePath(singlePathBrowserReport({ [SP_TITLES.s6]: "failed" }));
    expect(report.s.S6?.status).toBe("fail");
    expect(report.s.S2?.status).toBe("pass");
    expect(code).toBe(1);
  });

  it("the same dispatch titles do not satisfy a dual-path (src/v2) route", () => {
    const { code, report } = runSinglePath(singlePathBrowserReport(), true);
    expect(report.s.S2?.status).toBe("missing");
    expect(report.s.S6?.status).toBe("missing");
    expect(report.s.S7?.status).toBe("missing");
    expect(code).toBe(1);
  });
});
