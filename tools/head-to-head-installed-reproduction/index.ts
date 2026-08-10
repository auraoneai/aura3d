import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const workspace = resolve(root, "tests/reports/current-head-to-head-installed");
const tarballDirectory = resolve(root, "tests/reports/release-tarballs");
const reportPath = resolve(workspace, "report.json");
const specs = [
  "tests/browser/head-to-head-primitive-scene.spec.ts",
  "tests/browser/head-to-head-gltf-product-viewer.spec.ts",
  "tests/browser/head-to-head-cinematic-architecture.spec.ts",
  "tests/browser/head-to-head-digital-twin-data.spec.ts",
  "tests/browser/head-to-head-instancing-lod.spec.ts",
  "tests/browser/head-to-head-skinned-morph-animation.spec.ts",
  "tests/browser/head-to-head-custom-material-shader.spec.ts",
  "tests/browser/head-to-head-postprocessed-scene.spec.ts",
  "tests/browser/head-to-head-physical-character.spec.ts",
  "tests/browser/head-to-head-physical-vehicle.spec.ts",
  "tests/browser/head-to-head-navigation-crowd.spec.ts",
  "tests/browser/head-to-head-webgpu-tsl.spec.ts",
  "tests/browser/head-to-head-xr-interaction.spec.ts",
  "tests/browser/head-to-head-resource-lifecycle.spec.ts",
  "tests/browser/head-to-head-scaffold-to-deploy.spec.ts"
] as const;
const aggregateTools = [
  "head-to-head-primitive",
  "head-to-head-gltf-product-viewer",
  "head-to-head-cinematic-architecture",
  "head-to-head-digital-twin-data",
  "head-to-head-instancing-lod",
  "head-to-head-skinned-morph-animation",
  "head-to-head-custom-material-shader",
  "head-to-head-postprocessed-scene",
  "head-to-head-physical-character",
  "head-to-head-physical-vehicle",
  "head-to-head-navigation-crowd",
  "head-to-head-webgpu-tsl",
  "head-to-head-xr-interaction",
  "head-to-head-resource-lifecycle",
  "head-to-head-scaffold-to-deploy"
] as const;

rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
run("pnpm", ["build:raw"], root);
run("node", ["tools/release/publish-all.mjs", "--dry-run"], root);

const tarballs = readdirSync(tarballDirectory)
  .filter((name) => name.endsWith("-2.0.0.tgz"))
  .map((name) => resolve(tarballDirectory, name))
  .sort();
if (tarballs.length !== 29) throw new Error(`Expected 29 Aura3D 2.0.0 tarballs, found ${tarballs.length}.`);

writeFileSync(resolve(workspace, "package.json"), `${JSON.stringify({
  name: "aura3d-current-head-to-head-installed-reproduction",
  version: "0.0.0",
  private: true,
  type: "module"
}, null, 2)}\n`);
run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], workspace);

const installedManifests = readdirSync(resolve(workspace, "node_modules/@aura3d"))
  .map((name) => resolve(workspace, "node_modules/@aura3d", name, "package.json"))
  .filter(existsSync)
  .map((path) => JSON.parse(readFileSync(path, "utf8")) as { readonly name: string; readonly version: string })
  .map(({ name, version }) => ({ name, version }))
  .sort((left, right) => left.name.localeCompare(right.name));
const createManifest = JSON.parse(readFileSync(resolve(workspace, "node_modules/create-aura3d/package.json"), "utf8")) as {
  readonly name: string;
  readonly version: string;
};
const installedPackages = [...installedManifests, { name: createManifest.name, version: createManifest.version }]
  .sort((left, right) => left.name.localeCompare(right.name));
if (installedPackages.length !== 29 || installedPackages.some((entry) => entry.version !== "2.0.0")) {
  throw new Error(`Installed package inventory is not the exact 29-package 2.0.0 set: ${JSON.stringify(installedPackages)}`);
}

const environment = { ...process.env, A3D_INSTALLED_PACKAGE_ROOT: workspace };
run("pnpm", ["exec", "playwright", "test", ...specs, "--reporter=line", "--workers=1"], root, environment);
for (const tool of aggregateTools) {
  run("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", `tools/${tool}/index.ts`], root, environment);
}

const commit = run("git", ["rev-parse", "HEAD"], root).trim();
const lockSha256 = sha256(resolve(root, "pnpm-lock.yaml"));
const reportBase = {
  schema: "aura3d.current-head-to-head-installed-reproduction/1.0",
  generatedAt: new Date().toISOString(),
  pass: true,
  mode: "fresh-local-tarballs-installed-by-npm",
  commit,
  lockSha256,
  packageCount: installedPackages.length,
  packages: installedPackages,
  tarballs: tarballs.map((path) => ({ file: basename(path), sha256: sha256(path) })),
  environmentVariable: { name: "A3D_INSTALLED_PACKAGE_ROOT", value: "<tests/reports/current-head-to-head-installed>" },
  workloadCount: specs.length,
  specs,
  aggregateTools,
  aggregatePath: "tests/reports/current-head-to-head/aggregate.json",
  claimBoundary: "All 15 retained browser workloads resolved Aura3D public imports from fresh 2.0.0 npm tarballs installed in an isolated project. Current Three.js and companion controls remain the repository-locked public packages. This does not substitute for a clean-VM rerun, independent human review, or the complete performance-sampling contract."
};
writeFileSync(reportPath, `${JSON.stringify(reportBase, null, 2)}\n`);
run("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/head-to-head-current-aggregate/index.ts"], root, environment);
const report = {
  ...reportBase,
  aggregateSha256: sha256(resolve(root, "tests/reports/current-head-to-head/aggregate.json"))
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Installed-package head-to-head PASS: ${specs.length}/15 workloads, ${installedPackages.length}/29 Aura packages; ${reportPath}`);

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const output = execFileSync(command, [...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (output.trim()) process.stdout.write(output);
  return output;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
