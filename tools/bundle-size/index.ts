import { renderBundleSizeMarkdown } from "./markdown.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Metafile, type Plugin } from "esbuild";
import { writeReport, type ReleaseCheck } from "../check-common";

interface BundleTarget {
  readonly id: string;
  readonly label: string;
  readonly entryPoint?: string;
  readonly stdin?: string;
  readonly budget: number;
  /** Informational targets retain visibility but do not define release success. */
  readonly enforced?: boolean;
  readonly external?: readonly string[];
}

interface BundleResult {
  readonly id: string;
  readonly label: string;
  readonly budget: number;
  readonly jsBytes: number;
  readonly gzipBytes: number;
  readonly bundlePath: string;
  readonly gzipPath: string;
  readonly enforced: boolean;
  readonly criticalPathFiles: readonly string[];
  readonly deferredFiles: readonly string[];
  readonly deferredJsBytes: number;
  readonly deferredGzipBytes: number;
  readonly sizeLimitBytes: number;
  readonly sizeLimitPassed: boolean;
}

/**
 * WS-2.3 — this list is now EMPTY, and that is the point.
 *
 * It used to mark `node:child_process`, `node:fs/promises`, `node:os` and `node:path` external for every
 * browser bundle measurement, with a comment explaining that `FfmpegFrameEncoder` reaches them behind a
 * capability probe and that esbuild resolves `await import()` at build time regardless. That comment was
 * accurate and it was a workaround: it made the *measurement* succeed while leaving Node builtins in the
 * browser dependency graph, so the reported size was of a bundle no browser could actually load.
 *
 * `FfmpegFrameEncoder` now lives behind `@aura3d/engine/media-node` and is no longer re-exported from
 * the browser barrel, so nothing reachable from a browser entry imports a Node builtin. Keeping the
 * externals would hide a regression: with the list empty, a future re-introduction fails this build
 * instead of being quietly excused. `tools/browser-entry-purity` asserts the same property directly.
 */
const BROWSER_EXTERNAL_NODE_BUILTINS = [] as const;

