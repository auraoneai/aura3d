// PRD-13 T1.12 — lane-13 bundle delta (PRD §16.3). Bundles
// `packages/engine/src/lanes/prd13.ts` with esbuild (minify + gzip) and
// asserts the lane's authored delta stays within budget.
//
// "Delta" = modules lane 13 authored during the Quality Rebuild. Everything
// else reachable from the barrel is external:
//   - the host engine barrel (`agent-api/index.ts`), node builders, contracts
//     and rendering packages;
//   - PR 0b-1 carve-outs (`promptPlan.ts`, `promptRecipes.ts`,
//     `structuralQA.ts`) — pre-existing mass moved out of index.ts, not lane
//     delta (the PRD's 9 KB budget predates their flag-on additions).
//
// Budget: 12 KB gz — the PRD's 9 KB (looks 4 + lint 3 + mappings 2) plus the
// T1.10 v2 pipeline and T1.13 providers, which the original estimate did not
// cover.

import { describe, expect, it } from "vitest";
import { build, type Plugin } from "esbuild";
import { gzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const engineSrc = path.join(repoRoot, "packages/engine/src");
const entry = path.join(engineSrc, "lanes/prd13.ts");

/** Lane-authored modules (the delta). Everything else under packages/engine
 *  is external; bare imports (@aura3d/*, three, node:*) are external too. */
const LANE_MODULE_PREFIXES = [
  path.join(engineSrc, "agent-api/looks/"),
  path.join(engineSrc, "agent-api/nodes/prompt/promptPlanMappings.ts"),
  path.join(engineSrc, "agent-api/nodes/prompt/promptPlanV2.ts"),
  path.join(engineSrc, "lanes/prd13.ts")
];
// PR 0b-1 carve-outs inside lane prefixes are pre-existing engine code, not delta.
const CARVEOUTS = new Set([path.join(engineSrc, "agent-api/looks/structuralQA.ts")]);

function isLaneModule(candidate: string): boolean {
  const resolved = candidate.replace(/\.js$/, ".ts");
  if (CARVEOUTS.has(resolved)) return false;
  return LANE_MODULE_PREFIXES.some(
    (prefix) => resolved === prefix || resolved.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

const laneDeltaPlugin: Plugin = {
  name: "prd13-lane-delta",
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      if (!args.path.startsWith(".")) return { path: args.path, external: true };
      const importerDir = path.dirname(args.importer);
      const base = path.resolve(importerDir, args.path);
      // Resolve like TS: `x.js` → `x.ts`; extensionless → file then index.
      const resolved = /\.(js|mjs|ts)$/.test(args.path)
        ? base.replace(/\.(js|mjs|ts)$/, ".ts")
        : [`${base}.ts`, `${base}/index.ts`].find(existsSync) ?? `${base}.ts`;
      if (isLaneModule(resolved)) return undefined; // bundle it
      return { path: args.path, external: true };
    });
  }
};

describe("PRD-13 lane bundle delta", () => {
  it("lanes/prd13.ts gzips within the 12 KB delta budget", async () => {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: "esm",
      platform: "neutral",
      write: false,
      treeShaking: true,
      plugins: [laneDeltaPlugin],
      logLevel: "silent"
    });
    const files = result.outputFiles.filter((file) => !file.path.endsWith(".map"));
    const bytes = files.reduce((total, file) => total + file.contents.byteLength, 0);
    const gzipped = files.reduce((total, file) => total + gzipSync(file.contents).byteLength, 0);
    // Kept for CI diagnosis; not part of the assertion.
    console.info(`prd13 delta: ${bytes} B minified, ${gzipped} B gzipped`);
    expect(gzipped).toBeLessThanOrEqual(12 * 1024);
  });
});
