import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * WS-0.2 — the deletion-safety tool is only useful if it *blocks* a file that is genuinely unsafe
 * to delete. A tool that clears a known-unsafe file is worse than no tool, because it converts a
 * missing check into a false assurance. `OceanFixtures.ts` is the canonical case: revision 1 of the
 * 1.6 PRD listed it for bulk deletion, and `EnvironmentPlatform.ts` imports it.
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
    const { status, report } = run(["packages/rendering/src/OceanFixtures.ts"]);
    expect(status).not.toBe(0);
    expect(report.pass).toBe(false);
    const files = report.files as readonly { readonly path: string; readonly clear: boolean; readonly blocking: Record<string, readonly { readonly at: string }[]> }[];
    const ocean = files.find((file) => file.path.endsWith("OceanFixtures.ts"));
    expect(ocean?.clear).toBe(false);
    /*
     * The blocking evidence is the package's own public re-export. `packages/rendering/src/index.ts`
     * has `export { sampleOceanFixture } from "./OceanFixtures"`, so deleting the file breaks the
     * published `@aura3d/rendering` surface. That is a real `export`-map dependency and it is what
     * the R8 gate exists to catch.
     */
    const runtime = ocean?.blocking["runtime-consumer"] ?? [];
    expect(runtime.some((evidence) => evidence.at.startsWith("packages/rendering/src/index.ts:"))).toBe(true);
  }, 180_000);

  it("does not block on a specifier named inside a plain string", () => {
    /*
     * Regression pin. `EnvironmentPlatform.ts:304` contains the capability-description string
     * "OceanFixtures and waterSystems provide Gerstner/procedural water telemetry." — English prose
     * in a quoted claim, not an import. An earlier version of this tool reported it as a
     * `runtime-consumer`, and this test asserted that false positive as its proof of correctness.
     *
     * That is the failure mode R8 is most vulnerable to: fabricated blocking evidence blocks a
     * legitimate deletion on a dependency that does not exist, and it does so while looking
     * rigorous. A gate that invents blockers gets routed around, exactly like the fabricated
     * performance gates this re-platform removed.
     */
    const { report } = run(["packages/rendering/src/OceanFixtures.ts"]);
    const files = report.files as readonly { readonly path: string; readonly blocking: Record<string, readonly { readonly at: string }[]> }[];
    const ocean = files.find((file) => file.path.endsWith("OceanFixtures.ts"));
    const everyBlocker = Object.values(ocean?.blocking ?? {}).flat();
    expect(everyBlocker.length).toBeGreaterThan(0);
    expect(everyBlocker.some((evidence) => evidence.at.includes("EnvironmentPlatform.ts"))).toBe(false);
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
     * The tool's own source comment names `test-utils/src/index.ts`. An early version classified
     * that as a runtime consumer and blocked on itself, which is unclearable. Prose is reported so
     * stale references get tidied, but it does not gate a deletion.
     */
    const { report } = run(["packages/rendering/src/OceanFixtures.ts"]);
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
    const candidates = ["packages/rendering/src/OceanFixtures.ts", "packages/ecs/src/Bitset.ts"];
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
      const ocean = files.find((file) => file.path.endsWith("OceanFixtures.ts"));
      expect((ocean?.blocking["runtime-consumer"] ?? []).some((evidence) => evidence.at.startsWith("packages/rendering/src/index.ts:"))).toBe(true);
    } finally {
      rmSync(join(repoRoot, manifestPath), { force: true });
    }
  }, 180_000);

  it("fails when asked to prove a deletion of a file that does not exist", () => {
    const { status, report } = run(["packages/rendering/src/DefinitelyNotAFile.ts"]);
    expect(status).not.toBe(0);
    const failures = report.failures as readonly string[];
    expect(failures.some((failure) => failure.includes("already gone"))).toBe(true);
  }, 180_000);
});