const targets: readonly BundleTarget[] = [
  {
    id: "core-agent-api",
    label: "@aura3d/engine \".\" core primitive critical path",
    entryPoint: "packages/engine/src/public/index.ts",
    // 920_000 against a 2026-10-07 honest measurement of 891,081 gzip bytes
    // (3,154,095 js). The lean shim entry measured 545,089 the same day —
    // it re-exported only a slice of this barrel; "." additionally carries
    // the full live union plus the kept-deprecated names, and T3's
    // agent-api split placed rendererReports — which statically imports
    // production-runtime — on the "." path. T8.1 deleted packages/lean and
    // "." is now the direct home of the identical critical path.
    // Structural PRD-15 cost, not drift; the lit-scene lane tracks the
    // user-facing bundle floor separately.
    budget: 920_000,
    external: ["react", "three", "three/examples/jsm/loaders/GLTFLoader.js"]
  },
  {
    id: "compatibility-root-observation",
    label: "@aura3d/engine compatibility root (informational, not the new-app entry)",
    entryPoint: "packages/engine/src/agent-api/index.ts",
    budget: 80_000,
    enforced: false,
    external: ["react", "three", "three/examples/jsm/loaders/GLTFLoader.js"]
  },
  {
    id: "react-adapter",
    label: "@aura3d/react adapter excluding React and core",
    entryPoint: "packages/react/src/index.ts",
    budget: 15_000,
    external: ["react", "@aura3d/engine"]
  },
  {
    id: "devtools",
    label: "opt-in devtools exports",
    stdin: [
      'export * from "./packages/engine/src/devtools/AuraDiagnosticsOverlay";',
      'export * from "./packages/engine/src/devtools/AuraAssetPanel";',
      'export * from "./packages/engine/src/devtools/AuraPerformancePanel";'
    ].join("\n"),
    budget: 20_000,
    external: ["react", "@aura3d/engine"]
  },
  {
    id: "presets-effects",
    label: "cinematic presets/effects helpers",
    entryPoint: "packages/rendering/src/cinematic/index.ts",
    budget: 45_000,
    external: ["three"]
  },
  {
    id: "template-product-viewer",
    label: "product-viewer starter app before user assets",
    entryPoint: "packages/create-aura3d/templates/product-viewer/src/main.ts",
    // 780_000 against 739,709 gzip measured 2026-10-07 — templates inherit
    // the monolithic "." entry plus the kept-deprecated union (see
    // core-agent-api note; was 545,633 pre-T8.1).
    budget: 780_000,
    external: ["react"]
  },
  {
    id: "template-cinematic-scene",
    label: "cinematic-scene starter app before user assets",
    entryPoint: "packages/create-aura3d/templates/cinematic-scene/src/main.ts",
    // 790_000 against 746,308 gzip measured 2026-10-07 (was 549,641 earlier
    // the same day, 384,326 on 2026-09-05; latest step is the T8.1 removal
    // of the lean indirection — "." now carries the kept-deprecated union —
    // see core-agent-api). Composition verified genuine: three (tree-shaken)
    // + engine barrels + cinematic presets + postprocessing addons; the
    // recast engine is absent from the critical path (lazy dynamic edge).
    budget: 790_000,
    external: ["react"]
  },
  {
    id: "template-mini-game",
    label: "mini-game starter app before user assets",
    entryPoint: "packages/create-aura3d/templates/mini-game/src/main.ts",
    // 850_000 against 809,335 gzip measured 2026-10-07 (was 580,359 earlier
    // the same day; step-up is the T8.1 "." union — see core-agent-api) —
    // the game kits pull more builder surface than the viewers; same
    // monolithic-entry cause.
    budget: 850_000,
    external: ["react"]
  }
];

// PRD-15 T7 — single resolution truth: the alias map is generated by
// tools/generate-resolution-maps into tsconfig.paths.generated.json; the
// hardcoded list that used to live here drifted (e.g.
// @aura3d/rendering/production-runtime resolved under tsc but not esbuild).
function loadGeneratedAliases(): Map<string, string> {
  const generated = JSON.parse(
    readFileSync(resolve(process.cwd(), "tsconfig.paths.generated.json"), "utf8")
  ) as { compilerOptions?: { paths?: Record<string, string[]> } };
  const aliases = new Map<string, string>();
  for (const [specifier, targets] of Object.entries(generated.compilerOptions?.paths ?? {})) {
    const target = targets[0];
    if (!target || specifier.includes("*") || target.includes("*")) continue;
    aliases.set(specifier, `./${target}`);
  }
  return aliases;
}

function createAliasPlugin(external: readonly string[]): Plugin {
  const externalSet = new Set(external);
  return {
    name: "aura3d-source-alias",
    setup(buildApi) {
    const aliases = loadGeneratedAliases();
    buildApi.onResolve({ filter: /^@aura3d\// }, (args) => {
      if (externalSet.has(args.path)) {
        return { path: args.path, external: true };
      }
      const target = aliases.get(args.path);
      if (!target) return undefined;
      return { path: new URL(target, `file://${process.cwd()}/`).pathname };
    });
    }
  };
}

const results = await Promise.all(targets.map(bundleTarget));
const checks: ReleaseCheck[] = results.map((result) => ({
  id: result.id,
  pass: !result.enforced || (result.gzipBytes <= result.budget && result.sizeLimitPassed),
  detail: `${result.label}: critical-path bundle ${result.jsBytes} bytes, gzip ${result.gzipBytes} bytes, `
    + `deferred ${result.deferredJsBytes} bytes / ${result.deferredGzipBytes} gzip, `
    + `size-limit ${result.sizeLimitBytes} bytes <= ${result.budget}${result.enforced ? "" : " (informational)"}`
}));

