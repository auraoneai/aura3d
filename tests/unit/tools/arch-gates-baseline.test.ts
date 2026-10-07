import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectBaselineMetrics, subpathSourceFile, writePhase0Baseline } from "../../../tools/arch-gates/baseline.js";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "arch-baseline-"));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      exports: {
        ".": "./dist/eng/index.js",
        "./leaf": { import: "./dist/leaf/index.js", types: "./dist/leaf/index.d.ts" }
      },
      scripts: { build: "tsc", test: "vitest", lint: "eslint ." }
    })
  );
  mkdirSync(join(root, "packages/eng/src"), { recursive: true });
  mkdirSync(join(root, "packages/leaf/src"), { recursive: true });
  mkdirSync(join(root, "packages/engine/src/agent-api"), { recursive: true });
  mkdirSync(join(root, "tools/example"), { recursive: true });
  writeFileSync(join(root, "packages/eng/src/index.ts"), "export const alpha = 1;\nexport function beta(): number { return 2; }\nexport * from \"../../leaf/src/index.js\";\n");
  writeFileSync(join(root, "packages/leaf/src/index.ts"), "export const gamma = 3;\nexport interface Delta { readonly id: string; }\nexport const orphan = 0;\nexport const unused = true;\n");
  writeFileSync(join(root, "packages/eng/src/stale.d.ts.map"), "{}");
  writeFileSync(join(root, "packages/engine/src/agent-api/index.ts"), "a\nb\nc\n");
  writeFileSync(join(root, "packages/engine/src/index.ts"), "export const engineOnly = 1;\nexport const engineExtra = 2;\n");
  writeFileSync(join(root, "tools/example/keep.ts"), "export {};\n");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("arch-gates baseline", () => {
  it("maps dist export specifiers to package source entries", () => {
    expect(subpathSourceFile("/r", "./dist/engine/agent-api/index.js")).toBe("/r/packages/engine/src/agent-api/index.ts");
    expect(subpathSourceFile("/r", "./dist/assets/browser-index.js")).toBe("/r/packages/assets/src/browser-index.ts");
    expect(subpathSourceFile("/r", "not-a-dist-path")).toBeNull();
  });

  it("collects the fixture metrics (2 subpaths, 3 scripts)", () => {
    const root = fixtureRoot();
    const metrics = collectBaselineMetrics(root);
    expect(metrics.subpathCount).toBe(2);
    expect(metrics.scriptCount).toBe(3);
    expect(metrics.toolDirCount).toBe(1);
    expect(metrics.orphanSourceMapCount).toBe(1);
    expect(metrics.agentApiIndexLines).toBe(4);
    // eng/index.ts: alpha, beta + re-exported gamma, Delta (export *), orphan, unused
    expect(metrics.exportCounts["."]).toBe(6);
    // leaf/index.ts: gamma, Delta, orphan, unused
    expect(metrics.exportCounts["./leaf"]).toBe(4);
    // engine/src/index.ts: engineOnly, engineExtra
    expect(metrics.engineIndexExportCount).toBe(2);
  });

  it("writes phase0.json preserving existing keys", () => {
    const root = fixtureRoot();
    const evidenceDir = join(root, "docs/project/aura3d-quality-rebuild/evidence/prd15/baselines");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, "phase0.json"), JSON.stringify({ $schema: "ledger", ic0Runs: { sentinel: 1 } }));
    const path = writePhase0Baseline(root, collectBaselineMetrics(root));
    const written = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(written["$schema"]).toBe("ledger");
    expect(written["ic0Runs"]).toEqual({ sentinel: 1 });
    expect(written["subpathCount"]).toBe(2);
    expect(written["scriptCount"]).toBe(3);
    expect(written["orphanSourceMapCount"]).toBe(1);
    expect(written["agentApiIndexLines"]).toBe(4);
    expect(typeof written["metricsGeneratedUtc"]).toBe("string");
  });
});
