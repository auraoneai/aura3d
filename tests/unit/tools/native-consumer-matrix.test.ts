import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BROWSERS, CHECK_IDS, assertBrowserBuild, commands, matrixFailureSummary, pnpmCandidateOverrides, consumerSplatSpz, consumerTriangleGlb, consumerViteConfig, hashConsumerProject, inspectMatrixInstalledProject, matrixCells, projectManifest, readCandidate, restoreMatrixProject, runBrowser, validateGateMatchesSource, validateSourceMatrixReport, type MatrixReport, type PackageEntry } from "../../../tools/native-consumer-matrix/index";
import { inventoryPortableConsumerFiles } from "../../../tools/package-clean-install/index";
import * as admissions from "../../../tools/release/archive-admission.mjs";
import * as npmGraph from "../../../tools/release/portable-npm-lock.mjs";
import * as pnpmGraph from "../../../tools/release/portable-pnpm-lock.mjs";
import type { ConsumerNativePnpmStoreInput, NativePnpmStoreReport } from "../../../tools/release/portable-pnpm-lock.mjs";

const repo = resolve(__dirname, "../../..");
const fixtures = join(repo, "tests/fixtures/native-consumer");
const zstdLiteral = readFileSync(join(repo, "packages/assets/src/workers/zstd.worker.ts"), "utf8").match(/^const WASM_PACKAGE = (".*");$/m)?.[1];
if (!zstdLiteral) throw new Error("Missing embedded Zstandard payload");
const zstdWorker = `const WASM_PACKAGE = ${zstdLiteral}; const expectedBytes = 1; const notice = WASM_PACKAGE.slice(0, WASM_PACKAGE.indexOf("\\n--AURA3D-ZSTD-WASM--\\n")); self.postMessage({ok:true,notice});`;
const dirs: string[] = [];
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function temporary(): string { const dir = mkdtempSync(join(tmpdir(), "native-matrix-test-")); dirs.push(dir); return dir; }
function write(path: string, text: string): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
function writeBrowserBuildFixture(dir: string): void {
  const assets = [
    "render.worker.bundle-test.js", "retarget.worker.bundle-test.js", "ktx2.worker-test.js",
    "aura-vfx-1k-test.png", "aura-vfx-2k-test.png", "humanoid-fixture-test.glb",
    "basis_transcoder-test.js", "basis_transcoder-test.mjs", "basis_transcoder-test.wasm",
    "draco_decoder-test.mjs", "draco_decoder-test.wasm", "meshopt_decoder-test.mjs",
    "zstd.worker.bundle-test.js", "zstd.worker-test.js"
  ];
  write(join(dir, "dist/index.html"), "<html></html>");
  write(join(dir, "dist/assets/index-test.js"), JSON.stringify(assets));
  for (const asset of assets) write(join(dir, "dist/assets", asset), asset.startsWith("render.worker") ? 'self.postMessage({type:"init"});' : asset.startsWith("zstd.worker") ? zstdWorker : "asset");
  writeFileSync(join(dir, "dist/triangle.glb"), consumerTriangleGlb());
  writeFileSync(join(dir, "dist/splat.spz"), consumerSplatSpz());
}
function makeReport() {
  const root = temporary();
  write(join(root, "pnpm-lock.yaml"), "source lock\n");
  const entries: PackageEntry[] = ["@aura3d/engine", "@aura3d/react", "@aura3d/navigation-recast", "@aura3d/assets", "@aura3d/input", "@aura3d/controls"].map((name, i) => {
    const bytes = `archive-${i}`;
    const tarball = `archives/${i}.tgz`;
    write(join(root, tarball), bytes);
    return { name, version: "4.7.1", tarball, sha256: hash(bytes), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
  });
  const plan = { schema: "aura3d-release-plan/1.0", version: "4.7.1", source: { commit: "origin-commit", fingerprint: "a".repeat(64), inputDigest: "b".repeat(64), lockfileSha256: hash("source lock\n") }, packageCount: 6, expectedPackageCount: 6, packages: entries };
  const planText = JSON.stringify(plan);
  write(join(root, "candidate.json"), planText);
  cpSync(fixtures, join(root, "tests/fixtures/native-consumer"), { recursive: true });
  cpSync(join(repo, "packages/assets/vendor/zstd"), join(root, "packages/assets/vendor/zstd"), { recursive: true });
  const report: MatrixReport = {
    schema: "aura3d.native-consumers/1", phase: "source", runId: "test", status: "pass",
    source: { revision: "origin-commit", stagedSourceSha256: "b".repeat(64), lockfileSha256: hash("source lock\n") },
    candidate: { path: "candidate.json", sha256: hash(planText), version: "4.7.1", packages: entries },
    toolVersions: { node: "unit-test", npm: "unit-test", pnpm: "unit-test" }, projects: [], checks: [],
    browser: matrixCells().flatMap(cell => BROWSERS.map(browser => ({ id: `${cell.id}/${browser}`, status: "not-run" as const })))
  };
  for (const cell of matrixCells()) {
    const path = `tests/reports/native-consumer-matrix/test/projects/${cell.id}`;
    const dir = join(root, path);
    mkdirSync(dir, { recursive: true });
    for (const name of ["javascript-esm.mjs", "typescript-nodenext.ts", "typescript-bundler.ts", "react-ssr.tsx", "react-client.tsx", "optional-peer-absent.mjs", "optional-peer-present.mjs", "conditions.mjs"]) cpSync(join(fixtures, name), join(dir, name));
    write(join(dir, "package.json"), `${JSON.stringify(projectManifest(root, cell, plan), null, 2)}\n`);
    writeBrowserBuildFixture(dir);
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "public/triangle.glb"), consumerTriangleGlb());
    writeFileSync(join(dir, "public/splat.spz"), consumerSplatSpz());
    write(join(dir, "vite.config.js"), consumerViteConfig());
    const packages = entries.filter(p => p.name !== "@aura3d/navigation-recast" || cell.peer === "present").sort((a, b) => a.name.localeCompare(b.name));
    mkdirSync(join(dir, "tarballs"), { recursive: true });
    for (const pkg of packages) cpSync(join(root, pkg.tarball), join(dir, "tarballs", basename(pkg.tarball)), { recursive: true });
    for (const pkg of packages) write(join(dir, "node_modules", ...pkg.name.split("/"), "package.json"), JSON.stringify({ name: pkg.name, version: pkg.version }));
    for (const name of ["react", "react-dom"]) write(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version: cell.reactMajor === 18 ? "18.3.1" : "19.2.8" }));
    for (const name of ["typescript", "tsx", "vite"]) write(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
    const lockfile = cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
    const lock = cell.manager === "npm" ? JSON.stringify({ packages: Object.fromEntries(packages.map(p => [`node_modules/${p.name}`, { integrity: p.integrity }])) }) : `packages:\n${packages.map(p => `  '${p.name}@file:${p.tarball}':\n    resolution: {integrity: ${p.integrity}, tarball: file:${p.tarball}}`).join("\n")}\n`;
    write(join(dir, lockfile), lock);
    report.projects.push({ ...cell, path, manifestSha256: hash(readFileSync(join(dir, "package.json"))), lockfile, lockfileSha256: hash(lock), projectSha256: hashConsumerProject(dir), installedPackages: packages, toolVersions: { typescript: "1.0.0", tsx: "1.0.0", vite: "1.0.0", react: cell.reactMajor === 18 ? "18.3.1" : "19.2.8", "react-dom": cell.reactMajor === 18 ? "18.3.1" : "19.2.8" } });
    for (const id of CHECK_IDS) {
      const logPath = `tests/reports/native-consumer-matrix/test/logs/${cell.id}-${id}.log`;
      write(join(root, logPath), "passed\n");
      report.checks.push({ id, project: cell.id, command: commands(cell)[id] ?? ["inspect-installed-artifacts"], status: "pass", exitCode: 0, logPath, logSha256: hash("passed\n") });
    }
  }
  const reportPath = "tests/reports/native-consumers/test/matrix-source.json";
  const save = () => write(join(root, reportPath), JSON.stringify(report));
  save();
  return { root, reportPath, report, save };
}
function makePortableReport() {
  const state = makeReport(), sourcePath = "tests/reports/native-capabilities/test/source-manifest.json";
  const source = '{"synthetic":"source"}\n';
  write(join(state.root, sourcePath), source);
  state.report.source.manifest = { path: sourcePath, sha256: hash(source) };
  state.report.candidateReviews = [];
  write(join(state.root, "tests/reports/native-source-inputs/test/inputs.json"),
    JSON.stringify({ schema: "aura3d.native-portable-inputs/1", runId: "test", candidateReviews: [] }));
  for (const project of state.report.projects) {
    const dir = join(state.root, project.path);
    rmSync(join(dir, "node_modules"), { recursive: true, force: true });
    project.retention = "portable-v1";
    project.sourceManifest = state.report.source.manifest;
    project.candidateReviews = [];
    project.files = inventoryPortableConsumerFiles(dir);
    project.archives = project.installedPackages.map(pkg => {
      const bytes = readFileSync(join(state.root, pkg.tarball));
      const path = `tests/reports/native-consumer-matrix/test/dependency-archives/${pkg.sha256}.tgz`;
      mkdirSync(dirname(join(state.root, path)), { recursive: true });
      writeFileSync(join(state.root, path), bytes);
      return { resolved: `file:./tarballs/${basename(pkg.tarball)}`, path, size: bytes.length, sha256: pkg.sha256, integrity: pkg.integrity };
    }).sort((a, b) => a.resolved < b.resolved ? -1 : a.resolved > b.resolved ? 1 : 0);
  }
  for (const check of state.report.checks) check.logSize = Buffer.byteLength("passed\n");
  state.save();
  return state;
}
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("isolated native consumer matrix", () => {
  it("exercises the published worker factory with the default Vite worker format", () => {
    const client = readFileSync(join(fixtures, "react-client.tsx"), "utf8");
    expect(client).toMatch(/\bcreateWorkerRendererWorker\(\)/);
    expect(client).toContain('parseGaussianSplat(input, "spz")');
    expect(client).toContain('parseEngineGaussianSplat(input, "spz")');
    // invariant: source must keep `manifest.zstdWorker` — the React consumer fixture loads the zstd worker via the published manifest URL, not a hard-coded path
    expect(client).toContain("manifest.zstdWorker");
    expect(client).not.toContain("./worker.mjs");
    expect(consumerViteConfig()).not.toMatch(/worker\s*:/);
  });

  it("retains independent compressed SPZ streams with the expected decoded points", () => {
    const source = consumerSplatSpz();
    expect(source.readUInt32LE(8)).toBe(512);
    let offset = 128;
    for (let index = 0; index < 6; index++) {
      const length = Number(source.readBigUInt64LE(32 + index * 16));
      const decoded = zstdDecompressSync(source.subarray(offset, offset + length));
      expect(decoded.length).toBe(Number(source.readBigUInt64LE(40 + index * 16)));
      if (index === 0) expect([...decoded.subarray(0, 9)]).toEqual([0, 16, 0, 0, 224, 255, 0, 8, 0]);
      offset += length;
    }
  });

  it("requires the built client to reference the compiled package worker", () => {
    const root = temporary();
    writeBrowserBuildFixture(root);
    expect(() => assertBrowserBuild(root)).not.toThrow();
    write(join(root, "dist/assets/render.worker.bundle-test.js"), 'import { installWorkerRenderer } from "./workerRuntime.js"; installWorkerRenderer(self);');
    expect(() => assertBrowserBuild(root)).toThrow(/did not compile/);
    write(join(root, "dist/assets/render.worker.bundle-test.js"), 'self.postMessage({type:"init"});');
    write(join(root, "dist/assets/index-test.js"), "export {};");
    expect(() => assertBrowserBuild(root)).toThrow(/does not reference/);
    writeBrowserBuildFixture(root);
    rmSync(join(root, "dist/assets/basis_transcoder-test.wasm"));
    expect(() => assertBrowserBuild(root)).toThrow(/complete packaged worker asset set/);
    writeBrowserBuildFixture(root);
    write(join(root, "dist/assets/zstd.worker-test.js"), 'self.postMessage({expectedBytes:1});');
    expect(() => assertBrowserBuild(root)).toThrow(/executable license/);
  });
  it("requires the complete manager, React-major and optional-peer cross product", () => {
    const cells = matrixCells();
    expect(cells).toHaveLength(8);
    for (const manager of ["npm", "pnpm"]) for (const major of [18, 19]) for (const peer of ["absent", "present"]) {
      expect(cells.filter(cell => cell.manager === manager && cell.reactMajor === major && cell.peer === peer)).toHaveLength(1);
    }
    for (const cell of cells) {
      expect(commands(cell)["typescript-nodenext"][0]).toBe("node_modules/.bin/tsc");
      expect(commands(cell)["optional-peer"]).toEqual(["node", `optional-peer-${cell.peer}.mjs`]);
      expect(commands(cell)["condition-browser"]).toContain("--conditions=browser");
      expect(commands(cell)["condition-node"]).not.toContain("--conditions=browser");
      expect(commands(cell).install).toContain("--offline");
      expect(commands(cell).install).toContain("--ignore-scripts");
      if (cell.manager === "pnpm") {
        expect(commands(cell).install).toContain("--frozen-lockfile");
        expect(commands(cell).install).toContain("--ignore-pnpmfile");
        expect(commands(cell).install).toContain("--package-import-method=copy");
      }
    }
  });

  it("accepts a complete report and rejects a skipped or fabricated required check", () => {
    const { root, reportPath, report, save } = makeReport();
    expect(validateSourceMatrixReport(root, reportPath).projects).toHaveLength(8);
    report.checks[2].status = "not-run"; report.checks[2].exitCode = null; save();
    expect(() => validateSourceMatrixReport(root, reportPath)).toThrow(/Missing\/failed check/);
    report.checks[2].status = "pass"; report.checks[2].exitCode = 0; report.checks[2].command = ["true"]; save();
    expect(() => validateSourceMatrixReport(root, reportPath)).toThrow(/Missing\/failed check/);
  });

  it("validates portable project inputs before node_modules is restored", () => {
    const { root, reportPath, report } = makeReport();
    for (const project of report.projects) rmSync(join(root, project.path, "node_modules"), { recursive: true, force: true });
    expect(validateSourceMatrixReport(root, reportPath).projects).toHaveLength(8);
  });

  it("rejects a gate for different candidate archives or staged source", () => {
    const { report } = makeReport();
    const gate = { candidatePlan: { path: report.candidate.path, sha256: report.candidate.sha256 }, sourceInputDigest: report.source.stagedSourceSha256, lockfileSha256: report.source.lockfileSha256, archives: report.candidate.packages.map(pkg => ({ path: pkg.tarball, sha256: pkg.sha256 })) };
    expect(() => validateGateMatchesSource(gate, report)).not.toThrow();
    expect(() => validateGateMatchesSource({ ...gate, sourceInputDigest: "c".repeat(64) }, report)).toThrow(/source identities differ/);
    expect(() => validateGateMatchesSource({ ...gate, archives: gate.archives.slice(1) }, report)).toThrow(/archives differ/);
    expect(() => validateGateMatchesSource({ ...gate, candidatePlan: { ...gate.candidatePlan, sha256: "d".repeat(64) } }, report)).toThrow(/candidate plans differ/);
  });

  it("rejects a changed archive, missing peer leg, changed lock or altered project", () => {
    const state = makeReport();
    write(join(state.root, "archives/0.tgz"), "changed");
    expect(() => readCandidate(state.root, "candidate.json")).toThrow(/archive mismatch/);
    write(join(state.root, "archives/0.tgz"), "archive-0");
    state.report.projects.pop(); state.save();
    expect(() => validateSourceMatrixReport(state.root, state.reportPath)).toThrow(/project inventory/);
    const second = makeReport();
    write(join(second.root, second.report.projects[0].path, "typescript-bundler.ts"), "changed");
    expect(() => validateSourceMatrixReport(second.root, second.reportPath)).toThrow(/Retained project changed/);
    const third = makeReport();
    write(join(third.root, third.report.projects[0].path, third.report.projects[0].lockfile), "changed");
    expect(() => validateSourceMatrixReport(third.root, third.reportPath)).toThrow(/Retained project changed/);
  });

  it("checks actual Node import and browser export-condition resolution", () => {
    const dir = temporary();
    const manifest = { name: "@aura3d/engine", type: "module", exports: { ".": { browser: "./browser.js", import: "./node.js" } } };
    write(join(dir, "node_modules/@aura3d/engine/package.json"), JSON.stringify(manifest));
    write(join(dir, "node_modules/@aura3d/engine/browser.js"), "export {};");
    write(join(dir, "node_modules/@aura3d/engine/node.js"), "export {};");
    cpSync(join(fixtures, "conditions.mjs"), join(dir, "conditions.mjs"));
    const node = spawnSync(process.execPath, ["conditions.mjs", "node"], { cwd: dir, encoding: "utf8" });
    const browser = spawnSync(process.execPath, ["--conditions=browser", "conditions.mjs", "browser"], { cwd: dir, encoding: "utf8" });
    const wrong = spawnSync(process.execPath, ["conditions.mjs", "browser"], { cwd: dir, encoding: "utf8" });
    expect(node.status, node.stderr).toBe(0);
    expect(browser.status, browser.stderr).toBe(0);
    expect(wrong.status).not.toBe(0);
    const withRequire = { ...manifest, exports: { ".": { node: { require: "./require.cjs", import: "./node.js" }, browser: "./browser.js" } } };
    write(join(dir, "node_modules/@aura3d/engine/package.json"), JSON.stringify(withRequire));
    write(join(dir, "node_modules/@aura3d/engine/require.cjs"), "module.exports = { value: 1 };");
    const required = spawnSync(process.execPath, ["conditions.mjs", "node"], { cwd: dir, encoding: "utf8" });
    expect(required.status, required.stderr).toBe(0);
    expect(required.stdout).toContain("CommonJS: declared and loaded");
  });

  it("rejects a project symlink that reaches an external dependency", () => {
    const project = temporary();
    const outside = temporary();
    write(join(outside, "package.js"), "export default 1");
    symlinkSync(outside, join(project, "undeclared-package"));
    expect(() => hashConsumerProject(project)).toThrow(/symlink escapes isolation/);
  });

  it("refuses browser execution before creating a run if the global gate is missing", async () => {
    const root = temporary();
    await expect(runBrowser(root, "denied", "source.json", "gate.json")).rejects.toThrow();
    expect(existsSync(join(root, "tests/reports/native-consumer-matrix/denied"))).toBe(false);
  });

  it("validates the global gate before rejecting a source matrix with blocked pnpm installation", async () => {
    const state = makeReport();
    await expect(runBrowser(state.root, "denied", state.reportPath, "missing-gate.json")).rejects.not.toThrow(/MATRIX_PNPM_INSTALL_UNAVAILABLE/);
    expect(existsSync(join(state.root, "tests/reports/native-consumer-matrix/denied"))).toBe(false);
  });

  it("does not restore npm consumers without authenticated execution isolation", async () => {
    const state = makePortableReport(), parent = temporary(), destination = join(parent, "project");
    vi.spyOn(admissions, "verifyArchiveAdmission").mockReturnValue({ capability: {} as never, receipt: {} as never });
    vi.spyOn(npmGraph, "assertIndependentNpmConsumer").mockReturnValue({ inputPaths: [] });
    vi.spyOn(npmGraph, "inspectNpmArchive").mockReturnValue({ manifest: { name: "synthetic" }, files: [] });
    const seed = vi.spyOn(npmGraph, "seedVerifiedNpmCache");
    await expect(restoreMatrixProject(state.root, state.report, "npm-react18-peer-absent", destination))
      .rejects.toThrow(/MATRIX_NPM_INSTALL_UNAVAILABLE/);
    expect(seed).not.toHaveBeenCalled();
    expect(existsSync(destination)).toBe(false);
  });

  it("preflights the admitted pnpm store but refuses restore without installed-tree and execution custody", async () => {
    const state = makePortableReport(), parent = temporary(), destination = join(parent, "project");
    const capability = Object.freeze({});
    vi.spyOn(admissions, "verifyPnpmArchiveAdmission").mockReturnValue({ capability: capability as never, receipt: {} as never });
    vi.spyOn(pnpmGraph, "assertIndependentPnpmConsumer").mockReturnValue({ inputPaths: [] });
    vi.spyOn(npmGraph, "inspectNpmArchive").mockReturnValue({ manifest: { name: "synthetic" }, files: [] });
    const storePaths: string[] = [];
    const result = (input: ConsumerNativePnpmStoreInput): NativePnpmStoreReport => ({
      schema: "aura3d.pnpm-native-store/1",
      binding: { kind: "consumer", manifestSha256: hash(Buffer.from(input.admission!.manifestBytes)), lockfileSha256: hash(Buffer.from(input.admission!.lockBytes)) },
      // One archive per candidate package of the peer-absent cell.
      manifestSha256: "a".repeat(64), archiveCount: state.report.projects.find(item => item.id === "pnpm-react18-peer-absent")!.archives!.length,
      fileCount: 1, installationAuthorized: false, scope: "synthetic inventory"
    });
    const seed = vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      expect(input.admission?.capability).toBe(capability);
      storePaths.push(input.storeDir);
      mkdirSync(input.storeDir);
      return result(input);
    });
    const verify = vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(result);
    await expect(restoreMatrixProject(state.root, state.report, "pnpm-react18-peer-absent", destination))
      .rejects.toThrow(/MATRIX_PNPM_TRANSPORT_UNAVAILABLE.*invalid admission capability/);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(existsSync(storePaths[0])).toBe(false);
    expect(existsSync(dirname(storePaths[0]))).toBe(false);
    expect(existsSync(destination)).toBe(false);
  });

  it("re-admits and inspects a retained pnpm cell without starting an installer or claiming execution", () => {
    const state = makePortableReport(), parent = temporary(), destination = join(parent, "project");
    const cellId = "pnpm-react18-peer-absent";
    const project = state.report.projects.find(item => item.id === cellId)!;
    cpSync(join(state.root, project.path), destination, { recursive: true });
    for (const pkg of project.installedPackages) {
      write(join(destination, "node_modules", ...pkg.name.split("/"), "package.json"),
        JSON.stringify({ name: pkg.name, version: pkg.version }));
    }
    for (const name of ["react", "react-dom"]) {
      write(join(destination, "node_modules", name, "package.json"), JSON.stringify({ name, version: "18.3.1" }));
    }
    const capability = Object.freeze({});
    const admit = vi.spyOn(admissions, "verifyPnpmArchiveAdmission").mockReturnValue({ capability: capability as never, receipt: {} as never });
    vi.spyOn(pnpmGraph, "assertIndependentPnpmConsumer").mockReturnValue({ inputPaths: [] });
    vi.spyOn(npmGraph, "inspectNpmArchive").mockReturnValue({ manifest: { name: "synthetic" }, files: [] });
    const store = vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(input => ({
      schema: "aura3d.pnpm-native-store/1", binding: { kind: "consumer",
        manifestSha256: hash(Buffer.from(input.admission!.manifestBytes)), lockfileSha256: hash(Buffer.from(input.admission!.lockBytes)) },
      manifestSha256: "a".repeat(64), archiveCount: project.archives!.length, fileCount: 1,
      installationAuthorized: false, scope: "synthetic observation"
    }));
    const tree = vi.spyOn(pnpmGraph, "assertInstalledPnpmArchiveSet").mockImplementation(input => ({
      schema: "aura3d.pnpm-installed-consumer/1", manifestSha256: hash(Buffer.from(input.admission!.manifestBytes)),
      lockfileSha256: hash(Buffer.from(input.admission!.lockBytes)), snapshotKeys: ["synthetic@1.0.0"], omittedSnapshotKeys: [],
      platform: { os: process.platform, cpu: process.arch, libc: "unknown" }, fileCount: 1, bytes: 1,
      installationAuthorized: false, scope: "synthetic observation"
    }));
    const storeDir = join(parent, "store");
    expect(inspectMatrixInstalledProject(state.root, state.report, cellId, destination, storeDir)).toEqual({
      schema: "aura3d.matrix-installed-observation/1", project: cellId, manager: "pnpm",
      installationAuthorized: false, executionAuthorized: false
    });
    expect(admit).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledTimes(4);
    expect(tree).toHaveBeenCalledTimes(2);
    write(join(destination, "typescript-bundler.ts"), "changed");
    admit.mockClear();
    expect(() => inspectMatrixInstalledProject(state.root, state.report, cellId, destination, storeDir)).toThrow(/inputs differ/);
    expect(admit).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    write(join(destination, "typescript-bundler.ts"), readFileSync(join(fixtures, "typescript-bundler.ts"), "utf8"));
    expect(() => inspectMatrixInstalledProject(state.root, state.report, cellId, destination, storeDir))
      .toThrow(/no independently trusted policy anchor/);
  });
});

