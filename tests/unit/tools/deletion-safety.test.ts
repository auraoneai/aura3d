import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * WS-0.2 — the deletion-safety tool is only useful if it *blocks* a file that is genuinely unsafe
 * to delete. A tool that clears a known-unsafe file is worse than no tool, because it converts a
 * missing check into a false assurance. `TerrainHeightfield.ts` is the canonical case:
 * `EnvironmentPlatform.ts` imports it to build production terrain geometry.
 */
const scratch = mkdtempSync(join(tmpdir(), "deletion-safety-"));
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function run(args: readonly string[]): { readonly status: number; readonly report: Record<string, unknown> } {
  const reportPath = join(scratch, `report-${Math.random().toString(36).slice(2)}.json`);
  let status = 0;
  try {
    execFileSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/deletion-safety/index.ts", "--report", reportPath, ...args], {
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    status = (error as { readonly status?: number }).status ?? 1;
  }
  return { status, report: JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown> };
}

describe("deletion-safety (R8)", () => {
  it("blocks a file with a real internal importer", () => {
    const { status, report } = run(["packages/rendering/src/TerrainHeightfield.ts"]);
    expect(status).not.toBe(0);
    expect(report.pass).toBe(false);
    const files = report.files as readonly { readonly path: string; readonly clear: boolean; readonly blocking: Record<string, readonly { readonly at: string }[]> }[];
    const terrain = files.find((file) => file.path.endsWith("TerrainHeightfield.ts"));
    expect(terrain?.clear).toBe(false);
    /*
     * The blocking evidence includes the live production importer. A barrel-only reference can be
     * retired with an unreleased addition, but `EnvironmentPlatform` actually executes this module.
     */
    const runtime = terrain?.blocking["runtime-consumer"] ?? [];
    expect(runtime.some((evidence) => evidence.at.startsWith("packages/rendering/src/EnvironmentPlatform.ts:"))).toBe(true);
  }, 180_000);

  it("blocks a symbol consumed through a multiline public-barrel import", () => {
    const { status, report } = run(["packages/rendering/src/OceanSurface.ts"]);
    expect(status).not.toBe(0);
    const files = report.files as readonly {
      readonly path: string;
      readonly blocking: Record<string, readonly { readonly at: string; readonly detail: string }[]>;
    }[];
    const ocean = files.find((file) => file.path.endsWith("OceanSurface.ts"));
    const runtime = ocean?.blocking["runtime-consumer"] ?? [];
    expect(runtime.some((evidence) =>
      evidence.at.startsWith("apps/advanced-examples-gallery/src/waterSystems.ts:")
      && evidence.detail.includes("multiline import")
    )).toBe(true);
  }, 180_000);

  it("treats an empty deletion queue as a pass", () => {
    /*
     * Against an explicitly empty manifest, not the repository's live queue. Reading the live
     * `candidates.json` made this test assert that no deletion is currently being proven — so it
     * passed only while no workstream was mid-flight and failed the moment WS-3.3 populated the
     * queue with 68 files. That is a test coupled to transient working state rather than to the
     * behaviour it names, and R2 forbids relaxing the assertion to accommodate it.
     */
    const manifestPath = "tests/reports/deletion-safety-empty-manifest.json";
    writeFileSync(join(repoRoot, manifestPath), JSON.stringify({ candidates: [] }, null, 2));
    try {
      const { status, report } = run(["--manifest", manifestPath]);
      expect(status).toBe(0);
      expect(report.pass).toBe(true);
      expect((report.checks as readonly { readonly id: string }[]).some((check) => check.id === "r8:queue")).toBe(true);
    } finally {
      rmSync(join(repoRoot, manifestPath), { force: true });
    }
  }, 180_000);

  it("reports a prose mention without blocking on it", () => {
    /*
     * The tool's own source comment names `rendering/src/OceanSurface.ts`. An early version classified
     * that as a runtime consumer and blocked on itself, which is unclearable. Prose is reported so
     * stale references get tidied, but it does not gate a deletion.
     */
    const { report } = run(["packages/rendering/src/OceanSurface.ts"]);
    const files = report.files as readonly { readonly proseMentions?: readonly unknown[] }[];
    expect(Array.isArray(files[0]?.proseMentions)).toBe(true);
  }, 180_000);

  it("does not block a non-unique basename on every other file that shares it", () => {
    /*
     * Regression pin for the fourth false-positive class. `moduleSpecifiersFor` emitted a file's
     * bare basename as an identity it could be referenced by, suppressing only a hand-written list
     * of names known to be ambiguous (`index`, `main`, `utils`, ...). `package.json` was not on that
     * list, so proving `packages/ecs` deletable reported 306 blocking references for
     * `packages/ecs/package.json` — every `"package.json"` string in every showcase evidence
     * manifest in the repository. `tsconfig.json` (19) and `README.md` (114) failed the same way.
     * Three of the four largest counts in that run were this single bug, and together they made a
     * cleared package look immovably blocked.
     *
     * The rule is now uniqueness rather than enumeration: a bare name identifies a file only when it
     * names exactly one file in the repository. This asserts the ambiguous-name blockers are gone
     * while the **path**-shaped evidence that actually matters still lands — `packages/ecs/src/index.ts`
     * is genuinely blocked by `tools/bundle-scenarios` and the `@aura3d/ecs` export map.
     */
    const { report } = run(["packages/ecs/package.json", "packages/ecs/tsconfig.json", "packages/ecs/README.md", "packages/ecs/src/index.ts"]);
    const files = report.files as readonly {
      readonly path: string;
      readonly blocking: Record<string, readonly { readonly at: string; readonly detail: string }[]>;
    }[];

    /*
     * The invariant is not "zero blockers" — this test file itself names all four paths in the line
     * above, and a line quoting the full repo-relative path *is* a real reference. The invariant is
     * that every blocker names the candidate by its **path**, never by a bare name it happens to
     * share with 300 unrelated files.
     */
    for (const name of ["packages/ecs/package.json", "packages/ecs/tsconfig.json", "packages/ecs/README.md"]) {
      const file = files.find((entry) => entry.path === name);
      const strays = Object.values(file?.blocking ?? {})
        .flat()
        .filter((evidence) => !evidence.detail.includes("packages/ecs") && !evidence.detail.includes("@aura3d/ecs"))
        .map((evidence) => `${evidence.at} :: ${evidence.detail}`);
      expect(strays, `${name} must not block on files that merely share its basename`).toEqual([]);
    }

    // The gate must still catch the real thing, or this fix would have blunted it.
    const barrel = files.find((entry) => entry.path === "packages/ecs/src/index.ts");
    expect(barrel?.blocking["runtime-consumer"]?.length ?? 0).toBeGreaterThan(0);
  }, 180_000);

  it("does not report the deletion queue itself as a consumer of its candidates", () => {
    /*
     * Regression pin for the fifth — and most self-defeating — false-positive class. The manifest
     * lists each candidate by its repo-relative path, which is precisely the shape
     * `referencesSpecifier` matches, so every candidate came back blocked by
     * `runtime-consumer @ tools/deletion-safety/candidates.json:<n>`: the queue entry that asked
     * for the proof.
     *
     * WS-3.3's first run hit this on all 68 files, and for the 12 that were otherwise clear the
     * queue entry was the *only* blocker — so a file with no dependency anywhere in the repository
     * still could not be cleared. A gate that blocks because it was asked to run can never pass,
     * and an unpassable gate is one someone eventually deletes or overrides. Same class as the two
     * calibration bugs above: the tool manufacturing its own blocking evidence.
     */
    const manifestPath = "tests/reports/deletion-safety-selfref-manifest.json";
    const candidates = ["packages/rendering/src/TerrainHeightfield.ts", "packages/ecs/src/Bitset.ts"];
    writeFileSync(join(repoRoot, manifestPath), JSON.stringify({ candidates }, null, 2));
    try {
      const { report } = run(["--manifest", manifestPath]);
      const files = report.files as readonly {
        readonly path: string;
        readonly blocking: Record<string, readonly { readonly at: string }[]>;
      }[];
      expect(files.map((file) => file.path)).toEqual(candidates);
      for (const file of files) {
        const fromManifest = Object.values(file.blocking)
          .flat()
          .filter((evidence) => evidence.at.startsWith(manifestPath));
        expect(fromManifest, `${file.path} must not be blocked by the queue that requested its proof`).toEqual([]);
      }

      // Still catches the real dependency, or the exclusion would have blunted the gate.
      const terrain = files.find((file) => file.path.endsWith("TerrainHeightfield.ts"));
      expect((terrain?.blocking["runtime-consumer"] ?? []).some((evidence) => evidence.at.startsWith("packages/rendering/src/EnvironmentPlatform.ts:"))).toBe(true);
    } finally {
      rmSync(join(repoRoot, manifestPath), { force: true });
    }
  }, 180_000);

  it("excludes the deletion queue however the run was invoked", () => {
    /*
     * The first fix for the class above excluded the manifest only when the candidate list had been
     * *read* from it, so `--manifest` runs passed while runs that named the same paths as CLI
     * arguments were still blocked by `tools/deletion-safety/candidates.json`. WS-3.5 is driven by
     * an explicit argument list of every per-package `Fixtures.ts` path, which is exactly the
     * invocation that stayed broken.
     *
     * A gate whose verdict depends on how it was called is not evidence, so this pins the invariant
     * on the CLI-argument path and against the *default* queue rather than a temporary one.
     */
    const candidate = "packages/rendering/src/VegetationScatter.ts";
    const { report } = run([candidate]);
    const files = report.files as readonly {
      readonly path: string;
      readonly blocking: Record<string, readonly { readonly at: string }[]>;
    }[];
    const file = files.find((entry) => entry.path === candidate);
    expect(file, `${candidate} must appear in the report`).toBeDefined();
    const fromQueue = Object.values(file?.blocking ?? {})
      .flat()
      .filter((evidence) => evidence.at.startsWith("tools/deletion-safety/candidates.json"));
    expect(fromQueue, "the default queue must never be reported as a consumer").toEqual([]);
  }, 180_000);

  it("fails when asked to prove a deletion of a file that does not exist", () => {
    const { status, report } = run(["packages/rendering/src/DefinitelyNotAFile.ts"]);
    expect(status).not.toBe(0);
    const failures = report.failures as readonly string[];
    expect(failures.some((failure) => failure.includes("already gone"))).toBe(true);
  }, 180_000);

  it("proves a tracked working-tree deletion from its HEAD body", () => {
    const candidate = "packages/rendering/src/OceanSurface.ts";
    const absolute = join(repoRoot, candidate);
    const held = `${absolute}.deletion-safety-test`;
    renameSync(absolute, held);
    try {
      const { report } = run([candidate]);
      const files = report.files as readonly {
        readonly path: string;
        readonly exists: boolean;
        readonly source: string;
        readonly lines: number;
      }[];
      const file = files.find((entry) => entry.path === candidate);
      expect(file).toMatchObject({ exists: false, source: "head" });
      expect(file?.lines).toBeGreaterThan(0);
      const checks = report.checks as readonly { readonly id: string }[];
      expect(checks.some((check) => check.id === `r8:missing:${candidate}`)).toBe(false);
    } finally {
      renameSync(held, absolute);
    }
  }, 180_000);

  it("keeps a deletion proof reproducible after the deletion commit", () => {
    const candidate = "packages/assets/src/AssetBundleCacheFixtures.ts";
    const { report } = run([candidate]);
    const files = report.files as readonly {
      readonly path: string;
      readonly exists: boolean;
      readonly source: string;
      readonly lines: number;
      readonly proseMentionCount: number;
      readonly proseMentions: readonly unknown[];
      readonly proseMentionsTruncated: boolean;
    }[];
    const file = files.find((entry) => entry.path === candidate);
    expect(file).toMatchObject({ exists: false, source: "history" });
    expect(file?.lines).toBeGreaterThan(0);
    expect(file?.proseMentions.length).toBeLessThanOrEqual(25);
    expect(file?.proseMentionCount).toBeGreaterThanOrEqual(file?.proseMentions.length ?? 0);
  }, 180_000);
});

