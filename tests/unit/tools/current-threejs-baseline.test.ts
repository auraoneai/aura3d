import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current Three.js baseline", () => {
  it("keeps every active comparison input on the frozen current target", () => {
    const output = execFileSync("node", ["tools/current-threejs-baseline/index.mjs", "--gate-only"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    const report = JSON.parse(output) as {
      pass: boolean;
      historicalVersion: string;
      currentInputs: Record<string, string | null>;
      failures: string[];
    };

    expect(report.failures).toEqual([]);
    expect(report.pass).toBe(true);
    expect(report.historicalVersion).toBe("0.165.0");
    expect(report.currentInputs.context).toBe("0.185.1");
    expect(report.currentInputs.rootThree).toBe("0.185.1");
    expect(report.currentInputs.benchmarkThree).toBe("0.185.1");
  });

  it("keeps the old context explicitly historical", () => {
    const source = readFileSync("benchmark/context/threejs/README.md", "utf8");
    expect(source).toContain("historical frozen fixture");
    expect(source).toContain("threejs-r185.1-20260808.json");
  });
});
