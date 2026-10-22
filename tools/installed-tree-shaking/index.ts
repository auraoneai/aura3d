import { loadValidatedReleasePlan, inspectInstalledRelease } from "../release/exact-release-plan.mjs";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { build, type Metafile } from "esbuild";

const root = resolve(import.meta.dirname, "..", "..");
const expectedPackedVersion = (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string }).version;
const cleanInstallReportPath = resolve(root, "tests/reports/package-clean-install.json");
const templateRoot = resolve(root, "tests/reports/package-clean-install-workspace/templates");
const outputPath = resolve(root, "tests/reports/installed-tree-shaking.json");

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const exactPlan = loadValidatedReleasePlan(root);
const installedIdentity: unknown[] = [];
const cleanInstall = JSON.parse(readFileSync(cleanInstallReportPath, "utf8")) as { readonly pass?: boolean; readonly releasePlan?: {path:string;sha256:string} };
if (exactPlan && JSON.stringify(cleanInstall.releasePlan) !== JSON.stringify(exactPlan.reference)) throw new Error("Clean install report belongs to a different exact release plan");
if (!cleanInstall.pass) {
  throw new Error("Installed tree-shaking requires a passing fresh `pnpm check:clean-install` report.");
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "aura3d-installed-tree-shaking-"));
const checks: Check[] = [];
const measurements: Record<string, unknown> = {};

/*
 * Post-T8.1 reality: `@aura3d/lean` is gone — every former lean specifier
 * resolves to `@aura3d/engine` (product surface on ".", game surface on
 * "/game"). Tree-shaking now has to be proven inside the single flat package:
 * the public "." barrel pulls the whole §6.6 surface into the module graph,
 * so the gate measures RETAINED bytes (metafile output.inputs bytesInOutput)
 * per dist subtree rather than import-graph presence alone.
 *
 * `external` models the clean consumer install: optional native peers
 * (@dimforge rapier wasm) are absent from the scaffolded demos' node_modules —
 * without the marker esbuild would resolve them through the repository root's
 * dev dependencies and report bytes a real consumer bundle never sees.
 * `node:*` covers server-only paths inside asset tooling (mirrors how Vite
 * externalises builtins for browser builds).
 */
const OPTIONAL_NATIVE_EXTERNALS = [
  "node:*",
  "@dimforge/rapier3d-compat",
  "@dimforge/*"
];

