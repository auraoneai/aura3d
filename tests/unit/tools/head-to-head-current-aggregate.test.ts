import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current Three.js head-to-head aggregate", () => {
  it("emits bounded categories without collapsing them into a universal score", () => {
    execFileSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/head-to-head-current-aggregate/index.ts"], { stdio: "pipe" });
    const report = JSON.parse(readFileSync("tests/reports/current-head-to-head/aggregate.json", "utf8")) as Record<string, unknown>;
    expect(report.pass).toBe(true);
    expect(report.comparisonComplete).toBe(false);
    expect(report.universalScore).toBeNull();
    expect(report.workloadCount).toBe(15);
    for (const category of ["wins", "parity", "losses", "unproven", "notComparable"] as const) {
      expect(report[category], `${category} must be retained`).toBeInstanceOf(Array);
      // A category may be empty: requiring a win would manufacture superiority
      // when the current measured workload loses or ties.
    }
    const source = JSON.parse(readFileSync("tests/reports/current-head-to-head/scaffold-to-deploy/aggregate.json", "utf8"));
    const measured = [...report.wins as Array<Record<string, unknown>>, ...report.parity as Array<Record<string, unknown>>, ...report.losses as Array<Record<string, unknown>>].find(entry => entry.scope === "selected scaffold production output size");
    expect(measured).toBeTruthy();
    expect(measured?.aura).toEqual({ javascriptBytes: source.measurements.aura.javascriptBytes, totalBytes: source.measurements.aura.totalDeployBytes });
    expect(measured?.three).toEqual({ javascriptBytes: source.measurements.three.javascriptBytes, totalBytes: source.measurements.three.totalDeployBytes });
  });
});
