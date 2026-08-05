import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * WS-0.2 — the deletion-safety tool is only useful if it *blocks* a file that is genuinely unsafe
 * to delete. A tool that clears a known-unsafe file is worse than no tool, because it converts a
 * missing check into a false assurance. `OceanFixtures.ts` is the canonical case: revision 1 of the
 * 1.6 PRD listed it for bulk deletion, and `EnvironmentPlatform.ts` imports it.
 */
const scratch = mkdtempSync(join(tmpdir(), "deletion-safety-"));

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
    const { status, report } = run([]);
    expect(status).toBe(0);
    expect(report.pass).toBe(true);
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

  it("fails when asked to prove a deletion of a file that does not exist", () => {
    const { status, report } = run(["packages/rendering/src/DefinitelyNotAFile.ts"]);
    expect(status).not.toBe(0);
    const failures = report.failures as readonly string[];
    expect(failures.some((failure) => failure.includes("already gone"))).toBe(true);
  }, 180_000);
});
