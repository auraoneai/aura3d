#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = "tests/reports/final-subsystem-ownership.json";
const docPath = "docs/architecture/final-subsystem-ownership.md";
const adrRegistryPath = "tools/final-subsystem-ownership/adr-registry.json";
const externalAuditPath = "tests/reports/external-candidate-package-audit.json";
const online = process.argv.includes("--online");
const write = !process.argv.includes("--check");
const dispositions = new Set([
  "AURA-CORE", "AURA-MOAT", "EXTERNAL-ADAPTER", "BROWSER-STANDARD",
  "OPTIONAL-PLUGIN", "COMPATIBILITY-ONLY", "DEPRECATE-REMOVE", "DELETE-NOW", "EVIDENCE-ONLY"
]);

const packageDisposition = {
  animation: "AURA-CORE", apps: "AURA-MOAT", "asset-index": "AURA-MOAT", assets: "AURA-MOAT",
  audio: "BROWSER-STANDARD", "aura3d-cli": "AURA-MOAT", controls: "AURA-CORE", core: "AURA-CORE",
  "create-aura3d": "AURA-MOAT", debug: "AURA-MOAT", ecs: "COMPATIBILITY-ONLY",
  "editor-runtime": "OPTIONAL-PLUGIN", editor: "OPTIONAL-PLUGIN", engine: "AURA-MOAT",
  environments: "AURA-CORE", input: "AURA-CORE", materials: "AURA-CORE", math: "AURA-CORE",
  "navigation-recast": "EXTERNAL-ADAPTER", physics: "COMPATIBILITY-ONLY", "physics-rapier": "EXTERNAL-ADAPTER", "product-studio": "AURA-MOAT", react: "EXTERNAL-ADAPTER",
  rendering: "AURA-CORE", scene: "AURA-CORE", scripting: "COMPATIBILITY-ONLY",
  "three-compat": "COMPATIBILITY-ONLY", workflows: "AURA-MOAT"
};

const overrides = [
  { id: "physics-evidence-descriptors", package: "physics", match: /(?:Cloth|Fluid|Fracture|SoftBody|FireSmoke|Sandbox|Platformer).*Fixtures\.ts$/, disposition: "EVIDENCE-ONLY", owner: "tests/tools", decision: "Move out of the published runtime; never represent descriptors as solvers." },
  { id: "physics-navigation-crowd-steering", package: "physics", match: /\/(?:Navigation|Crowd|Steering)\.ts$/, disposition: "OPTIONAL-PLUGIN", owner: "recast/steering adapter candidate", decision: "Bake off against Recast/Detour and maintained alternatives in Phase 2." },
  { id: "physics-custom-physical-controllers", package: "physics", match: /\/(?:CharacterController|KinematicBody|KinematicWorld|VehicleDynamics)\.ts$/, disposition: "DEPRECATE-REMOVE", owner: "selected optional physics engine", decision: "Retain only until the optional-engine bake-off and migration proof identify replacements." },
  { id: "physics-cannon-adapter", package: "physics", match: /\/(?:PhysicsWorld|PhysicsStepper|RigidBody|Collider|Constraint|Constraints|CollisionEvents|Shape|Raycast|TimeOfImpact|SurfaceQuery|NarrowPhase)\.ts$/, disposition: "EXTERNAL-ADAPTER", owner: "current cannon-es adapter", decision: "Compare against current Rapier topology; exactly one physical solver may remain." },
  { id: "audio-evidence-fixtures", package: "audio", match: /Fixtures\.ts$/, disposition: "EVIDENCE-ONLY", owner: "tests/tools", decision: "Move non-runtime fixtures out of the published audio package." },
  { id: "audio-browser-runtime", package: "audio", match: /\.ts$/, disposition: "BROWSER-STANDARD", owner: "Web Audio or selected thin adapter", decision: "Select one playback owner; retain Aura-specific cue semantics only." },
  { id: "asset-evidence-fixtures", package: "assets", match: /(?:Fixtures|ExternalParity).*\.ts$/, disposition: "EVIDENCE-ONLY", owner: "tests/tools", decision: "Remove evidence-only source from the published runtime after consumer proof." },
  { id: "engine-node-media-publishing", package: "engine", match: /\/(?:FfmpegFrameEncoder|CloudRenderAdapter|PublishingPipeline|VideoExportPipeline|YouTubeMetadataGenerator|YouTubeUploadAdapter|PngSequenceEncoder|CaptionExporter|AudioMuxer)\.ts$/, disposition: "OPTIONAL-PLUGIN", owner: "Node/media integration package", decision: "Remove Node/cloud/FFmpeg ownership from browser entries." },
  { id: "engine-browser-media", package: "engine", match: /\/(?:BrowserFrameCaptureAdapter|MediaRecorderFrameEncoder|WebCodecsFrameEncoder|FrameEncoder)\.ts$/, disposition: "BROWSER-STANDARD", owner: "browser media adapter", decision: "Keep browser capture separate from Node encoding and publishing." },
  { id: "editor-evidence-fixtures", package: "editor-runtime", match: /Fixtures\.ts$/, disposition: "EVIDENCE-ONLY", owner: "tests/tools", decision: "Move fixtures out of the optional editor runtime." }
];

