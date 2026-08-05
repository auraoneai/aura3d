/**
 * WS-2.4 — canonical bundle scenarios, measured against equivalent Three.js stacks.
 *
 * ## Why a single "cube <= 100 KB" number was not enough
 *
 * Without a committed entry file and one shared bundler config, a bundle budget is gameable: the
 * number moves with what you chose to import, whether the renderer came along, whether loaders were
 * external, and which minifier ran. So each scenario has **one committed entry per engine**, both
 * built with the **same** config, and the report states for each what is included.
 *
 * ## Budgets come from the comparison, not from aspiration
 *
 * §B.1 sets the ratio, not the absolute: scenario 1 and 2 at <= 1.25x the Three.js equivalent, and
 * scenario 3 at <= 1.5x. That framing is deliberate — an absolute byte budget invites being raised
 * (R2 forbids it), while a ratio can only be met by making Aura3D smaller or by Three.js growing.
 *
 * ## What is external, and why it is the same for both
 *
 * Node builtins only. `three` is NOT external for the Three.js entries and `@aura3d/*` is NOT external
 * for the Aura3D entries, because the question is what a developer downloads. Marking either engine's
 * own code external would produce a flattering number for whichever side got the exemption.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Plugin } from "esbuild";
import { writeReport, type ReleaseCheck } from "../check-common";

const REPORT_PATH = "tests/reports/bundle-scenarios.json";
const ARTIFACT_DIR = "tests/reports/bundle-scenarios";

/**
 * Node builtins are external to every browser bundle, for both engines equally.
 *
 * `FfmpegFrameEncoder` reaches `node:child_process` and friends behind a runtime capability probe, so
 * esbuild would otherwise fail to resolve them for `platform: "browser"`. A real browser bundler also
 * treats builtins as external, so this is the honest measurement rather than a workaround — and
 * WS-2.3 removes the reachability itself.
 */
const EXTERNAL_NODE_BUILTINS = [
  "node:child_process",
  "node:fs/promises",
  "node:os",
  "node:path",
  "node:fs",
  "node:crypto",
  "node:url"
] as const;

interface ScenarioContents {
  readonly renderer: string;
  readonly webgl2: boolean;
  readonly webgpu: boolean;
  readonly assetLoaders: boolean;
  readonly sceneGraph: boolean;
  readonly math: boolean;
  readonly typedApi: boolean;
  readonly diagnostics: boolean;
  readonly environment: boolean;
  readonly polyfills: boolean;
  readonly compressedTextures: boolean;
  readonly physics: boolean;
}

interface Scenario {
  readonly id: string;
  readonly label: string;
  /** Ratio of Aura3D gzip to the equivalent Three.js gzip that this scenario must not exceed. */
  readonly maxRatio: number;
  readonly aura3dEntry: string;
  readonly threejsEntry: string;
  readonly contents: ScenarioContents;
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: "scenario-1-core-primitive-scene",
    label: "Core primitive scene: WebGL2 renderer, scene graph, camera, one material, one cube",
    maxRatio: 1.25,
    aura3dEntry: "tools/bundle-scenarios/entries/scenario-1-aura3d.ts",
    threejsEntry: "tools/bundle-scenarios/entries/scenario-1-threejs.ts",
    contents: {
      renderer: "WebGL2 only",
      webgl2: true,
      webgpu: false,
      assetLoaders: false,
      sceneGraph: true,
      math: true,
      typedApi: true,
      diagnostics: false,
      environment: false,
      polyfills: false,
      compressedTextures: false,
      physics: false
    }
  },
  {
    id: "scenario-2-product-viewer",
    label: "Product viewer: glTF, PBR, orbit controls, lighting, environment",
    maxRatio: 1.25,
    aura3dEntry: "tools/bundle-scenarios/entries/scenario-2-aura3d.ts",
    threejsEntry: "tools/bundle-scenarios/entries/scenario-2-threejs.ts",
    contents: {
      renderer: "WebGL2 only",
      webgl2: true,
      webgpu: false,
      assetLoaders: true,
      sceneGraph: true,
      math: true,
      typedApi: true,
      diagnostics: false,
      environment: true,
      polyfills: false,
      compressedTextures: false,
      physics: false
    }
  },
  {
    id: "scenario-3-game-runtime",
    label: "Game runtime: input, animation, physics integration, game loop",
    maxRatio: 1.5,
    aura3dEntry: "tools/bundle-scenarios/entries/scenario-3-aura3d.ts",
    threejsEntry: "tools/bundle-scenarios/entries/scenario-3-threejs.ts",
    contents: {
      renderer: "WebGL2 only",
      webgl2: true,
      webgpu: false,
      assetLoaders: false,
      sceneGraph: true,
      math: true,
      typedApi: true,
      diagnostics: false,
      environment: false,
      polyfills: false,
      compressedTextures: false,
      physics: true
    }
  }
];