/* ------------------------------------------------------------------------------------------- */
/* Calibration harness (WS-0.2)                                                                 */
/*                                                                                              */
/* The cases above pin behaviour against real repository files. The cases below drive the same    */
/* CLI over *synthetic* files, which is the only way to assert the negative — that the gate does  */
/* not invent a consumer — without depending on the repository happening not to contain one.     */
/*                                                                                              */
/* The scratch directory lives inside the repo because the gate only scans repository            */
/* directories, but deliberately not under `tests/reports/`, whose paths `classify`              */
/* short-circuits by prefix. `tests/tooling-calibration/` gets no special handling.              */
/* ------------------------------------------------------------------------------------------- */

/*
 * `mkdtempSync` creates the leaf, never the parent.
 *
 * `tests/tooling-calibration/` is not tracked (it holds only scratch directories, all of them
 * removed in `afterAll`) and nothing else creates it, so this file threw
 * `ENOENT ... mkdtemp` at module scope on a clean checkout and vitest reported
 * "Failed Suites 1 / no tests". Every calibration case below — the negative half of the R8
 * gate, the half that proves it does not invent a consumer — was silently not running.
 */
const CALIBRATION_ROOT = join(repoRoot, "tests/tooling-calibration");
mkdirSync(CALIBRATION_ROOT, { recursive: true });
const calibrationScratch = mkdtempSync(join(CALIBRATION_ROOT, "scratch-"));
const calibrationReports: string[] = [];

