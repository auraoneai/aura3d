#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../..");
const contextRelativePath = "benchmark/context/threejs-r185.1-20260808.json";
const inventoryRelativePath = "docs/project/parity/threejs-r185-surface-inventory.md";
const reportRelativePath = "tests/reports/current-threejs-baseline.json";
const historicalVersion = "0.165.0";
const online = process.argv.includes("--online");
const gateOnly = process.argv.includes("--gate-only");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(resolve(repoRoot, relativePath))).digest("hex");
}

function check(id, pass, detail) {
  return { id, pass, detail };
}

function packageVersionFromSource(relativePath, expression) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const match = expression.exec(source);
  return match?.[1] ?? null;
}

function npmLatest() {
  if (!online) return null;
  const raw = JSON.parse(execFileSync("npm", ["view", "three@latest", "version", "dist.integrity", "gitHead", "time", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  }));
  return {
    version: raw.version,
    "dist.integrity": raw["dist.integrity"],
    gitHead: raw.gitHead,
    publishedAt: raw.time?.[raw.version] ?? null
  };
}

function releaseDistance(frozenVersion, latestVersion) {
  const frozen = /^0\.(\d+)\./.exec(frozenVersion);
  const latest = /^0\.(\d+)\./.exec(latestVersion);
  if (!frozen || !latest) return Number.POSITIVE_INFINITY;
  return Number(latest[1]) - Number(frozen[1]);
}

const context = readJson(contextRelativePath);
const rootManifest = readJson("package.json");
const benchmarkManifest = readJson("benchmarks/threejs/package.json");
const lockfile = readFileSync(resolve(repoRoot, "pnpm-lock.yaml"), "utf8");
const currentInputs = {
  context: context.three.version,
  rootThree: rootManifest.devDependencies?.three ?? null,
  rootThreeTypes: rootManifest.devDependencies?.["@types/three"] ?? null,
  benchmarkThree: benchmarkManifest.devDependencies?.three ?? null,
  benchmarkDeclaredVersion: benchmarkManifest.benchmarkEngine?.version ?? null,
  setupEngine: packageVersionFromSource("benchmark/runner/setup-engine.mjs", /three:\s*"([^"]+)"/),
  developerFriction: packageVersionFromSource("tools/developer-friction/install-to-first-cube.ts", /const threeVersion = "([^"]+)"/),
  sharedDescriptor: packageVersionFromSource("benchmarks/shared/scenes/descriptor.ts", /threejs:\s*"([^"]+)"/),
  visualReference: packageVersionFromSource("tests/visual/pbr-environment-pixels.spec.ts", /referencePackage:\s*"three@([^"]+)"/)
};
const latest = npmLatest();
const checks = [
  check("context-exists", existsSync(resolve(repoRoot, contextRelativePath)), contextRelativePath),
  check("surface-inventory-exists", existsSync(resolve(repoRoot, inventoryRelativePath)), inventoryRelativePath),
  check("context-is-not-historical-target", context.three.version !== historicalVersion, `current=${context.three.version}; forbidden current target=${historicalVersion}`),
  check("current-inputs-agree", Object.entries(currentInputs).filter(([key]) => key !== "rootThreeTypes").every(([, value]) => value === context.three.version), JSON.stringify(currentInputs)),
  check("types-match-current-minor", currentInputs.rootThreeTypes === "0.185.4", `@types/three=${currentInputs.rootThreeTypes}`),
  check("npm-and-tag-commit-agree", context.three.npmGitHead === context.three.releaseCommit, `${context.three.npmGitHead} vs ${context.three.releaseCommit}`),
  check("root-lock-has-current-three", lockfile.includes("three@0.185.1:") && lockfile.includes("specifier: 0.185.1"), "pnpm lock contains exact three@0.185.1 importer and package"),
  check("root-lock-does-not-select-historical-three", !lockfile.includes("three@0.165.0:") && !lockfile.includes("specifier: ^0.165.0") && !lockfile.includes("specifier: 0.165.0"), "pnpm lock has no active three@0.165.0 package/importer"),
  check("official-surface-inventory-complete", ["WebGLRenderer", "WebGPURenderer", "TSL", "EffectComposer", "GLTFLoader", "AnimationMixer", "InstancedMesh", "LOD", "WebXRManager"].every((name) => context.officialSurfaceSources.some((url) => url.includes(name.toLowerCase()) || url.includes(name))), `${context.officialSurfaceSources.length} official source URLs locked`),
  check("workload-set-complete", context.workloads.length === 15, `${context.workloads.length} of 15 required workloads locked`),
  check("common-render-contract-complete", Boolean(context.commonRenderContract?.viewport && context.commonRenderContract?.camera && context.commonRenderContract?.lighting && context.commonRenderContract?.color && context.commonRenderContract?.sampling && context.commonRenderContract?.nonInferiority), "viewport, DPR, camera, lighting, color, sampling, and thresholds present"),
  check("asset-hashes-current", Object.values(context.assets).every((asset) => existsSync(resolve(repoRoot, asset.path)) && sha256(asset.path) === asset.sha256), `${Object.keys(context.assets).length} locked assets match bytes on disk`),
  ...(latest ? [
    check("npm-latest-matches-or-is-within-two-releases", releaseDistance(context.three.version, latest.version) >= 0 && releaseDistance(context.three.version, latest.version) <= 2, `frozen=${context.three.version}; npm latest=${latest.version}; stable-release distance=${releaseDistance(context.three.version, latest.version)}`),
    check("npm-latest-integrity-matches-when-same-version", latest.version !== context.three.version || latest["dist.integrity"] === context.three.npmIntegrity, `frozen=${context.three.npmIntegrity}; npm=${latest["dist.integrity"]}`),
    check("npm-latest-git-head-matches-when-same-version", latest.version !== context.three.version || latest.gitHead === context.three.releaseCommit, `frozen=${context.three.releaseCommit}; npm=${latest.gitHead}`)
  ] : [])
];
const failures = checks.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.detail}`);
const report = {
  schema: "aura3d.current-threejs-baseline/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  mode: online ? "online-registry-verification" : "locked-source-verification",
  contextPath: contextRelativePath,
  contextSha256: sha256(contextRelativePath),
  inventoryPath: inventoryRelativePath,
  inventorySha256: sha256(inventoryRelativePath),
  historicalVersion,
  currentInputs,
  three: context.three,
  latest,
  checks,
  failures
};

if (!gateOnly) {
  mkdirSync(dirname(resolve(repoRoot, reportRelativePath)), { recursive: true });
  writeFileSync(resolve(repoRoot, reportRelativePath), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
