import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Plugin } from "esbuild";
import { writeReport, type ReleaseCheck } from "../check-common";

interface BundleTarget {
  readonly id: string;
  readonly label: string;
  readonly entryPoint?: string;
  readonly stdin?: string;
  readonly budget: number;
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
  readonly sizeLimitBytes: number;
  readonly sizeLimitPassed: boolean;
}

const targets: readonly BundleTarget[] = [
  {
    id: "core-agent-api",
    label: "@aura3d/engine agent API",
    entryPoint: "packages/engine/src/agent-api/index.ts",
    budget: 80_000,
    external: ["react"]
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
    budget: 250_000,
    external: ["react"]
  },
  {
    id: "template-cinematic-scene",
    label: "cinematic-scene starter app before user assets",
    entryPoint: "packages/create-aura3d/templates/cinematic-scene/src/main.ts",
    budget: 250_000,
    external: ["react"]
  },
  {
    id: "template-mini-game",
    label: "mini-game starter app before user assets",
    entryPoint: "packages/create-aura3d/templates/mini-game/src/main.ts",
    budget: 250_000,
    external: ["react"]
  }
];

function createAliasPlugin(external: readonly string[]): Plugin {
  const externalSet = new Set(external);
  return {
    name: "aura3d-source-alias",
    setup(buildApi) {
    const aliases = new Map([
      ["@aura3d/engine", "./packages/engine/src/agent-api/index.ts"],
      ["@aura3d/rendering", "./packages/rendering/src/index.ts"],
      ["@aura3d/assets", "./packages/assets/src/browser-index.ts"],
      ["@aura3d/scene", "./packages/scene/src/index.ts"],
      ["@aura3d/core", "./packages/core/src/index.ts"],
      ["@aura3d/math", "./packages/math/src/index.ts"],
      ["@aura3d/physics", "./packages/physics/src/index.ts"],
      ["@aura3d/product-studio", "./packages/product-studio/src/index.ts"],
      ["@aura3d/apps", "./packages/apps/src/index.ts"],
      ["@aura3d/animation", "./packages/animation/src/browser-index.ts"]
    ]);
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
  pass: result.gzipBytes <= result.budget && result.sizeLimitPassed,
  detail: `${result.label}: bundled ${result.jsBytes} bytes, gzip ${result.gzipBytes} bytes, size-limit ${result.sizeLimitBytes} bytes <= ${result.budget}`
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
  measurement: "esbuild bundle + minify + gzip artifact + size-limit",
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
    treeShaking: true,
    sourcemap: false,
    logLevel: "silent",
    plugins: [createAliasPlugin(target.external ?? [])],
    external: [...(target.external ?? [])],
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

  const bundled = buildResult.outputFiles.map((file) => file.contents).reduce((total, file) => {
    const merged = new Uint8Array(total.length + file.length);
    merged.set(total);
    merged.set(file, total.length);
    return merged;
  }, new Uint8Array());
  const gzip = gzipSync(bundled);
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
    sizeLimitBytes: sizeLimit.size,
    sizeLimitPassed: sizeLimit.passed
  };
}

function runSizeLimit(path: string, budget: number): { readonly passed: boolean; readonly size: number } {
  try {
    const output = execFileSync("pnpm", ["exec", "size-limit", path, "--limit", `${budget} B`, "--json"], {
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
  const lines = [
    "# Aura3D Bundle Sizes",
    "",
    `Generated from \`tests/reports/bundle-size.json\` on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`",
    "against the gzip artifact.",
    "",
    "| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |",
    "|---|---:|---:|---:|---:|",
    ...results.map((result) => [
      `\`${result.label}\``,
      formatBytes(result.jsBytes),
      formatBytes(result.gzipBytes),
      formatBytes(result.budget),
      result.gzipBytes <= result.budget && result.sizeLimitPassed ? "pass" : "fail"
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "The authoritative machine-readable report is",
    "`tests/reports/bundle-size.json`.",
    ""
  ];
  writeFileSync("BUNDLE_SIZES.md", lines.join("\n"));
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
