import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subprocesses = vi.hoisted(() => ({
  spawnSync: vi.fn(() => { throw new Error("unexpected subprocess"); })
}));
vi.mock("node:child_process", async importOriginal => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: subprocesses.spawnSync
}));

import { matrixCells, projectManifest, runSource, verifyMatrixInstalledNpmProject, verifyMatrixInstalledPnpmProject } from "../../../tools/native-consumer-matrix/index";
import * as admissions from "../../../tools/release/archive-admission.mjs";
import * as npmGraph from "../../../tools/release/portable-npm-lock.mjs";
import * as pnpmGraph from "../../../tools/release/portable-pnpm-lock.mjs";
import * as registry from "../../../tools/release/pnpm-loopback-registry.mjs";
import * as cleanInstall from "../../../tools/package-clean-install/index";
import type { ConsumerNativePnpmStoreInput, NativePnpmStoreReport } from "../../../tools/release/portable-pnpm-lock.mjs";

const roots: string[] = [];
const hash = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const sri = (value: Uint8Array): string => `sha512-${createHash("sha512").update(value).digest("base64")}`;

function write(root: string, path: string, value: string | Uint8Array): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
}

/** In-memory fixture bytes only: no package manager, trust policy, or socket. */
function archive(manifest: Record<string, unknown>, extra: Record<string, string> = {}): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, value] of Object.entries({ "package.json": JSON.stringify(manifest), ...extra })) {
    const data = Buffer.from(value), header = Buffer.alloc(512);
    const octal = (number: number, offset: number, length: number) =>
      header.write(`${number.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
    header.write(`package/${path}`, 0, 100, "utf8");
    octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(data.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48;
    header.write("ustar\0", 257, 6, "ascii");
    octal(header.reduce((sum, byte) => sum + byte, 0), 148, 8);
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

function fixture(options: { lifecycleManager?: "npm" | "pnpm"; registryManager?: "npm" | "pnpm";
  bindingGyp?: boolean; lockHasInstallScript?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "matrix-store-orchestration-"));
  roots.push(root);
  const runId = "store-test";
  const manifestPath = `tests/reports/native-capabilities/${runId}/source-manifest.json`;
  const sourceManifest = '{"synthetic":"staged-source"}\n';
  const sourceLock = "source-lock\n";
  write(root, "staged-manifest.json", sourceManifest);
  write(root, manifestPath, sourceManifest);
  write(root, "pnpm-lock.yaml", sourceLock);
  const packages = ["@aura3d/engine", "@aura3d/react", "@aura3d/assets", "@aura3d/input", "@aura3d/controls", "@aura3d/navigation-recast"].map((name, index) => {
    const bytes = archive({ name, version: "1.0.0" });
    const tarball = `archives/${index}.tgz`;
    write(root, tarball, bytes);
    return { name, version: "1.0.0", tarball, sha256: hash(bytes), integrity: sri(bytes) };
  });
  const planBytes = JSON.stringify({ schema: "aura3d-release-plan/1.0", version: "1.0.0",
    source: { commit: "synthetic", fingerprint: "a".repeat(64), lockfileSha256: hash(sourceLock) }, packages });
  write(root, "candidate.json", planBytes);
  const plan = JSON.parse(planBytes);
  const prefix = `tests/reports/native-source-inputs/${runId}/matrix/`;
  const archiveBytes = readFileSync(join(root, packages[0].tarball));
  const archivePath = `${prefix}archives/${hash(archiveBytes)}.tgz`;
  write(root, archivePath, archiveBytes);
  const candidateArchive = { resolved: "file:./tarballs/0.tgz", path: archivePath, size: archiveBytes.length,
    sha256: hash(archiveBytes), integrity: sri(archiveBytes) };
  const lifecycleBytes = options.lifecycleManager || options.registryManager ? archiveFixture() : undefined;
  function archiveFixture(): Buffer {
    return archive({ name: "foreign-helper", version: "1.0.0",
      ...(options.lifecycleManager && !options.bindingGyp ? { scripts: { postinstall: "never-run" } } : {}) },
    options.bindingGyp ? { "binding.gyp": "{}" } : {});
  }
  const lifecyclePath = lifecycleBytes ? `${prefix}archives/${hash(lifecycleBytes)}.tgz` : undefined;
  if (lifecyclePath && lifecycleBytes) write(root, lifecyclePath, lifecycleBytes);
  const lifecycleArchive = lifecycleBytes && lifecyclePath ? {
    resolved: "https://registry.npmjs.org/foreign-helper/-/foreign-helper-1.0.0.tgz",
    path: lifecyclePath, size: lifecycleBytes.length, sha256: hash(lifecycleBytes), integrity: sri(lifecycleBytes)
  } : undefined;
  const cells = matrixCells().map(cell => {
    const directory = `${prefix}cells/${cell.id}/`;
    const manifest = JSON.stringify(projectManifest(root, cell, plan));
    const lock = cell.manager === "npm"
      ? options.lockHasInstallScript ? '{"packages":{"node_modules/foreign":{"hasInstallScript":true}}}' : '{"packages":{}}'
      : `lockfileVersion: '9.0'\ncell: ${cell.id}\n`;
    const manifestFile = `${directory}package.json`;
    const lockFile = `${directory}${cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"}`;
    write(root, manifestFile, manifest);
    write(root, lockFile, lock);
    return { id: cell.id, manager: cell.manager,
      manifest: { path: manifestFile, size: Buffer.byteLength(manifest), sha256: hash(manifest) },
      lockfile: { path: lockFile, size: Buffer.byteLength(lock), sha256: hash(lock) },
      archives: [cell.manager === options.lifecycleManager || cell.manager === options.registryManager ? lifecycleArchive! : candidateArchive] };
  });
  const bundlePath = `${prefix}bundle.json`;
  const bundle = JSON.stringify({ schema: "aura3d.native-matrix-input/1", candidatePlanSha256: hash(planBytes),
    sourceManifest: { path: manifestPath, sha256: hash(sourceManifest) }, cells });
  write(root, bundlePath, bundle);
  const envelopePath = `tests/reports/native-source-inputs/${runId}/inputs.json`;
  const envelope = { schema: "aura3d.native-portable-inputs/1", runId,
    sourceManifest: { path: manifestPath, sha256: hash(sourceManifest) },
    candidatePlan: { path: "candidate.json", sha256: hash(planBytes) },
    matrixBundle: { path: bundlePath, sha256: hash(bundle) }, candidateReviews: [] };
  write(root, envelopePath, JSON.stringify(envelope));
  vi.stubEnv("NATIVE_MATRIX_BUNDLE_INPUT", bundlePath);
  vi.stubEnv("AURA3D_SOURCE_MANIFEST", "staged-manifest.json");
  vi.stubEnv("AURA3D_CANDIDATE_REVIEWS_JSON", "[]");
  return { root, runId, manifestPath, bundlePath, envelopePath, envelope, registryArchive: lifecycleArchive };
}

