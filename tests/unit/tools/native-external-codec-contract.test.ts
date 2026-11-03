import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  createExternalCodecFetch,
  evaluateExternalCodecResults,
  EXTERNAL_CODEC_ASSERTION_IDS,
  EXTERNAL_CODEC_CONFIG_PATH,
  EXTERNAL_CODEC_CONTRACT_TEST_PATH,
  EXTERNAL_CODEC_POLICY_PATH,
  EXTERNAL_CODEC_SOURCE_TEST_PATH,
  EXTERNAL_CODEC_TEST_PATH,
  validateExternalCodecFixtureRecords,
  validateExternalCodecInputs,
  validateExternalCodecInstalledProject,
  validateExternalCodecPolicy,
  validateExternalCodecRunContext,
  verifyExternalCodecGitProof,
  type ExternalCodecLock,
  type ExternalCodecPolicy,
  type ExternalCodecRecord
} from "../../../tools/remote-acr/external-codec-contract.mjs";

const policyBytes = readFileSync(EXTERNAL_CODEC_POLICY_PATH);
const policy = validateExternalCodecPolicy(policyBytes).policy;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const gitHash = (kind: string, bytes: Uint8Array) => createHash("sha1").update(`${kind} ${bytes.length}\0`).update(bytes).digest("hex");
const clone = <T>(value: T): T => structuredClone(value);

function syntheticTree() {
  const payload = Buffer.from("synthetic fixture payload");
  const blob = gitHash("blob", payload);
  const leaf = Buffer.concat([Buffer.from("100644 fixture.bin\0"), Buffer.from(blob, "hex")]);
  const leafOid = gitHash("tree", leaf);
  const root = Buffer.concat([Buffer.from("40000 Models\0"), Buffer.from(leafOid, "hex")]);
  const rootOid = gitHash("tree", root);
  const commit = Buffer.from(`tree ${rootOid}\nauthor Fixture <fixture@example.test> 0 +0000\ncommitter Fixture <fixture@example.test> 0 +0000\n\nSynthetic test object\n`);
  const revision = gitHash("commit", commit);
  return { payload, blob, revision, proof: { revision, commitObjectBase64: commit.toString("base64"), trees: [
    { oid: rootOid, bytesBase64: root.toString("base64") }, { oid: leafOid, bytesBase64: leaf.toString("base64") }
  ] } };
}

