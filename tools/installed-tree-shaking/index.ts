/**
 * Measure actual retained code from untouched, packed source-consumer projects.
 * This is a source check: no browser receipt or browser execution is involved.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build, type Metafile } from "esbuild";
import { hashConsumerProject, restorePackedConsumerProject, restorePortableConsumerProject, validateSourceConsumerReport, type NativeConsumerProject } from "../package-clean-install/index";
import { loadValidatedReleasePlan, type ExactReleasePlan } from "../release/exact-release-plan.mjs";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
interface Slice { readonly id: string; readonly project: string; readonly requiredImports: readonly string[] }

export const SLICES: readonly Slice[] = [
  { id: "root", project: "product-viewer", requiredImports: ["@aura3d/engine"] },
  { id: "game-addon", project: "mini-game", requiredImports: ["@aura3d/engine", "@aura3d/engine/game"] },
  { id: "react", project: "react-import", requiredImports: ["@aura3d/react"] }
];

// Optional peers may be absent. Keep only their asynchronous imports external;
// a static import or any other missing dependency fails. These are recorded in
// the output rather than counted as bytes transferred by this bundle.
const OPTIONAL_PEERS = ["@dimforge/rapier3d-compat", "@aura3d/navigation-recast", "recast-navigation", "recast-navigation/*"];
// Node-only branches that installed dependencies reach through a dynamic `import("node:...")` (for example
// @gltf-transform/core's HTTP/file helper). A browser never runs them; bundlers such as Vite stub them, esbuild
// needs them declared external. Like the optional peers they are valid only as dynamic imports and are recorded.
const NODE_DYNAMIC_IMPORTS = ["node:fs", "node:path"];
const ALLOWED_EXTERNALS = [...OPTIONAL_PEERS, ...NODE_DYNAMIC_IMPORTS];
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function inside(parent: string, path: string): boolean {
  const rel = relative(parent, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Locate the packed-consumer source report. A missing file is named as such (it is normally absent
 * because `package-clean-install --phase source` failed first), distinct from a path outside the root.
 */
export function resolveSourceReportFile(root: string, sourceReportPath: string): string {
  const reportFile = resolve(root, sourceReportPath);
  if (!existsSync(reportFile)) {
    throw new Error(`Source report not found: ${relative(root, reportFile).split(sep).join("/")} (it is written by package-clean-install --phase source; check that step first)`);
  }
  if (!inside(realpathSync(root), realpathSync(reportFile))) throw new Error("Source report must be inside the source root");
  return reportFile;
}

/** Enforce that project builds never silently resolve workspace dependencies. */
export function assertIsolatedInputs(projectRoot: string, inputs: readonly string[]): void {
  const project = realpathSync(projectRoot);
  for (const input of inputs) {
    const file = resolve(projectRoot, input);
    if (!existsSync(file) || !inside(project, realpathSync(file))) {
      throw new Error(`Consumer dependency resolves outside isolated project: ${input}`);
    }
  }
}

/** Externals are valid only for documented asynchronous optional peer loads. */
export function assertOptionalExternals(metafile: Metafile): string[] {
  const externals = Object.values(metafile.outputs).flatMap(output => output.imports.filter(entry => entry.external));
  for (const entry of externals) {
    const allowed = ALLOWED_EXTERNALS.some(peer => peer.endsWith("/*") ? entry.path.startsWith(peer.slice(0, -1)) : entry.path === peer);
    if (!allowed || entry.kind !== "dynamic-import") throw new Error(`Unexpected external ${entry.kind}: ${entry.path}`);
  }
  return [...new Set(externals.map(entry => entry.path))].sort();
}

/** Sum emitted bytes by installed package; use contributions, not graph presence. */
export function retainedPackages(metafile: Metafile): Record<string, number> {
  const result: Record<string, number> = {};
  for (const output of Object.values(metafile.outputs)) {
    for (const [path, contribution] of Object.entries(output.inputs)) {
      // An npm installation can nest a dependency beneath another package.
      // Attribute it to the innermost package, not its parent.
      const parts = path.replaceAll("\\", "/").split("/");
      const index = parts.lastIndexOf("node_modules");
      const first = parts[index + 1];
      const name = index >= 0 && first ? (first.startsWith("@") && parts[index + 2] ? `${first}/${parts[index + 2]}` : first) : undefined;
      if (name) result[name] = (result[name] ?? 0) + contribution.bytesInOutput;
    }
  }
  return result;
}