try {
  for (const profile of ["product-viewer", "mini-game"] as const) {
    const projectRoot = resolve(templateRoot, profile, "demo");
    if(exactPlan)installedIdentity.push(inspectInstalledRelease(root,projectRoot,exactPlan));
    const packageRoot = resolve(projectRoot, "node_modules/@aura3d/engine");
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      readonly name: string;
      readonly version: string;
    };
    const entryPath = resolve(projectRoot, "src/main.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const outputFile = resolve(temporaryDirectory, `${profile}.js`);
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entryPath],
      bundle: true,
      format: "esm",
      minify: true,
      platform: "browser",
      external: OPTIONAL_NATIVE_EXTERNALS,
      outfile: outputFile,
      metafile: true,
      treeShaking: true,
      write: true,
      logLevel: "silent"
    });
    if (!result.metafile) throw new Error(`Missing esbuild metafile for ${profile}.`);

    const outputEntry = Object.values(result.metafile.outputs).find((output) => output.entryPoint);
    if (!outputEntry) throw new Error(`Missing esbuild output entry for ${profile}.`);
    const retained = retainedEngineInputs(result.metafile);
    const inputNames = Object.keys(result.metafile.inputs).filter((path) => path.includes("node_modules/@aura3d/engine/dist/"));
    const packageBytes = Object.fromEntries(inputNames.map((path) => [
      path,
      statSync(resolve(root, path)).size
    ]));
    const outputBytes = statSync(outputFile).size;

    const retainedFor = (suffix: string): number => {
      const inputPath = inputNames.find((path) => path.endsWith(suffix));
      return inputPath ? outputEntry.inputs[inputPath]?.bytesInOutput ?? 0 : 0;
    };
    const packagedFor = (suffix: string): number => {
      const inputPath = inputNames.find((path) => path.endsWith(suffix));
      return inputPath ? statSync(resolve(root, inputPath)).size : 0;
    };
    const retainedBySubtree = subtreeBytes(result.metafile, outputEntry);
    const zeroRetainedSubtrees = Object.keys(retainedBySubtree).filter((dir) => retainedBySubtree[dir] === 0);
    const nativeRetainedBytes = Object.entries(outputEntry.inputs)
      .filter(([path, contribution]) => /@dimforge\/|recast-navigation|three-compat|three\//.test(path) && contribution.bytesInOutput > 0)
      .reduce((sum, [, contribution]) => sum + contribution.bytesInOutput, 0);

    checks.push({
      id: `${profile}-exact-packed-version`,
      pass: manifest.name === "@aura3d/engine" && manifest.version === expectedPackedVersion,
      detail: `${manifest.name}@${manifest.version} from the fresh clean-install project (need ${expectedPackedVersion})`
    });
    checks.push({
      id: `${profile}-documented-subpath`,
      pass: entrySource.includes(profile === "product-viewer" ? 'from "@aura3d/engine"' : 'from "@aura3d/engine/game"'),
      detail: profile === "product-viewer" ? "uses @aura3d/engine" : "uses @aura3d/engine/game"
    });

    if (profile === "product-viewer") {
      checks.push({
        id: "product-excludes-game-runtime",
        pass: !inputNames.some((path) => /\/dist\/game\//u.test(path)),
        detail: `retained engine inputs: ${Object.keys(retained).join(", ")}`
      });
      checks.push({
        id: "product-removes-unused-engine-code",
        pass:
          retainedFor("/engine/public/index.js") < packagedFor("/engine/public/index.js") &&
          retainedFor("/engine/agent-api/index.js") < packagedFor("/engine/agent-api/index.js"),
        detail: `public/index ${retainedFor("/engine/public/index.js")}/${packagedFor("/engine/public/index.js")} bytes; agent-api/index ${retainedFor("/engine/agent-api/index.js")}/${packagedFor("/engine/agent-api/index.js")} bytes retained`
      });
    } else {
      checks.push({
        id: "game-retains-deterministic-arcade-runtime",
        pass: inputNames.some((path) => path.endsWith("/dist/game/createGame.js")) && (retainedBySubtree["game"] ?? 0) > 0,
        detail: `retained engine inputs: ${Object.keys(retained).join(", ")}`
      });
    }

    checks.push({
      id: `${profile}-excludes-optional-subsystems`,
      pass:
        nativeRetainedBytes === 0 &&
        ["editor", "editor-runtime", "three-compat", "scripting", "apps", "debug", "aura3d-cli", "create-aura3d"].every(
          (dir) => (retainedBySubtree[dir] ?? 0) === 0
        ),
      detail: `zero-retained subtrees: ${zeroRetainedSubtrees.join(", ") || "none"}; native-dep retained bytes: ${nativeRetainedBytes}`
    });

    measurements[profile] = {
      entry: entryPath.slice(root.length + 1),
      installedPackage: `${manifest.name}@${manifest.version}`,
      outputBytes,
      retainedEngineBytes: retained,
      engineInputBytes: packageBytes,
      engineInputs: inputNames,
      retainedBySubtree
    };
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const failures = checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`);
const report = {
  schema: "aura3d.installed-tree-shaking/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  source: exactPlan ? "validated exact release plan archives" : `fresh local ${expectedPackedVersion} tarballs installed by tests/reports/package-clean-install.json`,
  releasePlan: exactPlan?.reference,
  installedIdentity,
  method: "Bundle the generated product and arcade entries from their clean npm-installed projects with esbuild treeShaking enabled; inspect the emitted metafile and retained bytes rather than source manifests alone.",
  checks,
  failures,
  measurements
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Installed-tarball tree-shaking ${report.pass ? "PASS" : "FAIL"}: ${checks.length - failures.length}/${checks.length}; tests/reports/installed-tree-shaking.json`);
if (!report.pass) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
}

function retainedEngineInputs(metafile: Metafile): Record<string, number> {
  const retained: Record<string, number> = {};
  for (const output of Object.values(metafile.outputs)) {
    for (const [path, contribution] of Object.entries(output.inputs)) {
      if (!path.includes("node_modules/@aura3d/engine/dist/")) continue;
      const name = basename(path);
      retained[name] = (retained[name] ?? 0) + contribution.bytesInOutput;
    }
  }
  return retained;
}

function subtreeBytes(metafile: Metafile, outputEntry: Metafile["outputs"][string]): Record<string, number> {
  const subtree: Record<string, number> = {};
  for (const path of Object.keys(metafile.inputs)) {
    const match = /node_modules\/@aura3d\/engine\/dist\/([^/]+)\//u.exec(path);
    if (!match) continue;
    subtree[match[1]!] = subtree[match[1]!] ?? 0;
  }
  for (const [path, contribution] of Object.entries(outputEntry.inputs)) {
    const match = /node_modules\/@aura3d\/engine\/dist\/([^/]+)\//u.exec(path);
    if (!match) continue;
    subtree[match[1]!] = (subtree[match[1]!] ?? 0) + contribution.bytesInOutput;
  }
  return subtree;
}
