import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WS-1.4 — guards the properties that make this benchmark admissible under R1, so a future edit
 * cannot quietly turn it back into the instrument it replaced.
 *
 * The two things it replaced were a Canvas 2D test returning `cpuFrameMs: 13.8` as a source constant,
 * and a raw-WebGL2 triangle benchmark that imported none of the engines it claimed to compare. Both
 * would have passed a "does a report exist" check, which is why these assertions are about *how* the
 * numbers were produced.
 */
const toolSource = readFileSync("tools/production-path-benchmark/index.ts", "utf8");
const sceneSource = readFileSync("tools/production-path-benchmark/scene.ts", "utf8");
const reportPath = "tests/reports/production-path-benchmark.json";

describe("production-path benchmark source (R1 admissibility)", () => {
  it("imports both engines through public entry points only", () => {
    expect(toolSource).toContain('from "@aura3d/engine"');
    expect(toolSource).toContain('import * as THREE from "three"');
    // A deep import would reach internals and satisfy nothing under R1.
    expect(toolSource).not.toMatch(/@aura3d\/[a-z-]+\/src\//);
    expect(toolSource).not.toMatch(/\.\.\/\.\.\/packages\//);
  });

  it("never draws through a 2D context", () => {
    /*
     * `getContext("2d")` appears exactly once, in the pixel-verification helper that reads the
     * WebGL canvas back to count non-blank pixels. It must never be a render target.
     */
    const occurrences = toolSource.match(/getContext\("2d"\)/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(toolSource).toContain("countNonBlankPixels");
    expect(toolSource).not.toMatch(/fillRect\(/);
  });

  it("reports no hardcoded frame time or draw-call constant", () => {
    /*
     * The deleted spec returned drawCalls and cpuFrameMs as literal object values. Checked against
     * executable lines only: the tool's own comments quote those literals as the thing being
     * replaced, and a check that forbade naming the defect would push the explanation out of the
     * file where the next reader needs it.
     */
    const executable = toolSource
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
      })
      .join("\n");
    expect(executable).not.toMatch(/cpuFrameMs:\s*\d/);
    expect(executable).not.toMatch(/drawCalls:\s*\d/);
    expect(executable).not.toMatch(/steadyStateFrameMs:\s*\d/);
    expect(executable).not.toMatch(/gpuTimerQueryMs:\s*\d/);
  });

  it("only labels a value GPU time when it came from a timer query", () => {
    expect(toolSource).toContain("EXT_disjoint_timer_query_webgl2");
    expect(toolSource).toContain("GPU_DISJOINT_EXT");
    expect(toolSource).toContain("gpuTimerQueryUnavailableReason");
    // Never substitute CPU time behind a GPU-labelled field.
    expect(toolSource).not.toMatch(/gpuTimerQueryMs\s*[:=]\s*cpu/i);
  });

  it("declares the scene once so both engines draw identical content", () => {
    expect(sceneSource).toContain("PRODUCTION_PATH_BENCHMARK_SCENE");
    expect(sceneSource).toContain("pixelRatio: 1");
    expect(sceneSource).toMatch(/warmupFrames:\s*\d+/);
    expect(sceneSource).toMatch(/measuredFrames:\s*\d+/);
  });

  it("runs at least three sessions and reports variance", () => {
    expect(toolSource).toMatch(/const SESSIONS = [3-9]/);
    expect(toolSource).toContain("stddev");
  });
});

describe("production-path benchmark report", () => {
  it("records both engines, the device, and the timing taxonomy", () => {
    if (!existsSync(reportPath)) {
      // The report is a generated artifact under gitignored tests/reports/. Absence is not a source
      // defect; `pnpm bench:production-path` regenerates it, and check:production-path-benchmark
      // fails when it is missing.
      return;
    }
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, any>;
    expect(report.schema).toBe("a3d-production-path-benchmark");
    for (const engine of ["aura3d", "threejs"] as const) {
      expect(report[engine].steadyStateFrameMs).toBeGreaterThan(0);
      expect(report[engine].runtimeStartupToFirstFrameMs.median).toBeGreaterThan(0);
      expect(report[engine].runtimeStartupToFirstFrameMs.sampleCount).toBeGreaterThanOrEqual(3);
      expect(report[engine].sessions.length).toBeGreaterThanOrEqual(3);
      for (const session of report[engine].sessions) {
        expect(session.realWebGL2).toBe(true);
        expect(session.nonBlankPixels).toBeGreaterThan(1_000);
        expect(session.startupFrameNonBlankPixels).toBeGreaterThan(1_000);
      }
      // A GPU number must be accompanied by a query, or be null with a reason.
      if (report[engine].gpuTimerQueryMs === null) {
        expect(typeof report[engine].gpuTimerQueryUnavailableReason).toBe("string");
      }
    }
    expect(report.environment.gpuRenderer).toBeTruthy();
    expect(typeof report.environment.softwareRasterizer).toBe("boolean");
    expect(report.measurementTaxonomy.steadyStateFrameMs).toContain("Median");
  });
});