/** Attribute bundled engine modules to their published dist subtree. */
export function retainedEngineSubtrees(metafile: Metafile): Record<string, number> {
  const result: Record<string, number> = {};
  for (const output of Object.values(metafile.outputs)) {
    for (const [path, contribution] of Object.entries(output.inputs)) {
      // Use the innermost installation, just as retainedPackages does. A nested
      // dependency under an engine directory is not itself engine code.
      const parts = path.replaceAll("\\", "/").split("/");
      const index = parts.lastIndexOf("node_modules");
      const subtree = parts[index + 4];
      if (index >= 0 && parts[index + 1] === "@aura3d" && parts[index + 2] === "engine" &&
          parts[index + 3] === "dist" && subtree && parts[index + 5]) {
        result[subtree] = (result[subtree] ?? 0) + contribution.bytesInOutput;
      }
    }
  }
  return result;
}

function importsSpecifier(source: string, specifier: string): boolean {
  return new RegExp(`(?:from\\s*|import\\s*)["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "u").test(source);
}

function cliValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--") || argv.lastIndexOf(flag) !== index) throw new Error(`${flag} requires exactly one value`);
  return value;
}

export function copyVerifiedProject(root: string, project: NativeConsumerProject, destination: string): void {
  const source = resolve(root, project.path);
  cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true });
  assertVerifiedProject(project, destination);
}

/** Recheck source, lock and every nested candidate installation before bundling. */
function assertVerifiedProject(project: NativeConsumerProject, destination: string): void {
  if (hashConsumerProject(destination) !== project.projectSha256) throw new Error(`Copied source differs: ${project.template}`);
  if (sha256(readFileSync(join(destination, "package.json"))) !== project.manifestSha256 ||
      sha256(readFileSync(join(destination, "package-lock.json"))) !== project.lockfileSha256) {
    throw new Error(`Copied manifest or lock differs: ${project.template}`);
  }
  for (const installed of project.installedPackages) {
    if (!installed.installPath || isAbsolute(installed.installPath) || installed.installPath.includes("\\") ||
        installed.installPath.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`Invalid installed package path: ${installed.installPath}`);
    }
    const installedPath = resolve(destination, installed.installPath);
    if (!inside(destination, installedPath) || !existsSync(installedPath) || !lstatSync(installedPath).isDirectory() ||
        !inside(realpathSync(destination), realpathSync(installedPath)) || hashConsumerProject(installedPath) !== installed.contentsSha256) {
      throw new Error(`Copied installed package differs: ${project.template}/${installed.name}`);
    }
  }
}

export async function measureSlice(root: string, project: NativeConsumerProject, slice: Slice, work: string, plan?: ExactReleasePlan): Promise<{ checks: Check[]; measurement: unknown }> {
  const isolated = join(work, slice.id);
  if (project.retention === "packed-v1") {
    if (!plan) throw new Error(`A validated candidate plan is required to restore ${project.template}`);
    // Reinstall from the retained lock and staged candidate archives; the
    // restore rechecks every candidate lock identity and installed package.
    await restorePackedConsumerProject(root, project, isolated, plan);
    assertVerifiedProject(project, isolated);
  } else if (project.retention === "portable-v1") {
    if (!plan) throw new Error(`A validated candidate plan is required to restore ${project.template}`);
    // Reconstruct only from the retained lock and candidate archives after the
    // restore helper has checked their identity and dependency independence.
    await restorePortableConsumerProject(root, project, isolated, plan);
    assertVerifiedProject(project, isolated);
  } else {
    // Kept for isolated, explicitly constructed legacy unit fixtures. A real
    // candidate measurement passes a plan and may not use retained installs.
    if (plan || project.kind !== "fixture") throw new Error(`Portable consumer project required: ${project.template}`);
    copyVerifiedProject(root, project, isolated);
  }
  const entryPath = resolve(isolated, project.entry);
  if (!inside(isolated, entryPath) || !existsSync(entryPath)) throw new Error(`Invalid consumer entry for ${slice.id}`);
  const entrySource = readFileSync(entryPath, "utf8");
  const outdir = resolve(isolated, ".aura-measurement-output");
  const result = await build({
    absWorkingDir: isolated,
    entryPoints: [entryPath],
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    splitting: true,
    treeShaking: true,
    metafile: true,
    write: false,
    logLevel: "silent",
    external: ALLOWED_EXTERNALS
  }).catch((error: unknown) => {
    // esbuild's message names only the unresolved import; say which slice and project failed.
    throw new Error(`Installed tree-shaking slice ${slice.id} (${project.template}) failed to bundle: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!result.metafile || !result.outputFiles?.length) throw new Error(`No measurement for ${slice.id}`);
  assertIsolatedInputs(isolated, Object.keys(result.metafile.inputs));
  const externalDynamicImports = assertOptionalExternals(result.metafile);
  const retained = retainedPackages(result.metafile);
  const engineSubtrees = retainedEngineSubtrees(result.metafile);
  const js = result.outputFiles.filter(file => file.path.endsWith(".js"));
  if (!js.length) throw new Error(`No JavaScript outputs for ${slice.id}`);
  const retainedEngineGame = (engineSubtrees.game ?? 0) + (retained["@aura3d/game"] ?? 0);
  const forbidden = ["@aura3d/editor", "@aura3d/editor-runtime", "@aura3d/physics-rapier", "@aura3d/navigation-recast", "@dimforge/rapier3d-compat", "recast-navigation"];
  // These adapters are embedded in the packed engine, so their retained bytes
  // are attributed to @aura3d/engine rather than to the optional package.
  const forbiddenBackends = ["physics-rapier", "navigation-recast"];
  const checks: Check[] = [
    ...slice.requiredImports.map(specifier => ({ id: `${slice.id}-import-${specifier}`, pass: importsSpecifier(entrySource, specifier), detail: `source entry imports ${specifier}` })),
    { id: `${slice.id}-engine-retained`, pass: (retained["@aura3d/engine"] ?? 0) > 0, detail: `${retained["@aura3d/engine"] ?? 0} retained engine bytes` },
    { id: `${slice.id}-excludes-optional-packages`, pass: forbidden.every(name => (retained[name] ?? 0) === 0), detail: `retained packages ${JSON.stringify(retained)}` },
    { id: `${slice.id}-excludes-optional-backend-subtrees`, pass: forbiddenBackends.every(name => (engineSubtrees[name] ?? 0) === 0), detail: `retained engine subtrees ${JSON.stringify(engineSubtrees)}` }
  ];
  if (slice.id !== "react") {
    const excludedSubtrees = ["editor", "editor-runtime", "three-compat", "scripting", "apps", "debug", "aura3d-cli", "create-aura3d"];
    checks.push({ id: `${slice.id}-excludes-optional-engine-subtrees`, pass: excludedSubtrees.every(name => (engineSubtrees[name] ?? 0) === 0), detail: `retained engine subtrees ${JSON.stringify(engineSubtrees)}` });
  }
  if (slice.id === "root") {
    const inputs = result.metafile.inputs;
    const contributions = Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs));
    for (const suffix of ["/engine/public/index.js", "/engine/agent-api/index.js"]) {
      const entry = Object.entries(inputs).find(([path]) => /(?:^|\/)node_modules\/@aura3d\/engine\/dist\//u.test(path.replaceAll("\\", "/")) && path.replaceAll("\\", "/").endsWith(suffix));
      const emitted = entry ? contributions.filter(([path]) => path === entry[0]).reduce((sum, [, value]) => sum + value.bytesInOutput, 0) : 0;
      checks.push({ id: `root-removes-unused-${suffix.includes("public") ? "public" : "agent"}-code`, pass: !!entry && emitted < entry[1].bytes, detail: `${suffix}: ${emitted}/${entry?.[1].bytes ?? 0} bytes retained` });
    }
  }
  if (slice.id === "root") checks.push({ id: "root-excludes-game", pass: retainedEngineGame === 0, detail: `${retainedEngineGame} retained game bytes` });
  if (slice.id === "game-addon") checks.push({ id: "game-addon-retained", pass: retainedEngineGame > 0, detail: `${retainedEngineGame} retained game bytes` });
  if (slice.id === "react") checks.push({ id: "react-adapter-retained", pass: (retained["@aura3d/react"] ?? 0) > 0, detail: `${retained["@aura3d/react"] ?? 0} retained adapter bytes` });
  return {
    checks,
    measurement: {
      project: project.path,
      entry: project.entry,
      manifestSha256: project.manifestSha256,
      lockfileSha256: project.lockfileSha256,
      projectSha256: project.projectSha256,
      installedPackages: project.installedPackages,
      javascriptBytes: js.reduce((sum, file) => sum + file.contents.byteLength, 0),
      gzipBytes: js.reduce((sum, file) => sum + gzipSync(file.contents).byteLength, 0),
      brotliBytes: js.reduce((sum, file) => sum + brotliCompressSync(file.contents).byteLength, 0),
      chunks: js.map(file => basename(file.path)).sort(),
      chunkDigests: js.map(file => ({ name: basename(file.path), bytes: file.contents.byteLength, sha256: sha256(file.contents) })).sort((a, b) => a.name.localeCompare(b.name)),
      retainedPackages: retained,
      retainedEngineSubtrees: engineSubtrees,
      retainedGameBytes: retainedEngineGame,
      externalDynamicImports
    }
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2), root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")): Promise<void> {
  // The source pass exports an absolute NATIVE_REPORT_DIR (tools/remote-acr/source5-run.sh).
  const rawReportDirectory = process.env.NATIVE_REPORT_DIR ?? "tests/reports";
  const reportDirectory = isAbsolute(rawReportDirectory) ? relative(root, rawReportDirectory).split(sep).join("/") : rawReportDirectory;
  if (!/^tests\/reports(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u.test(reportDirectory) || reportDirectory.split("/").some(part => part === "." || part === "..")) {
    throw new Error("NATIVE_REPORT_DIR must be a path under tests/reports");
  }
  const sourceReportPath = cliValue(argv, "--source-report") ?? process.env.NATIVE_CONSUMER_SOURCE_REPORT;
  const candidatePath = cliValue(argv, "--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
  if (!sourceReportPath || !candidatePath || argv.some((value, index) => index % 2 === 0 && value !== "--source-report" && value !== "--candidate-plan") || argv.length % 2 !== 0) {
    throw new Error("Usage: --source-report <source.json> [--candidate-plan <path>] (or set NATIVE_CONSUMER_SOURCE_REPORT and A3D_RELEASE_PLAN)");
  }
  const plan = loadValidatedReleasePlan(root, candidatePath);
  if (!plan) throw new Error("A validated current candidate plan is required");
  const reportFile = resolveSourceReportFile(root, sourceReportPath);
  const reportPath = relative(root, reportFile).replaceAll("\\", "/");
  const reportBytes = readFileSync(reportFile);
  const sourceReport = validateSourceConsumerReport(root, reportPath, plan);
  if (reportPath !== `tests/reports/native-consumers/${sourceReport.runId}/source.json`) throw new Error("Source report path does not match its run ID");
  const temporary = mkdtempSync(join(tmpdir(), "aura3d-installed-tree-shaking-"));
  const checks: Check[] = [];
  const measurements: Record<string, unknown> = {};
  try {
    for (const slice of SLICES) {
      const project = sourceReport.projects.find(row => row.template === slice.project);
      if (!project) throw new Error(`Source report is missing ${slice.project}`);
      const result = await measureSlice(root, project, slice, temporary, plan);
      checks.push(...result.checks);
      measurements[slice.id] = result.measurement;
    }
    // Prevent races between the validation and the bundling of copied projects.
    if (sha256(readFileSync(reportFile)) !== sha256(reportBytes)) throw new Error("Source report changed during measurement");
    const verifiedPlan = loadValidatedReleasePlan(root, candidatePath);
    if (!verifiedPlan || verifiedPlan.reference.sha256 !== plan.reference.sha256) throw new Error("Candidate plan changed during measurement");
    validateSourceConsumerReport(root, reportPath, verifiedPlan);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const failures = checks.filter(check => !check.pass).map(check => `${check.id}: ${check.detail}`);
  const result = {
    schema: "aura3d.installed-tree-shaking/2",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    sourceReport: { path: reportPath, sha256: sha256(reportBytes), runId: sourceReport.runId },
    candidate: { releasePlan: plan.reference, version: plan.version, source: plan.source },
    method: "Restore verified source-phase consumer projects (packed or portable) outside the workspace from their retained lock and candidate archives; sum per-chunk JavaScript, gzip and Brotli bytes and inspect esbuild retained-byte contributions. Dynamic optional-peer imports are listed separately.",
    checks, failures, measurements
  };
  const output = resolve(root, reportDirectory, "installed-tree-shaking.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Installed tree-shaking ${result.pass ? "PASS" : "FAIL"}: ${checks.length - failures.length}/${checks.length}; ${relative(root, output)}`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
