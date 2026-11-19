// tests/qr/prd14/unit/write-evidence.test.ts — the S1..S11 evidence writer
// (tests/qr/prd14/write-evidence.mjs) marks rows from one run's outputs and
// fails the step when any row is not "pass".
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRIPT = join(ROOT, "tests/qr/prd14/write-evidence.mjs");
const RUN_ID = "990000001";
const EVIDENCE = join(ROOT, "docs/project/aura3d-quality-rebuild/evidence/prd14/showcase-iron-crown", RUN_ID);

const passed = (title: string) => ({ title, tests: [{ results: [{ status: "passed" }] }] });
function browserReport(overrides: Record<string, string> = {}) {
  const spec = (file: string, titles: string[]) => ({
    file,
    specs: titles.map((t) => ({ ...passed(t), tests: [{ results: [{ status: overrides[t] ?? "passed" }] }] }))
  });
  return {
    suites: [
      spec("iron-crown-dispatch.spec.ts", ["flag off boots legacy with its evidence global and no console errors"]),
      spec("showcase-iron-crown-v2.spec.ts", [
        "boots to playing, scripted timeline clean, conditions met, look parity",
        "appliedLook identical between play URL and every scenario URL",
        "showcase-iron-crown: S11 audio — synthCues 0, every audio[] event played"
      ]),
      spec("showcase-iron-crown-framing.spec.ts", ["subjectHeightFraction within band at 1920x1080"]),
      spec("art-direction-audit.spec.ts", ["route showcase-iron-crown: no auditArtDirection/lookLint violations"]),
      spec("budgets.spec.ts", ["showcase-iron-crown: S8 Medium draws ≤ budget, 0 readbacks; S9 p95 rAF ≤ 50 ms"]),
      spec("s10-assets.spec.ts", [
        "showcase-iron-crown: every asset role is admitted",
        "showcase-iron-crown: every asset role's kit file has an accept look-dev verdict",
        "showcase-courier-rush: every asset role is admitted"
      ])
    ]
  };
}
const capture = { games: [{ id: "showcase-iron-crown", runs: [{ run: "desktop", blankShots: [], missingShots: [] }] }] };

function run(browser: unknown, staticOutcome = "success"): { code: number; report: { summary: string; s: Record<string, { status: string }> } } {
  const dir = mkdtempSync(join(tmpdir(), "prd14-ev-"));
  writeFileSync(join(dir, "capture.json"), JSON.stringify(capture));
  writeFileSync(join(dir, "browser.json"), JSON.stringify(browser));
  let code = 0;
  try {
    execFileSync("node", [SCRIPT, "--capture", join(dir, "capture.json"), "--browser", join(dir, "browser.json"),
      "--static", staticOutcome, "--run-id", RUN_ID, "--sha", "deadbeef", "--routes", "showcase-iron-crown"], { stdio: "pipe" });
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  rmSync(dir, { recursive: true, force: true });
  return { code, report: JSON.parse(readFileSync(join(EVIDENCE, "report.json"), "utf8")) };
}

afterEach(() => rmSync(EVIDENCE, { recursive: true, force: true }));

describe("write-evidence.mjs (14-S1..S11)", () => {
  // The all-pass, red-S11 and failing-row cases attributed rows through a PRD-14 rebuild route's own
  // browser specs (`const APP_DIR = ...`); every rebuild app and its specs were deleted, so only the
  // cases that do not need a route-owned spec remain. The fixture route is a live games.json entry.
  it("S10 counts only this route's s10-assets tests", () => {
    const { report } = run(browserReport({ "showcase-courier-rush: every asset role is admitted": "failed" }));
    expect(report.s.S10?.status).toBe("pass");
    const kitRed = run(browserReport({ "showcase-iron-crown: every asset role's kit file has an accept look-dev verdict": "failed" }));
    expect(kitRed.report.s.S10?.status).toBe("fail");
  });

  it("does not report S10 pass when either acceptance half is absent", () => {
    for (const absent of ["every asset role is admitted", "every asset role's kit file has an accept look-dev verdict"]) {
      const browser = browserReport();
      const suite = browser.suites.find((s) => s.file === "s10-assets.spec.ts")!;
      suite.specs = suite.specs.filter((s) => s.title !== `showcase-iron-crown: ${absent}`);
      const { code, report } = run(browser);
      expect(report.s.S10?.status).toBe("missing");
      expect(code).toBe(1);
    }
  });

  it("reports missing S11 instead of accepting a route with no playback-evidence test", () => {
    const browser = browserReport();
    const suite = browser.suites.find((s) => s.file === "showcase-iron-crown-v2.spec.ts")!;
    suite.specs = suite.specs.filter((s) => !s.title.includes("S11 audio"));
    const { code, report } = run(browser);
    expect(report.s.S11?.status).toBe("missing");
    expect(code).toBe(1);
  });

  it("marks rows with no producing test as missing and exits 1", () => {
    const { code, report } = run({ suites: [] }, "skipped");
    expect(report.s.S1?.status).toBe("missing");
    expect(report.s.S4?.status).toBe("missing");
    expect(code).toBe(1);
  });
});
