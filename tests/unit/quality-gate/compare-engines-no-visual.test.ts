import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T0.8 — the compare-engines report carries no fabricated visual section:
 * no `visual*` keys, no `benchmarkVisualRenders`, no `screenshotDiffs` /
 * `screenshotDiff` entries anywhere in the output JSON. The descriptor-driven
 * box-grid renderer and its diff thresholds were removed in Phase 0; pixel
 * diffs belong to tools/quality-gate on real scene captures.
 */

const root = resolve(__dirname, "../../..");
const FORBIDDEN = /^(visual|.*visual.*|screenshotDiffs?|benchmarkVisualRenders|renderedBenchmarkVisuals)$/i;

function collectForbiddenKeys(value: unknown, path: string, hits: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, `${path}[${index}]`, hits));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.test(key)) hits.push(`${path}.${key}`);
    collectForbiddenKeys(child, `${path}.${key}`, hits);
  }
}

describe("compare-engines output has no visual section (T0.8)", () => {
  it(
    "the generated report JSON contains no visual/screenshot-diff keys",
    () => {
      // The tool's one unconditional input read; tests/reports/ is gitignored
      // generated output, so seeding the minimal shape is honest, not staged.
      const inputPath = resolve(root, "tests/reports/asset-compatibility-threejs.json");
      const seeded = !existsSync(inputPath);
      if (seeded) {
        mkdirSync(dirname(inputPath), { recursive: true });
        writeFileSync(inputPath, `${JSON.stringify({ sourceManifest: {}, summary: {} })}\n`);
      }
      const run = spawnSync(
        "pnpm",
        ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/compare-engines/index.ts"],
        { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240_000 },
      );
      if (seeded) rmSync(inputPath, { force: true });
      if (run.error) throw run.error;
      expect(run.status, `compare-engines exited ${run.status}:\n${run.stderr.slice(-2000)}`).toBe(0);
      const report = JSON.parse(run.stdout) as Record<string, unknown>;
      const hits: string[] = [];
      collectForbiddenKeys(report, "$", hits);
      expect(hits).toEqual([]);
    },
    240_000,
  );
});
