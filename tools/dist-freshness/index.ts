/**
 * Is `dist/` newer than the source it was built from?
 *
 * ## Why this exists
 *
 * `@aura3d/engine` resolves to `dist/engine/agent-api/index.js`, **not** to `packages/engine/src`. So
 * every tool that bundles the public entry point — which is exactly what R1 requires — measures the
 * last build, not the working tree.
 *
 * That produced a genuinely misleading result during WS-2.1a: a full anisotropic-GGX implementation
 * with a tangent frame was written, typechecked, and committed to source, and the structural gate
 * reported **byte-identical output**, because the bundle was reading a `dist/` from the previous day.
 * The natural reading of that evidence is "the shader change did nothing" — which would have sent the
 * next hour into rewriting correct code. After `pnpm build:raw`, the same gate went from 1 of 5 passing
 * to 4 of 5, with anisotropy elongation moving 1.5602 -> 18.7819.
 *
 * A measurement that silently reads a stale artifact is the same defect class as a gate that returns a
 * constant, so it gets the same treatment: an explicit check that fails loudly.
 *
 * Used as a guard by `tools/production-path-benchmark` and `tools/material-structural-parity`, and
 * available as `pnpm check:dist-freshness`.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

export interface DistFreshness {
  readonly fresh: boolean;
  readonly distPath: string;
  readonly distModifiedMs: number | null;
  /** The newest source file that is newer than the build, if any. */
  readonly newestStaleSource: string | null;
  readonly newestStaleSourceMs: number | null;
  readonly staleSourceCount: number;
  readonly message: string;
}

function newestSourceAfter(thresholdMs: number): { readonly path: string | null; readonly modifiedMs: number | null; readonly count: number } {
  let newestPath: string | null = null;
  let newestMs = thresholdMs;
  let count = 0;
  const walk = (directory: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist") continue;
      const child = join(directory, entry);
      let stats;
      try {
        stats = statSync(child);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(child);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (stats.mtimeMs <= thresholdMs) continue;
      count += 1;
      if (stats.mtimeMs > newestMs) {
        newestMs = stats.mtimeMs;
        newestPath = relative(repoRoot, child);
      }
    }
  };
  for (const pkg of readdirSync(join(repoRoot, "packages"))) {
    const src = join(repoRoot, "packages", pkg, "src");
    if (existsSync(src)) walk(src);
  }
  return { path: newestPath, modifiedMs: newestPath === null ? null : newestMs, count };
}

export function checkDistFreshness(): DistFreshness {
  const distPath = "dist/engine/agent-api/index.js";
  const absolute = join(repoRoot, distPath);
  if (!existsSync(absolute)) {
    return {
      fresh: false,
      distPath,
      distModifiedMs: null,
      newestStaleSource: null,
      newestStaleSourceMs: null,
      staleSourceCount: 0,
      message: `${distPath} does not exist. \`@aura3d/engine\` resolves to dist/, so nothing can measure the public entry point until \`pnpm build:raw\` has run.`
    };
  }
  const distModifiedMs = statSync(absolute).mtimeMs;
  const stale = newestSourceAfter(distModifiedMs);
  if (stale.path === null) {
    return {
      fresh: true,
      distPath,
      distModifiedMs,
      newestStaleSource: null,
      newestStaleSourceMs: null,
      staleSourceCount: 0,
      message: `${distPath} is newer than every packages/*/src TypeScript file, so a bundle of the public entry point reflects the working tree.`
    };
  }
  return {
    fresh: false,
    distPath,
    distModifiedMs,
    newestStaleSource: stale.path,
    newestStaleSourceMs: stale.modifiedMs,
    staleSourceCount: stale.count,
    message: `STALE BUILD: ${stale.count} source file(s) are newer than ${distPath}, most recently ${stale.path}. \`@aura3d/engine\` resolves to dist/, so any measurement taken now describes the PREVIOUS build and not your changes. Run \`pnpm build:raw\` first. This exact situation once reported a working anisotropic-GGX implementation as producing byte-identical output.`
  };
}

/** Throw with the explanation rather than silently measure a stale artifact. */
export function requireFreshDist(): void {
  const freshness = checkDistFreshness();
  if (!freshness.fresh) throw new Error(freshness.message);
}

if (process.argv[1] !== undefined && process.argv[1].includes("dist-freshness")) {
  const freshness = checkDistFreshness();
  console.log(freshness.message);
  if (!freshness.fresh) process.exitCode = 1;
}
