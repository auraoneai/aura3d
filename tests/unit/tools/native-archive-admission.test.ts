import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import type { ArchiveAdmissionCapability, PnpmArchiveAdmissionCapability, VerifyArchiveAdmissionInput } from "../../../tools/release/archive-admission.mjs";
import type { WorkspaceArchiveCapability } from "../../../tools/release/workspace-pnpm-admission.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const sri = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const canonical = (value: unknown) => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const formatted = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function tar(files: Array<{ path: string; data: string; type?: string }>): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    const data = Buffer.from(file.data), header = Buffer.alloc(512);
    header.write(`package/${file.path}`, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(32, 148, 156);
    header.write(file.type ?? "0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write(`${header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

type FixtureMode = "valid" | "no-anchor" | "wrong-anchor" | "empty-policy" | "invalid-policy" | "stale-review" | "missing-file" | "unknown-origin" | "missing-evidence" | "changed-source";

/** A synthetic module copy/policy tests the verifier without changing production trust. */
async function fixture(mode: FixtureMode = "valid", engineBin = false) {
  const root = mkdtempSync(join(tmpdir(), "aura-admission-"));
  roots.push(root);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = Buffer.from(publicKey.export({ format: "der", type: "spki" }));
  const authority = { keyId: sha(publicDer), spkiDerBase64: publicDer.toString("base64") };
  const tracked = new Set<string>();
  const put = (path: string, data: string | Uint8Array, source = true) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
    if (source) tracked.add(path);
  };
  const repo = process.cwd();
  for (const name of ["portable-npm-lock.mjs", "portable-pnpm-lock.mjs", "source-identity.mjs", "release-inventory.mjs", "admitted-archive-modes.mjs",
    "workspace-pnpm-admission.mjs", "pnpm-loopback-registry.mjs", "pnpm-installed-tree.mjs"]) {
    put(`tools/release/${name}`, readFileSync(join(repo, "tools/release", name)));
  }
  put("tools/remote-acr/offline-archive-store.mjs", readFileSync(join(repo, "tools/remote-acr/offline-archive-store.mjs")));
  const inventoryModule = await import(/* @vite-ignore */ pathToFileURL(join(root, "tools/release/release-inventory.mjs")).href) as {
    publicPackageNames(version: string, inventory: string): string[];
  };
  const names = inventoryModule.publicPackageNames("4.7.1", "native-1");
  const engineManifest = JSON.stringify({ name: "@aura3d/engine", version: "4.7.1", ...(engineBin ? { bin: { engine: "dist/index.js" } } : {}) });
  const helperManifest = JSON.stringify({ name: "helper", version: "1.0.0" });
  const engineCode = "export const engine = 1;\n", helperCode = "export const helper = 1;\n";
  put("package.json", engineManifest);
  put("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  put("source/engine.js", mode === "changed-source" ? "different source\n" : engineCode);
  put("source/helper-package.json", helperManifest);
  put("source/helper.js", helperCode);
  const evidencePath = "source/review-evidence.txt";
  const evidence = "Synthetic source-review evidence for this isolated test fixture.\n";
  put(evidencePath, evidence);
  for (const name of names.filter(name => name !== "@aura3d/engine")) {
    const directory = name === "@aura3d/cli" ? "aura3d-cli" : name.replace("@aura3d/", "");
    put(`packages/${directory}/package.json`, JSON.stringify({ name, version: "4.7.1" }));
  }
  const engineBytes = tar([{ path: "package.json", data: engineManifest }, { path: "dist/index.js", data: engineCode }]);
  const helperBytes = tar([{ path: "package.json", data: helperManifest }, { path: "index.js", data: helperCode }]);
  const engine = { name: "@aura3d/engine", version: "4.7.1", sha256: sha(engineBytes), integrity: sri(engineBytes) };
  const helper = { name: "helper", version: "1.0.0", sha256: sha(helperBytes), integrity: sri(helperBytes) };
  const evidenceRef = { path: evidencePath, sha256: sha(evidence) };
  const reviewedFile = (path: string, data: string, sourcePath: string) => ({
    path, sha256: sha(data), size: Buffer.byteLength(data), origin: "source-match",
    sources: [{ path: sourcePath, sha256: sha(data) }], evidence: [evidenceRef],
    rationale: "An independent fixture reviewer inspected the entire exact file and compared its source bytes."
  });
  const engineReview = {
    schema: "aura3d.archive-review/1", archive: engine, decision: "approved", scope: "complete-archive",
    reviewer: { id: "test-independent-reviewer", kind: "independent-source-review" },
    files: [reviewedFile("package.json", engineManifest, "package.json"), reviewedFile("dist/index.js", engineCode, "source/engine.js")]
  };
  const helperReview = {
    schema: "aura3d.archive-review/1", archive: helper, decision: "approved", scope: "complete-archive",
    reviewer: { id: "test-independent-reviewer", kind: "independent-source-review" },
    files: [reviewedFile("package.json", helperManifest, "source/helper-package.json"), reviewedFile("index.js", helperCode, "source/helper.js")]
  };
  if (mode === "missing-file") engineReview.files.pop();
  if (mode === "unknown-origin") engineReview.files[1]!.origin = "unknown";
  if (mode === "missing-evidence") { engineReview.files[1]!.origin = "reviewed-output"; engineReview.files[1]!.evidence = []; }
  const helperReviewPath = "source/helper-review.json";
  const helperReviewBytes = formatted(helperReview);
  put(helperReviewPath, helperReviewBytes);
  const admissions = [
    { archive: helper, review: { path: helperReviewPath, sha256: mode === "stale-review" ? "0".repeat(64) : sha(helperReviewBytes) } }
  ];
  const policy = formatted({ schema: mode === "invalid-policy" ? "invalid" : "aura3d.archive-admission-policy/1",
    admissions: mode === "empty-policy" ? [] : admissions, candidateAuthorities: mode === "empty-policy" ? [] : [authority] });
  put("tools/release/archive-admission-policy.json", policy);
  let verifierCode = readFileSync(join(repo, "tools/release/archive-admission.mjs"), "utf8");
  if (mode !== "no-anchor") {
    const pin = mode === "wrong-anchor" ? "0".repeat(64) : sha(policy);
    verifierCode = verifierCode.replace("const TRUSTED_POLICY_SHA256 = null;", `const TRUSTED_POLICY_SHA256 = '${pin}';`);
  }
  put("tools/release/archive-admission.mjs", verifierCode);
  const files = [...tracked].sort().map(path => ({
    path, type: "file", mode: "100644", sha256: sha(readFileSync(join(root, path)))
  }));
  const sourceManifest = {
    schema: "aura3d.native-source-manifest/1", origin: { commit: "a".repeat(40), tree: "b".repeat(40) },
    files, administrativeFiles: [], lockfileSha256: sha("lockfileVersion: '9.0'\n"), inputDigest: sha(canonical(files))
  };
  const sourceManifestPath = ".native-source-manifest.json";
  const sourceManifestBytes = formatted(sourceManifest);
  put(sourceManifestPath, sourceManifestBytes, false);
  const fingerprint = createHash("sha256");
  for (const file of files) fingerprint.update(file.path).update("\0").update(readFileSync(join(root, file.path))).update("\0");
  const source = {
    ...sourceManifest.origin, lockfileSha256: sourceManifest.lockfileSha256, fingerprint: fingerprint.digest("hex"),
    inputDigest: sourceManifest.inputDigest, manifestSha256: sha(sourceManifestBytes)
  };
  const packages = names.map((name, index) => {
    const data = name === engine.name ? engineBytes : tar([{ path: "package.json", data: JSON.stringify({ name, version: "4.7.1" }) }]);
    const tarball = `tests/reports/candidate-${index}.tgz`;
    put(tarball, data, false);
    return { name, version: "4.7.1", tarball, sha256: sha(data), integrity: sri(data) };
  });
  const planPath = "tests/reports/plan.json";
  const planBytes = JSON.stringify({ schema: "aura3d-release-plan/1.0", version: "4.7.1", inventoryId: "native-1", source,
    expectedPackageCount: names.length, packageCount: names.length, packages });
  put(planPath, planBytes, false);
  const sidecarEvidencePath = "tests/reports/native-source-inputs/test-run/candidate-review-evidence/review.txt";
  const sidecarEvidence = "Synthetic post-pack evidence for this candidate review only.\n";
  put(sidecarEvidencePath, sidecarEvidence, false);
  const payload = {
    schema: "aura3d.candidate-review/1", sourceInputSha256: source.inputDigest, sourceManifestSha256: source.manifestSha256,
    candidatePlanSha256: sha(planBytes), archive: engine, decision: engineReview.decision, scope: engineReview.scope,
    reviewer: engineReview.reviewer, files: engineReview.files.map(file => ({ ...file,
      evidence: file.evidence.length ? [{ scope: "sidecar", path: sidecarEvidencePath, sha256: sha(sidecarEvidence) }] : [] }))
  };
  function signedReview(reviewPayload: typeof payload, signer: KeyObject = privateKey, keyId = authority.keyId) {
    const message = Buffer.from(`aura3d.candidate-review/1\0${canonical(reviewPayload)}`);
    const signature = sign(null, message, signer).toString("base64");
    const review = formatted({ schema: "aura3d.candidate-review-envelope/1", payload: reviewPayload,
      signature: { algorithm: "ed25519", keyId, value: signature } });
    const digest = sha(review), path = `tests/reports/native-source-inputs/test-run/candidate-reviews/${digest}.json`;
    put(path, review, false);
    return { path, sha256: digest };
  }
  const candidateReviews = [signedReview(payload)];
  const engineResolved = "file:archives/engine.tgz", helperResolved = "https://registry.npmjs.org/helper/-/helper-1.0.0.tgz";
  const dependencies = { "@aura3d/engine": engineResolved, helper: "1.0.0" };
  const manifestBytes = Buffer.from(JSON.stringify({ name: "consumer", dependencies }));
  const lockBytes = Buffer.from(JSON.stringify({ lockfileVersion: 3, packages: {
    "": { name: "consumer", dependencies },
    "node_modules/@aura3d/engine": { version: engine.version, resolved: engineResolved, integrity: engine.integrity },
    "node_modules/helper": { version: helper.version, resolved: helperResolved, integrity: helper.integrity }
  } }));
  const input: VerifyArchiveAdmissionInput = { root, sourceManifestPath, planPath, manifestBytes, lockBytes, candidateReviews,
    archives: [{ resolved: engineResolved, bytes: engineBytes }, { resolved: helperResolved, bytes: helperBytes }] };
  const api = await import(/* @vite-ignore */ pathToFileURL(join(root, "tools/release/archive-admission.mjs")).href) as typeof import("../../../tools/release/archive-admission.mjs");
  return { root, api, input, engineBytes, helperBytes, payload, privateKey, authority, signedReview, sidecarEvidencePath };
}

function pnpmInput(f: Awaited<ReturnType<typeof fixture>>): VerifyArchiveAdmissionInput {
  const plan = JSON.parse(readFileSync(join(f.root, f.input.planPath), "utf8")) as { packages: { name: string; tarball: string }[] };
  const tarball = plan.packages.find(entry => entry.name === "@aura3d/engine")!.tarball.split("/").at(-1)!;
  const local = `file:./tarballs/${tarball}`;
  const key = `@aura3d/engine@file:tarballs/${tarball}`;
  const manifestBytes = Buffer.from(JSON.stringify({ name: "consumer", version: "0.0.0", private: true,
    dependencies: { "@aura3d/engine": local, helper: "^1.0.0" } }));
  const lockBytes = Buffer.from(`lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    dependencies:\n      '@aura3d/engine':\n        specifier: ${local}\n        version: file:tarballs/${tarball}\n      helper:\n        specifier: ^1.0.0\n        version: 1.0.0\npackages:\n  '${key}':\n    resolution: {integrity: ${sri(f.engineBytes)}, tarball: file:tarballs/${tarball}}\n  helper@1.0.0:\n    resolution: {integrity: ${sri(f.helperBytes)}}\nsnapshots:\n  '${key}': {}\n  helper@1.0.0: {}\n`);
  return { root: f.root, sourceManifestPath: f.input.sourceManifestPath, planPath: f.input.planPath, candidateReviews: f.input.candidateReviews, manifestBytes, lockBytes,
    archives: [{ resolved: local, bytes: f.engineBytes }, { resolved: "https://registry.npmjs.org/helper/-/helper-1.0.0.tgz", bytes: f.helperBytes }] };
}

describe("digest-bound archive admission", () => {
  it("fails the configuration preflight before opening a missing root when no trust pin exists", async () => {
    const f = await fixture("no-anchor");
    expect(() => f.api.assertArchiveAdmissionConfigured({ root: join(f.root, "does-not-exist") })).toThrow(/no independently trusted policy anchor/);
  });

  it.each([
    ["wrong-anchor", /does not match the independently trusted anchor/],
    ["invalid-policy", /invalid policy schema/]
  ] as const)("rejects %s during the configuration preflight", async (mode, expected) => {
    const f = await fixture(mode);
    expect(() => f.api.assertArchiveAdmissionConfigured({ root: f.root })).toThrow(expected);
  });

  it("checks only the pinned policy and never grants admission or reads source evidence and archives", async () => {
    const f = await fixture();
    rmSync(join(f.root, "source"), { recursive: true, force: true });
    rmSync(join(f.root, "tests/reports"), { recursive: true, force: true });
    rmSync(join(f.root, f.input.sourceManifestPath));
    expect(f.api.assertArchiveAdmissionConfigured({ root: f.root })).toBeUndefined();
  });

  it("treats an empty pinned policy as configured without authorizing any archive", async () => {
    const f = await fixture("empty-policy");
    expect(f.api.assertArchiveAdmissionConfigured({ root: f.root })).toBeUndefined();
    expect(() => f.api.verifyArchiveAdmission(f.input)).toThrow(/untrusted candidate review authority/);
  });

  it("verifies all reviewed candidate and external files, and retains immutable byte snapshots", async () => {
    const f = await fixture();
    const result = f.api.verifyArchiveAdmission(f.input);
    expect(result.receipt.archives.map(entry => entry.name).sort()).toEqual(["@aura3d/engine", "helper"]);
    expect(result.receipt.archives.every(entry => entry.files.length === 2)).toBe(true);
    expect(result.receipt.sourceManifest.path).toBe(f.input.sourceManifestPath);
    expect(Object.isFrozen(result.receipt.archives[0]!.files)).toBe(true);
    const original = Buffer.from(f.engineBytes);
    f.engineBytes[0] ^= 255;
    const read = () => f.api.consumeArchiveAdmission({ capability: result.capability, manifestBytes: f.input.manifestBytes, lockBytes: f.input.lockBytes });
    const first = read();
    expect(Buffer.from(first.find(item => item.resolved.startsWith("file:"))!.bytes)).toEqual(original);
    first[0]!.bytes[0] ^= 255;
    expect(Buffer.from(read().find(item => item.resolved.startsWith("file:"))!.bytes)).toEqual(original);
  });

  it.each([
    ["no-anchor", /no independently trusted policy anchor/],
    ["wrong-anchor", /does not match the independently trusted anchor/],
    ["empty-policy", /untrusted candidate review authority/],
    ["stale-review", /review digest mismatch/],
    ["missing-file", /cover every file/],
    ["unknown-origin", /unknown file origin/],
    ["missing-evidence", /missing supporting evidence/],
    ["changed-source", /source digest mismatch/]
  ] as const)("fails closed for %s", async (mode, expected) => {
    const f = await fixture(mode);
    expect(() => f.api.verifyArchiveAdmission(f.input)).toThrow(expected);
  });

  it("rejects altered archives, duplicate resolutions, and forged capabilities", async () => {
    const f = await fixture();
    const altered = [...f.input.archives];
    altered[0] = { ...altered[0]!, bytes: Buffer.from("unreviewed bytes") };
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, archives: altered })).toThrow();
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, archives: [...f.input.archives, f.input.archives[0]!] })).toThrow(/duplicate archive resolution/);
    expect(() => f.api.consumeArchiveAdmission({ capability: {} as ArchiveAdmissionCapability,
      manifestBytes: f.input.manifestBytes, lockBytes: f.input.lockBytes })).toThrow(/invalid admission capability/);
  });

  it("rejects changed graph bytes or staged source after admission", async () => {
    const f = await fixture();
    const { capability } = f.api.verifyArchiveAdmission(f.input);
    expect(() => f.api.consumeArchiveAdmission({ capability, manifestBytes: f.input.manifestBytes, lockBytes: Buffer.from("{}") })).toThrow(/manifest or lock differs/);
    writeFileSync(join(f.root, "source/helper.js"), "modified");
    expect(() => f.api.consumeArchiveAdmission({ capability, manifestBytes: f.input.manifestBytes, lockBytes: f.input.lockBytes })).toThrow(/mismatch/);
  });

  it("reviews a batch against one staged context without issuing install capabilities", async () => {
    const f = await fixture();
    const { root, sourceManifestPath, planPath, candidateReviews, ...consumer } = f.input;
    const receipts = f.api.verifyArchiveAdmissionBatch({ root, sourceManifestPath, planPath, candidateReviews, consumers: [consumer, consumer] });
    expect(receipts).toHaveLength(2);
    expect(receipts[0]!.lockSha256).toBe(sha(f.input.lockBytes));
    expect(receipts[1]!.archives).toEqual(receipts[0]!.archives);
    expect("capability" in receipts[0]!).toBe(false);
  });

  it("rejects a staged-source change during a batch", async () => {
    const f = await fixture();
    const { root, sourceManifestPath, planPath, candidateReviews, manifestBytes, lockBytes } = f.input;
    const consumer = { manifestBytes, lockBytes, get archives() {
      writeFileSync(join(root, "pnpm-lock.yaml"), "changed during review\n");
      return f.input.archives;
    } };
    expect(() => f.api.verifyArchiveAdmissionBatch({ root, sourceManifestPath, planPath, candidateReviews, consumers: [consumer] })).toThrow(/mismatch/);
  });

  it("binds pnpm lock bytes with a distinct capability and batch receipt", async () => {
    const f = await fixture(), input = pnpmInput(f);
    const npm = f.api.verifyArchiveAdmission(f.input), pnpm = f.api.verifyPnpmArchiveAdmission(input);
    expect(pnpm.receipt.lockFormat).toBe("pnpm");
    expect(pnpm.receipt.lockSha256).toBe(sha(input.lockBytes));
    expect(f.api.consumePnpmArchiveAdmission({ capability: pnpm.capability, manifestBytes: input.manifestBytes, lockBytes: input.lockBytes })).toHaveLength(2);
    expect(() => f.api.consumeArchiveAdmission({ capability: pnpm.capability as unknown as ArchiveAdmissionCapability,
      manifestBytes: input.manifestBytes, lockBytes: input.lockBytes })).toThrow(/invalid admission capability/);
    expect(() => f.api.consumePnpmArchiveAdmission({ capability: npm.capability as unknown as PnpmArchiveAdmissionCapability,
      manifestBytes: f.input.manifestBytes, lockBytes: f.input.lockBytes })).toThrow(/invalid admission capability/);
    expect(() => f.api.consumePnpmArchiveAdmission({ capability: pnpm.capability, manifestBytes: input.manifestBytes,
      lockBytes: Buffer.from("changed") })).toThrow(/manifest or lock differs/);
    const { root, sourceManifestPath, planPath, candidateReviews, ...consumer } = input;
    const receipts = f.api.verifyPnpmArchiveAdmissionBatch({ root, sourceManifestPath, planPath, candidateReviews, consumers: [consumer, consumer] });
    expect(receipts.map(receipt => receipt.lockFormat)).toEqual(["pnpm", "pnpm"]);
    expect(receipts[0]!.archives).toEqual(pnpm.receipt.archives);
  });

  it("routes a real signed-review pnpm capability without network or workspace-brand confusion", async () => {
    const f = await fixture(), input = pnpmInput(f);
    const { capability } = f.api.verifyPnpmArchiveAdmission(input);
    const routerApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/pnpm-loopback-registry.mjs")).href) as typeof import("../../../tools/release/pnpm-loopback-registry.mjs");
    const workspaceApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/workspace-pnpm-admission.mjs")).href) as typeof import("../../../tools/release/workspace-pnpm-admission.mjs");
    expect(() => workspaceApi.consumeWorkspacePnpmAdmission({ capability: capability as unknown as WorkspaceArchiveCapability,
      root: f.root, sourceManifestPath: f.input.sourceManifestPath })).toThrow(/invalid workspace archive capability/);
    const router = routerApi.createPnpmLoopbackRegistry({ capability, manifestBytes: input.manifestBytes, lockBytes: input.lockBytes });
    const first = router.handle({ method: "GET", target: `${router.registryPath}helper/-/helper-1.0.0.tgz` });
    expect(first.status).toBe(200);
    expect(Buffer.from(first.body)).toEqual(f.helperBytes);
    first.body[0] ^= 255;
    expect(Buffer.from(router.handle({ method: "GET", target: `${router.registryPath}helper/-/helper-1.0.0.tgz` }).body)).toEqual(f.helperBytes);
    expect(router.finish().closed).toBe(true);
  });

  it("stops serving consumer archives when their admitted source changes", async () => {
    const f = await fixture(), input = pnpmInput(f);
    const { capability } = f.api.verifyPnpmArchiveAdmission(input);
    const routerApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/pnpm-loopback-registry.mjs")).href) as typeof import("../../../tools/release/pnpm-loopback-registry.mjs");
    const router = routerApi.createPnpmLoopbackRegistry({ capability, manifestBytes: input.manifestBytes, lockBytes: input.lockBytes });
    const request = { method: "GET", target: `${router.registryPath}helper/-/helper-1.0.0.tgz` };
    expect(router.handle(request).status).toBe(200);
    writeFileSync(join(f.root, "pnpm-lock.yaml"), "changed after registry creation\n");
    expect(() => router.handle(request)).toThrow(/admission.*(changed|unavailable)/i);
    expect(router.status()).toMatchObject({ closed: true, denied: 1 });
  });

  it("stores a real pnpm-admitted candidate and closes its stored dispatcher on tampering", async () => {
    const f = await fixture(), admissionInput = pnpmInput(f);
    const { capability } = f.api.verifyPnpmArchiveAdmission(admissionInput);
    const storeApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/remote-acr/offline-archive-store.mjs")).href) as typeof import("../../../tools/remote-acr/offline-archive-store.mjs");
    const routerApi = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/pnpm-loopback-registry.mjs")).href) as typeof import("../../../tools/release/pnpm-loopback-registry.mjs");
    const parent = mkdtempSync(join(tmpdir(), "aura-consumer-store-")); roots.push(parent);
    const input = { capability, manifestBytes: admissionInput.manifestBytes, lockBytes: admissionInput.lockBytes, storeDir: join(parent, "store") };
    const created = storeApi.createConsumerOfflineArchiveStore(input);
    expect(created).toMatchObject({ archiveCount: 2, blobCount: 2, installationAuthorized: false });
    expect(() => storeApi.readConsumerOfflineArchiveStore({ ...input, lockBytes: Buffer.from("changed") })).toThrow(/manifest or lock differs/);
    const router = routerApi.createStoredPnpmLoopbackRegistry(input);
    const request = { method: "GET", target: `${router.registryPath}helper/-/helper-1.0.0.tgz` };
    expect(Buffer.from(router.handle(request).body)).toEqual(f.helperBytes);
    writeFileSync(join(input.storeDir, "archives", `${sha(f.helperBytes)}.tgz`), "changed");
    expect(() => router.handle(request)).toThrow(/admission.*(changed|unavailable)/i);
    expect(router.status()).toMatchObject({ closed: true, denied: 1 });
  });

  it("seeds a native consumer store only from live candidate and registry admissions", async () => {
    const f = await fixture(), admitted = pnpmInput(f);
    const { capability } = f.api.verifyPnpmArchiveAdmission(admitted);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/portable-pnpm-lock.mjs")).href) as typeof import("../../../tools/release/portable-pnpm-lock.mjs");
    const parent = mkdtempSync(join(tmpdir(), "aura-consumer-native-")); roots.push(parent);
    const input = { storeDir: join(parent, "store"), admission: { capability, manifestBytes: admitted.manifestBytes, lockBytes: admitted.lockBytes } };
    const result = api.seedVerifiedPnpmStore(input);
    expect(result).toMatchObject({ schema: "aura3d.pnpm-native-store/1", archiveCount: 2, installationAuthorized: false });
    expect(api.verifyPnpmNativeStore(input).manifestSha256).toBe(result.manifestSha256);
    const manifest = JSON.parse(readFileSync(join(input.storeDir, "manifest.json"), "utf8")) as { archives: { resolved: string; integrity: string; key: string }[] };
    const local = manifest.archives.find(item => item.resolved.startsWith("file:"))!;
    expect(local.key).toBe(`${local.integrity}\t${local.resolved.replace("file:./", "file:")}`);
    expect(() => api.verifyPnpmNativeStore({ ...input, admission: { ...input.admission, lockBytes: Buffer.from("changed") } })).toThrow(/manifest or lock differs/);
    writeFileSync(join(f.root, "source/helper.js"), "changed after admission");
    expect(() => api.verifyPnpmNativeStore(input)).toThrow(/mismatch/);
  });

  it("checks post-use registration and SQLite statistics against a live synthetic admission", async () => {
    const f = await fixture(), admitted = pnpmInput(f);
    const { capability } = f.api.verifyPnpmArchiveAdmission(admitted);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/portable-pnpm-lock.mjs")).href) as typeof import("../../../tools/release/portable-pnpm-lock.mjs");
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "aura-consumer-postuse-"))); roots.push(parent);
    const project = join(parent, "project"), storeDir = join(parent, "store");
    mkdirSync(project);
    writeFileSync(join(project, "package.json"), admitted.manifestBytes);
    writeFileSync(join(project, "pnpm-lock.yaml"), admitted.lockBytes);
    const base = { storeDir, admission: { capability, manifestBytes: admitted.manifestBytes, lockBytes: admitted.lockBytes } };
    api.seedVerifiedPnpmStore(base);
    const projects = join(storeDir, "v11", "projects"), registration = join(projects, sha(project).slice(0, 32));
    mkdirSync(projects, { mode: 0o700 }); symlinkSync(relative(projects, project), registration);
    const db = new DatabaseSync(join(storeDir, "v11", "index.db"));
    try { db.exec("ANALYZE"); } finally { db.close(); }
    const input = { ...base, afterUse: { projectDir: project } };
    expect(api.verifyPnpmNativeStore(input)).toMatchObject({ archiveCount: 2, installationAuthorized: false });
    expect(() => api.verifyPnpmNativeStore(base)).toThrow(/unexpected native store entries/);
    writeFileSync(join(project, "package.json"), "{}");
    expect(() => api.verifyPnpmNativeStore(input)).toThrow(/project binding differs/);
    writeFileSync(join(project, "package.json"), admitted.manifestBytes);
    rmSync(registration); symlinkSync(project, registration);
    expect(() => api.verifyPnpmNativeStore(input)).toThrow(/project registration differs/);
    rmSync(registration); symlinkSync(relative(projects, project), registration);
    const tampered = new DatabaseSync(join(storeDir, "v11", "index.db"));
    try { tampered.exec("UPDATE sqlite_stat1 SET stat = '999999 1'"); } finally { tampered.close(); }
    expect(() => api.verifyPnpmNativeStore(input)).toThrow(/index statistics differ/);
    const samples = new DatabaseSync(join(storeDir, "v11", "index.db"));
    try { samples.exec("ANALYZE; UPDATE sqlite_stat4 SET sample = X'00'"); } finally { samples.close(); }
    expect(() => api.verifyPnpmNativeStore(input)).toThrow(/index statistics differ/);
    const row = new DatabaseSync(join(storeDir, "v11", "index.db"));
    try { row.exec("ANALYZE; UPDATE package_index SET data = X'00' WHERE key = (SELECT key FROM package_index LIMIT 1)"); }
    finally { row.close(); }
    expect(() => api.verifyPnpmNativeStore(input)).toThrow(/index differs from admission/);
  }, 30000);

  it("checks an installed synthetic candidate and registry package against the same live admission", async () => {
    const f = await fixture(), admitted = pnpmInput(f);
    const { capability } = f.api.verifyPnpmArchiveAdmission(admitted);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/portable-pnpm-lock.mjs")).href) as typeof import("../../../tools/release/portable-pnpm-lock.mjs");
    const project = realpathSync(mkdtempSync(join(tmpdir(), "aura-consumer-tree-"))); roots.push(project);
    const put = (path: string, data: string | Uint8Array) => {
      mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data);
    };
    const modules = join(project, "node_modules"), virtual = join(modules, ".pnpm");
    const local = admitted.archives.find(item => item.resolved.startsWith("file:"))!;
    const tarball = local.resolved.slice("file:./tarballs/".length);
    const engine = join(virtual, `file+tarballs+${tarball}`, "node_modules", "@aura3d", "engine");
    const helper = join(virtual, "helper@1.0.0", "node_modules", "helper");
    put(join(project, "package.json"), admitted.manifestBytes);
    put(join(project, "pnpm-lock.yaml"), admitted.lockBytes);
    put(join(project, "tarballs", tarball), f.engineBytes);
    put(join(virtual, "lock.yaml"), admitted.lockBytes);
    put(join(engine, "package.json"), JSON.stringify({ name: "@aura3d/engine", version: "4.7.1" }));
    put(join(engine, "dist/index.js"), "export const engine = 1;\n");
    put(join(helper, "package.json"), JSON.stringify({ name: "helper", version: "1.0.0" }));
    put(join(helper, "index.js"), "export const helper = 1;\n");
    mkdirSync(join(modules, "@aura3d"), { recursive: true });
    symlinkSync(relative(join(modules, "@aura3d"), engine), join(modules, "@aura3d", "engine"));
    symlinkSync(relative(modules, helper), join(modules, "helper"));
    const input = { projectDir: project, admission: { capability, manifestBytes: admitted.manifestBytes, lockBytes: admitted.lockBytes } };
    expect(api.assertInstalledPnpmArchiveSet(input)).toMatchObject({ schema: "aura3d.pnpm-installed-consumer/1",
      snapshotKeys: [`@aura3d/engine@file:tarballs/${tarball}`, "helper@1.0.0"], installationAuthorized: false });
    put(join(helper, "index.js"), "tampered");
    expect(() => api.assertInstalledPnpmArchiveSet(input)).toThrow(/differs from admitted archive/);
    put(join(helper, "index.js"), "export const helper = 1;\n");
    put(join(project, "tarballs", tarball), "tampered");
    expect(() => api.assertInstalledPnpmArchiveSet(input)).toThrow(/tarball differs/);
    expect(() => api.assertInstalledPnpmArchiveSet({ ...input, admission: { ...input.admission, capability: {} as PnpmArchiveAdmissionCapability } }))
      .toThrow(/invalid admission capability/);
  }, 30000);

  it("checks an npm installed tree against a genuine live synthetic admission capability", async () => {
    // The existing fixture uses an isolated test-only policy and source tree;
    // it does not change the repository's independent production trust pin.
    const f = await fixture("valid", true);
    const manifest = JSON.parse(Buffer.from(f.input.manifestBytes).toString("utf8"));
    const lock = JSON.parse(Buffer.from(f.input.lockBytes).toString("utf8"));
    delete manifest.dependencies.helper;
    manifest.optionalDependencies = { helper: "1.0.0" };
    delete lock.packages[""].dependencies.helper;
    lock.packages[""].optionalDependencies = { helper: "1.0.0" };
    lock.packages["node_modules/helper"].optional = true;
    const admitted = { ...f.input, manifestBytes: Buffer.from(JSON.stringify(manifest)), lockBytes: Buffer.from(JSON.stringify(lock)) };
    const { capability } = f.api.verifyArchiveAdmission(admitted);
    const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/pnpm-installed-tree.mjs")).href) as typeof import("../../../tools/release/pnpm-installed-tree.mjs");
    const projectDir = realpathSync(mkdtempSync(join(tmpdir(), "aura-npm-admitted-tree-"))); roots.push(projectDir);
    const put = (path: string, data: string | Uint8Array) => {
      mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data);
    };
    put(join(projectDir, "package.json"), admitted.manifestBytes);
    put(join(projectDir, "package-lock.json"), admitted.lockBytes);
    put(join(projectDir, "archives/engine.tgz"), f.engineBytes);
    put(join(projectDir, "node_modules/@aura3d/engine/package.json"), JSON.stringify({ name: "@aura3d/engine", version: "4.7.1", bin: { engine: "dist/index.js" } }));
    put(join(projectDir, "node_modules/@aura3d/engine/dist/index.js"), "export const engine = 1;\n");
    put(join(projectDir, "node_modules/helper/package.json"), JSON.stringify({ name: "helper", version: "1.0.0" }));
    put(join(projectDir, "node_modules/helper/index.js"), "export const helper = 1;\n");
    const bin = join(projectDir, "node_modules/.bin/engine");
    mkdirSync(dirname(bin), { recursive: true });
    symlinkSync("../@aura3d/engine/dist/index.js", bin);
    const admission = { capability, manifestBytes: admitted.manifestBytes, lockBytes: admitted.lockBytes };
    const input = { projectDir, admission };
    expect(api.verifyInstalledNpmConsumer(input)).toMatchObject({
      schema: "aura3d.npm-installed-consumer/1", archiveAdmissionBound: true,
      manifestSha256: sha(admitted.manifestBytes), lockfileSha256: sha(admitted.lockBytes),
      packagePaths: ["node_modules/@aura3d/engine", "node_modules/helper"],
      installationAuthorized: false, executionAuthorized: false
    });
    expect(() => api.verifyInstalledNpmConsumer({ ...input, admission: { ...admission, capability: {} as ArchiveAdmissionCapability } }))
      .toThrow(/invalid admission capability/);
    expect(() => api.verifyInstalledNpmConsumer({ ...input, admission: { ...admission, lockBytes: Buffer.from("{}") } }))
      .toThrow(/lock differs from admitted bytes/);
    rmSync(join(projectDir, "node_modules/helper"), { recursive: true });
    expect(() => api.verifyInstalledNpmConsumer(input)).toThrow(/missing.*platform custody/i);
    put(join(projectDir, "node_modules/helper/package.json"), JSON.stringify({ name: "helper", version: "1.0.0" }));
    put(join(projectDir, "node_modules/helper/index.js"), "export const helper = 1;\n");
    rmSync(bin);
    symlinkSync("../@aura3d/engine/package.json", bin);
    expect(() => api.verifyInstalledNpmConsumer(input)).toThrow(/bin.*declared/i);
    rmSync(bin);
    symlinkSync("../@aura3d/engine/dist/index.js", bin);
    put(join(projectDir, "node_modules/helper/index.js"), "tampered");
    expect(() => api.verifyInstalledNpmConsumer(input)).toThrow(/differs from admitted archive/);
    put(join(projectDir, "node_modules/helper/index.js"), "export const helper = 1;\n");
    put(join(projectDir, "archives/engine.tgz"), "tampered");
    expect(() => api.verifyInstalledNpmConsumer(input)).toThrow(/local archive differs from admission/);
    put(join(projectDir, "archives/engine.tgz"), f.engineBytes);
    put(join(f.root, "source/engine.js"), "stale reviewed source\n");
    expect(() => api.verifyInstalledNpmConsumer(input)).toThrow(/source|identity|changed/i);
  }, 30000);

  // Register executable conformance only in an explicitly isolated run. An
  // absent opt-in is neither a passing nor a skipped conformance result.
  if (process.env.AURA3D_TEST_PINNED_PNPM) it(
    "imports an inert reviewed local candidate and registry package from the native store", async () => {
      const f = await fixture(), admitted = pnpmInput(f);
      const { capability } = f.api.verifyPnpmArchiveAdmission(admitted);
      const api = await import(/* @vite-ignore */ pathToFileURL(join(f.root, "tools/release/portable-pnpm-lock.mjs")).href) as typeof import("../../../tools/release/portable-pnpm-lock.mjs");
      const parent = mkdtempSync(join(tmpdir(), "aura-consumer-pnpm-")); roots.push(parent);
      const project = join(parent, "project"), home = join(parent, "home");
      mkdirSync(join(project, "tarballs"), { recursive: true }); mkdirSync(home);
      const local = admitted.archives.find(item => item.resolved.startsWith("file:"))!;
      writeFileSync(join(project, local.resolved.slice("file:./".length)), f.engineBytes);
      writeFileSync(join(project, "package.json"), admitted.manifestBytes);
      writeFileSync(join(project, "pnpm-lock.yaml"), admitted.lockBytes);
      // Fixture-only policy setting; the product policy is untouched.
      writeFileSync(join(project, "pnpm-workspace.yaml"), "packages: []\nminimumReleaseAge: 0\n");
      const input = { storeDir: join(parent, "store"), admission: { capability, manifestBytes: admitted.manifestBytes, lockBytes: admitted.lockBytes } };
      api.seedVerifiedPnpmStore(input);
      const env = { HOME: home, XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"),
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, CI: "true", COREPACK_ENABLE_NETWORK: "0" };
      const cli = process.env.AURA3D_TEST_PINNED_PNPM!;
      if (process.platform !== "darwin") throw new Error("no independently enforced network-denying sandbox for this conformance fixture");
      const run = (args: string[]) => spawnSync("/usr/bin/sandbox-exec",
        ["-p", "(version 1)(allow default)(deny network*)", process.execPath, cli, ...args],
        { cwd: project, env, encoding: "utf8", timeout: 20000 });
      const version = run(["--version"]);
      expect(version.status).toBe(0); expect(version.stdout.trim()).toBe("11.1.3");
      const installed = run(["install", "--offline", "--ignore-scripts", "--ignore-pnpmfile",
        "--frozen-lockfile", "--package-import-method=copy", "--store-dir", input.storeDir,
        "--registry=http://127.0.0.1:9/", "--reporter=append-only"]);
      expect({ status: installed.status, error: installed.error?.message, output: installed.stdout + installed.stderr })
        .toMatchObject({ status: 0 });
      expect(readFileSync(join(project, "node_modules", "@aura3d", "engine", "dist", "index.js"), "utf8"))
        .toBe("export const engine = 1;\n");
      expect(readFileSync(join(project, "node_modules", "helper", "index.js"), "utf8")).toBe("export const helper = 1;\n");
      expect(() => api.verifyPnpmNativeStore(input)).toThrow(/unexpected native store entries/);
    }, 45000);

  it("rejects pnpm admission when the independently trusted policy pin is missing", async () => {
    const f = await fixture("no-anchor");
    expect(() => f.api.verifyPnpmArchiveAdmission(pnpmInput(f))).toThrow(/no independently trusted policy anchor/);
  });

  it("requires an authenticated post-pack candidate review without changing staged source", async () => {
    const f = await fixture();
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [] })).toThrow(/no trusted digest-bound candidate archive review/);
    const result = f.api.verifyArchiveAdmission(f.input);
    const staged = JSON.parse(readFileSync(join(f.root, f.input.sourceManifestPath), "utf8")) as { files: { path: string }[] };
    expect(staged.files.some(entry => entry.path === f.input.candidateReviews![0]!.path || entry.path === f.sidecarEvidencePath)).toBe(false);
    expect(result.receipt.sourceInputSha256).toBe(f.payload.sourceInputSha256);
    expect(result.receipt.plan.sha256).toBe(f.payload.candidatePlanSha256);
    expect(result.receipt.archives.find(item => item.name === "@aura3d/engine")?.review).toMatchObject({
      ...f.input.candidateReviews![0], keyId: f.authority.keyId
    });
  });

  it.each(["sourceInputSha256", "sourceManifestSha256", "candidatePlanSha256"] as const)("rejects a validly signed review bound to the wrong %s", async field => {
    const f = await fixture(), review = f.signedReview({ ...f.payload, [field]: "0".repeat(64) });
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [review] })).toThrow(/does not bind staged source, plan and archive/);
  });

  it("rejects forged and unknown candidate review signers", async () => {
    const f = await fixture(), other = generateKeyPairSync("ed25519");
    const forged = f.signedReview(f.payload, other.privateKey);
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [forged] })).toThrow(/invalid candidate review signature/);
    const unknown = f.signedReview(f.payload, other.privateKey, sha(Buffer.from(other.publicKey.export({ format: "der", type: "spki" }))));
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [unknown] })).toThrow(/untrusted candidate review authority/);
  });

  it("accepts signed candidate review evidence from staged source without a post-pack evidence file", async () => {
    const f = await fixture(), payload = structuredClone(f.payload);
    const evidencePath = "source/review-evidence.txt";
    const evidenceHash = sha(readFileSync(join(f.root, evidencePath)));
    for (const file of payload.files) file.evidence = [{ scope: "source", path: evidencePath, sha256: evidenceHash }];
    const review = f.signedReview(payload);
    rmSync(join(f.root, f.sidecarEvidencePath));
    expect(f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [review] }).receipt.archives).toHaveLength(2);
  });

  it("rejects a trusted signature on the wrong candidate bytes or an out-of-run evidence reference", async () => {
    const f = await fixture();
    const wrongArchive = f.signedReview({ ...f.payload, archive: { ...f.payload.archive, sha256: "0".repeat(64) } });
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [wrongArchive] })).toThrow(/does not bind staged source, plan and archive/);
    const badEvidence = structuredClone(f.payload);
    badEvidence.files[0]!.evidence[0]!.path = "tests/reports/native-source-inputs/another-run/candidate-review-evidence/review.txt";
    const badReview = f.signedReview(badEvidence);
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [badReview] })).toThrow(/outside its run-scoped directory/);
  });

  it("rejects duplicate review refs and changed post-pack evidence after admission", async () => {
    const f = await fixture(), review = f.input.candidateReviews![0]!;
    expect(() => f.api.verifyArchiveAdmission({ ...f.input, candidateReviews: [review, review] })).toThrow(/duplicate|unsorted/);
    const { capability } = f.api.verifyArchiveAdmission(f.input);
    writeFileSync(join(f.root, f.sidecarEvidencePath), "changed after review");
    expect(() => f.api.consumeArchiveAdmission({ capability, manifestBytes: f.input.manifestBytes, lockBytes: f.input.lockBytes })).toThrow(/candidate review or evidence changed/);
  });

  it("rejects a changed signed review after capability creation", async () => {
    const f = await fixture(), { capability } = f.api.verifyArchiveAdmission(f.input);
    writeFileSync(join(f.root, f.input.candidateReviews![0]!.path), "changed after signing");
    expect(() => f.api.consumeArchiveAdmission({ capability, manifestBytes: f.input.manifestBytes, lockBytes: f.input.lockBytes })).toThrow(/candidate review or evidence changed/);
  });
});