afterAll(() => {
  rmSync(calibrationScratch, { recursive: true, force: true });
  for (const report of calibrationReports) rmSync(join(repoRoot, report), { force: true });
});

interface CalibrationReport {
  readonly path: string;
  readonly clear: boolean;
  /** Keyed by R8 point; only non-empty keys are present. */
  readonly blocking: Readonly<Record<string, readonly { readonly at: string }[]>>;
}

/**
 * A name that appears nowhere in the repository as a literal — including in this file.
 *
 * The gate scans every file, this one included, so a hard-coded synthetic name would show up as a
 * reference to itself and the assertion would be reading its own source text.
 */
function uniqueName(): string {
  return `calib${randomBytes(6).toString("hex")}`;
}

/** Every blocking point on a report, flattened to `point @ location`. */
function blockingEntries(report: CalibrationReport | undefined): readonly string[] {
  return Object.entries(report?.blocking ?? {}).flatMap(([point, entries]) => entries.map((entry) => `${point} @ ${entry.at}`));
}

/** Run the real gate over `candidates` and return its per-file reports. */
function runGate(candidates: readonly string[]): readonly CalibrationReport[] {
  const reportPath = join("tests/reports", `${uniqueName()}.json`);
  calibrationReports.push(reportPath);
  try {
    execFileSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/deletion-safety/index.ts", ...candidates, "--report", reportPath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch {
    // A blocked candidate exits non-zero by design; the report is still written.
  }
  const parsed = JSON.parse(readFileSync(join(repoRoot, reportPath), "utf8")) as { readonly files: readonly CalibrationReport[] };
  return parsed.files;
}

