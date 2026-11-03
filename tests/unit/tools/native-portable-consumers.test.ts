import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertIndependentNpmConsumer, assertIndependentNpmGraph, inspectIndependentNpmConsumer, inspectNpmArchive, seedVerifiedNpmCache } from "../../../tools/release/portable-npm-lock.mjs";
import type { ExactReleasePlan } from "../../../tools/release/exact-release-plan.mjs";
import { assertInstalledArchiveSet, createPortableSourceEnvironment, hashConsumerProject, inventoryPortableConsumerFiles, main, restorePortableConsumerProject, type NativeConsumerProject } from "../../../tools/package-clean-install/index";
import { CREATE_AURA3D_TEMPLATES } from "../../../packages/create-aura3d/src/index";

const release = vi.hoisted(() => ({ current: null as ExactReleasePlan | null, spawn: vi.fn(), verify: vi.fn(),
  synthetic: null as null | { capability: object; receipt: object; manifestBytes: Uint8Array; lockBytes: Uint8Array;
    archives: { resolved: string; bytes: Uint8Array }[] } }));
vi.mock("../../../tools/release/exact-release-plan.mjs", () => ({
  loadValidatedReleasePlan: () => release.current,
  inspectInstalledRelease: () => ({ packages: [] })
}));
vi.mock("../../../tools/release/archive-admission.mjs", () => ({
  verifyArchiveAdmission: (input: unknown) => {
    release.verify(input);
    if (release.synthetic) return { capability: release.synthetic.capability, receipt: release.synthetic.receipt };
    throw new Error("trusted digest-bound candidate archive admission unavailable");
  },
  consumeArchiveAdmission: (input: { capability: object; manifestBytes: Uint8Array; lockBytes: Uint8Array }) => {
    const synthetic = release.synthetic;
    if (synthetic && input.capability === synthetic.capability &&
        Buffer.from(input.manifestBytes).equals(Buffer.from(synthetic.manifestBytes)) &&
        Buffer.from(input.lockBytes).equals(Buffer.from(synthetic.lockBytes))) {
      return synthetic.archives.map(item => ({ resolved: item.resolved, bytes: Uint8Array.from(item.bytes) }));
    }
    throw new Error("trusted digest-bound candidate archive admission unavailable");
  }
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(), execFileSync: release.spawn
}));