/**
 * Resolve `@aura3d/*` to package sources.
 *
 * Source rather than `dist/`, deliberately and unlike the runtime measurement tools: a bundle budget
 * must reflect the code as written, so a stale build cannot flatter or damn it. The behavioural gates
 * do the opposite and measure `dist/`, because that is what a developer's bundler resolves — see
 * `tools/dist-freshness`.
 */
function auraSourceAlias(): Plugin {
  const aliases = new Map([
    ["@aura3d/engine", "packages/engine/src/agent-api/index.ts"],
    ["@aura3d/rendering", "packages/rendering/src/index.ts"],
    ["@aura3d/assets", "packages/assets/src/browser-index.ts"],
    ["@aura3d/scene", "packages/scene/src/index.ts"],
    ["@aura3d/core", "packages/core/src/index.ts"],
    ["@aura3d/math", "packages/math/src/index.ts"],
    ["@aura3d/physics", "packages/physics/src/index.ts"],
    ["@aura3d/product-studio", "packages/product-studio/src/index.ts"],
    ["@aura3d/apps", "packages/apps/src/index.ts"],
    ["@aura3d/animation", "packages/animation/src/browser-index.ts"],
    ["@aura3d/input", "packages/input/src/index.ts"],
    ["@aura3d/audio", "packages/audio/src/index.ts"],
    ["@aura3d/controls", "packages/controls/src/index.ts"],
    ["@aura3d/ecs", "packages/ecs/src/index.ts"],
    ["@aura3d/workflows", "packages/workflows/src/index.ts"],
    ["@aura3d/editor-runtime", "packages/editor-runtime/src/index.ts"],
    ["@aura3d/editor", "packages/editor/src/index.ts"],
    ["@aura3d/debug", "packages/debug/src/index.ts"],
    ["@aura3d/scripting", "packages/scripting/src/index.ts"],
    ["@aura3d/materials", "packages/materials/src/index.ts"],
    ["@aura3d/environments", "packages/environments/src/index.ts"],
    ["@aura3d/asset-index", "packages/asset-index/src/index.ts"],
    ["@aura3d/three-compat", "packages/three-compat/src/index.ts"],
    ["@aura3d/test-utils", "packages/test-utils/src/index.ts"]
  ]);
  return {
    name: "aura3d-source-alias",
    setup(api) {
      api.onResolve({ filter: /^@aura3d\// }, (args) => {
        const target = aliases.get(args.path);
        return target === undefined ? undefined : { path: resolve(process.cwd(), target) };
      });
    }
  };
}

interface Measurement {
  readonly entry: string;
  readonly jsBytes: number;
  readonly gzipBytes: number;
  readonly artifactPath: string;
  /** Bytes contributed to the output, grouped by workspace package or third-party module. */
  readonly bytesByPackage: Readonly<Record<string, number>>;
  readonly largestContributors: readonly { readonly path: string; readonly bytes: number }[];
}

async function measure(id: string, engine: "aura3d" | "threejs", entry: string): Promise<Measurement> {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    sourcemap: false,
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: engine === "aura3d" ? [auraSourceAlias()] : [],
    external: [...EXTERNAL_NODE_BUILTINS]
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error(`No output produced for ${id}/${engine}`);
  const gzip = gzipSync(output.contents);
  const artifactPath = `${ARTIFACT_DIR}/${id}-${engine}.js`;
  mkdirSync(dirname(resolve(artifactPath)), { recursive: true });
  writeFileSync(resolve(artifactPath), output.contents);
  writeFileSync(resolve(`${artifactPath}.gz`), gzip);

  const outputKey = Object.keys(result.metafile!.outputs)[0]!;
  const inputs = result.metafile!.outputs[outputKey]!.inputs;
  const contributions = Object.entries(inputs)
    .map(([path, value]) => ({ path, bytes: value.bytesInOutput }))
    .filter((entryValue) => entryValue.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes);
  const bytesByPackage: Record<string, number> = {};
  for (const contribution of contributions) {
    const workspace = /packages\/([a-z0-9-]+)\//.exec(contribution.path);
    const key = workspace ? `@aura3d/${workspace[1]}` : contribution.path.includes("node_modules") ? thirdPartyName(contribution.path) : "entry";
    bytesByPackage[key] = (bytesByPackage[key] ?? 0) + contribution.bytes;
  }
  return {
    entry,
    jsBytes: output.contents.byteLength,
    gzipBytes: gzip.byteLength,
    artifactPath,
    bytesByPackage: Object.fromEntries(Object.entries(bytesByPackage).sort((left, right) => right[1] - left[1])),
    largestContributors: contributions.slice(0, 12)
  };
}