/** Write a file under the calibration scratch directory and return its repo-relative path. */
function write(name: string, contents: string): string {
  const absolute = join(calibrationScratch, name);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, contents);
  return relative(repoRoot, absolute);
}

describe("R8 deletion safety — blocks real dependencies", () => {
  it("blocks a module that a runtime file imports by path", () => {
    const moduleName = uniqueName();
    const target = write(`${moduleName}.ts`, `export function widget(): number {\n  return 1;\n}\n`);
    write(
      `${uniqueName()}.ts`,
      `import { widget } from "./${moduleName}";\nexport const used = widget();\n`
    );

    const [report] = runGate([target]);
    expect(report?.clear).toBe(false);
    expect(blockingEntries(report).some((entry) => entry.startsWith("runtime-consumer"))).toBe(true);
  });

  it("blocks a module whose exported symbol is re-exported by a registry that never names the file", () => {
    const moduleName = uniqueName();
    const symbol = uniqueName();
    const target = write(`${moduleName}.ts`, `export const ${symbol} = { role: "fixture" };\n`);
    write(`${uniqueName()}.ts`, `export { ${symbol} } from "./${moduleName}";\n`);

    const [report] = runGate([target]);
    expect(report?.clear).toBe(false);
  });
});

describe("R8 deletion safety — argument handling", () => {
  it("ignores the pnpm `--` separator instead of treating it as a candidate", () => {
    /*
     * `pnpm check:deletion-safety -- a.ts` forwards `--` through to the tool. It was pushed onto the
     * candidate list, so every scripted invocation reported an extra
     * `BLOCKED  -- ... already gone` row and exited non-zero regardless of the real verdicts. The
     * WS-3.5 re-run surfaced this: 30 genuine results arrived alongside one phantom failure for a
     * file nobody named.
     */
    const target = write(`${uniqueName()}.ts`, `export const ${uniqueName()} = 1;\n`);
    const reports = runGate(["--", target]);
    expect(reports.map((report) => report.path)).toEqual([target]);
    expect(reports[0]?.clear).toBe(true);
  });
});

describe("R8 deletion safety — does not manufacture dependencies", () => {
  it("clears a prose file that merely contains pasted source code", () => {
    // The exact defect that reported 111 references to logs.txt: a transcript is not a module, so
    // `export function frame()` inside it is not an export *of* the transcript. Every identifier
    // pasted below also exists as a real export elsewhere in the repository.
    const target = write(
      `${uniqueName()}.txt`,
      [
        "session log 2026-08-05",
        "",
        "  export function frame(index) {",
        "    return index + 1;",
        "  }",
        "",
        "  export const resolve = () => null;",
        "  export { create, analyze };",
        ""
      ].join("\n")
    );

    const [report] = runGate([target]);
    expect(blockingEntries(report)).toEqual([]);
    expect(report?.clear).toBe(true);
  });

  it("clears a module whose exported name collides with an identifier bound from elsewhere", () => {
    const target = write(`${uniqueName()}.ts`, `export function frame(): number {\n  return 0;\n}\n`);
    write(
      `${uniqueName()}.ts`,
      `import { frame } from "./${uniqueName()}";\nexport const value = frame();\n`
    );

    const [report] = runGate([target]);
    expect(blockingEntries(report)).toEqual([]);
    expect(report?.clear).toBe(true);
  });

  it("clears a file whose only mention is prose in a Markdown document", () => {
    const moduleName = uniqueName();
    const target = write(`${moduleName}.ts`, `export const ${uniqueName()} = 7;\n`);
    write(`${uniqueName()}.md`, `We should delete \`${moduleName}.ts\` at some point.\n`);

    const [report] = runGate([target]);
    expect(blockingEntries(report)).toEqual([]);
    expect(report?.clear).toBe(true);
  });
});
