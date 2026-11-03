/**
 * Exact packed-package consumers. Source and browser phases have separate,
 * immutable reports; the latter may not start without the global phase gate.
 * Every project runs outside the workspace, so a missing dependency cannot be
 * satisfied by the repository's node_modules.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyArchiveAdmission, verifyPnpmArchiveAdmission, type ArchiveAdmissionReceipt } from "../release/archive-admission.mjs";
import { assertIndependentNpmConsumer, inspectNpmArchive, seedVerifiedNpmCache } from "../release/portable-npm-lock.mjs";
import { assertIndependentPnpmConsumer, assertInstalledPnpmArchiveSet, seedVerifiedPnpmStore, verifyPnpmNativeStore, type InstalledPnpmConsumerReport, type NativePnpmStoreReport } from "../release/portable-pnpm-lock.mjs";
import { createPnpmLoopbackRegistry } from "../release/pnpm-loopback-registry.mjs";
import { assertZstdWorkerPayload } from "../finalize-dist/worker-bundle.mjs";
import { assertInstalledArchiveSet, createPortableSourceEnvironment, inventoryPortableConsumerFiles, packedConsumerEnvironment, type NativeConsumerFile, type PortableLock } from "../package-clean-install/index";
import { redactText } from "../remote-acr/upload-artifacts.mjs";

export type Manager = "npm" | "pnpm";
export type Peer = "absent" | "present";
export interface MatrixCell { id: string; manager: Manager; reactMajor: 18 | 19; peer: Peer }
export interface PackageEntry { name: string; version: string; tarball: string; sha256: string; integrity: string; internalDependencies?: string[] }
interface CandidatePlan {
  schema: string; version: string; source: { commit: string; tree?: string; fingerprint: string; inputDigest?: string; lockfileSha256: string };
  packages: PackageEntry[]; packageCount?: number; expectedPackageCount?: number;
}
export interface MatrixArchive { resolved: string; path: string; size: number; sha256: string; integrity: string }
export interface MatrixCandidateReview { path: string; sha256: string }
interface MatrixInputFile { path: string; size: number; sha256: string }
interface MatrixInputCell { id: string; manager: Manager; manifest: MatrixInputFile; lockfile: MatrixInputFile; archives: MatrixArchive[] }
interface MatrixInputBundle {
  schema: "aura3d.native-matrix-input/1";
  candidatePlanSha256: string;
  sourceManifest: { path: string; sha256: string };
  cells: MatrixInputCell[];
}
interface Check { id: string; project: string; command: string[]; status: "pass" | "fail" | "not-run"; exitCode: number | null; logPath: string; logSha256: string; logSize?: number }
interface RetainedProject extends MatrixCell {
  path: string; manifestSha256: string; lockfile: string; lockfileSha256: string;
  projectSha256: string; installedPackages: PackageEntry[]; toolVersions: Record<string, string>;
  /** packed-v1: ordinary packed-consumer install; retained without node_modules. */
  retention?: "portable-v1" | "packed-v1";
  sourceManifest?: { path: string; sha256: string };
  files?: NativeConsumerFile[];
  archives?: MatrixArchive[];
  admission?: ArchiveAdmissionReceipt;
  candidateReviews?: MatrixCandidateReview[];
}
export interface MatrixReport {
  schema: "aura3d.native-consumers/1"; phase: "source"; runId: string; status: "pass" | "fail";
  source: { revision: string; stagedSourceSha256: string; lockfileSha256: string; manifest?: { path: string; sha256: string } };
  candidate: { path: string; sha256: string; version: string; packages: PackageEntry[] };
  candidateReviews?: MatrixCandidateReview[];
  toolVersions: Record<string, string>; projects: RetainedProject[]; checks: Check[];
  browser: { id: string; status: "not-run" }[];
}

const FIXTURES = ["javascript-esm.mjs", "typescript-nodenext.ts", "typescript-bundler.ts", "react-ssr.tsx", "react-client.tsx", "optional-peer-absent.mjs", "optional-peer-present.mjs", "conditions.mjs"] as const;
export const CHECK_IDS = ["install", "installed-identity", "javascript-esm", "condition-node", "condition-browser", "typescript-nodenext", "typescript-bundler", "react-ssr", "optional-peer", "browser-build"] as const;
export const BROWSERS = ["chromium", "firefox", "webkit"] as const;
const hash = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const fileHash = (path: string): string => hash(readFileSync(path));
const fail = (message: string): never => { throw new Error(message); };
const must = (condition: unknown, message: string): void => { if (!condition) fail(message); };

const MATRIX_INPUT_ERROR = "MATRIX_ADMISSION_UNAVAILABLE: a complete verified npm/pnpm dependency graph and digest-bound candidate and external archive admission are required before matrix subprocesses";
const MATRIX_PNPM_INSTALL_ERROR = "MATRIX_PNPM_INSTALL_UNAVAILABLE: verified package-manager custody, enforced process/network isolation and pnpm registry-policy handling are required before matrix installation and probes";
const MATRIX_NPM_INSTALL_ERROR = "MATRIX_NPM_INSTALL_UNAVAILABLE: verified package-manager custody and enforced process/network isolation are required before matrix installation and probes";
const matrixPermits = new WeakMap<object, { root: string; sourceManifestPath: string }>();
type MatrixPermit = object;

export function matrixCells(): MatrixCell[] {
  return (["npm", "pnpm"] as const).flatMap(manager => ([18, 19] as const).flatMap(reactMajor =>
    (["absent", "present"] as const).map(peer => ({ id: `${manager}-react${reactMajor}-peer-${peer}`, manager, reactMajor, peer }))));
}

/** Hash all portable retained inputs and build output. Dependencies are restored from the lock. */
export function hashConsumerProject(path: string): string {
  const digest = createHash("sha256");
  const project = realpathSync(path);
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir).sort()) {
      if (!prefix && entry === "node_modules") continue;
      const name = prefix ? `${prefix}/${entry}` : entry;
      const full = join(dir, entry);
      const stat = lstatSync(full);
      digest.update(name).update("\0");
      if (stat.isSymbolicLink()) {
        const target = realpathSync(full);
        must(target === project || target.startsWith(`${project}${sep}`), `Project symlink escapes isolation: ${name}`);
        digest.update("link\0").update(readlinkSync(full));
      }
      else if (stat.isDirectory()) { digest.update("directory\0"); walk(full, name); }
      else if (stat.isFile()) digest.update("file\0").update(readFileSync(full));
      else fail(`Unsupported project entry: ${name}`);
      digest.update("\0");
    }
  }
  walk(path, "");
  return digest.digest("hex");
}

function inside(root: string, path: string): string {
  const full = resolve(root, path);
  const rel = relative(root, full);
  must(rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `Path outside repository: ${path}`);
  return full;
}

/** Validate the plan and the exact archive bytes without repacking. */
export function readCandidate(root: string, path: string): { plan: CandidatePlan; ref: { path: string; sha256: string } } {
  const absolute = inside(root, path);
  const bytes = readFileSync(absolute);
  const plan = JSON.parse(bytes.toString()) as CandidatePlan;
  must(plan.schema === "aura3d-release-plan/1.0", "Invalid candidate plan schema");
  must(Boolean(plan.version && plan.source?.commit && /^[a-f0-9]{64}$/.test(plan.source.fingerprint ?? "") && /^[a-f0-9]{64}$/.test(plan.source.lockfileSha256 ?? "")), "Incomplete candidate source identity");
  if (plan.source.inputDigest !== undefined) must(/^[a-f0-9]{64}$/.test(plan.source.inputDigest), "Invalid staged input digest");
  must(fileHash(join(root, "pnpm-lock.yaml")) === plan.source.lockfileSha256, "Candidate lockfile differs from staged lockfile");
  must(Array.isArray(plan.packages) && plan.packages.length > 0 && new Set(plan.packages.map(p => p.name)).size === plan.packages.length, "Missing or duplicated candidate archives");
  if (plan.packageCount !== undefined) must(plan.packageCount === plan.packages.length, "Candidate package count mismatch");
  if (plan.expectedPackageCount !== undefined) must(plan.expectedPackageCount === plan.packages.length, "Candidate inventory mismatch");
  for (const pkg of plan.packages) {
    must(Boolean(pkg.name && pkg.version === plan.version && pkg.tarball), `Missing package identity: ${pkg.name}`);
    const archive = readFileSync(inside(root, pkg.tarball));
    must(hash(archive) === pkg.sha256 && `sha512-${createHash("sha512").update(archive).digest("base64")}` === pkg.integrity, `Candidate archive mismatch: ${pkg.name}`);
  }
  for (const name of ["@aura3d/engine", "@aura3d/react", "@aura3d/assets", "@aura3d/input", "@aura3d/controls", "@aura3d/navigation-recast"]) {
    must(plan.packages.some(pkg => pkg.name === name), `Candidate missing ${name}`);
  }
  return { plan, ref: { path: relative(root, absolute), sha256: hash(bytes) } };
}

function packageFor(plan: CandidatePlan, name: string): PackageEntry {
  return plan.packages.find(pkg => pkg.name === name) ?? fail(`Candidate missing ${name}`);
}
function projectPackages(plan: CandidatePlan, cell: MatrixCell): PackageEntry[] {
  const pending = ["@aura3d/engine", "@aura3d/react", "@aura3d/assets", "@aura3d/input", "@aura3d/controls", ...(cell.peer === "present" ? ["@aura3d/navigation-recast"] : [])];
  const names = new Set<string>();
  while (pending.length) {
    const name = pending.shift()!;
    if (names.has(name)) continue;
    const entry = packageFor(plan, name);
    names.add(name);
    pending.push(...(entry.internalDependencies ?? []));
  }
  return [...names].sort().map(name => packageFor(plan, name));
}
export function projectManifest(_root: string, cell: MatrixCell, plan: CandidatePlan): Record<string, unknown> {
  const dependencies: Record<string, string> = Object.fromEntries(projectPackages(plan, cell).map(pkg => [pkg.name, `file:./tarballs/${basename(pkg.tarball)}`]));
  Object.assign(dependencies, {
    react: cell.reactMajor === 18 ? "18.3.1" : "19.2.8",
    "react-dom": cell.reactMajor === 18 ? "18.3.1" : "19.2.8"
  });
  return {
    name: `native-consumer-${cell.id}`, version: "0.0.0", private: true, type: "module", dependencies,
    devDependencies: { "@types/node": "^22.0.0", "@types/react": `^${cell.reactMajor}.0.0`, "@types/react-dom": `^${cell.reactMajor}.0.0`, typescript: "^5.8.3", tsx: "^4.19.4", vite: "^7.3.2" }
  };
}