function syntheticClosure() {
  const runId = "synthetic-codec";
  const revision = policy.revision;
  const rawRoot = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${revision}/`;
  const input = new Map<string, Buffer>(), oids = new Map<string, string>();
  const record = (repoPath: string, bytes: Buffer, label: string): ExternalCodecRecord => {
    const localPath = `tests/reports/native-external-codec-inputs/${runId}/assets/${label}`;
    input.set(localPath, bytes); oids.set(repoPath, gitHash("blob", bytes));
    return { repoPath, url: new URL(repoPath, rawRoot).href, sha256: hash(bytes), byteLength: bytes.length, localPath };
  };
  const fixtures = policy.fixtures.map((fixture, index) => {
    const depPath = fixture.documentPath.replace(/[^/]+$/, "payload.bin");
    const bytes = Buffer.from([index + 1, index + 2, index + 3]);
    const document = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "payload.bin", byteLength: bytes.length }], images: [{ uri: "data:image/png;base64,AA==" }] }));
    return { id: fixture.id, document: record(fixture.documentPath, document, `${index}-document`), dependencies: [record(depPath, bytes, `${index}-payload`)] };
  });
  const testPolicy = { ...clone(policy), fixtures: policy.fixtures.map((fixture, index) => ({ ...fixture, documentSha256: fixtures[index]!.document.sha256 })) };
  const readBytes = (path: string) => {
    const bytes = input.get(path);
    if (!bytes) throw new Error("missing synthetic input");
    return bytes;
  };
  const treeBlob = (path: string) => {
    const oid = oids.get(path);
    if (!oid) throw new Error("missing synthetic tree entry");
    return oid;
  };
  return { runId, fixtures, testPolicy, readBytes, treeBlob, input };
}

function candidateGate() {
  const ref = { path: "candidate.json", sha256: "2".repeat(64) };
  return {
    schema: "aura3d.native-code-complete/1", status: "CODE_COMPLETE_GO", freezeCommit: "1".repeat(40),
    sourceInputDigest: "3".repeat(64), candidatePlan: ref,
    deferredExternalCodecTests: {
      schema: "aura3d.external-codec-fixture-inventory/1", kind: "external-codec-fixtures",
      path: EXTERNAL_CODEC_TEST_PATH, sha256: "4".repeat(64), phase: "acceptance", status: "not-run",
      assertionIds: [...EXTERNAL_CODEC_ASSERTION_IDS], currentCandidateBrowserReceipt: false,
      policy: { path: EXTERNAL_CODEC_POLICY_PATH, sha256: hash(policyBytes) },
      config: { path: EXTERNAL_CODEC_CONFIG_PATH, sha256: "5".repeat(64) },
      sourceTest: { path: EXTERNAL_CODEC_SOURCE_TEST_PATH, sha256: "6".repeat(64) },
      contractTest: { path: EXTERNAL_CODEC_CONTRACT_TEST_PATH, sha256: "7".repeat(64) }
    }
  } as never;
}

function response(url: string, bytes: Uint8Array, options: { redirected?: boolean; status?: number } = {}) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const value = new Response(copy.buffer, { status: options.status ?? 200, headers: { "content-type": "application/octet-stream", "content-length": String(bytes.byteLength) } });
  Object.defineProperty(value, "url", { value: url });
  if (options.redirected) Object.defineProperty(value, "redirected", { value: true });
  return value;
}

// Tiny self-authored archives exercise only the offline installed-byte check.
function syntheticArchive(files: Record<string, string>): Buffer {
  const pieces: Buffer[] = [];
  for (const [path, text] of Object.entries(files)) {
    const data = Buffer.from(text), header = Buffer.alloc(512);
    header.write(`package/${path}`, 0, "utf8");
    header.write("0000644\0", 100, "ascii");
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, "ascii");
    header.write("00000000000\0", 136, "ascii");
    header.fill(32, 148, 156);
    header.write("0", 156, "ascii");
    header.write("ustar\0", 257, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
    pieces.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...pieces, Buffer.alloc(1024)]));
}

function isolatedSyntheticTemp(): string {
  const candidates = [process.env.AURA3D_CODEC_TEST_TMPDIR, tmpdir(), "/var/tmp", "/tmp"];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parent = realpathSync(candidate);
      accessSync(parent, constants.W_OK);
      let clean = true;
      for (let current = parent; ; current = dirname(current)) {
        if (existsSync(join(current, "node_modules"))) { clean = false; break; }
        if (dirname(current) === current) break;
      }
      if (clean) return mkdtempSync(join(parent, "aura3d-codec-source-"));
    } catch { /* Try the next bounded candidate. */ }
  }
  throw new Error("No writable isolated temporary directory is available for the source fixture");
}

function syntheticInstallation() {
  const base = isolatedSyntheticTemp();
  const projectPath = join(base, "project"), assetPath = join(projectPath, "node_modules", "@aura3d", "assets");
  const nestedPath = join(assetPath, "node_modules", "meshoptimizer");
  mkdirSync(nestedPath, { recursive: true });
  const projectManifest = Buffer.from('{"name":"synthetic-consumer"}');
  writeFileSync(join(projectPath, "package.json"), projectManifest);
  const assets = { "package.json": '{"name":"@aura3d/assets","version":"1.0.0"}', "index.js": "export const asset = 1;" };
  const codec = { "package.json": '{"name":"meshoptimizer","version":"1.0.0"}', "decoder.js": "export const decode = 1;" };
  for (const [path, contents] of Object.entries(assets)) writeFileSync(join(assetPath, path), contents);
  for (const [path, contents] of Object.entries(codec)) writeFileSync(join(nestedPath, path), contents);
  const assetArchive = syntheticArchive(assets), codecArchive = syntheticArchive(codec);
  const integrity = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const packageLock = { lockfileVersion: 3, packages: {
    "": {}, "node_modules/@aura3d/assets": { resolved: "asset", integrity: integrity(assetArchive) },
    "node_modules/@aura3d/assets/node_modules/meshoptimizer": { resolved: "codec", integrity: integrity(codecArchive) }
  } };
  const archiveBytes = new Map([["asset.tgz", assetArchive], ["codec.tgz", codecArchive]]);
  const readArchive = (path: string) => {
    const bytes = archiveBytes.get(path);
    if (!bytes) throw new Error("missing synthetic archive");
    return bytes;
  };
  const projectSha256 = createHash("sha256").update("package.json\0file\0").update(projectManifest).update("\0").digest("hex");
  const input = { root: process.cwd(), projectPath, project: { id: "npm-react19-peer-present", projectSha256 }, packageLock,
    archives: [{ resolved: "asset", path: "asset.tgz" }, { resolved: "codec", path: "codec.tgz" }], readArchive };
  return { base, projectPath, assetPath, nestedPath, input, archiveBytes };
}

describe("external codec source contract", () => {
  it("checks synthetic candidate and nested codec bytes against locked archives", () => {
    const fixture = syntheticInstallation();
    try {
      const result = validateExternalCodecInstalledProject(fixture.input);
      expect(result.projectRealpath).toBe(fixture.projectPath);
      expect(result.installedTreeSha256).toMatch(/^[a-f0-9]{64}$/);
      writeFileSync(join(fixture.nestedPath, "decoder.js"), "export const decode = 2;");
      expect(() => validateExternalCodecInstalledProject(fixture.input)).toThrow(/bytes differ/);
      writeFileSync(join(fixture.nestedPath, "decoder.js"), "export const decode = 1;");
      fixture.archiveBytes.set("asset.tgz", Buffer.from("changed archive"));
      expect(() => validateExternalCodecInstalledProject(fixture.input)).toThrow(/archive integrity/);
    } finally { rmSync(fixture.base, { recursive: true, force: true }); }
  });

  it("rejects unlocked packages, symlinks and missing required installed files", () => {
    const fixture = syntheticInstallation();
    try {
      const extra = join(fixture.projectPath, "node_modules", "unlocked");
      mkdirSync(extra);
      expect(() => validateExternalCodecInstalledProject(fixture.input)).toThrow(/unlocked installed package/);
      rmSync(extra, { recursive: true });
      rmSync(join(fixture.assetPath, "index.js"));
      symlinkSync(join(fixture.nestedPath, "decoder.js"), join(fixture.assetPath, "index.js"));
      expect(() => validateExternalCodecInstalledProject(fixture.input)).toThrow(/symlink in installed package/);
      rmSync(join(fixture.assetPath, "index.js"));
      expect(() => validateExternalCodecInstalledProject(fixture.input)).toThrow(/missing archive entries/);
    } finally { rmSync(fixture.base, { recursive: true, force: true }); }
  });

  it("rejects a project with a node_modules directory in its ancestry", () => {
    const fixture = syntheticInstallation();
    try {
      mkdirSync(join(fixture.base, "node_modules"));
      expect(() => validateExternalCodecInstalledProject(fixture.input)).toThrow(/packages outside its isolated project/);
    } finally { rmSync(fixture.base, { recursive: true, force: true }); }
  });

  it("requires an exact context bound to the gated inputs and measured installation", () => {
    const gate = candidateGate(), installedTreeSha256 = "a".repeat(64);
    const input = { runId: "source-test", gate, gatePath: "gate.json", gateSha256: "b".repeat(64),
      lockPath: "lock.json", lockSha256: "c".repeat(64), npmPath: "npm.json", npmSha256: "d".repeat(64),
      projectRealpath: "/tmp/synthetic-consumer", installedTreeSha256 };
    const context = { schema: "aura3d.external-codec-candidate-context/1", runId: input.runId,
      gate: { path: input.gatePath, sha256: input.gateSha256 }, freezeCommit: "1".repeat(40), sourceInputDigest: "3".repeat(64),
      candidatePlan: { path: "candidate.json", sha256: "2".repeat(64) }, fixtureLock: { path: input.lockPath, sha256: input.lockSha256 },
      npmInventory: { path: input.npmPath, sha256: input.npmSha256 }, matrixProject: "npm-react19-peer-present", projectRealpath: input.projectRealpath, installedTreeSha256 };
    expect(validateExternalCodecRunContext({ ...input, context })).toEqual(context);
    expect(() => validateExternalCodecRunContext({ ...input, context: null })).toThrow(/context does not match/);
    expect(() => validateExternalCodecRunContext({ ...input, context: { ...context, installedTreeSha256: "f".repeat(64) } })).toThrow(/context does not match/);
    expect(() => validateExternalCodecRunContext({ ...input, context: { ...context, projectRealpath: "/tmp/other" } })).toThrow(/context does not match/);
    expect(() => validateExternalCodecRunContext({ ...input, context: { ...context, extra: true } })).toThrow(/context does not match/);
  });

  it("pins policy and records the missing Duck SHA without inventing a digest", () => {
    expect(policy.fixtures[0]?.documentSha256).toBe("8721150e3409425acf83aa21986e55880360ab084c17e96409c25fac53477f72");
    expect(policy.fixtures[1]?.documentSha256).toBeNull();
    const changed = clone(policy) as { revision: string };
    changed.revision = "0".repeat(40);
    expect(() => validateExternalCodecPolicy(Buffer.from(JSON.stringify(changed)))).toThrow(/policy differs/);
  });

  it("authenticates synthetic Git commit, nested tree and blob identities", () => {
    const { blob, proof, revision } = syntheticTree();
    const lookup = verifyExternalCodecGitProof(proof, revision, policy.limits);
    expect(lookup("Models/fixture.bin")).toBe(blob);
    expect(() => lookup("Models/missing.bin")).toThrow(/missing Git proof/);
    expect(() => verifyExternalCodecGitProof(proof, "0".repeat(40), policy.limits)).toThrow(/pinned Git proof/);
    const corrupt = clone(proof);
    corrupt.trees[0]!.bytesBase64 = Buffer.from("changed").toString("base64");
    expect(() => verifyExternalCodecGitProof(corrupt, revision, policy.limits)).toThrow(/tree proof hash mismatch/);
  });

  it("verifies every authenticated document and its exact dependency closure", () => {
    const input = syntheticClosure();
    const result = validateExternalCodecFixtureRecords({ policy: input.testPolicy, runId: input.runId, fixtures: input.fixtures, treeBlob: input.treeBlob, readBytes: input.readBytes });
    expect(result.fixtures).toHaveLength(2);
    expect(result.fixtures.every(fixture => fixture.dependencies.length === 1)).toBe(true);
    expect(result.inputPaths).toHaveLength(4);
    const missing = input.fixtures.map((fixture, index) => index === 0 ? { ...fixture, dependencies: [] } : fixture);
    expect(() => validateExternalCodecFixtureRecords({ policy: input.testPolicy, runId: input.runId, fixtures: missing, treeBlob: input.treeBlob, readBytes: input.readBytes })).toThrow(/dependency closure/);
    const changed = input.fixtures.map((fixture, index) => index === 0
      ? { ...fixture, dependencies: [{ ...fixture.dependencies[0]!, sha256: "0".repeat(64) }] }
      : fixture);
    expect(() => validateExternalCodecFixtureRecords({ policy: input.testPolicy, runId: input.runId, fixtures: changed, treeBlob: input.treeBlob, readBytes: input.readBytes })).toThrow(/differ from the lock/);
    expect(() => validateExternalCodecFixtureRecords({ policy: input.testPolicy, runId: input.runId, fixtures: input.fixtures, treeBlob: () => "0".repeat(40), readBytes: input.readBytes })).toThrow(/pinned Git tree/);
  });

  it("refuses missing proof and changed candidate identity before reading any fixture", () => {
    const gate = candidateGate();
    const lock = { schema: "aura3d.external-codec-lock/1", runId: "source-test", gate: { path: "gate.json", sha256: "8".repeat(64) },
      freezeCommit: "1".repeat(40), sourceInputDigest: "3".repeat(64), candidatePlan: { path: "candidate.json", sha256: "2".repeat(64) },
      policy: { path: EXTERNAL_CODEC_POLICY_PATH, sha256: hash(policyBytes) }, provenance: {}, fixtures: [] } as unknown as ExternalCodecLock;
    const readBytes = vi.fn(() => Buffer.alloc(0));
    expect(() => validateExternalCodecInputs({ policyBytes, gate, gatePath: "gate.json", gateSha256: "8".repeat(64), lock, readBytes })).toThrow(/pinned Git proof/);
    expect(readBytes).not.toHaveBeenCalled();
    const stale = { ...lock, sourceInputDigest: "9".repeat(64) };
    expect(() => validateExternalCodecInputs({ policyBytes, gate, gatePath: "gate.json", gateSha256: "8".repeat(64), lock: stale, readBytes })).toThrow(/not bound/);
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("allows only locked credential-free requests and verifies response bytes before returning them", async () => {
    const input = syntheticClosure();
    const verified = validateExternalCodecFixtureRecords({ policy: input.testPolicy, runId: input.runId, fixtures: input.fixtures, treeBlob: input.treeBlob, readBytes: input.readBytes });
    const target = verified.fixtures[0]!.document;
    const bytes = input.input.get(target.localPath)!;
    const fetchImpl = vi.fn(async () => response(target.url, bytes));
    const guarded = createExternalCodecFetch({ fixtures: verified.fixtures, limits: verified.limits, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(guarded(target.url, { credentials: "omit", redirect: "error" }).then(value => value.arrayBuffer())).resolves.toEqual(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    await expect(guarded("https://unlisted.example.test/asset", { credentials: "omit", redirect: "error" })).rejects.toThrow(/not allowed/);
    await expect(guarded(target.url, { credentials: "include", redirect: "error" })).rejects.toThrow(/not allowed/);
    await expect(guarded(target.url, { credentials: "omit", redirect: "follow" })).rejects.toThrow(/not allowed/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects redirected or changed network bytes instead of parsing them", async () => {
    const input = syntheticClosure();
    const verified = validateExternalCodecFixtureRecords({ policy: input.testPolicy, runId: input.runId, fixtures: input.fixtures, treeBlob: input.treeBlob, readBytes: input.readBytes });
    const target = verified.fixtures[0]!.document;
    const bytes = input.input.get(target.localPath)!;
    const redirected = createExternalCodecFetch({ fixtures: verified.fixtures, limits: verified.limits,
      fetchImpl: (async () => response(target.url, bytes, { redirected: true })) as typeof fetch });
    await expect(redirected(target.url, { credentials: "omit", redirect: "error" })).rejects.toThrow(/response URL/);
    const corrupted = Buffer.from(bytes); corrupted[0] = (corrupted[0] ?? 0) ^ 1;
    const changed = createExternalCodecFetch({ fixtures: verified.fixtures, limits: verified.limits,
      fetchImpl: (async () => response(target.url, corrupted)) as typeof fetch });
    await expect(changed(target.url, { credentials: "omit", redirect: "error" })).rejects.toThrow(/integrity mismatch/);
  });

  it("requires both exact assertion IDs with no skips, duplicates or unexpected results", () => {
    const results = EXTERNAL_CODEC_ASSERTION_IDS.map(id => ({ fullName: id.split("::")[1], status: "passed" }));
    const report = { success: true, numTotalTests: 2, testResults: [{ name: `/repo/${EXTERNAL_CODEC_TEST_PATH}`, assertionResults: results }] };
    expect(evaluateExternalCodecResults(report, "/repo").status).toBe("passed");
    const skipped = clone(report); skipped.testResults[0]!.assertionResults[0]!.status = "pending";
    expect(evaluateExternalCodecResults(skipped, "/repo").status).toBe("failed");
    const missing = clone(report); missing.testResults[0]!.assertionResults.pop();
    expect(evaluateExternalCodecResults(missing, "/repo").missing).toHaveLength(1);
    const duplicate = clone(report); duplicate.testResults[0]!.assertionResults.push(duplicate.testResults[0]!.assertionResults[0]!);
    expect(() => evaluateExternalCodecResults(duplicate, "/repo")).toThrow(/duplicate/);
  });
});