checks.push({
  id: "real-size-limit-bundle-measurement",
  pass:
    results.every((result) => result.jsBytes > result.gzipBytes) &&
    results.every((result) => result.gzipBytes > 0) &&
    results.every((result) => result.sizeLimitBytes >= result.gzipBytes && result.sizeLimitBytes <= result.gzipBytes + 32),
  detail: "all targets were bundled/minified with esbuild, gzipped, and checked by size-limit against the gzip artifact"
});

writeReport("tests/reports/bundle-size.json", "aura3d-real-bundle-size", checks, {
  measurement: "esbuild ESM splitting + statically reachable critical-path chunks + per-chunk gzip sum + size-limit",
  targets: results
});
writeBundleSizeMarkdown(results);

async function bundleTarget(target: BundleTarget): Promise<BundleResult> {
  const buildResult = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    splitting: true,
    outdir: resolve("tests/reports/bundle-size/chunks", target.id),
    entryNames: "entry",
    chunkNames: "chunk-[hash]",
    treeShaking: true,
    sourcemap: false,
    logLevel: "silent",
    plugins: [createAliasPlugin(target.external ?? [])],
    external: [...(target.external ?? []), ...BROWSER_EXTERNAL_NODE_BUILTINS],
    ...(target.stdin
      ? {
          stdin: {
            contents: target.stdin,
            loader: "ts",
            resolveDir: process.cwd(),
            sourcefile: `${target.id}.ts`
          }
        }
      : { entryPoints: [target.entryPoint!] })
  });

  const outputFiles = buildResult.outputFiles ?? [];
  const metafile = buildResult.metafile;
  if (!metafile) throw new Error(`Missing esbuild metafile for ${target.id}`);
  const criticalPathFiles = collectCriticalPathFiles(metafile, findEntryOutputKey(metafile, target));
  const criticalOutputs = outputFiles.filter((file) => criticalPathFiles.has(normalizeOutputPath(file.path)));
  const deferredOutputs = outputFiles.filter((file) => !criticalPathFiles.has(normalizeOutputPath(file.path)));
  if (criticalOutputs.length === 0) throw new Error(`No critical-path output files found for ${target.id}`);
  const bundled = concatenate(criticalOutputs.map((file) => file.contents), new TextEncoder().encode("\n"));
  // Concatenated gzip members preserve the conservative sum of independently transferred chunks.
  const gzipMembers = criticalOutputs.map((file) => gzipSync(file.contents));
  const gzip = concatenate(gzipMembers);
  const deferredJsBytes = deferredOutputs.reduce((total, file) => total + file.contents.byteLength, 0);
  const deferredGzipBytes = deferredOutputs.reduce((total, file) => total + gzipSync(file.contents).byteLength, 0);
  const bundlePath = `tests/reports/bundle-size/${target.id}.js`;
  const gzipPath = `${bundlePath}.gz`;
  mkdirSync(dirname(resolve(bundlePath)), { recursive: true });
  writeFileSync(resolve(bundlePath), bundled);
  writeFileSync(resolve(gzipPath), gzip);
  const sizeLimit = runSizeLimit(gzipPath, target.budget);

  return {
    id: target.id,
    label: target.label,
    budget: target.budget,
    jsBytes: bundled.byteLength,
    gzipBytes: gzip.byteLength,
    bundlePath,
    gzipPath,
    enforced: target.enforced !== false,
    criticalPathFiles: criticalOutputs.map((file) => normalizeOutputPath(file.path)).sort(),
    deferredFiles: deferredOutputs.map((file) => normalizeOutputPath(file.path)).sort(),
    deferredJsBytes,
    deferredGzipBytes,
    sizeLimitBytes: sizeLimit.size,
    sizeLimitPassed: sizeLimit.passed
  };
}