interface PreparedNpmCell {
  cell: MatrixCell;
  manifestBytes: Buffer;
  lockBytes: Buffer;
  manifest: Record<string, unknown>;
  lock: PortableLock;
  archives: MatrixArchive[];
  sourceManifest: { path: string; sha256: string };
  receipt: ArchiveAdmissionReceipt;
  candidateReviews: MatrixCandidateReview[];
  readArchive: (path: string) => Uint8Array;
  admission: { capability: ReturnType<typeof verifyArchiveAdmission>["capability"]; manifestBytes: Uint8Array; lockBytes: Uint8Array };
  permit: MatrixPermit;
}
interface PreparedPnpmCell {
  cell: MatrixCell;
  manifestBytes: Buffer;
  lockBytes: Buffer;
  archives: MatrixArchive[];
  sourceManifest: { path: string; sha256: string };
  receipt: ReturnType<typeof verifyPnpmArchiveAdmission>["receipt"];
  candidateReviews: MatrixCandidateReview[];
  readArchive: (path: string) => Uint8Array;
  admission: { capability: ReturnType<typeof verifyPnpmArchiveAdmission>["capability"]; manifestBytes: Uint8Array; lockBytes: Uint8Array };
}
const canonical = (value: unknown): string => JSON.stringify(value, function (_key, item: unknown) {
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item;
});
const MATRIX_HASH = /^[a-f0-9]{64}$/;
const MAX_MATRIX_JSON = 16 * 1024 * 1024;
const MAX_MATRIX_ARCHIVE = 64 * 1024 * 1024;
const MAX_MATRIX_ARCHIVES = 256 * 1024 * 1024;

/** Read a root-relative regular file without following any symlink ancestor. */
function matrixFile(root: string, path: string, limit: number): Buffer {
  if (typeof path !== "string" || !path || isAbsolute(path) || /[\\\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid matrix input path");
  let current = realpathSync(root);
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index], lower = name.toLowerCase();
    if ([".git", ".ssh", ".aws", ".azure", ".gcloud", ".gnupg", ".kube", ".docker", ".codex", ".npmrc", ".netrc", ".pypirc", ".yarnrc", ".git-credentials"].includes(lower) ||
        /^\.env(?:$|[._-])/.test(lower) || /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(lower)) throw new Error("Matrix input contains a private path");
    current = resolve(current, name);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) throw new Error("Matrix input contains an unsafe ancestor");
    if (index === parts.length - 1 && (!stat.isFile() || stat.size > limit)) throw new Error("Matrix input is not a bounded regular file");
  }
  return readFileSync(current);
}

/**
 * Bind review references to this run's retained sidecar. This checks only
 * paths and bytes; the admission verifier still authenticates each review.
 */
export function validateMatrixCandidateReviews(root: string, runId: string, supplied: unknown): MatrixCandidateReview[] {
  assertRunId(runId);
  if (!Array.isArray(supplied) || supplied.length > 10000) throw new Error("Invalid matrix candidate review inventory");
  const prefix = "tests/reports/native-source-inputs/" + runId + "/candidate-reviews/";
  const refs: MatrixCandidateReview[] = [];
  let previous = "";
  for (const item of supplied as unknown[]) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        canonical(Object.keys(item).sort()) !== canonical(["path", "sha256"])) throw new Error("Invalid matrix candidate review reference");
    const ref = item as MatrixCandidateReview;
    if (!MATRIX_HASH.test(ref.sha256 ?? "") || ref.path !== prefix + ref.sha256 + ".json" ||
        (previous && previous >= ref.path)) throw new Error("Invalid, duplicate, unsorted or out-of-run matrix candidate review");
    refs.push({ path: ref.path, sha256: ref.sha256 });
    previous = ref.path;
  }
  const inputPath = "tests/reports/native-source-inputs/" + runId + "/inputs.json";
  let envelope: { schema?: string; runId?: string; candidateReviews?: unknown };
  try { envelope = JSON.parse(matrixFile(root, inputPath, MAX_MATRIX_JSON).toString("utf8")); }
  catch { throw new Error("Matrix retained input envelope is unavailable or invalid"); }
  if (envelope.schema !== "aura3d.native-portable-inputs/1" || envelope.runId !== runId ||
      canonical(envelope.candidateReviews) !== canonical(refs)) throw new Error("Matrix candidate reviews differ from the retained input envelope");
  let total = 0;
  for (const ref of refs) {
    const bytes = matrixFile(root, ref.path, Math.min(MAX_MATRIX_JSON, MAX_MATRIX_ARCHIVES - total));
    total += bytes.byteLength;
    if (!bytes.byteLength || hash(bytes) !== ref.sha256) throw new Error("Matrix candidate review changed");
  }
  return refs;
}

function checkedMatrixInput(root: string, item: MatrixInputFile, prefix: string, limit: number): Buffer {
  if (!item || typeof item.path !== "string" || !item.path.startsWith(prefix) ||
      !Number.isSafeInteger(item.size) || item.size < 1 || item.size > limit || !MATRIX_HASH.test(item.sha256 ?? "")) {
    throw new Error("Invalid run-scoped matrix input identity");
  }
  const bytes = matrixFile(root, item.path, limit);
  if (bytes.byteLength !== item.size || hash(bytes) !== item.sha256) throw new Error("Matrix input changed");
  return bytes;
}

function snapshotMatrixArchives(root: string, archives: MatrixArchive[], archivePrefix: string): (path: string) => Uint8Array {
  if (!Array.isArray(archives) || !archives.length || archives.length > 10000) throw new Error("Matrix archive inventory is incomplete");
  const snapshots = new Map<string, Buffer>();
  let previous = "", total = 0;
  for (const item of archives) {
    if (!item || typeof item.resolved !== "string" || !item.resolved || (previous && previous >= item.resolved) ||
        !MATRIX_HASH.test(item.sha256 ?? "") || item.path !== archivePrefix + item.sha256 + ".tgz" ||
        !Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_MATRIX_ARCHIVE ||
        typeof item.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity) ||
        Buffer.from(item.integrity.slice(7), "base64").toString("base64") !== item.integrity.slice(7)) {
      throw new Error("Invalid matrix archive inventory");
    }
    let bytes = snapshots.get(item.path);
    if (!bytes) {
      bytes = checkedMatrixInput(root, item, archivePrefix, MAX_MATRIX_ARCHIVE);
      total += bytes.byteLength;
      if (total > MAX_MATRIX_ARCHIVES) throw new Error("Matrix archive snapshot limit exceeded");
      snapshots.set(item.path, bytes);
    }
    if (bytes.byteLength !== item.size || hash(bytes) !== item.sha256 ||
        "sha512-" + createHash("sha512").update(bytes).digest("base64") !== item.integrity) throw new Error("Matrix archive identity changed");
    if (item.resolved.startsWith("file:")) {
      const local = item.resolved.slice(5).replace(/^\.\//, "");
      if (!/^tarballs\/[A-Za-z0-9._-]+\.tgz$/.test(local)) throw new Error("Matrix local archive path is unsafe");
    }
    previous = item.resolved;
  }
  return (path: string): Uint8Array => {
    const bytes = snapshots.get(path);
    if (!bytes) throw new Error("Matrix archive snapshot is unavailable");
    return Uint8Array.from(bytes);
  };
}

/** Verify every npm lock and snapshot against a new opaque admission capability. */
function prepareNpmCell(root: string, runId: string, plan: CandidatePlan, planRef: { path: string; sha256: string },
  cell: MatrixCell, sourceManifest: { path: string; sha256: string }, manifestBytes: Buffer, lockBytes: Buffer,
  archives: MatrixArchive[], archivePrefix: string, candidateReviews: MatrixCandidateReview[]): PreparedNpmCell {
  if (cell.manager !== "npm") throw new Error(MATRIX_INPUT_ERROR);
  const sourceBytes = matrixFile(root, sourceManifest.path, MAX_MATRIX_JSON);
  if (!MATRIX_HASH.test(sourceManifest.sha256 ?? "") || hash(sourceBytes) !== sourceManifest.sha256) throw new Error("Matrix source manifest changed");
  let manifest: Record<string, unknown>, lock: PortableLock;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>;
    lock = JSON.parse(lockBytes.toString("utf8")) as PortableLock;
  } catch { throw new Error("Invalid matrix npm manifest or lock"); }
  if (canonical(manifest) !== canonical(projectManifest(root, cell, plan))) throw new Error("Matrix manifest differs from the candidate cell");
  const readArchive = snapshotMatrixArchives(root, archives, archivePrefix);
  const { capability, receipt } = verifyArchiveAdmission({ root, planPath: planRef.path, sourceManifestPath: sourceManifest.path,
    manifestBytes, lockBytes, candidateReviews, archives: archives.map(item => ({ resolved: item.resolved, bytes: readArchive(item.path) })) });
  const admission = { capability, manifestBytes, lockBytes };
  assertIndependentNpmConsumer({ manifest, lock, archives, readArchive, candidatePackages: plan.packages, admission });
  const permit = Object.freeze({});
  matrixPermits.set(permit, { root, sourceManifestPath: sourceManifest.path });
  return { cell, manifestBytes, lockBytes, manifest, lock, archives, sourceManifest, receipt, candidateReviews, readArchive, admission, permit };
}

/** The pnpm capability binds the actual pnpm lock, not an npm surrogate. */
function preparePnpmCell(root: string, plan: CandidatePlan, planRef: { path: string; sha256: string },
  cell: MatrixCell, sourceManifest: { path: string; sha256: string }, manifestBytes: Buffer, lockBytes: Buffer,
  archives: MatrixArchive[], archivePrefix: string, candidateReviews: MatrixCandidateReview[]): PreparedPnpmCell {
  if (cell.manager !== "pnpm") throw new Error(MATRIX_INPUT_ERROR);
  if (!MATRIX_HASH.test(sourceManifest.sha256 ?? "") || hash(matrixFile(root, sourceManifest.path, MAX_MATRIX_JSON)) !== sourceManifest.sha256) {
    throw new Error("Matrix source manifest changed");
  }
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>; }
  catch { throw new Error("Invalid matrix pnpm manifest"); }
  if (canonical(manifest) !== canonical(projectManifest(root, cell, plan))) throw new Error("Matrix manifest differs from the candidate cell");
  const readArchive = snapshotMatrixArchives(root, archives, archivePrefix);
  const { capability, receipt } = verifyPnpmArchiveAdmission({ root, planPath: planRef.path, sourceManifestPath: sourceManifest.path,
    manifestBytes, lockBytes, candidateReviews, archives: archives.map(item => ({ resolved: item.resolved, bytes: readArchive(item.path) })) });
  const admission = { capability, manifestBytes, lockBytes };
  assertIndependentPnpmConsumer({ manifestBytes, lockBytes, archives, readArchive, candidatePackages: plan.packages, admission });
  return { cell, manifestBytes, lockBytes, archives, sourceManifest, receipt, candidateReviews, readArchive, admission };
}

/**
 * An ignored lifecycle hook cannot be assumed unnecessary for the installed
 * consumer. Inspect only snapshots already checked against a live admission;
 * this is a restriction on execution, not a new admission or execution permit.
 */