function storeReport(input: ConsumerNativePnpmStoreInput): NativePnpmStoreReport {
  const admission = input.admission!;
  return { schema: "aura3d.pnpm-native-store/1",
    binding: { kind: "consumer", manifestSha256: hash(admission.manifestBytes), lockfileSha256: hash(admission.lockBytes) },
    manifestSha256: hash("synthetic store " + input.storeDir), archiveCount: 1, fileCount: 1,
    installationAuthorized: false, scope: "synthetic point-in-time inventory only" };
}

function stubGraphAdmission(events: string[]) {
  const issued: object[] = [];
  vi.spyOn(admissions, "verifyArchiveAdmission").mockImplementation(() => {
    events.push("npm-admission");
    return { capability: {} as never, receipt: {} as never };
  });
  vi.spyOn(admissions, "verifyPnpmArchiveAdmission").mockImplementation(() => {
    const capability = Object.freeze({});
    issued.push(capability);
    events.push("pnpm-admission");
    return { capability: capability as never, receipt: {} as never };
  });
  vi.spyOn(npmGraph, "assertIndependentNpmConsumer").mockReturnValue({ inputPaths: [] });
  vi.spyOn(pnpmGraph, "assertIndependentPnpmConsumer").mockReturnValue({ inputPaths: [] });
  vi.spyOn(registry, "createPnpmLoopbackRegistry").mockImplementation(() => {
    events.push("transport");
    let closed = false;
    const status = () => ({ closed, requests: 0, denied: 0, servedBytes: 0, registryArchives: 0, routes: [] });
    return { registryPath: `/${"a".repeat(48)}/`, status,
      handle: () => { throw new Error("synthetic dispatcher must not receive requests"); },
      finish: () => { events.push("finish"); closed = true; return status(); } };
  });
  return issued;
}

