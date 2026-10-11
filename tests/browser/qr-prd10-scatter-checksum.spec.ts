import { resolve } from "node:path";
import { build } from "esbuild";
import { test, expect } from "@playwright/test";
import {
  PRD10_FOREST_WIND_CHECKSUM,
  PRD10_FOREST_WIND_INSTANCES,
  PRD10_FOREST_WIND_SCATTER,
  PRD10_MEADOW_CHECKSUM,
  PRD10_MEADOW_SCATTER
} from "../../benchmarks/quality-rebuild/scenes/prd10/forest-scatter";
import { worldScatter } from "../../packages/engine/src/agent-api/world/scatter";

/**
 * PRD-10 S5 — scatter determinism across runtimes. The production planner
 * (`world.scatter`, `packages/engine/src/agent-api/world/scatter.ts`) is
 * bundled from source for the browser and evaluated inside Chromium on the
 * `prd10-forest-wind` rules (seed 103). Its SHA-256 placement checksum must
 * equal the Node value pinned in `prd10-scatter.test.ts` across 3 runs and
 * under evaluation-order permutations (forest → meadow → forest, meadow →
 * forest). Pure CPU: no GPU or skip path.
 */

let bundle = "";

test.beforeAll(async () => {
  const root = resolve("."); // playwright runs from the repo root
  const out = await build({
    stdin: {
      contents: [
        `import { worldScatter } from "./packages/engine/src/agent-api/world/scatter";`,
        `globalThis.__prd10Scatter = (o) => { const r = worldScatter(o); return { checksum: r.checksum, instanceCount: r.instanceCount, perAsset: r.perAsset }; };`
      ].join("\n"),
      resolveDir: root,
      loader: "ts"
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    // Source, not dist: the spec must exercise the same TS the Node pin runs.
    alias: { "@aura3d/rendering/world": resolve(root, "packages/rendering/src/world/index.ts") },
    logLevel: "error"
  });
  bundle = out.outputFiles[0]!.text;
});

interface PageResult {
  readonly checksum: string;
  readonly instanceCount: number;
  readonly perAsset: Record<string, number>;
}

test("S5: browser scatterChecksum == Node pin for prd10-forest-wind (3 runs, order permutations)", async ({ page }) => {
  await page.goto("about:blank");
  await page.addScriptTag({ content: bundle });
  const runs = await page.evaluate(({ forest, meadow }) => {
    const run = (globalThis as unknown as { __prd10Scatter: (o: unknown) => PageResult }).__prd10Scatter;
    const out: { order: string; forest: PageResult; meadow?: PageResult }[] = [];
    out.push({ order: "forest", forest: run(forest) });
    const m1 = run(meadow);
    out.push({ order: "meadow→forest", meadow: m1, forest: run(forest) });
    const f3 = run(forest);
    out.push({ order: "forest→meadow", forest: f3, meadow: run(meadow) });
    return { out, ua: navigator.userAgent };
  }, { forest: PRD10_FOREST_WIND_SCATTER, meadow: PRD10_MEADOW_SCATTER });

  // Node twin evaluated in this same process (not just the pinned constant).
  const node = worldScatter(PRD10_FOREST_WIND_SCATTER as never);
  expect(node.checksum).toBe(PRD10_FOREST_WIND_CHECKSUM);

  expect(runs.out).toHaveLength(3);
  for (const r of runs.out) {
    expect(r.forest.instanceCount, `forest count (${r.order})`).toBe(PRD10_FOREST_WIND_INSTANCES);
    expect(r.forest.checksum, `forest checksum (${r.order})`).toBe(PRD10_FOREST_WIND_CHECKSUM);
    expect(r.forest.perAsset).toEqual(node.perAsset);
    if (r.meadow) expect(r.meadow.checksum, `meadow checksum (${r.order})`).toBe(PRD10_MEADOW_CHECKSUM);
  }
  test.info().annotations.push({
    type: "S5",
    description: `forest-wind seed 103: ${PRD10_FOREST_WIND_INSTANCES} instances, sha256 ${PRD10_FOREST_WIND_CHECKSUM} (Node == ${runs.ua})`
  });
});
