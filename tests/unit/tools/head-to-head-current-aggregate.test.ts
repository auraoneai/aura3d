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
      expect((report[category] as unknown[]).length, `${category} must not be silently empty`).toBeGreaterThan(0);
    }
  });
});