beforeEach(() => { subprocesses.spawnSync.mockClear(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("matrix native offline store orchestration", () => {
  it("admits the complete matrix before seeding and rechecking each exact pnpm capability", async () => {
    const state = fixture(), events: string[] = [], capabilities = stubGraphAdmission(events);
    const seeded: ConsumerNativePnpmStoreInput[] = [];
    vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      events.push("seed");
      seeded.push(input);
      mkdirSync(input.storeDir);
      return storeReport(input);
    });
    vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(input => {
      events.push("verify");
      expect(existsSync(input.storeDir)).toBe(true);
      return storeReport(input);
    });

    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_INSTALL_UNAVAILABLE/);
    expect(events).toEqual([
      "npm-admission", "npm-admission", "npm-admission", "npm-admission",
      "pnpm-admission", "pnpm-admission", "pnpm-admission", "pnpm-admission",
      "seed", "verify", "transport", "finish", "seed", "verify", "transport", "finish",
      "seed", "verify", "transport", "finish", "seed", "verify", "transport", "finish"
    ]);
    expect(seeded).toHaveLength(4);
    expect(new Set(seeded.map(input => input.storeDir)).size).toBe(4);
    for (let index = 0; index < seeded.length; index++) {
      const input = seeded[index], cell = matrixCells().filter(item => item.manager === "pnpm")[index];
      expect(isAbsolute(input.storeDir)).toBe(true);
      expect(input.admission?.capability).toBe(capabilities[index]);
      expect(JSON.parse(Buffer.from(input.admission!.manifestBytes).toString()).name).toBe(`native-consumer-${cell.id}`);
      // invariant: source must keep `<cell id>` in the admitted lockfile — each pnpm matrix cell seeds its isolated store from its own lockfile, not a shared one
      expect(Buffer.from(input.admission!.lockBytes).toString()).toContain(cell.id);
      expect(existsSync(input.storeDir)).toBe(false);
      expect(existsSync(dirname(input.storeDir))).toBe(false);
    }
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    expect(existsSync(join(state.root, "tests/reports/native-consumer-matrix", state.runId))).toBe(false);
    expect(existsSync(join(state.root, "tests/reports/native-consumers", state.runId, "matrix-source.json"))).toBe(false);
  });

  it("stops and cleans every temporary store when a native store cannot be seeded", async () => {
    const state = fixture(), events: string[] = [];
    stubGraphAdmission(events);
    const paths: string[] = [];
    vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      paths.push(input.storeDir);
      mkdirSync(input.storeDir);
      if (paths.length === 2) throw new Error("synthetic seed failure");
      return storeReport(input);
    });
    const verify = vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(storeReport);
    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_STORE_UNAVAILABLE.*synthetic seed failure/);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(paths).toHaveLength(2);
    expect(paths.every(path => !existsSync(path) && !existsSync(dirname(path)))).toBe(true);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("refuses a changed store or a report claiming install authority", async () => {
    for (const changed of ["digest", "binding", "authority"] as const) {
      const state = fixture(), events: string[] = [];
      stubGraphAdmission(events);
      const paths: string[] = [];
      vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
        paths.push(input.storeDir);
        mkdirSync(input.storeDir);
        return storeReport(input);
      });
      vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(input => {
        const result = storeReport(input);
        if (changed === "digest") return { ...result, manifestSha256: "0".repeat(64) };
        if (changed === "binding") return { ...result, binding: { ...result.binding, lockfileSha256: "0".repeat(64) } };
        return { ...result, installationAuthorized: true } as unknown as NativePnpmStoreReport;
      });
      await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_STORE_UNAVAILABLE/);
      expect(paths).toHaveLength(1);
      expect(existsSync(dirname(paths[0]))).toBe(false);
      expect(subprocesses.spawnSync).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it("requires the store binding to match the admitted manifest and lock even when both reports agree", async () => {
    const state = fixture(), events: string[] = [];
    stubGraphAdmission(events);
    const paths: string[] = [];
    const changed = (input: ConsumerNativePnpmStoreInput): NativePnpmStoreReport => ({
      ...storeReport(input), binding: { kind: "consumer", manifestSha256: "0".repeat(64), lockfileSha256: "0".repeat(64) }
    });
    vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      paths.push(input.storeDir);
      mkdirSync(input.storeDir);
      return changed(input);
    });
    vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(changed);
    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_STORE_UNAVAILABLE/);
    expect(paths).toHaveLength(1);
    expect(existsSync(dirname(paths[0]))).toBe(false);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("propagates store verifier failure and removes temporary data before any subprocess", async () => {
    const state = fixture(), events: string[] = [];
    stubGraphAdmission(events);
    let path = "";
    vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      path = input.storeDir;
      mkdirSync(input.storeDir);
      return storeReport(input);
    });
    vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(() => { throw new Error("synthetic store tampering"); });
    await expect(runSource(state.root, state.runId, "candidate.json"))
      .rejects.toThrow(/MATRIX_PNPM_STORE_UNAVAILABLE.*synthetic store tampering/);
    expect(path).not.toBe("");
    expect(existsSync(dirname(path))).toBe(false);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("requires the retained envelope to bind the same source, candidate and matrix bundle", async () => {
    for (const key of ["sourceManifest", "candidatePlan", "matrixBundle"] as const) {
      const state = fixture();
      const changed = { ...state.envelope, [key]: { ...state.envelope[key], sha256: "0".repeat(64) } };
      write(state.root, state.envelopePath, JSON.stringify(changed));
      const npmAdmission = vi.spyOn(admissions, "verifyArchiveAdmission");
      const pnpmAdmission = vi.spyOn(admissions, "verifyPnpmArchiveAdmission");
      await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/Matrix.*envelope.*identity/i);
      expect(npmAdmission).not.toHaveBeenCalled();
      expect(pnpmAdmission).not.toHaveBeenCalled();
      expect(subprocesses.spawnSync).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it("does not turn an unbranded receipt or fabricated capability into a native store", () => {
    const parent = mkdtempSync(join(tmpdir(), "matrix-store-no-capability-"));
    roots.push(parent);
    const storeDir = join(parent, "store");
    expect(() => pnpmGraph.seedVerifiedPnpmStore({
      storeDir, admission: { capability: {} as never, manifestBytes: Buffer.from("{}"), lockBytes: Buffer.from("lock") }
    })).toThrow(/invalid admission capability/);
    expect(existsSync(storeDir)).toBe(false);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("does not admit a synthetic candidate when the independent archive policy anchor is absent", async () => {
    const state = fixture();
    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/no independently trusted policy anchor/);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    expect(existsSync(join(state.root, "tests/reports/native-consumer-matrix", state.runId))).toBe(false);
  });

  it("rejects foreign install hooks and implicit native builds before preparing any store", async () => {
    for (const lifecycleManager of ["npm", "pnpm"] as const) for (const bindingGyp of [false, true]) {
      const state = fixture({ lifecycleManager, bindingGyp }), events: string[] = [];
      stubGraphAdmission(events); // Only orchestration is stubbed; archive parsing is real.
      const seed = vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore");
      await expect(runSource(state.root, state.runId, "candidate.json"))
        .rejects.toThrow(/MATRIX_LIFECYCLE_UNAVAILABLE.*foreign-helper/);
      expect(seed).not.toHaveBeenCalled();
      expect(subprocesses.spawnSync).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it("rejects an npm lock that declares an install hook even if archive metadata omits it", async () => {
    const state = fixture({ lockHasInstallScript: true }), events: string[] = [];
    stubGraphAdmission(events);
    const seed = vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore");
    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_LIFECYCLE_UNAVAILABLE.*lock/);
    expect(seed).not.toHaveBeenCalled();
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("validates the admitted registry routes without listening or executing pnpm", async () => {
    const state = fixture({ registryManager: "pnpm" }), events: string[] = [], capabilities = stubGraphAdmission(events);
    const item = state.registryArchive!;
    let index = 0;
    const create = vi.mocked(registry.createPnpmLoopbackRegistry);
    create.mockImplementation(input => {
      expect(input.capability).toBe(capabilities[index++]);
      const registryPath = `/${"a".repeat(48)}/`;
      let closed = false;
      const routes = [{ path: registryPath + new URL(item.resolved).pathname.slice(1), sha256: item.sha256,
        integrity: item.integrity, size: item.size, served: 0 }];
      const status = () => ({ closed, requests: 0, denied: 0, servedBytes: 0, registryArchives: 1, routes });
      return { registryPath, status, handle: () => { throw new Error("no network"); },
        finish: () => { closed = true; return status(); } };
    });
    vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      mkdirSync(input.storeDir); return storeReport(input);
    });
    vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(storeReport);
    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_INSTALL_UNAVAILABLE/);
    expect(create).toHaveBeenCalledTimes(4);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("requires a valid dispatcher bound to the exact admission and cleans its store", async () => {
    const state = fixture(), events: string[] = [], capabilities = stubGraphAdmission(events);
    let path = "";
    vi.spyOn(pnpmGraph, "seedVerifiedPnpmStore").mockImplementation(input => {
      path = input.storeDir; mkdirSync(path); return storeReport(input);
    });
    vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(storeReport);
    const create = vi.mocked(registry.createPnpmLoopbackRegistry);
    create.mockImplementationOnce(input => {
      expect(input.capability).toBe(capabilities[0]);
      let closed = false;
      const status = () => ({ closed, requests: 1, denied: 1, servedBytes: 0, registryArchives: 0, routes: [] });
      return { registryPath: `/${"a".repeat(48)}/`, status,
        handle: () => { throw new Error("no network"); },
        finish: () => { closed = true; return status(); } };
    });
    await expect(runSource(state.root, state.runId, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_TRANSPORT_UNAVAILABLE/);
    expect(existsSync(dirname(path))).toBe(false);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("does not convert a fabricated capability into a registry dispatcher or installed-tree proof", () => {
    const parent = mkdtempSync(join(tmpdir(), "matrix-no-runtime-capability-")); roots.push(parent);
    const admission = { capability: {} as never, manifestBytes: Buffer.from("{}"), lockBytes: Buffer.from("{}") };
    expect(() => registry.createPnpmLoopbackRegistry(admission)).toThrow(/invalid admission capability/);
    expect(() => verifyMatrixInstalledPnpmProject({ projectDir: parent, storeDir: join(parent, "store"), admission }))
      .toThrow(/invalid admission capability/);
    expect(() => verifyMatrixInstalledNpmProject({ projectDir: parent, admission: admission as never,
      archives: [], readArchive: () => Buffer.alloc(0), candidatePackages: [] })).toThrow(/invalid admission capability/);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("rechecks the pnpm post-use store and installed graph without granting execution authority", () => {
    const parent = mkdtempSync(join(tmpdir(), "matrix-installed-pnpm-")); roots.push(parent);
    mkdirSync(join(parent, "node_modules"));
    const admission = { capability: {} as never, manifestBytes: Buffer.from('{"name":"synthetic"}'), lockBytes: Buffer.from("lock") };
    const storeDir = join(parent, "store");
    const tree = { schema: "aura3d.pnpm-installed-consumer/1" as const,
      manifestSha256: hash(admission.manifestBytes), lockfileSha256: hash(admission.lockBytes),
      snapshotKeys: ["synthetic@1.0.0"], omittedSnapshotKeys: [] as string[],
      platform: { os: process.platform, cpu: process.arch, libc: "unknown" }, fileCount: 1, bytes: 1,
      installationAuthorized: false as const, scope: "synthetic observation only" };
    const calls: string[] = [];
    const store = vi.spyOn(pnpmGraph, "verifyPnpmNativeStore").mockImplementation(input => {
      calls.push("store");
      expect(input.afterUse).toEqual({ projectDir: parent });
      expect(input.admission).toBe(admission);
      return storeReport(input);
    });
    const verify = vi.spyOn(pnpmGraph, "assertInstalledPnpmArchiveSet").mockImplementation(input => {
      calls.push("tree");
      expect(input).toEqual({ projectDir: parent, storeDir, admission });
      return tree;
    });
    expect(verifyMatrixInstalledPnpmProject({ projectDir: parent, storeDir, admission })).toBe(tree);
    expect(calls).toEqual(["store", "tree", "store"]);
    verify.mockReturnValueOnce({ ...tree, omittedSnapshotKeys: ["incompatible@1.0.0"] });
    expect(() => verifyMatrixInstalledPnpmProject({ projectDir: parent, storeDir, admission })).toThrow(/MATRIX_PLATFORM_UNAVAILABLE/);
    verify.mockReturnValueOnce({ ...tree, platform: { ...tree.platform, os: "unbound" } });
    expect(() => verifyMatrixInstalledPnpmProject({ projectDir: parent, storeDir, admission })).toThrow(/graph binding differs/);
    store.mockImplementationOnce(storeReport).mockImplementationOnce(input => ({ ...storeReport(input), manifestSha256: "0".repeat(64) }));
    expect(() => verifyMatrixInstalledPnpmProject({ projectDir: parent, storeDir, admission })).toThrow(/store changed/);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("does not excuse missing npm optional packages without installer platform custody", () => {
    const parent = mkdtempSync(join(tmpdir(), "matrix-installed-npm-")); roots.push(parent);
    const manifestBytes = Buffer.from('{"name":"synthetic"}');
    const lockBytes = Buffer.from('{"packages":{"":{},"node_modules/optional":{"optional":true}}}');
    const admission = { capability: {} as never, manifestBytes, lockBytes };
    write(parent, "package.json", manifestBytes); write(parent, "package-lock.json", lockBytes);
    mkdirSync(join(parent, "node_modules"));
    const admitted = vi.spyOn(npmGraph, "assertIndependentNpmConsumer").mockReturnValue({ inputPaths: [] });
    const installed = vi.spyOn(cleanInstall, "assertInstalledArchiveSet").mockImplementation(() => ({
      schema: "aura3d.npm-installed-consumer/1", archiveAdmissionBound: true, packagePaths: [], fileCount: 0, bytes: 0,
      installationAuthorized: false, executionAuthorized: false, scope: "synthetic"
    }));
    const input = { projectDir: parent, admission, archives: [], readArchive: () => Buffer.alloc(0), candidatePackages: [] };
    expect(() => verifyMatrixInstalledNpmProject(input)).toThrow(/MATRIX_PLATFORM_UNAVAILABLE/);
    expect(installed).not.toHaveBeenCalled();
    mkdirSync(join(parent, "node_modules/optional"));
    admitted.mockClear();
    expect(() => verifyMatrixInstalledNpmProject(input)).not.toThrow();
    expect(admitted).toHaveBeenCalledTimes(2);
    expect(installed).toHaveBeenCalledTimes(1);
    write(parent, "package-lock.json", "{}");
    expect(() => verifyMatrixInstalledNpmProject(input)).toThrow(/manifest or lock changed/);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });
});