const roots: string[] = [];
beforeEach(() => { release.spawn.mockReset(); release.verify.mockReset(); release.synthetic = null; });
afterEach(() => { release.current = null; release.synthetic = null; for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function tar(entries: Array<{ path: string; data?: string; type?: string }>): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.data ?? ""), header = Buffer.alloc(512);
    header.write(entry.path, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(32, 148, 156);
    header.write(entry.type ?? "0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

function fixture() {
  const packageManifest = { name: "@aura3d/engine", version: "1.0.0", dependencies: {} };
  const bytes = tar([{ path: "package/package.json", data: JSON.stringify(packageManifest) }, { path: "package/dist/index.js", data: "export {};" }]);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const candidate = { name: packageManifest.name, version: packageManifest.version, sha256: createHash("sha256").update(bytes).digest("hex"), integrity };
  const manifest = { name: "consumer", dependencies: { "@aura3d/engine": "file:./archives/engine.tgz" } };
  const resolved = "file:archives/engine.tgz";
  const lock = { lockfileVersion: 3, packages: {
    "": { name: "consumer", dependencies: manifest.dependencies },
    "node_modules/@aura3d/engine": { version: "1.0.0", resolved, integrity, dependencies: {} }
  } };
  const archives = [{ resolved, path: "retained/engine.tgz" }];
  return { bytes, manifest, lock, archives, candidatePackages: [candidate] };
}

describe("portable npm pre-install independence", () => {
  it("checks a complete local candidate archive but refuses install without provenance", () => {
    const f = fixture();
    expect(assertIndependentNpmGraph({ manifest: f.manifest, lock: f.lock }).packagePaths).toEqual(["node_modules/@aura3d/engine"]);
    let reads = 0;
    expect(() => assertIndependentNpmConsumer({ ...f, readArchive: () => { reads++; return f.bytes; } })).toThrow(/trusted digest-bound candidate archive admission/);
    expect(reads).toBe(1);
  });

  it("rejects mismatched root graphs, missing transitive entries and prohibited aliases before reading archives", () => {
    const f = fixture(), readArchive = () => { throw new Error("must not read"); };
    const rootMismatch = structuredClone(f.lock);
    rootMismatch.packages[""].dependencies["@aura3d/engine"] = "*";
    expect(() => assertIndependentNpmConsumer({ ...f, lock: rootMismatch, readArchive })).toThrow(/differs from lock/);
    const missing = structuredClone(f.lock);
    (missing.packages["node_modules/@aura3d/engine"].dependencies as Record<string, string>).helper = "^1";
    expect(() => assertIndependentNpmConsumer({ ...f, lock: missing, readArchive })).toThrow(/unresolved dependency/);
    const alias = structuredClone(f.lock);
    (alias.packages["node_modules/@aura3d/engine"].dependencies as Record<string, string>).helper = "npm:three@1";
    expect(() => assertIndependentNpmConsumer({ ...f, lock: alias, readArchive })).toThrow(/prohibited package identity/);
  });

  it("rejects altered bytes, wrong candidate identity, unused and unsafe archive inputs", () => {
    const f = fixture();
    expect(() => assertIndependentNpmConsumer({ ...f, readArchive: () => Buffer.from("altered") })).toThrow(/gzip|integrity/);
    expect(() => assertIndependentNpmConsumer({ ...f, candidatePackages: [{ ...f.candidatePackages[0]!, sha256: "0".repeat(64) }], readArchive: () => f.bytes })).toThrow(/candidate archive mismatch/);
    expect(() => assertIndependentNpmConsumer({ ...f, archives: [{ ...f.archives[0]!, path: "../escape.tgz" }], readArchive: () => f.bytes })).toThrow(/unsafe archive path/);
    expect(() => assertIndependentNpmConsumer({ ...f, archives: [...f.archives, { resolved: "file:unused.tgz", path: "retained/unused.tgz" }], readArchive: () => f.bytes })).toThrow(/unused entries/);
  });

  it("rejects bundled dependencies, nested installations, symlinks and path traversal", () => {
    for (const entries of [
      [{ path: "package/package.json", data: JSON.stringify({ name: "@aura3d/engine", version: "1.0.0", bundledDependencies: ["dep"] }) }],
      [{ path: "package/package.json", data: JSON.stringify({ name: "@aura3d/engine", version: "1.0.0" }) }, { path: "package/node_modules/dep/index.js", data: "bad" }],
      [{ path: "package/package.json", data: JSON.stringify({ name: "@aura3d/engine", version: "1.0.0" }) }, { path: "package/link", type: "2" }],
      [{ path: "package/package.json", data: JSON.stringify({ name: "@aura3d/engine", version: "1.0.0" }) }, { path: "package/../escape", data: "bad" }]
    ]) {
      const f = fixture(), bytes = tar(entries);
      const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
      f.lock.packages["node_modules/@aura3d/engine"].integrity = integrity;
      f.candidatePackages[0] = { ...f.candidatePackages[0]!, sha256: createHash("sha256").update(bytes).digest("hex"), integrity };
      expect(() => assertIndependentNpmConsumer({ ...f, readArchive: () => bytes })).toThrow(/bundled|unsafe|unsupported/);
    }
  });

  it("binds registry URL, package identity and canonical integrity", () => {
    const f = fixture();
    const wrong = structuredClone(f.lock);
    const manifest = { ...f.manifest, dependencies: { "@aura3d/engine": "^1.0.0" } };
    wrong.packages[""].dependencies = manifest.dependencies;
    wrong.packages["node_modules/@aura3d/engine"].resolved = "https://registry.npmjs.org/wrong/-/wrong-1.0.0.tgz";
    expect(() => assertIndependentNpmConsumer({ ...f, manifest, lock: wrong, archives: [{ resolved: wrong.packages["node_modules/@aura3d/engine"].resolved, path: "retained/a.tgz" }], readArchive: () => f.bytes })).toThrow(/URL identity mismatch/);
    wrong.packages["node_modules/@aura3d/engine"].integrity = "sha512-abc";
    expect(() => assertIndependentNpmGraph({ manifest, lock: wrong })).toThrow(/canonical SHA-512/);
  });

  it("rejects alternate lock graphs, sources, encoded file paths and peer metadata changes", () => {
    const f = fixture();
    expect(() => assertIndependentNpmGraph({ manifest: f.manifest, lock: { ...f.lock, lockfileVersion: 2 } })).toThrow(/version 3/);
    expect(() => assertIndependentNpmGraph({ manifest: { ...f.manifest, overrides: { helper: "1" } }, lock: f.lock })).toThrow(/overrides/);
    for (const spec of ["file:archives/%2e%2e/escape.tgz", "file:archives/engine.tgz?query=1", "npm:helper@https://example.invalid/a.tgz", "../local-folder"]) {
      const manifest = { ...f.manifest, dependencies: { "@aura3d/engine": spec } };
      const lock = structuredClone(f.lock);
      lock.packages[""].dependencies = manifest.dependencies;
      expect(() => assertIndependentNpmGraph({ manifest, lock })).toThrow(/unsafe|unsupported|invalid/);
    }
    const peerManifest = { ...f.manifest, peerDependencies: { helper: "^1" }, peerDependenciesMeta: { helper: { optional: true } } };
    expect(() => assertIndependentNpmGraph({ manifest: peerManifest, lock: f.lock })).toThrow(/differs from lock/);
    const movedManifest = { ...f.manifest, dependencies: { "@aura3d/engine": "file:archives/different.tgz" } };
    const movedLock = structuredClone(f.lock);
    movedLock.packages[""].dependencies = movedManifest.dependencies;
    expect(() => assertIndependentNpmGraph({ manifest: movedManifest, lock: movedLock })).toThrow(/file resolution differs from lock/);
    const transitive = structuredClone(f.lock);
    (transitive.packages["node_modules/@aura3d/engine"].dependencies as Record<string, string>).helper = "file:archives/helper.tgz";
    expect(() => assertIndependentNpmGraph({ manifest: f.manifest, lock: transitive })).toThrow(/transitive file dependency/);
  });

  it("rejects credential paths and nonzero data after the tar trailer", () => {
    const f = fixture();
    const candidates = [
      tar([{ path: "package/package.json", data: JSON.stringify({ name: "@aura3d/engine", version: "1.0.0" }) }, { path: "package/.env.production", data: "secret" }]),
      gzipSync(Buffer.concat([gunzipSync(f.bytes), Buffer.alloc(512, 1)]))
    ];
    for (const bytes of candidates) {
      const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
      const lock = structuredClone(f.lock);
      lock.packages["node_modules/@aura3d/engine"].integrity = integrity;
      const candidatePackages = [{ ...f.candidatePackages[0]!, sha256: createHash("sha256").update(bytes).digest("hex"), integrity }];
      expect(() => assertIndependentNpmConsumer({ ...f, lock, candidatePackages, readArchive: () => bytes })).toThrow(/unsafe|trailer/);
    }
  });

  it("refuses external dependency archives and cache seeding without trusted admission before reading bytes", async () => {
    const f = fixture();
    const manifest = { ...f.manifest, dependencies: { ...f.manifest.dependencies, helper: "^1.0.0" } };
    const resolution = "https://registry.npmjs.org/helper/-/helper-1.0.0.tgz";
    const lock = { ...f.lock, packages: { ...f.lock.packages,
      "": { ...f.lock.packages[""], dependencies: manifest.dependencies },
      "node_modules/helper": { version: "1.0.0", resolved: resolution, integrity: f.candidatePackages[0]!.integrity }
    } };
    const archives = [...f.archives, { resolved: resolution, path: "retained/helper.tgz" }];
    const readArchive = () => { throw new Error("must not read"); };
    expect(() => assertIndependentNpmConsumer({ ...f, manifest, lock, archives, readArchive })).toThrow(/trusted digest-bound external archive admission/);
    await expect(seedVerifiedNpmCache({ lock, archives, readArchive, cacheDir: "/tmp/unused-cache" })).rejects.toThrow(/trusted digest-bound external archive admission/);
    expect(() => assertIndependentNpmConsumer({ ...f, candidatePackages: [{ ...f.candidatePackages[0]!, name: "helper" }], readArchive })).toThrow(/invalid candidate inventory/);
  });

  it("inspects copied package bytes without granting admission", () => {
    const f = fixture(), inspected = inspectNpmArchive(f.bytes);
    expect(inspected.manifest).toMatchObject({ name: "@aura3d/engine", version: "1.0.0" });
    expect(inspected.files.map(file => file.path)).toEqual(["package.json", "dist/index.js"]);
    const original = Buffer.from(inspected.files[1]!.bytes).toString("utf8");
    f.bytes.fill(0);
    expect(Buffer.from(inspected.files[1]!.bytes).toString("utf8")).toBe(original);
  });

  it("returns a complete structural snapshot of candidate and registry archives without authorizing them", () => {
    const f = fixture();
    const helperBytes = tar([{ path: "package/package.json", data: JSON.stringify({ name: "helper", version: "1.0.0" }) }, { path: "package/index.js", data: "export {};" }]);
    const integrity = `sha512-${createHash("sha512").update(helperBytes).digest("base64")}`;
    const manifest = { ...f.manifest, dependencies: { ...f.manifest.dependencies, helper: "^1.0.0" } };
    const resolved = "https://registry.npmjs.org/helper/-/helper-1.0.0.tgz";
    const lock = { ...f.lock, packages: { ...f.lock.packages, "": { ...f.lock.packages[""], dependencies: manifest.dependencies },
      "node_modules/helper": { version: "1.0.0", resolved, integrity } } };
    const archives = [...f.archives, { resolved, path: "retained/helper.tgz" }];
    const result = inspectIndependentNpmConsumer({ ...f, manifest, lock, archives, readArchive: path => path === "retained/helper.tgz" ? helperBytes : f.bytes });
    expect(result.packagePaths).toEqual(["node_modules/@aura3d/engine", "node_modules/helper"]);
    expect(result.inputPaths).toEqual(["retained/engine.tgz", "retained/helper.tgz"]);
    const snapshot = result.archives.find(item => item.resolved === resolved)!;
    expect(snapshot).toMatchObject({ sha256: createHash("sha256").update(helperBytes).digest("hex"), integrity, manifest: { name: "helper", version: "1.0.0" } });
    helperBytes.fill(0);
    expect(createHash("sha256").update(snapshot.bytes).digest("hex")).toBe(snapshot.sha256);
    expect(() => assertIndependentNpmConsumer({ ...f, manifest, lock, archives, readArchive: () => { throw new Error("must not read"); } })).toThrow(/trusted digest-bound external archive admission/);
  });

  it("rejects archive file and directory collisions in either order", () => {
    const manifest = { path: "package/package.json", data: JSON.stringify({ name: "@aura3d/engine", version: "1.0.0" }) };
    const parent = { path: "package/a", data: "file" }, child = { path: "package/a/b", data: "nested" };
    expect(() => inspectNpmArchive(tar([manifest, parent, child]))).toThrow(/conflicts/);
    expect(() => inspectNpmArchive(tar([manifest, child, parent]))).toThrow(/conflicts/);
    expect(() => inspectNpmArchive(tar([manifest, { path: "package/Node_Modules/payload.js", data: "bad" }]))).toThrow(/unsafe/);
  });
});

function portableFixture() {
  const f = fixture(), root = mkdtempSync(join(tmpdir(), "aura-portable-test-"));
  roots.push(root);
  const projectPath = "tests/reports/native-consumers/test-run/projects/react-import";
  const directory = join(root, projectPath);
  mkdirSync(join(directory, "src"), { recursive: true });
  mkdirSync(join(directory, "archives"));
  mkdirSync(join(root, "candidate"));
  writeFileSync(join(directory, "src/main.ts"), "export {};\n");
  const manifest = JSON.stringify(f.manifest), lock = JSON.stringify(f.lock);
  writeFileSync(join(directory, "package.json"), manifest);
  writeFileSync(join(directory, "package-lock.json"), lock);
  writeFileSync(join(directory, "archives/engine.tgz"), f.bytes);
  writeFileSync(join(root, "candidate/engine.tgz"), f.bytes);
  const retainedArchive = `tests/reports/native-consumers/test-run/dependency-archives/${f.candidatePackages[0]!.sha256}.tgz`;
  mkdirSync(dirname(join(root, retainedArchive)), { recursive: true });
  writeFileSync(join(root, retainedArchive), f.bytes);
  const sourceManifestPath = "tests/reports/native-consumers/test-run/source-manifest.json";
  writeFileSync(join(root, sourceManifestPath), "{}");
  const planBytes = JSON.stringify({ version: "1.0.0" });
  writeFileSync(join(root, "candidate/plan.json"), planBytes);
  const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  const plan: ExactReleasePlan = { version: "1.0.0", source: { commit: "source", tree: "tree", fingerprint: "a".repeat(64), lockfileSha256: "b".repeat(64) },
    reference: { path: "candidate/plan.json", sha256: sha(planBytes) }, packages: [{ ...f.candidatePackages[0]!, tarball: "candidate/engine.tgz" }] };
  release.current = plan;
  const reviewBytes = Buffer.from('{"fixture":"untrusted synthetic review"}');
  const reviewSha256 = sha(reviewBytes), reviewPath = `tests/reports/native-source-inputs/test-run/candidate-reviews/${reviewSha256}.json`;
  mkdirSync(dirname(join(root, reviewPath)), { recursive: true });
  writeFileSync(join(root, reviewPath), reviewBytes);
  const candidateReviews = [{ path: reviewPath, sha256: reviewSha256 }];
  const sidecarPath = "tests/reports/native-source-inputs/test-run/inputs.json";
  writeFileSync(join(root, sidecarPath), JSON.stringify({ schema: "aura3d.native-portable-inputs/1", runId: "test-run",
    sourceManifest: { path: sourceManifestPath, sha256: sha("{}") }, candidatePlan: plan.reference, candidateReviews }));
  const project: NativeConsumerProject = { template: "fixture", kind: "fixture", path: projectPath, entry: "src/main.ts", retention: "portable-v1",
    sourceManifest: { path: sourceManifestPath, sha256: sha("{}") }, candidateReviews, files: inventoryPortableConsumerFiles(directory),
    archives: [{ resolved: f.archives[0]!.resolved, path: retainedArchive, size: f.bytes.byteLength, sha256: f.candidatePackages[0]!.sha256, integrity: f.candidatePackages[0]!.integrity }], manifestSha256: sha(manifest), lockfileSha256: sha(lock),
    projectSha256: hashConsumerProject(directory), installedPackages: [{ ...f.candidatePackages[0]!, installPath: "node_modules/@aura3d/engine", contentsSha256: "c".repeat(64) }], substitutions: [] };
  const destination = join(dirname(root), `${basename(root)}-restored`);
  roots.push(destination);
  return { root, directory, plan, project, destination, sidecarPath, candidateReviews };
}

describe("portable consumer source execution", () => {
  it("propagates the source-only process guard without forwarding arbitrary environment variables", () => {
    const f = portableFixture(), previous = process.env.AURA_TEST_UNTRUSTED_CONFIG;
    try {
      process.env.AURA_TEST_UNTRUSTED_CONFIG = "must-not-propagate";
      const env = createPortableSourceEnvironment(f.root, f.project.sourceManifest!.path);
      expect(env.AURA3D_SOURCE_PROCESS_GUARD).toBe("1");
      // invariant: source must keep `tools/remote-acr/source-checks.mjs` in NODE_OPTIONS — portable consumer runs keep the source-only process guard preloaded
      expect(env.NODE_OPTIONS).toContain("tools/remote-acr/source-checks.mjs");
      expect(env.AURA3D_SOURCE_MANIFEST).toBe(f.project.sourceManifest!.path);
      expect(env.AURA_TEST_UNTRUSTED_CONFIG).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.AURA_TEST_UNTRUSTED_CONFIG; else process.env.AURA_TEST_UNTRUSTED_CONFIG = previous;
    }
  });

  it("without a portable bundle, uses the packed producer and fails on a changed candidate archive before any subprocess or report", async () => {
    const f = portableFixture();
    const oldBundle = process.env.NATIVE_CONSUMER_BUNDLE_INPUT, oldManifest = process.env.AURA3D_SOURCE_MANIFEST;
    try {
      delete process.env.NATIVE_CONSUMER_BUNDLE_INPUT; delete process.env.AURA3D_SOURCE_MANIFEST;
      // The synthetic plan has no create-aura3d archive; the packed producer
      // must stop on candidate identity before running npm or writing a report.
      await expect(main(["--phase", "source", "--run-id", "safe-run", "--candidate-plan", f.plan.reference.path], f.root)).rejects.toThrow(/Candidate scaffold package is missing|Candidate archive changed/);
      expect(release.spawn).not.toHaveBeenCalled();
      expect(existsSync(join(f.root, "tests/reports/native-consumers/safe-run"))).toBe(false);
    } finally {
      if (oldBundle === undefined) delete process.env.NATIVE_CONSUMER_BUNDLE_INPUT; else process.env.NATIVE_CONSUMER_BUNDLE_INPUT = oldBundle;
      if (oldManifest === undefined) delete process.env.AURA3D_SOURCE_MANIFEST; else process.env.AURA3D_SOURCE_MANIFEST = oldManifest;
    }
  });

  it("rejects an incomplete input bundle before creating a report or starting npm", async () => {
    const f = portableFixture(), oldBundle = process.env.NATIVE_CONSUMER_BUNDLE_INPUT, oldManifest = process.env.AURA3D_SOURCE_MANIFEST;
    const bundlePath = "candidate/input.json";
    writeFileSync(join(f.root, bundlePath), JSON.stringify({ schema: "aura3d.portable-consumer-input/1", projects: [] }));
    mkdirSync(join(f.root, "tests/reports/native-capabilities/safe-run"), { recursive: true });
    writeFileSync(join(f.root, "tests/reports/native-capabilities/safe-run/source-manifest.json"), "{}");
    try {
      process.env.NATIVE_CONSUMER_BUNDLE_INPUT = bundlePath;
      process.env.AURA3D_SOURCE_MANIFEST = f.project.sourceManifest!.path;
      await expect(main(["--phase", "source", "--run-id", "safe-run", "--candidate-plan", f.plan.reference.path], f.root)).rejects.toThrow(/complete candidate and source inventory/);
      expect(release.spawn).not.toHaveBeenCalled();
      expect(existsSync(join(f.root, "tests/reports/native-consumers/safe-run"))).toBe(false);
    } finally {
      if (oldBundle === undefined) delete process.env.NATIVE_CONSUMER_BUNDLE_INPUT; else process.env.NATIVE_CONSUMER_BUNDLE_INPUT = oldBundle;
      if (oldManifest === undefined) delete process.env.AURA3D_SOURCE_MANIFEST; else process.env.AURA3D_SOURCE_MANIFEST = oldManifest;
    }
  });

  it("forwards staged candidate reviews into source admission and rejects a changed environment list", async () => {
    const f = portableFixture(), runId = "producer-run", sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
    const sourcePath = `tests/reports/native-capabilities/${runId}/source-manifest.json`;
    mkdirSync(dirname(join(f.root, sourcePath)), { recursive: true });
    writeFileSync(join(f.root, sourcePath), "{}");
    const reviewBytes = readFileSync(join(f.root, f.candidateReviews[0]!.path));
    const reviewPath = `tests/reports/native-source-inputs/${runId}/candidate-reviews/${sha(reviewBytes)}.json`;
    mkdirSync(dirname(join(f.root, reviewPath)), { recursive: true }); writeFileSync(join(f.root, reviewPath), reviewBytes);
    const candidateReviews = [{ path: reviewPath, sha256: sha(reviewBytes) }];
    const manifestPath = `${f.project.path}/package.json`, lockPath = `${f.project.path}/package-lock.json`;
    const manifestBytes = readFileSync(join(f.root, manifestPath)), lockBytes = readFileSync(join(f.root, lockPath));
    const archiveBytes = readFileSync(join(f.root, f.plan.packages[0]!.tarball)), archive = f.project.archives![0]!;
    const input = { manifest: { path: manifestPath, size: manifestBytes.length, sha256: sha(manifestBytes) },
      lockfile: { path: lockPath, size: lockBytes.length, sha256: sha(lockBytes) },
      archives: [{ resolved: "file:tarballs/engine.tgz", path: f.plan.packages[0]!.tarball, size: archiveBytes.length, sha256: sha(archiveBytes), integrity: archive.integrity }], assets: [] };
    const bundlePath = `tests/reports/native-source-inputs/${runId}/consumer/bundle.json`;
    const bundle = JSON.stringify({ schema: "aura3d.portable-consumer-input/1", candidatePlanSha256: f.plan.reference.sha256,
      sourceManifestSha256: sha("{}"), projects: ["launcher", ...CREATE_AURA3D_TEMPLATES, "react-import"].map(id => ({ id, ...input })) });
    mkdirSync(dirname(join(f.root, bundlePath)), { recursive: true }); writeFileSync(join(f.root, bundlePath), bundle);
    const envelope = { schema: "aura3d.native-portable-inputs/1", runId, sourceManifest: { path: sourcePath, sha256: sha("{}") },
      candidatePlan: f.plan.reference, consumerBundle: { path: bundlePath, sha256: sha(bundle) }, candidateReviews };
    writeFileSync(join(f.root, `tests/reports/native-source-inputs/${runId}/inputs.json`), JSON.stringify(envelope));
    const oldBundle = process.env.NATIVE_CONSUMER_BUNDLE_INPUT, oldManifest = process.env.AURA3D_SOURCE_MANIFEST,
      oldReviews = process.env.AURA3D_CANDIDATE_REVIEWS_JSON;
    try {
      process.env.NATIVE_CONSUMER_BUNDLE_INPUT = bundlePath; process.env.AURA3D_SOURCE_MANIFEST = f.project.sourceManifest!.path;
      process.env.AURA3D_CANDIDATE_REVIEWS_JSON = JSON.stringify(candidateReviews);
      await expect(main(["--phase", "source", "--run-id", runId, "--candidate-plan", f.plan.reference.path], f.root)).rejects.toThrow(/trusted digest-bound candidate archive admission/);
      expect(release.verify).toHaveBeenCalledWith(expect.objectContaining({ planPath: f.plan.reference.path, sourceManifestPath: sourcePath, candidateReviews }));
      expect(release.spawn).not.toHaveBeenCalled();
      expect(existsSync(join(f.root, `tests/reports/native-consumers/${runId}`))).toBe(false);
      release.verify.mockClear();
      process.env.AURA3D_CANDIDATE_REVIEWS_JSON = "[]";
      await expect(main(["--phase", "source", "--run-id", runId, "--candidate-plan", f.plan.reference.path], f.root)).rejects.toThrow(/environment differs from staged sidecar/);
      expect(release.verify).not.toHaveBeenCalled();
    } finally {
      if (oldBundle === undefined) delete process.env.NATIVE_CONSUMER_BUNDLE_INPUT; else process.env.NATIVE_CONSUMER_BUNDLE_INPUT = oldBundle;
      if (oldManifest === undefined) delete process.env.AURA3D_SOURCE_MANIFEST; else process.env.AURA3D_SOURCE_MANIFEST = oldManifest;
      if (oldReviews === undefined) delete process.env.AURA3D_CANDIDATE_REVIEWS_JSON; else process.env.AURA3D_CANDIDATE_REVIEWS_JSON = oldReviews;
    }
  });

  it("refuses a candidate-only restore before creating a destination or starting npm when admission is missing", async () => {
    const f = portableFixture();
    await expect(restorePortableConsumerProject(f.root, f.project, f.destination, f.plan)).rejects.toThrow(/trusted digest-bound candidate archive admission/);
    expect(release.verify).toHaveBeenCalledWith(expect.objectContaining({ planPath: f.plan.reference.path,
      sourceManifestPath: f.project.sourceManifest!.path, candidateReviews: f.candidateReviews }));
    expect(release.spawn).not.toHaveBeenCalled();
    expect(existsSync(f.destination)).toBe(false);
  });

  it("restores offline from the admitted cache once admission exists, and rejects an install that does not produce the admitted tree", async () => {
    const f = portableFixture(), parent = mkdtempSync(join(tmpdir(), "aura-custody-destination-"));
    roots.push(parent);
    const destination = join(parent, "consumer"), capability = Object.freeze({}), receipt = { synthetic: true };
    release.synthetic = { capability, receipt, manifestBytes: readFileSync(join(f.directory, "package.json")),
      lockBytes: readFileSync(join(f.directory, "package-lock.json")),
      archives: [{ resolved: f.project.archives![0]!.resolved, bytes: readFileSync(join(f.directory, "archives/engine.tgz")) }] };
    f.project.admission = receipt as never;
    // execFileSync is a no-op mock: npm "succeeds" but installs nothing, so the
    // post-install archive-set verification must reject and clean up.
    await expect(restorePortableConsumerProject(f.root, f.project, destination, f.plan)).rejects.toThrow(/missing|installed|archive/i);
    expect(release.verify).toHaveBeenCalledOnce();
    expect(release.spawn).toHaveBeenCalledOnce();
    expect(release.spawn.mock.calls[0]![0]).toBe("npm");
    expect(release.spawn.mock.calls[0]![1]).toEqual(expect.arrayContaining(["ci", "--offline", "--ignore-scripts"]));
    expect(existsSync(destination)).toBe(false);
  });

  it("rejects changed, duplicate, out-of-run or report-mismatched candidate review references before admission", async () => {
    const changed = portableFixture();
    writeFileSync(join(changed.root, changed.candidateReviews[0]!.path), "tampered");
    await expect(restorePortableConsumerProject(changed.root, changed.project, changed.destination, changed.plan)).rejects.toThrow(/Candidate review reference changed/);
    expect(release.verify).not.toHaveBeenCalled();

    const duplicate = portableFixture();
    const envelope = JSON.parse(readFileSync(join(duplicate.root, duplicate.sidecarPath), "utf8")) as { candidateReviews: unknown[] };
    envelope.candidateReviews.push(duplicate.candidateReviews[0]);
    writeFileSync(join(duplicate.root, duplicate.sidecarPath), JSON.stringify(envelope));
    await expect(restorePortableConsumerProject(duplicate.root, duplicate.project, duplicate.destination, duplicate.plan)).rejects.toThrow(/duplicate candidate review/);
    expect(release.verify).not.toHaveBeenCalled();

    const outside = portableFixture();
    const other = JSON.parse(readFileSync(join(outside.root, outside.sidecarPath), "utf8")) as { candidateReviews: { path: string; sha256: string }[] };
    other.candidateReviews[0]!.path = other.candidateReviews[0]!.path.replace("/test-run/", "/other-run/");
    writeFileSync(join(outside.root, outside.sidecarPath), JSON.stringify(other));
    await expect(restorePortableConsumerProject(outside.root, outside.project, outside.destination, outside.plan)).rejects.toThrow(/candidate review reference/);
    expect(release.verify).not.toHaveBeenCalled();

    const mismatch = portableFixture();
    mismatch.project.candidateReviews = [];
    await expect(restorePortableConsumerProject(mismatch.root, mismatch.project, mismatch.destination, mismatch.plan)).rejects.toThrow(/differ from the staged sidecar/);
    expect(release.verify).not.toHaveBeenCalled();
    expect(release.spawn).not.toHaveBeenCalled();
  });

  it.each(["dependency tree", "symlink", "private file"])("rejects a retained %s before npm", async (kind) => {
    const f = portableFixture();
    if (kind === "dependency tree") mkdirSync(join(f.directory, "node_modules"));
    else if (kind === "symlink") symlinkSync(join(f.directory, "src/main.ts"), join(f.directory, "link"));
    else writeFileSync(join(f.directory, ".env.local"), "private");
    await expect(restorePortableConsumerProject(f.root, f.project, f.destination, f.plan)).rejects.toThrow(/excluded tree|symlink|private/);
    expect(release.spawn).not.toHaveBeenCalled();
    expect(existsSync(f.destination)).toBe(false);
  });

  it("inventories retained source, lock and build files deterministically", () => {
    const f = portableFixture();
    expect(inventoryPortableConsumerFiles(f.directory).map(file => file.path)).toEqual(["archives/engine.tgz", "package-lock.json", "package.json", "src/main.ts"]);
    mkdirSync(join(f.directory, "empty"));
    expect(() => inventoryPortableConsumerFiles(f.directory)).toThrow(/empty directory/);
  });

  it("rejects changed project and archive inventories before admission or npm", async () => {
    const project = portableFixture();
    project.project.files![0]!.sha256 = "0".repeat(64);
    await expect(restorePortableConsumerProject(project.root, project.project, project.destination, project.plan)).rejects.toThrow(/file inventory changed/);
    const archive = portableFixture();
    archive.project.archives![0]!.path = "../outside.tgz";
    await expect(restorePortableConsumerProject(archive.root, archive.project, archive.destination, archive.plan)).rejects.toThrow(/archive inventory is invalid/);
    expect(release.spawn).not.toHaveBeenCalled();
  });

  it("checks installed package files and rejects undeclared executable links", () => {
    const f = fixture(), root = mkdtempSync(join(tmpdir(), "aura-installed-archive-test-"));
    roots.push(root);
    const directory = join(root, "node_modules/@aura3d/engine");
    for (const file of inspectNpmArchive(f.bytes).files) {
      const target = join(directory, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.bytes);
    }
    const verify = () => assertInstalledArchiveSet(root, f.lock, f.archives, () => f.bytes);
    expect(verify()).toMatchObject({ archiveAdmissionBound: false, installationAuthorized: false, executionAuthorized: false });
    mkdirSync(join(root, "node_modules/.bin"));
    symlinkSync("../@aura3d/engine/dist/index.js", join(root, "node_modules/.bin/engine"));
    expect(verify).toThrow(/undeclared npm bin/);
    rmSync(join(root, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(directory, "dist/index.js"), "tampered");
    expect(verify).toThrow(/differs from admitted archive/);
    writeFileSync(join(directory, "dist/index.js"), "export {};");
    mkdirSync(join(root, "node_modules/unrecorded"));
    expect(verify).toThrow(/unrecorded npm installed package/);
  });
});
