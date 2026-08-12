import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { build, type Metafile } from "esbuild";

const root = resolve(import.meta.dirname, "..", "..");
const cleanInstallReportPath = resolve(root, "tests/reports/package-clean-install.json");
const templateRoot = resolve(root, "tests/reports/package-clean-install-workspace/templates");
const outputPath = resolve(root, "tests/reports/installed-tree-shaking.json");

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const cleanInstall = JSON.parse(readFileSync(cleanInstallReportPath, "utf8")) as { readonly pass?: boolean };
if (!cleanInstall.pass) {
  throw new Error("Installed tree-shaking requires a passing fresh `pnpm check:clean-install` report.");
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "aura3d-installed-tree-shaking-"));
const checks: Check[] = [];
const measurements: Record<string, unknown> = {};

try {
  for (const profile of ["product-viewer", "mini-game"] as const) {
    const projectRoot = resolve(templateRoot, profile, "demo");
    const packageRoot = resolve(projectRoot, "node_modules/@aura3d/lean");
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
      outfile: outputFile,
      metafile: true,
      treeShaking: true,
      write: true,
      logLevel: "silent"
    });
    if (!result.metafile) throw new Error(`Missing esbuild metafile for ${profile}.`);

    const retained = retainedLeanInputs(result.metafile);
    const inputNames = Object.keys(result.metafile.inputs).filter((path) => path.includes("node_modules/@aura3d/lean/dist/"));
    const packageBytes = Object.fromEntries(inputNames.map((path) => [
      basename(path),
      statSync(resolve(root, path)).size
    ]));
    const outputBytes = statSync(outputFile).size;
    const outputSource = readFileSync(outputFile, "utf8");

    checks.push({
      id: `${profile}-exact-packed-version`,
      pass: manifest.name === "@aura3d/lean" && manifest.version === "2.0.0",
      detail: `${manifest.name}@${manifest.version} from the fresh clean-install project`
    });
    checks.push({
      id: `${profile}-documented-subpath`,
      pass: entrySource.includes(profile === "product-viewer" ? 'from "@aura3d/lean/product"' : 'from "@aura3d/lean/game"'),
      detail: profile === "product-viewer" ? "uses @aura3d/lean/product" : "uses @aura3d/lean/game"
    });

    if (profile === "product-viewer") {
      checks.push({
        id: "product-excludes-game-runtime",
        pass: !inputNames.some((path) => /\/(?:game|ArcadeRuntime)\.js$/u.test(path)),
        detail: `retained lean inputs: ${Object.keys(retained).join(", ")}`
      });
      checks.push({
        id: "product-removes-unused-lean-code",
        pass:
          (retained["base.js"] ?? Number.POSITIVE_INFINITY) < (packageBytes["base.js"] ?? 0) &&
          (retained["product.js"] ?? Number.POSITIVE_INFINITY) < (packageBytes["product.js"] ?? 0),
        detail: `base ${retained["base.js"] ?? 0}/${packageBytes["base.js"] ?? 0} bytes; product ${retained["product.js"] ?? 0}/${packageBytes["product.js"] ?? 0} bytes retained`
      });
    } else {
      checks.push({
        id: "game-retains-deterministic-arcade-runtime",
        pass: inputNames.some((path) => path.endsWith("/ArcadeRuntime.js")) && inputNames.some((path) => path.endsWith("/game.js")),
        detail: `retained lean inputs: ${Object.keys(retained).join(", ")}`
      });
    }

    checks.push({
      id: `${profile}-excludes-optional-subsystems`,
      pass:
        !Object.keys(result.metafile.inputs).some((path) => /@aura3d\/(?:engine|physics|physics-rapier|navigation-recast|editor|editor-runtime|three-compat)/u.test(path)) &&
        !/@dimforge\/rapier|recast-navigation|three-compat/u.test(outputSource),
      detail: "engine compatibility, physics, Rapier, navigation, editor, and Three compatibility are absent from the emitted graph"
    });

    measurements[profile] = {
      entry: entryPath.slice(root.length + 1),
      installedPackage: `${manifest.name}@${manifest.version}`,
      outputBytes,
      retainedLeanBytes: retained,
      leanInputBytes: packageBytes,
      leanInputs: inputNames
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
  source: "fresh local 2.0.0 tarballs installed by tests/reports/package-clean-install.json",
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

function retainedLeanInputs(metafile: Metafile): Record<string, number> {
  const retained: Record<string, number> = {};
  for (const output of Object.values(metafile.outputs)) {
    for (const [path, contribution] of Object.entries(output.inputs)) {
      if (!path.includes("node_modules/@aura3d/lean/dist/")) continue;
      const name = basename(path);
      retained[name] = (retained[name] ?? 0) + contribution.bytesInOutput;
    }
  }
  return retained;
}