function assertMatrixLifecycleFree(prepared: PreparedNpmCell | PreparedPnpmCell): void {
  const hooks = ["preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare"];
  for (const archive of prepared.archives) {
    const { manifest, files } = inspectNpmArchive(prepared.readArchive(archive.path));
    const scripts = manifest.scripts;
    if (scripts !== undefined && (!scripts || typeof scripts !== "object" || Array.isArray(scripts) ||
        Object.values(scripts).some(value => typeof value !== "string"))) {
      throw new Error(`MATRIX_LIFECYCLE_UNAVAILABLE: invalid scripts metadata in ${prepared.cell.id}`);
    }
    const hook = scripts && hooks.find(name => Object.hasOwn(scripts, name));
    if ((manifest.hasInstallScript !== undefined && typeof manifest.hasInstallScript !== "boolean") ||
        (manifest.gypfile !== undefined && typeof manifest.gypfile !== "boolean")) {
      throw new Error(`MATRIX_LIFECYCLE_UNAVAILABLE: invalid lifecycle metadata in ${prepared.cell.id}`);
    }
    if (hook || manifest.hasInstallScript === true || manifest.gypfile === true || files.some(file => file.path === "binding.gyp")) {
      throw new Error(`MATRIX_LIFECYCLE_UNAVAILABLE: ${prepared.cell.id} requires an install lifecycle (${String(manifest.name ?? "unknown")})`);
    }
  }
  if ("lock" in prepared && Object.values(prepared.lock.packages).some(entry =>
    (entry as { hasInstallScript?: unknown }).hasInstallScript !== undefined &&
    (entry as { hasInstallScript?: unknown }).hasInstallScript !== false)) {
    throw new Error(`MATRIX_LIFECYCLE_UNAVAILABLE: ${prepared.cell.id} lock requires an install lifecycle`);
  }
}

/**
 * Validate the in-memory, capability-backed route table without listening on a
 * socket. A dispatcher is not evidence of network isolation or permission to
 * start pnpm. The transport must still be hosted by an isolated runner.
 */
function preflightPnpmTransport(prepared: PreparedPnpmCell): void {
  try {
    const dispatcher = createPnpmLoopbackRegistry(prepared.admission);
    try {
      const before = dispatcher.status();
      must(/^\/[a-f0-9]{48}\/$/.test(dispatcher.registryPath) && !before.closed &&
        before.requests === 0 && before.denied === 0 && before.servedBytes === 0, "Invalid initial pnpm registry state");
      const expected = prepared.archives.filter(item => !item.resolved.startsWith("file:"));
      must(before.registryArchives === expected.length && before.routes.length === expected.length &&
        new Set(before.routes.map(route => route.path)).size === expected.length, "Pnpm registry archive inventory differs");
      for (const archive of expected) {
        const url = new URL(archive.resolved);
        const route = before.routes.find(item => item.path === dispatcher.registryPath + url.pathname.slice(1));
        must(Boolean(route) && route!.sha256 === archive.sha256 && route!.integrity === archive.integrity &&
          route!.size === archive.size && route!.served === 0, "Pnpm registry route differs from admitted archive");
      }
      const finished = dispatcher.finish();
      must(finished.closed && finished.requests === 0 && finished.denied === 0 && finished.servedBytes === 0 &&
        finished.registryArchives === before.registryArchives && canonical(finished.routes) === canonical(before.routes),
      "Pnpm registry changed during preflight");
    } finally {
      if (!dispatcher.status().closed) dispatcher.finish();
    }
  } catch (error) {
    throw new Error(`MATRIX_PNPM_TRANSPORT_UNAVAILABLE: ${String(error)}`);
  }
}