function thirdPartyName(path: string): string {
  const scoped = /node_modules\/(@[^/]+\/[^/]+)\//.exec(path);
  if (scoped) return scoped[1]!;
  const plain = /node_modules\/([^/]+)\//.exec(path);
  return plain ? plain[1]! : "node_modules";
}

/** `size-limit` against the gzip artifact, so the reported number is verified by a second tool. */
function sizeLimit(gzipPath: string, budget: number): { readonly bytes: number; readonly passed: boolean } {
  try {
    const output = execFileSync("pnpm", ["exec", "size-limit", gzipPath, "--limit", `${budget} B`, "--json"], { encoding: "utf8", stdio: "pipe" });
    const [entry] = JSON.parse(output) as { readonly passed?: boolean; readonly size?: number }[];
    return { bytes: entry?.size ?? -1, passed: entry?.passed === true };
  } catch (error) {
    const stdout = error instanceof Error && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    try {
      const [entry] = JSON.parse(stdout) as { readonly passed?: boolean; readonly size?: number }[];
      return { bytes: entry?.size ?? -1, passed: entry?.passed === true };
    } catch {
      return { bytes: -1, passed: false };
    }
  }
}

async function main(): Promise<void> {
  const checks: ReleaseCheck[] = [];
  const scenarios: Record<string, unknown>[] = [];
  for (const scenario of SCENARIOS) {
    for (const entry of [scenario.aura3dEntry, scenario.threejsEntry]) {
      if (!existsSync(resolve(entry))) throw new Error(`Missing committed scenario entry: ${entry}`);
    }
    const aura3d = await measure(scenario.id, "aura3d", scenario.aura3dEntry);
    const threejs = await measure(scenario.id, "threejs", scenario.threejsEntry);
    const ratio = threejs.gzipBytes > 0 ? aura3d.gzipBytes / threejs.gzipBytes : Number.POSITIVE_INFINITY;
    /*
     * The budget is DERIVED from the Three.js measurement, so it cannot be raised without Three.js
     * itself growing. This is the mechanism that makes R2 structural rather than a promise.
     */
    const derivedBudget = Math.floor(threejs.gzipBytes * scenario.maxRatio);
    const verified = sizeLimit(`${aura3d.artifactPath}.gz`, derivedBudget);
    const pass = ratio <= scenario.maxRatio;
    checks.push({
      id: scenario.id,
      pass,
      detail: `${scenario.label}: Aura3D ${aura3d.gzipBytes} B gzip vs Three.js ${threejs.gzipBytes} B = ${ratio.toFixed(3)}x (limit ${scenario.maxRatio}x, derived budget ${derivedBudget} B)`
    });
    scenarios.push({
      id: scenario.id,
      label: scenario.label,
      contents: scenario.contents,
      maxRatio: scenario.maxRatio,
      derivedBudgetBytes: derivedBudget,
      budgetSource: "Derived from the measured Three.js equivalent, not chosen. It cannot be raised without Three.js growing, which is what makes R2 structural.",
      ratio: Number(ratio.toFixed(4)),
      pass,
      overBy: pass ? 0 : aura3d.gzipBytes - derivedBudget,
      aura3d,
      threejs,
      sizeLimitVerification: verified
    });
  }

  writeReport(REPORT_PATH, "a3d-bundle-scenarios", checks, {
    rule: "§B.1 — 1.6 succeeds only if renderer parity improves AND developer bundle size approaches Three.js. Ratios are measured against a committed equivalent Three.js entry using one shared bundler config. Never raise a budget to go green (R2); the budget is derived from the comparison, so it cannot be raised at all.",
    canonicalBundlerConfig: {
      bundler: "esbuild",
      minify: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      treeShaking: true,
      gzip: true,
      verifiedBy: "size-limit against the gzip artifact",
      external: EXTERNAL_NODE_BUILTINS,
      externalPolicy: "Node builtins only. Neither engine's own code is external: the question is what a developer downloads, so exempting either side would flatter it.",
      aura3dResolution: "packages/*/src sources — a bundle budget must reflect the code as written. The behavioural gates measure dist/ instead, because that is what a developer's bundler resolves."
    },
    scenarios
  });
  for (const check of checks) console.log(`${check.pass ? "ok  " : "FAIL"} ${check.detail}`);
  console.log(`report: ${REPORT_PATH}`);
}

await main();