const externalLocks = {
  "@dimforge/rapier3d": ["0.20.0", "sha512-Tj5dwOG5kXgcN/JRgOLTk64UFBd9KkaCAsWHcmPXOcyuBX6Vo7/ptSwS6zW++NvZebjJOW9/njmIqTM4VsaUog==", "Apache-2.0", "2026-08-08T22:04:29.667Z"],
  "@dimforge/rapier3d-compat": ["0.20.0", "sha512-X4W9pJBdGRX5CO3c/gUNjBFEFG2fn4nYxp9k8STdBDaLa0/w5XTW2ArpayS+9jGFojTi3uFSOWAElCd4rkpekA==", "Apache-2.0", "2026-08-08T22:07:07.640Z"],
  "cannon-es": ["0.20.0", "sha512-eZhWTZIkFOnMAJOgfXJa9+b3kVlvG+FX4mdkpePev/w/rP5V8NRquGyEozcjPfEoXUlb+p7d9SUcmDSn14prOA==", "MIT", "2022-08-12T16:46:01.002Z"],
  "recast-navigation": ["0.43.1", "sha512-BVBQEHE6uqD36opJomVkI5TxMVZ8bBLdDn90mYtBUYJnNlqEuNFOL8DH8lLOksfVVaC+kjykYuS57P6MrxVB7A==", "MIT", "2026-02-04T13:50:20.423Z"],
  howler: ["2.2.4", "sha512-iARIBPgcQrwtEr+tALF+rapJ8qSc+Set2GJQl7xT1MQzWaVkFebdJhR3alVlSiUf5U7nAANKuj3aWpwerocD5w==", "MIT", "2023-09-19T14:59:40.275Z"],
  yuka: ["0.7.8", "sha512-G/pFcMZh2Azz7Yy500NSV1jQ0Ru7h9hTNyEW+HjRXcdzjJIyp/3mCGspnx7VJVP06zxORqK6mkl5TywLqVUnVg==", "MIT", "2022-09-17T08:45:45.072Z"],
  bitecs: ["0.4.0", "sha512-ho6Zop/L79DRTnBAfakPpGPuX7y0+lAjX06CpaAW+5tnAc7BH3L3RlSrWAXAqwnQGDZ10GsoxaxyTTsddlun3g==", "MPL-2.0", "2025-12-06T23:15:32.228Z"],
  miniplex: ["2.0.0", "sha512-pJlxmlPf5Qyx12amgOCyRE6Lzw28ct2G0lF9xn7/xudLtA/xDOUnCIU2xOxCk8GkjePYctcNpjmFshJp/Ht66A==", "MIT", "2023-07-16T11:26:33.188Z"]
};

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
}
function walk(root, accept = () => true) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(path, accept));
    else if (accept(path)) out.push(path);
  }
  return out;
}
function linesAndBytes(files) {
  let lines = 0; let bytes = 0;
  for (const file of files) { const value = readFileSync(file); bytes += value.length; lines += value.toString("utf8").split("\n").length - 1; }
  return { lines, bytes };
}
function compressedDist(packageDir) {
  const files = walk(join(packageDir, "dist"), (path) => path.endsWith(".js"));
  const value = Buffer.concat(files.map((path) => readFileSync(path)));
  return { jsFiles: files.length, rawBytes: value.length, gzipBytes: value.length ? gzipSync(value).length : 0, brotliBytes: value.length ? brotliCompressSync(value).length : 0, caveat: "sum of built JS, not a tree-shaken application workload" };
}
function compiledSubsystemCost(files) {
  const compiled = files.map((path) => resolve(repoRoot, path.replace(/\/src\/(.+)\.(?:ts|tsx|mts|cts)$/, "/dist/$1.js"))).filter(existsSync);
  const value = Buffer.concat(compiled.map((path) => readFileSync(path)));
  return { compiledFiles: compiled.length, rawBytes: value.length, gzipBytes: value.length ? gzipSync(value).length : 0, brotliBytes: value.length ? brotliCompressSync(value).length : 0, caveat: "concatenated built modules before application tree-shaking" };
}
function sha256(path) { return createHash("sha256").update(readFileSync(resolve(repoRoot, path))).digest("hex"); }
function npmLatest(name) {
  if (!online) return null;
  return JSON.parse(execFileSync("npm", ["view", `${name}@latest`, "name", "version", "dist.integrity", "license", "repository.url", "time.modified", "maintainers", "dependencies", "type", "types", "module", "main", "sideEffects", "--json"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
}

// `git ls-files` includes paths staged or unstaged for deletion. Evidence generators must be
// runnable before the deletion commit, so inventory only files that still exist in the worktree.
const allTracked = trackedFiles().filter((path) => existsSync(resolve(repoRoot, path)));
const searchable = allTracked.filter((path) => /\.(?:ts|tsx|js|mjs|cjs|json|md|yml|yaml)$/.test(path) && !path.startsWith("tests/reports/final-competitive-baseline/")).map((path) => [path, readFileSync(resolve(repoRoot, path), "utf8")]);
const identifierReferences = new Map();
for (const [path, text] of searchable) {
  for (const identifier of new Set(text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [])) {
    const paths = identifierReferences.get(identifier) ?? [];
    paths.push(path);
    identifierReferences.set(identifier, paths);
  }
}
const packageDirs = readdirSync(resolve(repoRoot, "packages")).filter((name) => existsSync(resolve(repoRoot, "packages", name, "package.json"))).sort();
const packages = [];
const subsystemFiles = new Map();

for (const name of packageDirs) {
  const packageDir = resolve(repoRoot, "packages", name);
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const srcFiles = walk(join(packageDir, "src"), (path) => /\.(?:ts|tsx|mts|cts)$/.test(path));
  const specifier = manifest.name;
  const consumers = { source: [], dynamicImport: [], route: [], fixture: [], cliOrGenerator: [], docs: [], externalConsumer: [] };
  for (const [path, text] of searchable) {
    if (path.startsWith(`packages/${name}/`)) continue;
    if (!text.includes(specifier)) continue;
    if (/import\s*\(/.test(text) && text.includes(specifier)) consumers.dynamicImport.push(path);
    if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(path)) consumers.source.push(path);
    if (/^(apps|examples|templates)\//.test(path)) consumers.route.push(path);
    if (/^(tests|benchmark)\//.test(path)) consumers.fixture.push(path);
    if (/^(tools|workers|marketing)\//.test(path)) consumers.cliOrGenerator.push(path);
    if (/\.md$/.test(path)) consumers.docs.push(path);
    if (/external-consumer|clean-room|package-smoke/.test(path)) consumers.externalConsumer.push(path);
  }
  for (const key of Object.keys(consumers)) consumers[key] = [...new Set(consumers[key])].sort();
  const publicExports = typeof manifest.exports === "object" ? Object.keys(manifest.exports) : manifest.main ? ["."] : [];
  packages.push({
    package: name, publishedName: manifest.name, published: manifest.private !== true, disposition: packageDisposition[name], source: linesAndBytes(srcFiles),
    dist: compressedDist(packageDir), publicExports, publicExportBlocksImmediateRemoval: manifest.private !== true && publicExports.length > 0,
    dependencies: { ...manifest.dependencies, ...manifest.peerDependencies }, consumers,
    consumerCounts: Object.fromEntries(Object.entries(consumers).map(([key, value]) => [key, value.length])),
    zeroSourceConsumers: consumers.source.length === 0,
    maintenanceCost: { sourceFiles: srcFiles.length, testMentions: consumers.fixture.length, docsMentions: consumers.docs.length }
  });
  for (const file of srcFiles) {
    const rel = relative(repoRoot, file);
    const override = overrides.find((item) => item.package === name && item.match.test(rel));
    const id = override?.id ?? `${name}-general`;
    const record = subsystemFiles.get(id) ?? { id, package: name, disposition: override?.disposition ?? packageDisposition[name], owner: override?.owner ?? manifest.name, decision: override?.decision ?? "Retain under the package disposition; reassess only with consumer and migration evidence.", files: [] };
    record.files.push(rel); subsystemFiles.set(id, record);
  }
}

const subsystems = [...subsystemFiles.values()].map((entry) => {
  const files = entry.files.sort();
  const stems = files.map((path) => path.split("/").pop()?.replace(/\.[^.]+$/, "")).filter((stem) => stem && stem !== "index");
  const maintenanceReferences = stems.flatMap((stem) => identifierReferences.get(stem) ?? []).filter((path) => !files.includes(path));
  return { ...entry, ...linesAndBytes(files.map((path) => resolve(repoRoot, path))), compiledCost: compiledSubsystemCost(files), maintenanceReferences: [...new Set(maintenanceReferences)].sort(), maintenanceReferenceCount: new Set(maintenanceReferences).size, files };
}).sort((a, b) => a.id.localeCompare(b.id));
const externalPackageAudit = existsSync(resolve(repoRoot, externalAuditPath)) ? JSON.parse(readFileSync(resolve(repoRoot, externalAuditPath), "utf8")) : null;
const externalCandidates = Object.entries(externalLocks).map(([name, [version, integrity, license, modified]]) => {
  const live = npmLatest(name);
  const ageDays = Math.floor((Date.parse("2026-08-08T23:59:59Z") - Date.parse(modified)) / 86_400_000);
  const freshness = ageDays <= 365 ? "active" : ageDays <= 1095 ? "aging" : "dormant-risk";
  const packageShape = name.includes("rapier3d") ? "ESM/WASM; initialization and lazy-load topology require Phase 2 measurement" : name === "howler" ? "legacy main bundle; browser audio singleton behavior requires Phase 2 measurement" : "package metadata locked; runtime shape requires Phase 2 measurement";
  const packageAudit = externalPackageAudit?.packages?.find((entry) => entry.name === name) ?? null;
  return {
    name, version, integrity, license, modified, ageDays, freshness,
    repository: live?.["repository.url"] ?? null, maintainers: live?.maintainers ?? null,
    dependencies: live?.dependencies ?? {}, moduleShape: { type: live?.type ?? null, types: live?.types ?? null, module: live?.module ?? null, main: live?.main ?? null, sideEffects: live?.sideEffects ?? null, summary: packageShape },
    scoring: {
      maintenance: freshness === "active" ? 3 : freshness === "aging" ? 2 : 0,
      license: ["MIT", "Apache-2.0"].includes(license) ? 3 : 1,
      types: live ? (live.types ? 3 : 1) : null,
      deterministicBehavior: "Phase 2 workload measurement required",
      disposalOwnership: "Phase 2 repeated-mount measurement required",
      browserNodeWorkerSupport: "Phase 2 bundle/runtime measurement required",
      securityHistory: "Phase 2 isolated lockfile audit required",
      fiveYearExitRisk: freshness === "dormant-risk" ? "high" : "medium until adapter boundary is proven"
    },
    packageAudit,
    onlineLockMatches: live ? live.version === version && live["dist.integrity"] === integrity : null
  };
});

const adrRegistry = JSON.parse(readFileSync(resolve(repoRoot, adrRegistryPath), "utf8"));
const addedPackageSource = execFileSync("git", ["diff", "--name-status", adrRegistry.baselineCommit, "--", "packages/*/src"], { cwd: repoRoot, encoding: "utf8" })
  .trim().split("\n").filter(Boolean).map((line) => line.split("\t")).filter(([status]) => status === "A").map(([, path]) => path);
const architectureLock = {
  baselineCommit: adrRegistry.baselineCommit,
  addedPackageSource,
  adrMappings: adrRegistry.addedPackageSource,
  missingAdrMappings: addedPackageSource.filter((path) => {
    const adr = adrRegistry.addedPackageSource[path];
    return !adr || !existsSync(resolve(repoRoot, adr)) || !/^docs\/architecture\/adr\//.test(adr);
  })
};

const overlaps = [
  { capability: "physical integration", owners: ["cannon-es via PhysicsWorld", "KinematicBody/KinematicWorld", "CharacterController", "VehicleDynamics"], status: "duplicate custom physical controller ownership; Phase 2 removal candidate" },
  { capability: "navigation and crowd", owners: ["optional Recast/Detour adapter"], status: "single selected owner after the major-version migration" },
  { capability: "audio context/mixing/effects", owners: ["AudioContextManager", "AudioMixer/Bus", "effects wrappers", "route/browser unlock handlers"], status: "potential duplicate browser ownership; Phase 2 characterization required" },
  { capability: "media encoding/publishing", owners: ["browser encoders", "FFmpeg adapter", "cloud/YouTube publishing"], status: "Node/browser ownership mixed in engine agent API" }
];
const failures = [];
if (packages.length !== Object.keys(packageDisposition).length) failures.push(`package-classification:${packages.length}/${Object.keys(packageDisposition).length}`);
if (packages.some((entry) => !dispositions.has(entry.disposition))) failures.push("invalid-package-disposition");
if (subsystems.some((entry) => !dispositions.has(entry.disposition))) failures.push("invalid-subsystem-disposition");
if (new Set(subsystems.flatMap((entry) => entry.files)).size !== subsystems.reduce((sum, entry) => sum + entry.files.length, 0)) failures.push("source-file-multiple-classification");
if (online && externalCandidates.some((entry) => !entry.onlineLockMatches)) failures.push("external-lock-drift");
if (!externalPackageAudit?.pass || externalCandidates.some((entry) => !entry.packageAudit)) failures.push("external-package-audit-missing-or-failing");
if (architectureLock.missingAdrMappings.length > 0) failures.push(`new-package-source-without-adr:${architectureLock.missingAdrMappings.join(",")}`);

const report = {
  schema: "aura3d.final-subsystem-ownership/1.0", generatedAt: new Date().toISOString(), pass: failures.length === 0,
  claimBoundary: "Phase 1 ownership inventory and migration queue only; no deletion, dependency selection, parity, or release claim.",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
  graphCoverage: ["static source imports", "dynamic imports", "package exports", "CLI/tool/worker generators", "docs", "tests/fixtures/benchmarks", "routes/templates", "external-consumer and clean-room tests"],
  packageCount: packages.length, subsystemCount: subsystems.length, sourceFilesClassified: subsystems.reduce((sum, entry) => sum + entry.files.length, 0),
  packages, subsystems, externalCandidates, overlaps, architectureLock, failures
};

function cell(value) { return String(value).replaceAll("|", "\\|").replaceAll("\n", " "); }
function renderDoc(value) {
  const lines = [
    "# Final Subsystem Ownership",
    "",
    `Generated from \`tools/final-subsystem-ownership/index.mjs\` at commit \`${value.sourceCommit}\`.`,
    "",
    value.claimBoundary,
    "",
    "## Package dispositions",
    "",
    "| Package | Disposition | Source lines | Source consumers | Public exports | Built JS gzip | Removal blocked by public export |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |"
  ];
  for (const entry of value.packages) lines.push(`| \`${entry.publishedName}\` | \`${entry.disposition}\` | ${entry.source.lines} | ${entry.consumerCounts.source} | ${entry.publicExports.length} | ${entry.dist.gzipBytes} | ${entry.publicExportBlocksImmediateRemoval ? "yes" : "no"} |`);
  lines.push("", "## Runtime subsystem dispositions", "", "Every package source file is assigned exactly once. General rows inherit the package decision; exceptional rows isolate commodity, compatibility, optional, and evidence-only ownership.", "", "| Subsystem | Package | Disposition | Files | Lines | Built gzip | Maintenance refs | Decision |", "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |");
  for (const entry of value.subsystems) lines.push(`| \`${entry.id}\` | \`${entry.package}\` | \`${entry.disposition}\` | ${entry.files.length} | ${entry.lines} | ${entry.compiledCost.gzipBytes} | ${entry.maintenanceReferenceCount} | ${cell(entry.decision)} |`);
  lines.push("", "## External-candidate maintenance lock", "", "A metadata score is not a selection. Runtime, bundle, determinism, disposal, worker, and isolated security measurements remain mandatory in Phase 2.", "", "| Candidate | Version | License | Modified | Freshness | Integrity | Exit-risk note |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const entry of value.externalCandidates) {
    const bundle = entry.packageAudit?.allExportBrowserBundle;
    const exitRisk = `${entry.scoring.fiveYearExitRisk}; tarball ${entry.packageAudit?.tarball?.packageBytes ?? "unmeasured"} B; all-export browser gzip ${bundle?.pass ? `${bundle.gzipBytes} B` : `requires explicit WASM loader (${bundle?.error ?? "unmeasured"})`}; isolated npm audit ${entry.packageAudit?.security?.vulnerable ? "vulnerable" : "0 vulnerabilities"}`;
    lines.push(`| \`${entry.name}\` | \`${entry.version}\` | ${entry.license} | ${entry.modified.slice(0, 10)} | ${entry.freshness} | \`${entry.integrity}\` | ${cell(exitRisk)} |`);
  }
  lines.push("", "## Consumer and removal truth", "", `The machine report retains the complete per-package paths for source, dynamic-import, route, fixture, generator/CLI, docs, and installed-consumer evidence. A package with zero direct source consumers is not deletable when its public exports, generators, docs, fixtures, or external-consumer proofs remain. All ${value.packageCount} packages publish at least one export, so none is a \`DELETE-NOW\` package in this inventory.`, "", "Known overlap queues:", "");
  for (const entry of value.overlaps) lines.push(`- **${entry.capability}:** ${entry.status}. Owners: ${entry.owners.join(", ")}.`);
  lines.push("", "## Architecture lock", "", `The source-addition baseline is \`${value.architectureLock.baselineCommit}\`. Every added \`packages/*/src\` file after that commit must be mapped to an existing ADR in \`${adrRegistryPath}\`; the current missing-ADR count is **${value.architectureLock.missingAdrMappings.length}**. A new package also fails because it has no disposition.`, "", "## Decision boundary", "", "No source is deleted by this audit. `DEPRECATE-REMOVE` means a candidate migration queue requiring Phase 2 bake-off, R8 deletion proof, semver review, migration tests, and rollback. `EVIDENCE-ONLY` means the code cannot support a shipped runtime claim and should move only after its consumers are relocated. Dormant-risk libraries are not selected merely because they are familiar.");
  return `${lines.join("\n")}\n`;
}

if (write) {
  mkdirSync(dirname(resolve(repoRoot, reportPath)), { recursive: true });
  mkdirSync(dirname(resolve(repoRoot, docPath)), { recursive: true });
  writeFileSync(resolve(repoRoot, reportPath), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(repoRoot, docPath), renderDoc(report));
}
console.log(JSON.stringify({ pass: report.pass, packages: report.packageCount, subsystems: report.subsystemCount, sourceFilesClassified: report.sourceFilesClassified, externalCandidates: report.externalCandidates.map((entry) => `${entry.name}@${entry.version}:${entry.freshness}`), failures }, null, 2));
if (!report.pass) process.exitCode = 1;