/*
 * With splitting enabled every lazy split point is also recorded with an
 * `entryPoint`, so first-match selection can start the walk at a small async
 * chunk and report a fraction of the app as the critical path (twice observed:
 * two unrelated targets reporting the identical byte count). The walk must
 * start at the output whose recorded entry matches the measured target;
 * anything else fails loudly instead of measuring the wrong node.
 */
function findEntryOutputKey(metafile: Metafile, target: BundleTarget): string {
  const outputs = Object.entries(metafile.outputs);
  const candidates = outputs.filter(([, output]) => typeof output.entryPoint === "string");
  if (candidates.length === 0) throw new Error(`esbuild did not emit an entry output for ${target.id}`);
  if (target.entryPoint) {
    const want = normalizeOutputPath(target.entryPoint);
    const exact = candidates.find(([, output]) => normalizeOutputPath(output.entryPoint as string) === want);
    if (!exact) {
      throw new Error(
        `No bundle output matches entry ${target.entryPoint} for ${target.id} ` +
        `(saw ${candidates.map(([, output]) => String(output.entryPoint)).join(", ")}); ` +
        "refusing to measure a split chunk as the critical path"
      );
    }
    return exact[0]!;
  }
  return candidates[0]![0];
}

function collectCriticalPathFiles(metafile: Metafile, entryKey: string): Set<string> {
  const outputs = Object.entries(metafile.outputs);
  const keyByAbsolutePath = new Map(outputs.map(([key]) => [normalizeOutputPath(key), key]));
  const visited = new Set<string>();
  const visit = (path: string): void => {
    const normalized = normalizeOutputPath(path);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    const output = metafile.outputs[path];
    if (!output) return;
    for (const dependency of output.imports) {
      if (dependency.external || dependency.kind === "dynamic-import") continue;
      // esbuild's metafile paths are already relative to absWorkingDir, even though the emitted
      // JavaScript rewrites them relative to the importing chunk. Resolve the recorded path first;
      // only fall back to importer-relative resolution for older esbuild output shapes.
      const dependencyKey = keyByAbsolutePath.get(normalizeOutputPath(dependency.path))
        ?? keyByAbsolutePath.get(normalizeOutputPath(resolve(dirname(resolve(path)), dependency.path)));
      if (dependencyKey) visit(dependencyKey);
    }
  };
  visit(entryKey);
  return visited;
}

function normalizeOutputPath(path: string): string {
  return resolve(path).replaceAll("\\", "/");
}

function concatenate(parts: readonly Uint8Array[], separator = new Uint8Array()): Uint8Array {
  const length = parts.reduce((total, part, index) => total + part.byteLength + (index > 0 ? separator.byteLength : 0), 0);
  const merged = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0 && separator.byteLength > 0) {
      merged.set(separator, offset);
      offset += separator.byteLength;
    }
    const part = parts[index]!;
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

function runSizeLimit(path: string, budget: number): { readonly passed: boolean; readonly size: number } {
  try {
    const sizeLimitExecutable = resolve(
      "node_modules",
      ".bin",
      process.platform === "win32" ? "size-limit.cmd" : "size-limit"
    );
    const output = execFileSync(sizeLimitExecutable, [path, "--limit", `${budget} B`, "--json"], {
      encoding: "utf8",
      stdio: "pipe"
    });
    const [result] = JSON.parse(output) as Array<{ readonly passed?: boolean; readonly size?: number }>;
    return { passed: result?.passed === true, size: result?.size ?? -1 };
  } catch (error) {
    const stdout = error instanceof Error && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    try {
      const [result] = JSON.parse(stdout) as Array<{ readonly passed?: boolean; readonly size?: number }>;
      return { passed: result?.passed === true, size: result?.size ?? -1 };
    } catch {
      return { passed: false, size: -1 };
    }
  }
}

function writeBundleSizeMarkdown(results: readonly BundleResult[]): void {
  writeFileSync("BUNDLE_SIZES.md", renderBundleSizeMarkdown(results));
}
