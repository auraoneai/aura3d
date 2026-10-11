/**
 * generate-r185-golden.spec.ts — PRD-04 §14 P1-3 (04-P1-3): regenerate
 * `tests/qr/prd04/fixtures/bsdf/r185-golden.json` from a remote browser run.
 *
 * The page (`r185-golden.ts`) compiles three's own `THREE.ShaderChunk` GLSL in
 * the C-02 ChunkHarness and evaluates the 20 cases on the 16×16×8 grid into
 * RGBA32F. This spec writes the result to
 *   tests/reports/prd04/r185-golden/r185-golden.json
 * which the lane workflow uploads as the `prd04-r185-golden` artifact. It
 * never writes the fixture: a maintainer commits the artifact from a main run
 * (citing the run id) on a three version bump.
 *
 * Pass: all 20 cases compile in ChunkHarness and in the evaluation program,
 * and each case has exactly `total × out` values. The drift of the committed
 * fixture against the regenerated golden is recorded on
 * `r185-golden-drift.json` (data for the regeneration decision, not a gate).
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

interface GoldenCase {
  fn: string;
  out: number;
  argorder: string[];
  axes: Record<string, number[]>;
  values: (number | null)[];
}

const OUT_DIR = resolve("tests/reports/prd04/r185-golden");
const FIXTURE = resolve("tests/qr/prd04/fixtures/bsdf/r185-golden.json");

test.describe("PRD-04 r185 golden generator (P1-3)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("THREE.ShaderChunk compiles in ChunkHarness and the 16x16x8 golden is written as an artifact", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd04/browser/r185-golden.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => ["ready", "error"].includes((window as any).__A3D_PRD04_R185_GOLDEN__?.status),
      undefined,
      { timeout: 120_000 }
    );
    const result = await page.evaluate(() => (window as any).__A3D_PRD04_R185_GOLDEN__);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      resolve(OUT_DIR, "r185-golden-report.json"),
      `${JSON.stringify({
        status: result?.status,
        error: result?.error,
        renderer: result?.renderer,
        glVersion: result?.glVersion,
        threeRevision: result?.threeRevision,
        githubRunId: process.env.GITHUB_RUN_ID ?? null,
        sha: process.env.GITHUB_SHA ?? null,
        cases: result?.report
      }, null, 2)}\n`
    );
    expect(result?.status, result?.error).toBe("ready");

    const golden = result.golden as { meta: Record<string, unknown>; cases: GoldenCase[] };
    golden.meta.githubRunId = process.env.GITHUB_RUN_ID ?? null;
    golden.meta.sha = process.env.GITHUB_SHA ?? null;
    writeFileSync(resolve(OUT_DIR, "r185-golden.json"), JSON.stringify(golden, null, 1));

    const report = result.report as { fn: string; harnessCompileOk: boolean; compileOk: boolean; log: string; total: number }[];
    expect(report.map((r) => r.fn)).toHaveLength(20);
    for (const r of report) {
      expect(r.harnessCompileOk, `${r.fn}: THREE.ShaderChunk functions compile in ChunkHarness\n${r.log}`).toBe(true);
      expect(r.compileOk, `${r.fn}: evaluation program compiles and links\n${r.log}`).toBe(true);
    }
    expect(golden.cases).toHaveLength(20);
    for (const c of golden.cases) {
      const total = c.argorder.reduce((acc, k) => acc * c.axes[k]!.length, 1);
      expect(c.values, `${c.fn}: total x out values`).toHaveLength(total * c.out);
    }

    // Drift of the committed (python/llvmpipe) fixture vs this regenerated golden.
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as { meta: unknown; cases: GoldenCase[] };
    const drift = golden.cases.map((c) => {
      const old = fixture.cases.find((x) => x.fn === c.fn);
      if (!old || old.values.length !== c.values.length) {
        return { fn: c.fn, comparable: false };
      }
      let maxAbs = 0;
      let maxRel = 0;
      let nullMismatch = 0;
      for (let i = 0; i < c.values.length; i++) {
        const a = c.values[i];
        const b = old.values[i];
        if (a === null || b === null) {
          if (a !== b) nullMismatch++;
          continue;
        }
        const abs = Math.abs(a - b);
        maxAbs = Math.max(maxAbs, abs);
        maxRel = Math.max(maxRel, abs / Math.max(Math.abs(b), 1e-6));
      }
      return { fn: c.fn, comparable: true, maxAbs, maxRel, nullMismatch };
    });
    writeFileSync(
      resolve(OUT_DIR, "r185-golden-drift.json"),
      `${JSON.stringify({ fixture: "tests/qr/prd04/fixtures/bsdf/r185-golden.json", fixtureMeta: fixture.meta, drift }, null, 2)}\n`
    );
  });
});
