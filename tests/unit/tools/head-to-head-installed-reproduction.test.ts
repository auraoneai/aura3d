import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("exact-installed head-to-head reproduction", () => {
  it("produces every aggregate prerequisite inside the clean lifecycle", () => {
    const source = readFileSync("tools/head-to-head-installed-reproduction/index.ts", "utf8");
    const baseline = source.indexOf('run("node", ["tools/current-threejs-baseline/index.mjs"], root);');
    const browser = source.indexOf('run("pnpm", ["exec", "playwright", "test"');
    const aggregate = source.indexOf("for (const tool of aggregateTools)");

    expect(baseline).toBeGreaterThan(-1);
    expect(browser).toBeGreaterThan(baseline);
    expect(aggregate).toBeGreaterThan(browser);
    expect(source).toContain('aggregatePath: "tests/reports/current-head-to-head/aggregate.json"');
  });
});
