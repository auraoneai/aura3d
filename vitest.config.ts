import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

type ResolutionRow = readonly [string, string, unknown?];
const registry = JSON.parse(readFileSync(new URL("./aura.exports.json", import.meta.url), "utf8")) as {
  paths: ResolutionRow[];
};
// Longest aliases go first so an exact subpath cannot be shadowed by its root.
// Wildcard-only TypeScript mappings have no equivalent as Vite string aliases.
export const sourceAliases = registry.paths
  .filter(([specifier, target]) => !specifier.includes("*") && !target.includes("*"))
  .map(([find, target]) => ({ find, replacement: fileURLToPath(new URL(`./${target}`, import.meta.url)) }))
  .sort((a, b) => b.find.length - a.find.length);

/** Largest per-test timeout a file declares as `}, <ms>)` (0 when none); reading only orders files, it never filters. */
function declaredTimeoutMs(file: string): number {
  let source: string;
  try { source = readFileSync(file, "utf8"); } catch { return 0; }
  let max = 0;
  for (const match of source.matchAll(/\},\s*(\d[\d_]{5,})\s*\)/g)) max = Math.max(max, Number(match[1]!.replaceAll("_", "")));
  return max;
}

/**
 * Vitest's default order on a cold cache is "largest file first", so a tiny file that runs a 10-minute simulation
 * (slingshot-siege/autoplay-campaign-*.test.ts: 22 lines, ~600 s on the 2 vCPU ACR runner) starts last and the shard
 * blows its 1620 s stage budget (5.6.0 run 002, unit 1/6: campaign slices 1 and 3 hash into the same shard and were
 * still running at the limit). Files that declare a per-test timeout of 5 minutes or more start first, longest first;
 * everything else keeps the default order. Order only: every file still runs.
 */
class LongRunningFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    const budget = new Map(sorted.map((spec) => [spec, declaredTimeoutMs(spec.moduleId)] as const));
    const long = sorted.filter((spec) => budget.get(spec)! >= 300_000).sort((a, b) => budget.get(b)! - budget.get(a)!);
    return [...long, ...sorted.filter((spec) => budget.get(spec)! < 300_000)];
  }
}

export default defineConfig({
  test: {
    environment: "node",
    // Source-pass runs (ACR, 2 vCPU) are 5-10x slower than a laptop; the 5 s default flaked on heavy simulations
    // (certified rigs, 24-match stall probes). Local runs keep the strict default.
    testTimeout: process.env.AURA3D_SOURCE_MANIFEST ? 60_000 : 5_000,
    hookTimeout: process.env.AURA3D_SOURCE_MANIFEST ? 60_000 : 10_000,
    // `tests/assets/**` is a vitest suite that the 3.0.1 obligation ledger names as
    // production-path evidence (for example tests/assets/gltf-extension-support.test.ts for
    // M1). It was absent from `include`, so passing such a file on the command line matched
    // nothing: vitest treats positional arguments as filters against `include`, reported
    // "No test files found", and existing scripts silently ran fewer files than they named
    // (animation-runtime:unit:raw named three files and executed two).
    // `tests/qr/**` unit specs follow the same rule (PRD-06 T0.9a
    // `tests/qr/prd06/unit/`); browser specs under `tests/qr/*/browser/` are
    // playwright `.spec.ts` files and stay outside the glob.
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/assets/**/*.test.ts",
      "tests/qr/**/*.test.ts"
    ],
    setupFiles: [],
    sequence: { sequencer: LongRunningFirstSequencer },
    // Workspace packages publish `exports` to ./dist, which does not exist in a
    // source checkout; externalizing them would bypass the resolve.alias entries
    // below that map every @aura3d specifier to src/. Inline so aliases win.
    server: { deps: { inline: [/^@aura3d\//, /^@aura3d$/] } },
    coverage: {
      reporter: ["text", "json"]
    }
  },
  // Read the same canonical rows as the resolution generator. Resolve source
  // tests against Node-safe sources; browser variants are for Vite builds.
  // All source packages and React DOM must share one React instance. Vite
  // applies dedupe to package subpaths as well, including react/jsx-runtime.
  resolve: { alias: sourceAliases, dedupe: ["react", "react-dom"] }
});
