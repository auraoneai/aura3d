import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

/**
 * WS-1.6 — R1 enforcement, and specifically the two ways this tool could be quietly defanged.
 *
 * It has to reject a deep import, and it has to accept all four legitimate evidence shapes. Getting
 * either wrong makes it worthless in opposite directions: too strict and people add decorative
 * imports to satisfy it; too loose and it green-lights internals-only tests as parity evidence.
 */
const MAP_PATH = "tools/claim-lineage/production-path-tests.json";
const REPORT_PATH = "tests/reports/claim-lineage.json";
const original = readFileSync(MAP_PATH, "utf8");

function run(): { readonly status: number; readonly report: Record<string, any> } {
  let status = 0;
  try {
    execFileSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/claim-lineage/index.ts"], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    status = (error as { readonly status?: number }).status ?? 1;
  }
  return { status, report: JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Record<string, any> };
}

afterEach(() => {
  writeFileSync(MAP_PATH, original);
});

describe("claim lineage (R1)", () => {
  it("passes on the committed map, with every non-gap row resolved", () => {
    const { status, report } = run();
    expect(status).toBe(0);
    expect(report.totals.withoutLineage).toBe(0);
    expect(report.totals.withLineage).toBe(report.totals.requiringLineage);
  }, 180_000);

  it("exempts gap rows rather than demanding a test that proves absence", () => {
    /*
     * Asserted as a general rule rather than against a named capability.
     *
     * This test used to pin "context loss recovery" as the example gap. WS-2.6 closed that row, so the
     * assertion started failing for a *good* reason — the capability now exists. A test that has to be
     * edited every time a gap is closed is measuring the wrong thing: what matters is that whatever is
     * currently a gap is exempt, and that every non-gap row still needs lineage.
     */
    const { report } = run();
    expect(report.gapRowsExempt).toContain("incoherent");
    const rows = report.rows as { readonly capability: string; readonly parityStatus: string }[];
    expect(rows.every((row) => row.parityStatus !== "gap"), "no gap row may appear in the lineage-required set").toBe(true);
    expect(report.totals.requiringLineage + report.totals.gapRowsExemptCount).toBe(report.totals.rows);
  }, 180_000);

  it("rejects a capability with no named production-path test", () => {
    const map = JSON.parse(original) as { productionPathTests: Record<string, string> };
    delete map.productionPathTests.materials;
    writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
    const { status, report } = run();
    expect(status).not.toBe(0);
    expect((report.unresolvedCapabilities as string[])).toContain("materials");
    const row = (report.rows as any[]).find((entry) => entry.capability === "materials");
    expect(row.statusUnderR1).toBe("unproven");
  }, 180_000);

  it("rejects evidence that reaches Aura3D only by deep import", () => {
    /*
     * The sabotage that mattered. platformer-jump-intent.test.ts imports
     * packages/engine/src/agent-api/PlatformerMotion and nothing public. An earlier version RESOLVED it,
     * because the walk stepped into PlatformerMotion.ts and kept going until some transitively
     * reachable internal file mentioned a public specifier — which every deep import would do, since
     * all internals are connected. The walk now stops at the package barrel.
     */
    const map = JSON.parse(original) as { productionPathTests: Record<string, string> };
    map.productionPathTests.materials = "tests/unit/physics/platformer-jump-intent.test.ts";
    writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
    const { status, report } = run();
    expect(status).not.toBe(0);
    const row = (report.rows as any[]).find((entry) => entry.capability === "materials");
    expect(row.lineageResolved).toBe(false);
    expect(row.reason).toContain("deep import");
  }, 180_000);

  it("rejects evidence that imports no Aura3D at all", () => {
    // webgl-input-audio.spec.ts tests that Chromium implements WebGL2 and pointer events.
    const map = JSON.parse(original) as { productionPathTests: Record<string, string> };
    map.productionPathTests.lights = "tests/browser/webgl-input-audio.spec.ts";
    writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
    const { status, report } = run();
    expect(status).not.toBe(0);
    const row = (report.rows as any[]).find((entry) => entry.capability === "lights");
    expect(row.lineageResolved).toBe(false);
  }, 180_000);

  it("accepts a relative import of a package barrel as the public entry", () => {
    /*
     * `../../../packages/physics/src` and `@aura3d/physics` are the same module: src/index.ts is what
     * package.json exports points at once built. Rejecting the relative spelling would fail honest
     * unit tests, while accepting `src/SomeFile` would accept anything — the barrel is the line.
     */
    const map = JSON.parse(original) as { productionPathTests: Record<string, string> };
    map.productionPathTests["rigid bodies"] = "tests/unit/physics/mesh-surface-query.test.ts";
    writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
    const { report } = run();
    const row = (report.rows as any[]).find((entry) => entry.capability === "rigid bodies");
    expect(row.lineageResolved).toBe(true);
    expect(row.publicEntry).toContain("@aura3d/physics");
  }, 180_000);

  it("resolves all four documented evidence shapes across the committed map", () => {
    const { report } = run();
    const shapes = new Set((report.rows as { readonly evidenceShape: string | null }[]).map((row) => row.evidenceShape));
    // The map exercises at least direct-test-import and harness-import; a browser spec that reaches
    // the engine only by navigating to a served harness page must resolve as harness-import.
    expect(shapes.has("direct-test-import")).toBe(true);
    expect(shapes.has("harness-import")).toBe(true);
    expect(report.evidenceShapes).toHaveLength(4);
  }, 180_000);

  it("reports the corrected morph-targets generator fault", () => {
    const { report } = run();
    const fault = (report.generatorFaults as any[]).find((entry) => entry.capability === "morph targets");
    expect(fault.stillPresent).toBe(false);
  }, 180_000);
});