function preflightPnpmStores(cells: readonly PreparedPnpmCell[]): void {
  const scratch = mkdtempSync(join(tmpdir(), "a3d-matrix-pnpm-stores-"));
  try {
    for (const prepared of cells) {
      try {
        const input = { storeDir: join(scratch, prepared.cell.id), admission: prepared.admission };
        const created = seedVerifiedPnpmStore(input);
        const checked = verifyPnpmNativeStore(input);
        const binding = { kind: "consumer", manifestSha256: hash(prepared.manifestBytes), lockfileSha256: hash(prepared.lockBytes) };
        must(created.schema === "aura3d.pnpm-native-store/1" && created.installationAuthorized === false &&
          canonical(created.binding) === canonical(binding) && MATRIX_HASH.test(created.manifestSha256) &&
          created.archiveCount === prepared.archives.length && Number.isSafeInteger(created.fileCount) && created.fileCount > 0 &&
          canonical(created) === canonical(checked), `Native pnpm store verification differs: ${prepared.cell.id}`);
      } catch (error) {
        throw new Error(`MATRIX_PNPM_STORE_UNAVAILABLE: ${String(error)}`);
      }
      preflightPnpmTransport(prepared);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function readMatrixInputBundle(root: string, runId: string, planRef: { path: string; sha256: string }, bundlePath: string,
  sourceManifestPath: string): { bundle: MatrixInputBundle; sourceManifest: { path: string; sha256: string } } {
  const prefix = "tests/reports/native-source-inputs/" + runId + "/matrix/";
  if (bundlePath !== prefix + "bundle.json") throw new Error("Matrix input bundle must be run-scoped");
  const bundleBytes = matrixFile(root, bundlePath, MAX_MATRIX_JSON);
  const bundle = JSON.parse(bundleBytes.toString("utf8")) as MatrixInputBundle;
  const manifestBytes = matrixFile(root, sourceManifestPath, MAX_MATRIX_JSON);
  const sourceManifest = { path: sourceManifestPath, sha256: hash(manifestBytes) };
  const cells = matrixCells();
  if (bundle.schema !== "aura3d.native-matrix-input/1" || bundle.candidatePlanSha256 !== planRef.sha256 ||
      canonical(bundle.sourceManifest) !== canonical(sourceManifest) || !Array.isArray(bundle.cells) ||
      bundle.cells.length !== cells.length || new Set(bundle.cells.map(item => item?.id)).size !== cells.length ||
      cells.some(cell => !bundle.cells.some(item => item?.id === cell.id && item.manager === cell.manager))) {
    throw new Error("Matrix input bundle does not bind the complete candidate and cell inventory");
  }
  const envelopePath = `tests/reports/native-source-inputs/${runId}/inputs.json`;
  let envelope: { schema?: string; runId?: string; sourceManifest?: unknown; candidatePlan?: unknown; matrixBundle?: unknown };
  try { envelope = JSON.parse(matrixFile(root, envelopePath, MAX_MATRIX_JSON).toString("utf8")); }
  catch { throw new Error("Matrix input envelope identity is unavailable or invalid"); }
  if (envelope.schema !== "aura3d.native-portable-inputs/1" || envelope.runId !== runId ||
      canonical(envelope.sourceManifest) !== canonical(sourceManifest) ||
      canonical(envelope.candidatePlan) !== canonical(planRef) ||
      canonical(envelope.matrixBundle) !== canonical({ path: bundlePath, sha256: hash(bundleBytes) })) {
    throw new Error("Matrix input envelope identity differs from source, candidate or bundle");
  }
  return { bundle, sourceManifest };
}
/** A self-authored glTF triangle, generated without external assets or network access. */
export function consumerTriangleGlb(): Buffer {
  const binary = Buffer.alloc(44);
  [-0.7, -0.6, 0, 0.7, -0.6, 0, 0, 0.7, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  const document = {
    asset: { version: "2.0", generator: "Aura3D independent consumer matrix" }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: 42 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }, { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.6, 0], max: [0.7, 0.7, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }]
  };
  const raw = Buffer.from(JSON.stringify(document)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(json);
  const glb = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
  const offset = 20 + json.length;
  glb.writeUInt32LE(binary.length, offset); glb.writeUInt32LE(0x004e4942, offset + 4); binary.copy(glb, offset + 8);
  return glb;
}

/** Independently generated SPZ v4 streams with compressed, repeating 512-point attributes. */
export function consumerSplatSpz(): Buffer {
  const streams = [
    [4608, "KLUv/WAAEY0AAEgAEAAA4P8ACAABAPTBvhwB"],
    [512, "KLUv/WAAAU0AABCAgAEA+yrAAg=="],
    [1536, "KLUv/WAABVUAABiAQMABAPr5uyE="],
    [1536, "KLUv/WAABVUAABigsJABAPr5uyE="],
    [2048, "KLUv/WAAB10AACAAAADAAQD5/zsi"],
    [4608, "KLUv/WAAEY0AAEiAgYKDhIWGh4gBAPTBvhwB"]
  ] as const;
  const compressed = streams.map(([, value]) => Buffer.from(value, "base64"));
  const header = 32 + streams.length * 16;
  const result = Buffer.alloc(header + compressed.reduce((sum, value) => sum + value.length, 0));
  result.writeUInt32LE(0x5053474e, 0); result.writeUInt32LE(4, 4); result.writeUInt32LE(512, 8);
  result[12] = 1; result[13] = 12; result[15] = streams.length; result.writeUInt32LE(32, 16);
  let offset = header;
  streams.forEach(([size], index) => {
    const bytes = compressed[index]!;
    result.writeBigUInt64LE(BigInt(bytes.length), 32 + index * 16);
    result.writeBigUInt64LE(BigInt(size), 40 + index * 16);
    bytes.copy(result, offset); offset += bytes.length;
  });
  return result;
}
export function consumerViteConfig(): string {
  const triangleHash = hash(consumerTriangleGlb());
  return `const external = ["@aura3d/navigation-recast"];\nexport default { define: { __AURA_MATRIX_TRIANGLE_SHA256__: ${JSON.stringify(JSON.stringify(triangleHash))} }, build: { rollupOptions: { external } } };\n`;
}
function projectFiles(root: string, project: string, cell: MatrixCell, plan: CandidatePlan): void {
  mkdirSync(join(project, "tarballs"), { recursive: true });
  const archives = projectPackages(plan, cell);
  must(new Set(archives.map(pkg => basename(pkg.tarball))).size === archives.length, `Duplicate archive filename in ${cell.id}`);
  for (const pkg of archives) cpSync(inside(root, pkg.tarball), join(project, "tarballs", basename(pkg.tarball)));
  writeFileSync(join(project, "package.json"), `${JSON.stringify(projectManifest(root, cell, plan), null, 2)}\n`);
  for (const fixture of FIXTURES) cpSync(join(root, "tests/fixtures/native-consumer", fixture), join(project, fixture));
  for (const mode of ["nodenext", "bundler"] as const) {
    const config = {
      compilerOptions: { target: "ES2022", module: mode === "nodenext" ? "NodeNext" : "ESNext", moduleResolution: mode === "nodenext" ? "NodeNext" : "Bundler", strict: true, noEmit: true, skipLibCheck: false, esModuleInterop: true, jsx: "react-jsx", types: ["node"], lib: ["ES2022", "DOM", "DOM.Iterable"] },
      files: [`typescript-${mode}.ts`, "react-ssr.tsx", ...(mode === "bundler" ? ["react-client.tsx"] : [])]
    };
    writeFileSync(join(project, `tsconfig.${mode}.json`), `${JSON.stringify(config, null, 2)}\n`);
  }
  writeFileSync(join(project, "index.html"), '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/react-client.tsx"></script></body></html>\n');
  mkdirSync(join(project, "public"), { recursive: true });
  writeFileSync(join(project, "public/triangle.glb"), consumerTriangleGlb());
  writeFileSync(join(project, "public/splat.spz"), consumerSplatSpz());
  // A lazy optional peer is deliberately external to the browser bundle. Its
  // absent/present behavior is independently executed by the Node probes.
  writeFileSync(join(project, "vite.config.js"), consumerViteConfig());
}
function localCommand(_cell: MatrixCell, bin: string, args: string[]): string[] {
  // Do not use npx/npm exec: a missing local tool must fail, never be fetched.
  return [join(".", "node_modules", ".bin", bin), ...args];
}
export function commands(cell: MatrixCell): Record<string, string[]> {
  return {
    install: cell.manager === "npm" ? ["npm", "ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier"] :
      ["pnpm", "install", "--offline", "--frozen-lockfile", "--ignore-scripts", "--ignore-pnpmfile", "--package-import-method=copy"],
    "javascript-esm": ["node", "javascript-esm.mjs"],
    "condition-node": ["node", "conditions.mjs", "node"],
    "condition-browser": ["node", "--conditions=browser", "conditions.mjs", "browser"],
    "typescript-nodenext": localCommand(cell, "tsc", ["-p", "tsconfig.nodenext.json"]),
    "typescript-bundler": localCommand(cell, "tsc", ["-p", "tsconfig.bundler.json"]),
    "react-ssr": localCommand(cell, "tsx", ["react-ssr.tsx"]),
    "optional-peer": ["node", `optional-peer-${cell.peer}.mjs`],
    "browser-build": localCommand(cell, "vite", ["build"])
  };
}
function runCommand(command: string[], cwd: string, permit: MatrixPermit): { exitCode: number; output: string } {
  // A caller-provided JSON receipt cannot authorize any subprocess.
  const admitted = matrixPermits.get(permit);
  if (!admitted) throw new Error(MATRIX_INPUT_ERROR);
  // The archive permit only binds input bytes. It is not runtime, package
  // manager, credential, or network custody, including for version probes.
  assertNpmExecutionReady();
  const env = createPortableSourceEnvironment(admitted.root, admitted.sourceManifestPath);
  const result = spawnSync(command[0], command.slice(1), { cwd, env, encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error}` : ""}` };
}
function version(command: string[], permit: MatrixPermit): string {
  const result = runCommand(command, process.cwd(), permit);
  if (result.exitCode !== 0) fail(`Required tool unavailable: ${command.join(" ")}\n${result.output}`);
  return result.output.trim();
}
export function assertBrowserBuild(project: string, sourceRoot = process.cwd()): void {
  must(existsSync(join(project, "dist/index.html")), "Browser build did not produce dist/index.html");
  const assets = join(project, "dist/assets");
  must(existsSync(assets), "Browser build did not produce assets");
  const files = readdirSync(assets);
  const patterns = [
    /^render\.worker\.bundle-.*\.m?js$/, /^retarget\.worker\.bundle-.*\.m?js$/,
    /^ktx2\.worker-.*\.m?js$/, /^aura-vfx-1k-.*\.png$/, /^aura-vfx-2k-.*\.png$/,
    /^humanoid-fixture-.*\.glb$/, /^basis_transcoder-.*\.js$/, /^basis_transcoder-.*\.mjs$/,
    /^basis_transcoder-.*\.wasm$/, /^draco_decoder-.*\.mjs$/, /^draco_decoder-.*\.wasm$/,
    /^meshopt_decoder-.*\.mjs$/, /^zstd\.worker\.bundle-.*\.m?js$/, /^zstd\.worker-.*\.m?js$/
  ];
  const workerAssets = patterns.map((pattern) => files.find((name) => pattern.test(name)));
  must(workerAssets.every(Boolean), "Browser build did not emit the complete packaged worker asset set");
  const emitted = workerAssets as string[];
  const allWorkerAssets = files.filter(name => patterns.some(pattern => pattern.test(name)));
  const clients = files.filter(name => /\.m?js$/.test(name) && !allWorkerAssets.includes(name));
  must(clients.length, "Browser build did not emit a client module");
  const workerCode = readFileSync(join(assets, emitted[0]!), "utf8");
  must(workerCode.includes("postMessage") && /["']init["']/.test(workerCode), "Browser build did not compile the render-worker runtime");
  const license = readFileSync(join(sourceRoot, "packages/assets/vendor/zstd/LICENSE.txt"), "utf8");
  const provenance = JSON.parse(readFileSync(join(sourceRoot, "packages/assets/vendor/zstd/provenance.json"), "utf8"));
  for (const worker of allWorkerAssets.filter(name => /^zstd\.worker(?:\.bundle)?-.*\.m?js$/.test(name))) assertZstdWorkerPayload(readFileSync(join(assets, worker), "utf8"), license, provenance);
  const clientCode = clients.map((name) => readFileSync(join(assets, name), "utf8")).join("\n");
  must(allWorkerAssets.every((name) => clientCode.includes(name)), "Browser build does not reference every packaged worker asset");
  must(fileHash(join(project, "dist/triangle.glb")) === hash(consumerTriangleGlb()), "Browser build lost or changed the triangle asset");
  must(fileHash(join(project, "dist/splat.spz")) === hash(consumerSplatSpz()), "Browser build lost or changed the SPZ asset");
}
function inspectLock(project: string, cell: MatrixCell, plan: CandidatePlan): PackageEntry[] {
  const lockfile = join(project, cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml");
  const lockText = readFileSync(lockfile, "utf8");
  const npmLock = cell.manager === "npm" ? JSON.parse(lockText) : null;
  if (npmLock) {
    for (const [path, observation] of Object.entries(npmLock.packages ?? {}) as [string, { integrity?: string }][]) {
      const match = path.match(/(?:^|\/)node_modules\/(?<name>@aura3d\/[^/]+)$/);
      if (!match?.groups?.name) continue;
      const candidate = packageFor(plan, match.groups.name);
      must(observation.integrity === candidate.integrity, `Non-candidate nested package: ${path}`);
    }
  } else {
    for (const stanza of lockText.split(/\r?\n(?=  \S)/)) {
      const match = stanza.match(/^  ['"]?(@aura3d\/[^@/'"\s]+)@/);
      if (!match || !/\n    resolution:/.test(stanza)) continue;
      const candidate = packageFor(plan, match[1]);
      must(stanza.includes(candidate.integrity), `Non-candidate pnpm package: ${match[1]}`);
    }
  }
  return projectPackages(plan, cell).map(pkg => {
    if (npmLock) must(npmLock.packages?.[`node_modules/${pkg.name}`]?.integrity === pkg.integrity, `Installed npm lock integrity mismatch: ${pkg.name}`);
    else {
      // Bind integrity to this file: dependency's own package stanza, rather
      // than accepting the same integrity string elsewhere in the lockfile.
      const stanzas = lockText.split(/\r?\n(?=  \S)/);
      must(stanzas.some(stanza => stanza.includes(`${pkg.name}@file:`) && stanza.includes(basename(pkg.tarball)) && stanza.includes(pkg.integrity)), `Installed pnpm lock integrity mismatch: ${pkg.name}`);
    }
    return pkg;
  });
}
function inspectInstalled(project: string, cell: MatrixCell, plan: CandidatePlan): PackageEntry[] {
  const packages = inspectLock(project, cell, plan);
  for (const name of ["react", "react-dom"]) {
    const manifest = JSON.parse(readFileSync(join(project, "node_modules", name, "package.json"), "utf8"));
    const expected = cell.reactMajor === 18 ? "18.3.1" : "19.2.8";
    must(manifest.version === expected, `Wrong ${name} peer version in ${cell.id}`);
  }
  for (const pkg of packages) {
    const manifest = JSON.parse(readFileSync(join(project, "node_modules", ...pkg.name.split("/"), "package.json"), "utf8"));
    must(manifest.name === pkg.name && manifest.version === pkg.version, `Installed package version mismatch: ${pkg.name}`);
  }
  return packages;
}
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function assertRunId(id: string): void { must(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id), "Invalid --run-id"); }

function assertMatrixProjectFiles(project: RetainedProject, directory: string): void {
  const actual = inventoryPortableConsumerFiles(directory);
  if (!Array.isArray(project.files) || project.files.length !== actual.length || actual.some((file, index) => {
    const expected = project.files?.[index];
    return !expected || expected.path !== file.path || expected.size !== file.size || expected.sha256 !== file.sha256;
  })) throw new Error("Matrix retained file inventory changed: " + project.id);
}

function validatePortableMatrixRecords(root: string, report: MatrixReport, project: RetainedProject, directory: string): void {
  const source = project.sourceManifest;
  if (!source || canonical(source) !== canonical(report.source.manifest) || !MATRIX_HASH.test(source.sha256 ?? "") ||
      hash(matrixFile(root, source.path, MAX_MATRIX_JSON)) !== source.sha256) throw new Error("Matrix source manifest identity changed");
  assertMatrixProjectFiles(project, directory);
  if (!Array.isArray(project.archives) || !project.archives.length) throw new Error("Matrix retained archive inventory is missing");
  const prefix = "tests/reports/native-consumer-matrix/" + report.runId + "/dependency-archives/";
  let previous = "";
  for (const item of project.archives) {
    if (!item || typeof item.resolved !== "string" || !item.resolved || (previous && previous >= item.resolved) ||
        !MATRIX_HASH.test(item.sha256 ?? "") || item.path !== prefix + item.sha256 + ".tgz" ||
        !Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_MATRIX_ARCHIVE ||
        typeof item.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity)) {
      throw new Error("Matrix retained archive inventory is invalid");
    }
    const bytes = checkedMatrixInput(root, item, prefix, MAX_MATRIX_ARCHIVE);
    if ("sha512-" + createHash("sha512").update(bytes).digest("base64") !== item.integrity) throw new Error("Matrix retained archive integrity changed");
    previous = item.resolved;
  }
}

/** Verify the complete required inventory and all retained artifacts, not only a pass flag. */
export function validateSourceMatrixReport(root: string, reportPath: string): MatrixReport {
  const report = JSON.parse(readFileSync(inside(root, reportPath), "utf8")) as MatrixReport;
  must(report.schema === "aura3d.native-consumers/1" && report.phase === "source" && report.status === "pass", "Missing passing source matrix report");
  assertRunId(report.runId);
  const { plan, ref } = readCandidate(root, report.candidate?.path);
  must(report.candidate.sha256 === ref.sha256 && report.candidate.version === plan.version && JSON.stringify(report.candidate.packages) === JSON.stringify(plan.packages), "Source report candidate mismatch");
  must(report.source?.revision === plan.source.commit && report.source.stagedSourceSha256 === (plan.source.inputDigest ?? plan.source.fingerprint) && report.source.lockfileSha256 === plan.source.lockfileSha256, "Source report source identity mismatch");
  const cells = matrixCells();
  must(Boolean(report.toolVersions?.node && report.toolVersions?.npm && report.toolVersions?.pnpm), "Missing package manager or Node version");
  must(Array.isArray(report.projects) && report.projects.length === cells.length && new Set(report.projects.map(p => p.id)).size === cells.length, "Source matrix project inventory mismatch");
  must(Array.isArray(report.checks) && report.checks.length === cells.length * CHECK_IDS.length, "Source matrix check inventory mismatch");
  must(Array.isArray(report.browser) && report.browser.length === cells.length * BROWSERS.length && report.browser.every(entry => entry.status === "not-run") && new Set(report.browser.map(entry => entry.id)).size === cells.length * BROWSERS.length, "Source browser cells must all be not-run");
  const portableProjects = report.projects.filter(project => project.retention === "portable-v1");
  if (portableProjects.length) {
    must(portableProjects.length === report.projects.length, "Matrix report mixes retention formats");
    const reviews = validateMatrixCandidateReviews(root, report.runId, report.candidateReviews);
    for (const project of portableProjects) if (canonical(project.candidateReviews) !== canonical(reviews)) {
      throw new Error("Matrix project candidate reviews differ from the retained report");
    }
  }
  for (const cell of cells) {
    const project = report.projects.find(p => p.id === cell.id);
    must(Boolean(project) && project!.manager === cell.manager && project!.reactMajor === cell.reactMajor && project!.peer === cell.peer, `Missing matrix combination: ${cell.id}`);
    const p = project!;
    must(p.path === `tests/reports/native-consumer-matrix/${report.runId}/projects/${cell.id}`, `Invalid project path: ${cell.id}`);
    const dir = inside(root, p.path);
    if (p.retention === "portable-v1") validatePortableMatrixRecords(root, report, p, dir);
    else if (p.retention !== undefined && p.retention !== "packed-v1") throw new Error("Unsupported matrix retention format");
    must(p.lockfile === (cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"), `Wrong lockfile: ${cell.id}`);
    must(fileHash(join(dir, "package.json")) === p.manifestSha256 && fileHash(join(dir, p.lockfile)) === p.lockfileSha256 && hashConsumerProject(dir) === p.projectSha256, `Retained project changed: ${cell.id}`);
    must(JSON.stringify(JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))) === JSON.stringify(projectManifest(root, cell, plan)), `Consumer manifest was changed: ${cell.id}`);
    must(fileHash(join(dir, "public/triangle.glb")) === hash(consumerTriangleGlb()) && fileHash(join(dir, "public/splat.spz")) === hash(consumerSplatSpz()) && readFileSync(join(dir, "vite.config.js"), "utf8") === consumerViteConfig(), `Consumer asset/config changed: ${cell.id}`);
    for (const pkg of projectPackages(plan, cell)) must(fileHash(join(dir, "tarballs", basename(pkg.tarball))) === pkg.sha256, `Retained package archive changed: ${cell.id}/${pkg.name}`);
    for (const fixture of FIXTURES) must(fileHash(join(dir, fixture)) === fileHash(join(root, "tests/fixtures/native-consumer", fixture)), `Consumer fixture changed: ${cell.id}/${fixture}`);
    assertBrowserBuild(dir, root);
    must(JSON.stringify(p.installedPackages) === JSON.stringify(projectPackages(plan, cell)), `Installed package list mismatch: ${cell.id}`);
    inspectLock(dir, cell, plan);
    for (const name of ["typescript", "tsx", "vite", "react", "react-dom"]) must(Boolean(p.toolVersions?.[name]), `Missing installed tool version: ${cell.id}/${name}`);
    for (const id of CHECK_IDS) {
      const matches = report.checks.filter(check => check.project === cell.id && check.id === id);
      const expectedCommand = id === "install" && p.retention === "packed-v1" ? packedInstallCommand(cell) : commands(cell)[id] ?? ["inspect-installed-artifacts"];
      const expectedLog = `tests/reports/native-consumer-matrix/${report.runId}/logs/${cell.id}-${id}.log`;
      must(matches.length === 1 && matches[0].status === "pass" && matches[0].exitCode === 0 && JSON.stringify(matches[0].command) === JSON.stringify(expectedCommand) && matches[0].logPath === expectedLog && existsSync(inside(root, expectedLog)) && matches[0].logSha256 === fileHash(inside(root, expectedLog)), `Missing/failed check: ${cell.id}/${id}`);
      if (p.retention === "portable-v1" || p.retention === "packed-v1") {
        const bytes = matrixFile(root, expectedLog, 64 * 1024 * 1024);
        must(Number.isSafeInteger(matches[0].logSize) && matches[0].logSize === bytes.byteLength && matches[0].logSha256 === hash(bytes), `Matrix log changed: ${cell.id}/${id}`);
      }
    }
    for (const browser of BROWSERS) must(report.browser.some(entry => entry.id === `${cell.id}/${browser}` && entry.status === "not-run"), `Missing browser cell: ${cell.id}/${browser}`);
  }
  return report;
}

export async function runSource(root: string, runId: string, planPath: string): Promise<MatrixReport> {
  const bundlePath = process.env.NATIVE_MATRIX_BUNDLE_INPUT;
  const stagedManifestPath = process.env.AURA3D_SOURCE_MANIFEST;
  // No pre-supplied portable bundle: run the ordinary packed-consumer matrix.
  if (!bundlePath) return runPackedMatrixSource(root, runId, planPath);
  if (!stagedManifestPath) throw new Error(MATRIX_INPUT_ERROR);
  assertRunId(runId);
  const sourceManifestPath = `tests/reports/native-capabilities/${runId}/source-manifest.json`;
  if (!matrixFile(root, stagedManifestPath, MAX_MATRIX_JSON).equals(matrixFile(root, sourceManifestPath, MAX_MATRIX_JSON))) {
    throw new Error("Matrix retained source manifest differs from the staged manifest");
  }
  const target = join(root, "tests/reports/native-consumer-matrix", runId);
  const reportPath = join(root, "tests/reports/native-consumers", runId, "matrix-source.json");
  must(!existsSync(target), `Run already exists: ${target}`);
  must(!existsSync(reportPath), `Source matrix report already exists: ${reportPath}`);
  const { plan, ref } = readCandidate(root, planPath);
  const { bundle, sourceManifest } = readMatrixInputBundle(root, runId, ref, bundlePath, sourceManifestPath);
  const reviewJson = process.env.AURA3D_CANDIDATE_REVIEWS_JSON;
  if (!reviewJson) throw new Error("Matrix candidate review references are required from the verified source-input envelope");
  let reviewInput: unknown;
  try { reviewInput = JSON.parse(reviewJson); }
  catch { throw new Error("Invalid matrix candidate review references"); }
  const candidateReviews = validateMatrixCandidateReviews(root, runId, reviewInput);
  const prefix = `tests/reports/native-source-inputs/${runId}/matrix/`;
  const npmCells: PreparedNpmCell[] = [], pnpmCells: PreparedPnpmCell[] = [];
  for (const cell of matrixCells()) {
    const input = bundle.cells.find(item => item.id === cell.id)!;
    const directory = `${prefix}cells/${cell.id}/`;
    const lockfile = cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
    if (input.manifest?.path !== `${directory}package.json` || input.lockfile?.path !== directory + lockfile) {
      throw new Error("Matrix input manifest or lock is not cell-scoped");
    }
    const manifest = checkedMatrixInput(root, input.manifest, directory, MAX_MATRIX_JSON);
    const lock = checkedMatrixInput(root, input.lockfile, directory, MAX_MATRIX_JSON);
    if (cell.manager === "npm") npmCells.push(prepareNpmCell(root, runId, plan, ref, cell, sourceManifest, manifest, lock, input.archives, `${prefix}archives/`, candidateReviews));
    else pnpmCells.push(preparePnpmCell(root, plan, ref, cell, sourceManifest, manifest, lock, input.archives, `${prefix}archives/`, candidateReviews));
  }
  must(npmCells.length === 4 && pnpmCells.length === 4, "Matrix input did not admit every cell");
  for (const prepared of [...npmCells, ...pnpmCells]) assertMatrixLifecycleFree(prepared);
  preflightPnpmStores(pnpmCells);
  assertMatrixExecutionReady("pnpm");
  throw new Error("MATRIX_SOURCE_PRODUCER_UNAVAILABLE: an isolated per-cell producer and report retention are not yet implemented");
}

function mime(path: string): string {
  return ({ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

function assertInstalledIsolation(project: string): void {
  const projectRoot = realpathSync(project);
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const entry = join(dir, name), stat = lstatSync(entry);
      if (stat.isSymbolicLink()) {
        const target = realpathSync(entry);
        must(target.startsWith(`${projectRoot}${sep}`), `Installed symlink escapes isolation: ${entry}`);
      } else if (stat.isDirectory()) walk(entry);
      else must(stat.isFile(), `Unsupported installed entry: ${entry}`);
    }
  }
  walk(join(project, "node_modules"));
}

/**
 * Inspect a pnpm tree and its post-use store against the same live admission.
 * This is a point-in-time observation, not permission to install or execute.
 * Platform omissions stay closed until the installing process's platform and
 * supported-architecture configuration have independent custody.
 */
export function verifyMatrixInstalledPnpmProject(input: {
  projectDir: string;
  storeDir: string;
  admission: PreparedPnpmCell["admission"];
}): InstalledPnpmConsumerReport {
  const storeInput = { storeDir: input.storeDir, admission: input.admission, afterUse: { projectDir: input.projectDir } };
  const binding = { kind: "consumer", manifestSha256: hash(Buffer.from(input.admission.manifestBytes)),
    lockfileSha256: hash(Buffer.from(input.admission.lockBytes)) };
  const checkStore = (report: NativePnpmStoreReport): void => {
    must(report.schema === "aura3d.pnpm-native-store/1" && report.installationAuthorized === false &&
      canonical(report.binding) === canonical(binding) && MATRIX_HASH.test(report.manifestSha256) &&
      Number.isSafeInteger(report.archiveCount) && report.archiveCount > 0 &&
      Number.isSafeInteger(report.fileCount) && report.fileCount > 0, "Matrix post-use pnpm store binding differs");
  };
  const before = verifyPnpmNativeStore(storeInput);
  checkStore(before);
  const installed = assertInstalledPnpmArchiveSet({ projectDir: input.projectDir, storeDir: input.storeDir, admission: input.admission });
  must(installed.schema === "aura3d.pnpm-installed-consumer/1" && installed.installationAuthorized === false &&
    installed.manifestSha256 === binding.manifestSha256 && installed.lockfileSha256 === binding.lockfileSha256 &&
    installed.platform?.os === process.platform && installed.platform?.cpu === process.arch &&
    typeof installed.platform?.libc === "string" && Number.isSafeInteger(installed.fileCount) && installed.fileCount > 0 &&
    Number.isSafeInteger(installed.bytes) && installed.bytes > 0 &&
    Array.isArray(installed.snapshotKeys) && installed.snapshotKeys.length > 0 &&
    new Set(installed.snapshotKeys).size === installed.snapshotKeys.length &&
    Array.isArray(installed.omittedSnapshotKeys), "Matrix installed pnpm graph binding differs");
  must(installed.omittedSnapshotKeys.length === 0,
    "MATRIX_PLATFORM_UNAVAILABLE: omitted pnpm packages require independently bound installer platform custody");
  assertInstalledIsolation(input.projectDir);
  const after = verifyPnpmNativeStore(storeInput);
  checkStore(after);
  must(canonical(before) === canonical(after), "Matrix pnpm store changed during installed-tree verification");
  return installed;
}

/**
 * Recheck npm graph admission and installed bytes before and after probes.
 * A missing optional entry is not a platform decision without authenticated
 * installer custody, so it cannot be treated as a successful observation.
 */
export function verifyMatrixInstalledNpmProject(input: {
  projectDir: string;
  admission: PreparedNpmCell["admission"];
  archives: MatrixArchive[];
  readArchive: (path: string) => Uint8Array;
  candidatePackages: PackageEntry[];
}): void {
  const { admission, projectDir, archives, readArchive, candidatePackages } = input;
  let manifest: Record<string, unknown>, lock: PortableLock;
  try {
    manifest = JSON.parse(Buffer.from(admission.manifestBytes).toString("utf8")) as Record<string, unknown>;
    lock = JSON.parse(Buffer.from(admission.lockBytes).toString("utf8")) as PortableLock;
  } catch { throw new Error("Invalid admitted matrix npm graph"); }
  const revalidate = (): void => {
    assertIndependentNpmConsumer({ manifest, lock, archives, readArchive, candidatePackages, admission });
    must(matrixFile(projectDir, "package.json", MAX_MATRIX_JSON).equals(Buffer.from(admission.manifestBytes)) &&
      matrixFile(projectDir, "package-lock.json", MAX_MATRIX_JSON).equals(Buffer.from(admission.lockBytes)),
    "Matrix installed npm manifest or lock changed");
    for (const archive of archives) if (archive.resolved.startsWith("file:")) {
      const local = archive.resolved.slice(5).replace(/^\.\//, "");
      must(matrixFile(projectDir, local, MAX_MATRIX_ARCHIVE).equals(Buffer.from(readArchive(archive.path))),
        "Matrix installed local archive changed");
    }
  };
  revalidate();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || existsSync(inside(projectDir, path))) continue;
    if (entry.optional === true) throw new Error(`MATRIX_PLATFORM_UNAVAILABLE: omitted npm package requires independently bound installer platform custody: ${path}`);
    throw new Error(`Required matrix installed package is missing: ${path}`);
  }
  // Bind the installed-tree observation itself to the live admission. The
  // four-argument form is only an unbound structural inspection, even when
  // the graph was admitted before reaching it.
  assertInstalledArchiveSet(projectDir, lock, archives, readArchive, admission);
  assertInstalledIsolation(projectDir);
  revalidate();
}

/**
 * Re-admit a retained matrix cell and inspect an already-installed private
 * project. This deliberately does not run a package manager or any probe and
 * its result must not be used as execution or browser-acceptance authority.
 */
export function inspectMatrixInstalledProject(root: string, report: MatrixReport, cellId: string, projectDir: string,
  storeDir?: string): { schema: "aura3d.matrix-installed-observation/1"; project: string; manager: Manager;
    installationAuthorized: false; executionAuthorized: false } {
  if (!report || !report.runId) throw new Error(MATRIX_INPUT_ERROR);
  assertRunId(report.runId);
  const reportPath = `tests/reports/native-consumers/${report.runId}/matrix-source.json`;
  matrixFile(root, reportPath, MAX_MATRIX_JSON);
  const verifiedReport = validateSourceMatrixReport(root, reportPath);
  if (canonical(verifiedReport) !== canonical(report)) throw new Error("Matrix report changed before inspection");
  const cell = matrixCells().find(item => item.id === cellId) ?? fail(`Unknown matrix project: ${cellId}`);
  const project = verifiedReport.projects.find(item => item.id === cellId) ?? fail(`Missing matrix project: ${cellId}`);
  if (project.retention !== "portable-v1" || !project.sourceManifest || !project.archives ||
      !Array.isArray(verifiedReport.candidateReviews)) throw new Error(MATRIX_INPUT_ERROR);
  must(isAbsolute(projectDir), "Inspected matrix project path must be absolute");
  const parent = realpathSync(dirname(projectDir)), directory = join(parent, basename(projectDir));
  must(realpathSync(projectDir) === directory && lstatSync(projectDir).isDirectory() && !lstatSync(projectDir).isSymbolicLink(),
    "Inspected matrix project must be a canonical directory");
  const workspace = realpathSync(root), fromTemp = relative(realpathSync(tmpdir()), parent);
  must(directory !== workspace && !directory.startsWith(`${workspace}${sep}`) &&
    fromTemp !== ".." && !fromTemp.startsWith(".." + sep) && !isAbsolute(fromTemp),
  "Inspected matrix project must be in a temporary workspace outside the repository");
  const parentStat = lstatSync(parent);
  must(parentStat.isDirectory() && (process.platform === "win32" ||
    ((parentStat.mode & 0o077) === 0 && (!process.getuid || parentStat.uid === process.getuid()))),
  "Inspected matrix project parent must be private");
  for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
    must(!existsSync(join(ancestor, "node_modules")), "Inspected matrix project can resolve outside dependencies");
    if (dirname(ancestor) === ancestor) break;
  }
  must(hashConsumerProject(directory) === project.projectSha256, `Inspected matrix project inputs differ: ${cell.id}`);
  const { plan, ref } = readCandidate(root, verifiedReport.candidate.path);
  const manifestBytes = matrixFile(root, project.path + "/package.json", MAX_MATRIX_JSON);
  const lockBytes = matrixFile(root, project.path + "/" + project.lockfile, MAX_MATRIX_JSON);
  const prefix = `tests/reports/native-consumer-matrix/${report.runId}/dependency-archives/`;
  if (cell.manager === "pnpm") {
    if (!storeDir) throw new Error("Matrix pnpm inspection requires its post-use store");
    const prepared = preparePnpmCell(root, plan, ref, cell, project.sourceManifest, manifestBytes, lockBytes,
      project.archives, prefix, verifiedReport.candidateReviews);
    assertMatrixLifecycleFree(prepared);
    const inspect = () => verifyMatrixInstalledPnpmProject({ projectDir: directory, storeDir, admission: prepared.admission });
    inspect(); inspectInstalled(directory, cell, plan); inspect();
  } else {
    if (storeDir !== undefined) throw new Error("Matrix npm inspection does not accept a pnpm store");
    const prepared = prepareNpmCell(root, report.runId, plan, ref, cell, project.sourceManifest, manifestBytes, lockBytes,
      project.archives, prefix, verifiedReport.candidateReviews);
    assertMatrixLifecycleFree(prepared);
    const inspect = () => verifyMatrixInstalledNpmProject({ projectDir: directory, admission: prepared.admission,
      archives: prepared.archives, readArchive: prepared.readArchive, candidatePackages: plan.packages });
    inspect(); inspectInstalled(directory, cell, plan); inspect();
  }
  must(hashConsumerProject(directory) === project.projectSha256, `Inspected matrix project changed: ${cell.id}`);
  return Object.freeze({ schema: "aura3d.matrix-installed-observation/1", project: cell.id, manager: cell.manager,
    installationAuthorized: false, executionAuthorized: false });
}

/** Restore a retained, admitted source project in a private temporary workspace. */
export async function restoreMatrixProject(root: string, report: MatrixReport, cellId: string, outputDir: string): Promise<string> {
  if (!report || !report.runId) throw new Error(MATRIX_INPUT_ERROR);
  assertRunId(report.runId);
  const reportPath = `tests/reports/native-consumers/${report.runId}/matrix-source.json`;
  matrixFile(root, reportPath, MAX_MATRIX_JSON);
  const verifiedReport = validateSourceMatrixReport(root, reportPath);
  if (canonical(verifiedReport) !== canonical(report)) throw new Error("Matrix report changed before restore");
  const cell = matrixCells().find(item => item.id === cellId) ?? fail(`Unknown matrix project: ${cellId}`);
  const project = verifiedReport.projects.find(item => item.id === cellId) ?? fail(`Missing matrix project: ${cellId}`);
  if (project.retention === "packed-v1") return restorePackedMatrixProject(root, verifiedReport, cell, project, outputDir);
  if (project.retention !== "portable-v1" || !project.sourceManifest || !project.archives || !Array.isArray(verifiedReport.candidateReviews)) throw new Error(MATRIX_INPUT_ERROR);
  const candidateReviews = verifiedReport.candidateReviews;
  const { plan, ref } = readCandidate(root, verifiedReport.candidate.path);
  const manifestBytes = matrixFile(root, project.path + "/package.json", MAX_MATRIX_JSON);
  const lockBytes = matrixFile(root, project.path + "/" + project.lockfile, MAX_MATRIX_JSON);
  if (cell.manager === "pnpm") {
    const prepared = preparePnpmCell(root, plan, ref, cell, project.sourceManifest, manifestBytes, lockBytes, project.archives,
      "tests/reports/native-consumer-matrix/" + report.runId + "/dependency-archives/", candidateReviews);
    assertMatrixLifecycleFree(prepared);
    preflightPnpmStores([prepared]);
    assertMatrixExecutionReady("pnpm");
    throw new Error("MATRIX_PNPM_RESTORE_UNAVAILABLE: isolated pnpm restoration and post-use verification are not yet connected");
  }
  const prepared = prepareNpmCell(root, report.runId, plan, ref, cell, project.sourceManifest, manifestBytes, lockBytes, project.archives,
    "tests/reports/native-consumer-matrix/" + report.runId + "/dependency-archives/", candidateReviews);
  assertMatrixLifecycleFree(prepared);
  assertNpmExecutionReady();
  must(isAbsolute(outputDir), "Restored project path must be absolute");
  const parent = realpathSync(dirname(outputDir));
  const destination = join(parent, basename(outputDir));
  const workspace = realpathSync(root);
  const tempRoot = realpathSync(tmpdir());
  const fromTemp = relative(tempRoot, parent);
  must(destination !== workspace && !destination.startsWith(`${workspace}${sep}`), "Restored consumer must be outside the repository");
  must(fromTemp !== ".." && !fromTemp.startsWith(".." + sep) && !isAbsolute(fromTemp), "Restored consumer must be in a temporary workspace");
  const parentStat = lstatSync(parent);
  must(parentStat.isDirectory() && (process.platform === "win32" || ((parentStat.mode & 0o077) === 0 && (!process.getuid || parentStat.uid === process.getuid()))), "Restored consumer parent must be private");
  for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
    must(!existsSync(join(ancestor, "node_modules")), "Restored consumer can resolve outside dependencies");
    if (dirname(ancestor) === ancestor) break;
  }
  try { lstatSync(destination); throw new Error("Restored project already exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const cache = mkdtempSync(join(tmpdir(), "a3d-matrix-cache-"));
  try {
    const retained = inside(root, project.path);
    cpSync(retained, destination, { recursive: true, verbatimSymlinks: true, filter: path => path !== join(retained, "node_modules") });
    assertMatrixProjectFiles(project, destination);
    must(hashConsumerProject(destination) === project.projectSha256, `Restored project inputs differ: ${cell.id}`);
    await seedVerifiedNpmCache({ lock: prepared.lock, archives: prepared.archives, readArchive: prepared.readArchive, cacheDir: cache, admission: prepared.admission });
    assertIndependentNpmConsumer({ manifest: prepared.manifest, lock: prepared.lock, archives: prepared.archives,
      readArchive: prepared.readArchive, candidatePackages: plan.packages, admission: prepared.admission });
    must(fileHash(join(destination, "package.json")) === hash(prepared.manifestBytes) &&
      fileHash(join(destination, project.lockfile)) === hash(prepared.lockBytes), "Matrix restore manifest or lock changed");
    for (const item of prepared.archives) if (item.resolved.startsWith("file:")) {
      const local = item.resolved.slice(5).replace(/^\.\//, "");
      must(matrixFile(destination, local, MAX_MATRIX_ARCHIVE).equals(prepared.readArchive(item.path)), "Matrix local archive changed");
    }
    const install = [...commands(cell).install, "--cache", cache, "--userconfig", devNull, "--globalconfig", devNull];
    const installed = runCommand(install, destination, prepared.permit);
    must(installed.exitCode === 0, `Locked consumer restore failed for ${cell.id}: ${installed.output}`);
    must(hashConsumerProject(destination) === project.projectSha256 && fileHash(join(destination, project.lockfile)) === project.lockfileSha256, `Restore changed source inputs or lock: ${cell.id}`);
    verifyMatrixInstalledNpmProject({ projectDir: destination, admission: prepared.admission, archives: prepared.archives,
      readArchive: prepared.readArchive, candidatePackages: plan.packages });
    inspectInstalled(destination, cell, plan);
    for (const id of ["javascript-esm", "condition-node", "condition-browser", "react-ssr", "optional-peer"]) {
      const result = runCommand(commands(cell)[id], destination, prepared.permit);
      must(result.exitCode === 0, `Restored ${cell.id}/${id} failed: ${result.output}`);
    }
    verifyMatrixInstalledNpmProject({ projectDir: destination, admission: prepared.admission, archives: prepared.archives,
      readArchive: prepared.readArchive, candidatePackages: plan.packages });
    must(hashConsumerProject(destination) === project.projectSha256 && fileHash(join(destination, project.lockfile)) === project.lockfileSha256,
      `Restored consumer changed during probes: ${cell.id}`);
    return destination;
  } catch (error) { rmSync(destination, { recursive: true, force: true }); throw error; }
  finally { rmSync(cache, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// Packed matrix producer (5.0 decision record item 1). Each cell is an
// ordinary isolated packed-consumer install in a fresh temporary project: the
// candidate archives are verified against the plan by readCandidate, copied in
// as file: dependencies, installed with the cell's package manager, and every
// probe runs against that installation. The lock must pin each candidate entry
// to its plan SRI (inspectLock). Retained projects omit node_modules and are
// restored with a lock-pinned install for the browser phase.
// ---------------------------------------------------------------------------

export type PackedMatrixRunner = (command: string[], cwd: string, env: NodeJS.ProcessEnv) => { exitCode: number; output: string };
const defaultPackedMatrixRunner: PackedMatrixRunner = (command, cwd, env) => {
  const result = spawnSync(command[0], command.slice(1), { cwd, env, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error}` : ""}` };
};

/** Source-phase install: resolves third-party packages and writes the cell lock. */
export function packedInstallCommand(cell: MatrixCell): string[] {
  return cell.manager === "npm"
    ? ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier"]
    : ["pnpm", "install", "--ignore-scripts", "--ignore-pnpmfile", "--package-import-method=copy"];
}
/** Browser-phase restore: installs exactly the retained lock. */
export function packedRestoreCommand(cell: MatrixCell): string[] {
  return cell.manager === "npm"
    ? ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier"]
    : ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts", "--ignore-pnpmfile", "--package-import-method=copy"];
}
function packedEnvironment(work: string): NodeJS.ProcessEnv {
  const cache = join(work, ".cache"), home = join(work, ".home"), store = join(work, ".pnpm-store");
  for (const dir of [cache, home, store]) mkdirSync(dir, { recursive: true });
  return { ...packedConsumerEnvironment(cache, home), npm_config_store_dir: store, npm_config_cache_dir: join(cache, "pnpm") };
}
function installedToolVersions(project: string): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const name of ["typescript", "tsx", "vite", "react", "react-dom"]) {
    const manifest = JSON.parse(readFileSync(join(project, "node_modules", name, "package.json"), "utf8")) as { version?: string };
    must(typeof manifest.version === "string" && manifest.version.length > 0, `Missing installed tool version: ${name}`);
    versions[name] = manifest.version!;
  }
  return versions;
}
function retainMatrixProject(source: string, target: string): void {
  cpSync(source, target, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false,
    filter: path => path !== join(source, "node_modules") });
}

export async function runPackedMatrixSource(root: string, runId: string, planPath: string, runner: PackedMatrixRunner = defaultPackedMatrixRunner): Promise<MatrixReport> {
  assertRunId(runId);
  const target = join(root, "tests/reports/native-consumer-matrix", runId);
  const reportPath = join(root, "tests/reports/native-consumers", runId, "matrix-source.json");
  must(!existsSync(target), `Run already exists: ${target}`);
  must(!existsSync(reportPath), `Source matrix report already exists: ${reportPath}`);
  const { plan, ref } = readCandidate(root, planPath);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "a3d-packed-matrix-")));
  const env = packedEnvironment(scratch);
  const projects: RetainedProject[] = [], checks: Check[] = [];
  let failed = false;
  try {
    const toolVersion = (command: string[]): string => {
      const result = runner(command, scratch, env);
      must(result.exitCode === 0, `Required tool unavailable: ${command.join(" ")}\n${result.output}`);
      return result.output.trim();
    };
    const toolVersions = { node: process.version, npm: toolVersion(["npm", "--version"]), pnpm: toolVersion(["pnpm", "--version"]) };
    for (const cell of matrixCells()) {
      const project = join(scratch, "cells", cell.id);
      mkdirSync(project, { recursive: true });
      projectFiles(root, project, cell, plan);
      let cellFailed = false;
      const record = (id: string, command: string[], exitCode: number, output: string): void => {
        const logPath = `tests/reports/native-consumer-matrix/${runId}/logs/${cell.id}-${id}.log`;
        const text = redactText(output);
        mkdirSync(dirname(join(root, logPath)), { recursive: true });
        writeFileSync(join(root, logPath), text);
        checks.push({ id, project: cell.id, command, status: exitCode === 0 ? "pass" : "fail", exitCode, logPath,
          logSha256: hash(text), logSize: Buffer.byteLength(text) });
        if (exitCode !== 0) cellFailed = true;
      };
      for (const id of CHECK_IDS) {
        const command = id === "install" ? packedInstallCommand(cell) : commands(cell)[id] ?? ["inspect-installed-artifacts"];
        if (cellFailed) {
          checks.push({ id, project: cell.id, command, status: "not-run", exitCode: null, logPath: "", logSha256: "" });
          continue;
        }
        if (id === "installed-identity") {
          try { inspectInstalled(project, cell, plan); record(id, command, 0, JSON.stringify(projectPackages(plan, cell).map(pkg => ({ name: pkg.name, integrity: pkg.integrity })))); }
          catch (error) { record(id, command, 1, String(error)); }
          continue;
        }
        const result = runner(command, project, env);
        let exitCode = result.exitCode, output = result.output;
        if (exitCode === 0 && id === "install") {
          try { inspectLock(project, cell, plan); } catch (error) { exitCode = 1; output += `\n${String(error)}`; }
        }
        if (exitCode === 0 && id === "browser-build") {
          try { assertBrowserBuild(project, root); } catch (error) { exitCode = 1; output += `\n${String(error)}`; }
        }
        record(id, command, exitCode, output);
      }
      failed ||= cellFailed;
      const retained = join(target, "projects", cell.id);
      mkdirSync(dirname(retained), { recursive: true });
      retainMatrixProject(project, retained);
      const lockfile = cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
      projects.push({ ...cell, path: relative(root, retained).split(sep).join("/"), retention: "packed-v1",
        manifestSha256: fileHash(join(retained, "package.json")), lockfile,
        lockfileSha256: existsSync(join(retained, lockfile)) ? fileHash(join(retained, lockfile)) : "",
        projectSha256: hashConsumerProject(retained), installedPackages: projectPackages(plan, cell),
        toolVersions: cellFailed ? {} : installedToolVersions(project) });
    }
    const report: MatrixReport = { schema: "aura3d.native-consumers/1", phase: "source", runId, status: failed ? "fail" : "pass",
      source: { revision: plan.source.commit, stagedSourceSha256: plan.source.inputDigest ?? plan.source.fingerprint, lockfileSha256: plan.source.lockfileSha256 },
      candidate: { path: ref.path, sha256: ref.sha256, version: plan.version, packages: plan.packages },
      toolVersions, projects, checks,
      browser: matrixCells().flatMap(cell => BROWSERS.map(browser => ({ id: `${cell.id}/${browser}`, status: "not-run" as const }))) };
    writeJson(reportPath, report);
    if (report.status === "pass") validateSourceMatrixReport(root, relative(root, reportPath));
    return report;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Restore a retained packed cell with a lock-pinned install and rerun its Node probes. */
async function restorePackedMatrixProject(root: string, report: MatrixReport, cell: MatrixCell, project: RetainedProject, outputDir: string,
  runner: PackedMatrixRunner = defaultPackedMatrixRunner): Promise<string> {
  const { plan } = readCandidate(root, report.candidate.path);
  must(isAbsolute(outputDir), "Restored project path must be absolute");
  const parent = realpathSync(dirname(outputDir));
  const destination = join(parent, basename(outputDir));
  const workspace = realpathSync(root);
  const fromTemp = relative(realpathSync(tmpdir()), parent);
  must(destination !== workspace && !destination.startsWith(`${workspace}${sep}`), "Restored consumer must be outside the repository");
  must(fromTemp !== ".." && !fromTemp.startsWith(".." + sep) && !isAbsolute(fromTemp), "Restored consumer must be in a temporary workspace");
  for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
    must(!existsSync(join(ancestor, "node_modules")), "Restored consumer can resolve outside dependencies");
    if (dirname(ancestor) === ancestor) break;
  }
  must(!existsSync(destination), "Restored project already exists");
  const work = mkdtempSync(join(tmpdir(), "a3d-packed-matrix-restore-"));
  try {
    retainMatrixProject(inside(root, project.path), destination);
    must(hashConsumerProject(destination) === project.projectSha256, `Restored project inputs differ: ${cell.id}`);
    const env = packedEnvironment(work);
    const installed = runner(packedRestoreCommand(cell), destination, env);
    must(installed.exitCode === 0, `Locked consumer restore failed for ${cell.id}: ${redactText(installed.output).slice(-4000)}`);
    must(hashConsumerProject(destination) === project.projectSha256 && fileHash(join(destination, project.lockfile)) === project.lockfileSha256, `Restore changed source inputs or lock: ${cell.id}`);
    inspectInstalled(destination, cell, plan);
    for (const id of ["javascript-esm", "condition-node", "condition-browser", "react-ssr", "optional-peer"]) {
      const result = runner(commands(cell)[id], destination, env);
      must(result.exitCode === 0, `Restored ${cell.id}/${id} failed: ${redactText(result.output).slice(-4000)}`);
    }
    must(hashConsumerProject(destination) === project.projectSha256 && fileHash(join(destination, project.lockfile)) === project.lockfileSha256,
      `Restored consumer changed during probes: ${cell.id}`);
    return destination;
  } catch (error) { rmSync(destination, { recursive: true, force: true }); throw error; }
  finally { rmSync(work, { recursive: true, force: true }); }
}

function assertMatrixExecutionReady(manager: Manager): void {
  // A real OS-enforced process/network isolation and pinned toolchain custody
  // capability has no issuer in this repository. Do not replace this with an
  // environment flag, archive receipt, cache report, or loopback URL.
  throw new Error(manager === "pnpm" ? MATRIX_PNPM_INSTALL_ERROR : MATRIX_NPM_INSTALL_ERROR);
}
function assertNpmExecutionReady(): void {
  assertMatrixExecutionReady("npm");
}

export function validateGateMatchesSource(gate: { candidatePlan?: { path: string; sha256: string }; sourceInputDigest?: string; lockfileSha256?: string; archives?: { path: string; sha256: string }[] }, source: MatrixReport): void {
  must(gate.candidatePlan?.path === source.candidate.path && gate.candidatePlan.sha256 === source.candidate.sha256, "Global gate and consumer candidate plans differ");
  must(gate.sourceInputDigest === source.source.stagedSourceSha256 && gate.lockfileSha256 === source.source.lockfileSha256, "Global gate and consumer source identities differ");
  const expected = source.candidate.packages.map(pkg => `${pkg.tarball}\0${pkg.sha256}`).sort();
  const observed = (gate.archives ?? []).map(archive => `${archive.path}\0${archive.sha256}`).sort();
  must(JSON.stringify(expected) === JSON.stringify(observed), "Global gate and consumer candidate archives differ");
}
async function assertGate(root: string, reportPath: string, gatePath: string, source?: MatrixReport): Promise<void> {
  const gateModule = await import(pathToFileURL(join(root, "tools/native-capability-gate/index.mjs")).href) as { validateAcceptanceGate: (input: { root: string; gatePath: string; sourceReport: string }) => Parameters<typeof validateGateMatchesSource>[0] };
  const gate = gateModule.validateAcceptanceGate({ root, gatePath, sourceReport: reportPath });
  if (source) validateGateMatchesSource(gate, source);
}

/** Restore exactly the peer-present React 18/19 projects for remote acceptance jobs. */
export async function restoreReactConsumers(root: string, reportPath: string, gatePath: string, outputDir: string): Promise<{ react18: string; react19: string }> {
  must(Boolean(reportPath), "--source-report is required in browser phase");
  if (!existsSync(inside(root, reportPath))) throw new Error(MATRIX_INPUT_ERROR);
  const report = validateSourceMatrixReport(root, reportPath);
  const { plan, ref } = readCandidate(root, report.candidate.path);
  const packed = report.projects.every(item => item.retention === "packed-v1");
  if (!packed && !Array.isArray(report.candidateReviews)) throw new Error(MATRIX_INPUT_ERROR);
  for (const id of ["npm-react18-peer-present", "npm-react19-peer-present"]) {
    const cell = matrixCells().find(item => item.id === id)!;
    const project = report.projects.find(item => item.id === id);
    if (packed && project) continue;
    if (!project || project.retention !== "portable-v1" || !project.sourceManifest || !project.archives) throw new Error(MATRIX_INPUT_ERROR);
    prepareNpmCell(root, report.runId, plan, ref, cell, project.sourceManifest,
      matrixFile(root, project.path + "/package.json", MAX_MATRIX_JSON), matrixFile(root, project.path + "/" + project.lockfile, MAX_MATRIX_JSON),
      project.archives, "tests/reports/native-consumer-matrix/" + report.runId + "/dependency-archives/", report.candidateReviews!);
  }
  await assertGate(root, reportPath, gatePath, report);
  must(isAbsolute(outputDir), "--out-dir must be absolute and outside the repository");
  const parent = realpathSync(dirname(outputDir));
  const base = join(parent, basename(outputDir));
  const workspace = realpathSync(root);
  const fromTemp = relative(realpathSync(tmpdir()), parent);
  must(base !== workspace && !base.startsWith(`${workspace}${sep}`), "--out-dir must be outside the repository");
  must(fromTemp !== ".." && !fromTemp.startsWith(".." + sep) && !isAbsolute(fromTemp), "--out-dir must be in a temporary workspace");
  must(!existsSync(base), `Restoration output already exists: ${base}`);
  mkdirSync(base, { mode: 0o700 });
  try {
    const react18 = await restoreMatrixProject(root, report, "npm-react18-peer-present", join(base, "react18"));
    await assertGate(root, reportPath, gatePath, report);
    const react19 = await restoreMatrixProject(root, report, "npm-react19-peer-present", join(base, "react19"));
    await assertGate(root, reportPath, gatePath, report);
    return { react18, react19 };
  } catch (error) { rmSync(base, { recursive: true, force: true }); throw error; }
}

/** Browser phase is intentionally unreachable without an independently verified global gate. */
export async function runBrowser(root: string, runId: string, reportPath: string, gatePath: string): Promise<boolean> {
  assertRunId(runId);
  must(Boolean(reportPath), "--source-report is required in browser phase");
  if (!existsSync(inside(root, reportPath))) throw new Error(MATRIX_INPUT_ERROR);
  const source = validateSourceMatrixReport(root, reportPath);
  await assertGate(root, reportPath, gatePath, source);
  // Gate every manager, not merely the presence of a pnpm cell, before loading
  // Playwright or creating any browser-phase artifacts.
  for (const project of source.projects) if (project.retention !== "packed-v1") assertMatrixExecutionReady(project.manager);
  const target = join(root, "tests/reports/native-consumer-matrix", runId);
  const browserReport = join(root, "tests/reports/native-consumers", runId, "matrix-browser.json");
  must(!existsSync(target), `Run already exists: ${target}`);
  must(!existsSync(browserReport), `Browser matrix report already exists: ${browserReport}`);
  const playwright = await import("playwright");
  mkdirSync(target, { recursive: true });
  const results: { id: string; status: "pass" | "fail"; command: string[]; exitCode: number; logPath: string; logSha256?: string; browserVersion?: string }[] = [];
  const playwrightVersion = JSON.parse(readFileSync(join(root, "node_modules/playwright/package.json"), "utf8")).version;
  const save = (status: "pass" | "fail", error?: string): void => {
    const checks = matrixCells().flatMap(cell => BROWSERS.map(browser => {
      const id = `${cell.id}/${browser}`;
      return results.find(result => result.id === id) ?? { id, status: "not-run", command: ["playwright", browser, "packed-react-and-worker"], exitCode: null, logPath: null };
    }));
    writeJson(browserReport, { schema: "aura3d.native-consumers/1", phase: "browser", runId, status, ...(error ? { error } : {}), sourceReport: { path: reportPath, sha256: fileHash(inside(root, reportPath)) }, source: source.source, candidate: source.candidate, toolVersions: { ...source.toolVersions, playwright: playwrightVersion }, projects: source.projects.map(({ id, path, manifestSha256, lockfileSha256, projectSha256 }) => ({ id, path, manifestSha256, lockfileSha256, projectSha256 })), checks });
  };
  save("fail", "Acceptance did not complete.");
  try {
  for (const project of source.projects) {
    const temp = mkdtempSync(join(tmpdir(), "a3d-native-browser-"));
    try {
      const staged = await restoreMatrixProject(root, source, project.id, join(temp, "project"));
      // Repeat the gate after staging and before starting a server or browser.
      await assertGate(root, reportPath, gatePath, source);
      const dist = join(staged, "dist");
      const server = createServer((request, response) => {
        let path: string;
        try { path = resolve(dist, `.${decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname === "/" ? "/index.html" : new URL(request.url ?? "/", "http://localhost").pathname)}`); }
        catch { response.writeHead(400).end(); return; }
        if (!path.startsWith(`${dist}${sep}`) || !existsSync(path) || !lstatSync(path).isFile()) { response.writeHead(404).end(); return; }
        response.writeHead(200, { "content-type": mime(path) }); response.end(readFileSync(path));
      });
      await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Could not allocate browser test server");
        for (const browserName of BROWSERS) {
          const id = `${project.id}/${browserName}`;
          const logPath = `tests/reports/native-consumer-matrix/${runId}/logs/${project.id}-${browserName}.log`;
          const command = ["playwright", browserName, "packed-react-and-worker"];
          let browser: Awaited<ReturnType<typeof playwright.chromium.launch>> | undefined;
          let browserVersion: string | undefined;
          let output = "";
          try {
            browser = await playwright[browserName].launch(); browserVersion = browser.version();
            const page = await browser.newPage();
            const errors: string[] = [];
            page.on("pageerror", error => errors.push(String(error)));
            await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "load" });
            const observation = await page.evaluate(async () => await Promise.race([
              (window as unknown as { runNativeConsumer: () => Promise<{ mounts: number; disposals: number; worker: boolean; splats: number; engineSplats: number; nestedZstd: boolean }> }).runNativeConsumer(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("packed consumer timed out")), 45_000))
            ]));
            must(observation.mounts === 2 && observation.disposals === 2 && observation.worker === true && observation.splats === 512 && observation.engineSplats === 512 && observation.nestedZstd === true && errors.length === 0, `Invalid client observation: ${JSON.stringify({ observation, errors })}`);
            output = JSON.stringify({ observation, browserVersion });
            results.push({ id, status: "pass", command, exitCode: 0, logPath, browserVersion });
          } catch (error) {
            output = String(error);
            results.push({ id, status: "fail", command, exitCode: 1, logPath, browserVersion });
          } finally { if (browser) await browser.close(); }
          mkdirSync(dirname(join(root, logPath)), { recursive: true }); writeFileSync(join(root, logPath), `${output}\n`);
          results[results.length - 1].logSha256 = fileHash(join(root, logPath));
          save("fail", "Acceptance did not complete.");
        }
      } finally { await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())); }
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  const pass = results.length === matrixCells().length * BROWSERS.length && results.every(result => result.status === "pass");
  save(pass ? "pass" : "fail");
  return pass;
  } catch (error) {
    save("fail", String(error));
    throw error;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    must(["--phase", "--run-id", "--candidate-plan", "--source-report", "--gate", "--out-dir", "--restore-react"].includes(flag) && !options.has(flag), `Unknown or repeated argument: ${flag}`);
    if (flag === "--restore-react") { options.set(flag, true); continue; }
    must(Boolean(args[i + 1]) && !args[i + 1].startsWith("--"), `${flag} requires a value`);
    options.set(flag, args[++i]);
  }
  const value = (flag: string): string | undefined => typeof options.get(flag) === "string" ? options.get(flag) as string : undefined;
  const phase = value("--phase"), runId = value("--run-id");
  must(phase === "source" || phase === "browser", "--phase source|browser is required");
  must(Boolean(runId), "--run-id is required");
  if (phase === "source") {
    must(!options.has("--source-report") && !options.has("--gate") && !options.has("--out-dir") && !options.has("--restore-react"), "Browser arguments are invalid in source phase");
    const plan = value("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
    must(Boolean(plan), "--candidate-plan or A3D_RELEASE_PLAN is required");
    const report = await runSource(process.cwd(), runId!, plan!);
    if (report.status !== "pass") process.exitCode = 1;
  } else {
    must(!options.has("--candidate-plan") && (!options.has("--out-dir") || options.has("--restore-react")), "Invalid browser arguments");
    const sourceReport = value("--source-report") ?? "";
    const gate = value("--gate") ?? "tests/reports/native-capabilities/code-complete-go.json";
    if (options.has("--restore-react")) {
      const paths = await restoreReactConsumers(process.cwd(), sourceReport, gate, value("--out-dir") ?? "");
      process.stdout.write(`${JSON.stringify(paths)}\n`);
      return;
    }
    const pass = await runBrowser(process.cwd(), runId!, sourceReport, gate);
    if (!pass) process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1; });