describe("native consumer matrix failure reporting and installs", () => {
  it("names the failing cell, check, command and the tail of its log", () => {
    const root = temporary();
    const lines = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`);
    write(join(root, "tests/reports/native-consumer-matrix/run/logs/npm-react18-peer-absent-typescript-nodenext.log"), `${lines.join("\n")}\n`);
    const summary = matrixFailureSummary(root, { checks: [
      { id: "install", project: "npm-react18-peer-absent", command: ["npm", "install"], status: "pass", exitCode: 0, logPath: "", logSha256: "" },
      { id: "typescript-nodenext", project: "npm-react18-peer-absent", command: ["node_modules/.bin/tsc", "-p", "tsconfig.nodenext.json"], status: "fail", exitCode: 2,
        logPath: "tests/reports/native-consumer-matrix/run/logs/npm-react18-peer-absent-typescript-nodenext.log", logSha256: "" },
      { id: "browser-build", project: "npm-react18-peer-absent", command: ["vite", "build"], status: "not-run", exitCode: null, logPath: "", logSha256: "" }
    ] }, 5);
    expect(summary).toContain("FAILED cell npm-react18-peer-absent check typescript-nodenext (exit 2): node_modules/.bin/tsc -p tsconfig.nodenext.json");
    expect(summary).toContain("last 5 of 100 lines");
    expect(summary).toContain("    line 100");
    expect(summary).toContain("    line 96");
    expect(summary).not.toContain("line 95\n");
    expect(summary).not.toContain("check install");
    expect(summary).not.toContain("browser-build");
    expect(matrixFailureSummary(root, { checks: [] })).toBe("");
  });

  it("still reports a failing check whose log is unavailable", () => {
    const summary = matrixFailureSummary(temporary(), { checks: [
      { id: "install", project: "pnpm-react19-peer-present", command: ["pnpm", "install"], status: "fail", exitCode: 1, logPath: "tests/reports/missing.log", logSha256: "" }
    ] });
    expect(summary).toContain("FAILED cell pnpm-react19-peer-present check install (exit 1)");
    expect(summary).toContain("log unavailable");
  });

  it("overrides every candidate package onto its archive so pnpm never asks the registry for unpublished internals", () => {
    const yaml = pnpmCandidateOverrides([
      { name: "@aura3d/math", tarball: "tests/reports/release-tarballs/aura3d-math-5.0.0.tgz" },
      { name: "@aura3d/engine", tarball: "tests/reports/release-tarballs/aura3d-engine-5.0.0.tgz" }
    ]);
    expect(yaml).toBe('overrides:\n  "@aura3d/math": "file:./tarballs/aura3d-math-5.0.0.tgz"\n  "@aura3d/engine": "file:./tarballs/aura3d-engine-5.0.0.tgz"\n');
  });

  it("accepts an unreferenced second copy of a decoder but not a kind that nothing references", () => {
    const root = temporary();
    writeBrowserBuildFixture(root);
    write(join(root, "dist/assets/basis_transcoder-orphan.js"), "asset");
    write(join(root, "dist/assets/meshopt_decoder-orphan.mjs"), "asset");
    expect(() => assertBrowserBuild(root)).not.toThrow();
    write(join(root, "dist/assets/index-test.js"), JSON.stringify(["render.worker.bundle-test.js", "retarget.worker.bundle-test.js", "ktx2.worker-test.js", "aura-vfx-1k-test.png", "aura-vfx-2k-test.png",
      "humanoid-fixture-test.glb", "basis_transcoder-test.js", "basis_transcoder-test.mjs", "basis_transcoder-test.wasm", "draco_decoder-test.mjs", "draco_decoder-test.wasm",
      "zstd.worker.bundle-test.js", "zstd.worker-test.js"]));
    expect(() => assertBrowserBuild(root)).toThrow(/does not reference any emitted worker asset matching: .*meshopt_decoder/);
  });
});
