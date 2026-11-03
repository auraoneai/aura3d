/**
 * Candidate-bound clean consumers. Source and browser runs are separate:
 * source production installs the packed candidate (or a verified portable
 * input bundle) in fresh temporary consumers; browser needs
 * both the immutable source report and the global code-complete gate.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withNpmTransport } from "../release/npm-transport.mjs";
import { inspectInstalledRelease, loadValidatedReleasePlan, type ExactReleasePlan } from "../release/exact-release-plan.mjs";
import { assertIndependentNpmConsumer, inspectNpmArchive, seedVerifiedNpmCache, type NpmAdmissionInput } from "../release/portable-npm-lock.mjs";
import { consumeArchiveAdmission, verifyArchiveAdmission } from "../release/archive-admission.mjs";
import { inspectInstalledNpmConsumer, verifyInstalledNpmConsumer, type InstalledNpmConsumerReport } from "../release/pnpm-installed-tree.mjs";
// @ts-expect-error The shared artifact-redaction module is plain JavaScript.
import { redactText } from "../remote-acr/upload-artifacts.mjs";
import { CREATE_AURA3D_TEMPLATES } from "../../packages/create-aura3d/src/index";

export interface NativeConsumerCheck {
  id: string;
  project: string;
  command: string[];
  status: "passed" | "failed" | "not-run";
  exitCode: number | null;
  logPath: string;
  /** Required for checks in portable source reports. */
  logSize?: number;
  logSha256?: string;
}
export interface NativeConsumerFile { path: string; size: number; sha256: string }
export interface NativeConsumerArchive { resolved: string; path: string; size: number; sha256: string; integrity: string }
export interface CandidateReviewReference { path: string; sha256: string }
export interface NativeConsumerProject {
  template: string;
  kind: "template" | "fixture";
  path: string;
  entry: string;
  manifestSha256: string;
  lockfileSha256: string;
  projectSha256: string;
  /** Portable projects retain no installed dependencies; archives are root-relative. */
  /** packed-v1: retained without node_modules; restored with a lock-pinned npm ci of the staged candidate archives. */
  retention?: "portable-v1" | "packed-v1";
  sourceManifest?: { path: string; sha256: string };
  candidateReviews?: CandidateReviewReference[];
  /** Informational only; each restore independently obtains a new capability. */
  admission?: ReturnType<typeof verifyArchiveAdmission>["receipt"];
  files?: NativeConsumerFile[];
  archives?: NativeConsumerArchive[];
  installedPackages: { name: string; installPath: string; version: string; sha256: string; integrity: string; contentsSha256: string }[];
  substitutions: { section: string; name: string; before: string; after: string }[];
}
export interface NativeConsumerReport {
  schema: "aura3d.native-consumers/1";
  phase: "source";
  runId: string;
  pass: boolean;
  source: { revision: string; stagedSourceSha256: string; lockfileSha256: string; manifest?: { path: string; sha256: string } };
  candidate: { path: string; sha256: string; version: string; packages: ExactReleasePlan["packages"] };
  candidateReviews?: CandidateReviewReference[];
  toolVersions: { node: string; npm: string };
  projects: NativeConsumerProject[];
  checks: NativeConsumerCheck[];
  browser: { id: string; status: "not-run" }[];
}

const hash = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const fileHash = (path: string): string => hash(readFileSync(path));
const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const hex = /^[0-9a-f]{64}$/;
const excluded = new Set(["node_modules", ".git", "coverage", "test-results", "playwright-report"]);

function inside(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`Expected a root-relative path: ${path}`);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Path escapes root: ${path}`);
  return absolute;
}

/** Hash retained source and build output, including symlinks, excluding dependency installations. */
export function hashConsumerProject(project: string, options: { includeDist?: boolean } = {}): string {
  const digest = createHash("sha256");
  function visit(dir: string, base = ""): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name) || (entry.name === "dist" && options.includeDist === false) || (base === "tests" && entry.name === "reports") || (!base && entry.name === "package-lock.json")) continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      const full = resolve(dir, entry.name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) digest.update(`link\0${rel}\0${readlinkSync(full)}\0`);
      else if (stat.isDirectory()) visit(full, rel);
      else if (stat.isFile()) digest.update(`file\0${rel}\0`).update(readFileSync(full)).update("\0");
      else throw new Error(`Unsupported consumer file: ${full}`);
    }
  }
  visit(project);
  return digest.digest("hex");
}

function contentsFor(project: string, installPath: string): string {
  const path = inside(project, installPath);
  if (!existsSync(resolve(path, "package.json")) || !lstatSync(path).isDirectory()) throw new Error(`Missing or linked installed package ${installPath}`);
  return hashConsumerProject(path);
}

const privateNames = new Set([".git", ".ssh", ".aws", ".azure", ".gcloud", ".gnupg", ".kube", ".docker", ".config", ".codex", ".npmrc", ".netrc", ".pypirc", ".yarnrc", ".yarnrc.yml", ".git-credentials", ".dockercfg", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const MAX_PORTABLE_ARCHIVE = 64 * 1024 * 1024;
const MAX_PORTABLE_ARCHIVES = 1024 * 1024 * 1024;

function assertSafeRelative(path: string): void {
  if (typeof path !== "string" || !path || isAbsolute(path) || /[\\\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid portable consumer path");
}

function assertPublicName(name: string): void {
  const lower = name.toLowerCase();
  if (privateNames.has(lower) || /^\.env(?:$|[._-])/.test(lower) || /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(lower) ||
      /[\\\x00-\x1f\x7f]/.test(name)) throw new Error("Portable consumer contains a private or nonportable path");
}

/** Resolve each component without following links, including ancestors. */
function checkedInput(root: string, path: string, kind: "file" | "directory", publicNames = true): string {
  assertSafeRelative(path);
  let current = realpathSync(root);
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (publicNames) assertPublicName(part);
    current = resolve(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("Portable consumer input contains a symlink");
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("Portable consumer input has a non-directory ancestor");
    if (index === parts.length - 1 && (kind === "directory" ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error("Portable consumer input is not a regular " + kind);
    }
  }
  return current;
}

function readPortableFile(root: string, path: string, limit = Number.MAX_SAFE_INTEGER): Buffer {
  const file = checkedInput(root, path, "file");
  if (lstatSync(file).size > limit) throw new Error("Portable consumer file exceeds its size limit");
  return readFileSync(file);
}

function normalizeReviewReferences(input: unknown): CandidateReviewReference[] {
  if (!Array.isArray(input) || input.length > 10000) throw new Error("Invalid candidate review references");
  return input.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid candidate review reference");
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).length !== 2 || typeof item.path !== "string" || typeof item.sha256 !== "string") throw new Error("Invalid candidate review reference");
    return { path: item.path, sha256: item.sha256 };
  });
}

/** Bind run-scoped review references to the staged sidecar, never to the environment alone. */
function stagedCandidateReviews(root: string, runId: string, plan: ExactReleasePlan, sourceManifest: { path: string; sha256: string },
  expected?: readonly CandidateReviewReference[], bundle?: { path: string; sha256: string }): CandidateReviewReference[] {
  if (!SLUG.test(runId)) throw new Error("Invalid portable consumer run ID");
  const envelopePath = `tests/reports/native-source-inputs/${runId}/inputs.json`;
  const envelope = JSON.parse(readPortableFile(root, envelopePath, 16 * 1024 * 1024).toString("utf8")) as {
    schema?: string; runId?: string; sourceManifest?: { path?: string; sha256?: string };
    candidatePlan?: { path?: string; sha256?: string }; consumerBundle?: { path?: string; sha256?: string }; candidateReviews?: unknown;
  };
  if (envelope.schema !== "aura3d.native-portable-inputs/1" || envelope.runId !== runId ||
      envelope.sourceManifest?.path !== sourceManifest.path || envelope.sourceManifest.sha256 !== sourceManifest.sha256 ||
      envelope.candidatePlan?.path !== plan.reference.path || envelope.candidatePlan.sha256 !== plan.reference.sha256 ||
      (bundle && (envelope.consumerBundle?.path !== bundle.path || envelope.consumerBundle.sha256 !== bundle.sha256))) {
    throw new Error("Portable consumer review sidecar identity is invalid");
  }
  const references = normalizeReviewReferences(envelope.candidateReviews);
  let previous = "", total = 0;
  const reviews = references.map((item): CandidateReviewReference => {
    if (!hex.test(item.sha256) ||
        item.path !== `tests/reports/native-source-inputs/${runId}/candidate-reviews/${item.sha256}.json` ||
        (previous && previous >= item.path)) throw new Error("Invalid or duplicate candidate review reference");
    previous = item.path;
    const bytes = readPortableFile(root, item.path, 16 * 1024 * 1024);
    total += bytes.byteLength;
    if (!bytes.byteLength || total > 256 * 1024 * 1024 || hash(bytes) !== item.sha256) throw new Error("Candidate review reference changed or exceeds its byte limit");
    return { path: item.path, sha256: item.sha256 };
  });
  if (reviews.length > plan.packages.length) throw new Error("Candidate review inventory exceeds the candidate plan");
  if (expected !== undefined && JSON.stringify(normalizeReviewReferences(expected)) !== JSON.stringify(reviews)) {
    throw new Error("Retained candidate reviews differ from the staged sidecar");
  }
  return reviews;
}

/** Inventory the complete portable tree, including lockfile and build output. */
export function inventoryPortableConsumerFiles(directory: string): NativeConsumerFile[] {
  const rootStat = lstatSync(directory);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("Portable consumer root must be a real directory");
  const files: NativeConsumerFile[] = [];
  function visit(dir: string, base = ""): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (!entries.length) throw new Error("Portable consumer contains an empty directory");
    for (const entry of entries) {
      assertPublicName(entry.name);
      const rel = base ? base + "/" + entry.name : entry.name;
      if (excluded.has(entry.name.toLowerCase()) || rel === "tests/reports") throw new Error("Portable consumer contains an excluded tree");
      const path = resolve(dir, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Portable consumer contains a symlink");
      if (stat.isDirectory()) visit(path, rel);
      else if (stat.isFile()) {
        const bytes = readFileSync(path);
        if (bytes.byteLength !== stat.size) throw new Error("Portable consumer file changed during inventory");
        files.push({ path: rel, size: bytes.byteLength, sha256: hash(bytes) });
      } else throw new Error("Portable consumer contains an unsupported filesystem entry");
    }
  }
  visit(directory);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function assertCurrentPortablePlan(root: string, plan: ExactReleasePlan): void {
  if (!plan?.reference?.path || !hex.test(plan.reference.sha256 ?? "")) throw new Error("A validated current candidate plan is required");
  if (hash(readPortableFile(root, plan.reference.path)) !== plan.reference.sha256) throw new Error("Candidate plan changed");
  const current = loadValidatedReleasePlan(root, plan.reference.path);
  if (!current || JSON.stringify(current) !== JSON.stringify(plan)) throw new Error("Candidate plan or staged source changed");
  for (const item of plan.packages) {
    const bytes = readPortableFile(root, item.tarball, MAX_PORTABLE_ARCHIVE);
    if (hash(bytes) !== item.sha256 || "sha512-" + createHash("sha512").update(bytes).digest("base64") !== item.integrity) {
      throw new Error("Candidate archive changed: " + item.name);
    }
  }
}

export interface PortableLockEntry {
  name?: string;
  version?: string;
  integrity?: string;
  resolved?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optional?: boolean;
}
export interface PortableLock { packages: Record<string, PortableLockEntry> }
interface PortableSnapshot {
  directory: string;
  lock: PortableLock;
  archives: NativeConsumerArchive[];
  readArchive: (path: string) => Uint8Array;
  admission: { capability: ReturnType<typeof verifyArchiveAdmission>["capability"]; manifestBytes: Uint8Array; lockBytes: Uint8Array };
}
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

function lockedPackageName(path: string): string {
  const parts = path.split("/");
  const index = parts.lastIndexOf("node_modules");
  const name = parts[index + 1];
  return name?.startsWith("@") ? name + "/" + parts[index + 2] : name;
}

/** Compare the complete candidate lock inventory with the recorded contents hashes. */
function assertPortableCandidateRecords(project: NativeConsumerProject, lock: PortableLock, plan: ExactReleasePlan): void {
  if (!Array.isArray(project.installedPackages) || !project.installedPackages.length) throw new Error("Missing installed candidate identities: " + project.template);
  const expected = Object.keys(lock.packages).filter(Boolean).sort().flatMap(installPath => {
    const entry = lock.packages[installPath];
    const name = entry.name ?? lockedPackageName(installPath);
    const candidate = plan.packages.find(item => item.name === name);
    if (!candidate) return [];
    return [{ installPath, name, version: candidate.version, sha256: candidate.sha256, integrity: candidate.integrity, lockedVersion: entry.version, lockedIntegrity: entry.integrity }];
  });
  if (!expected.length || expected.length !== project.installedPackages.length) throw new Error("Portable candidate inventory is incomplete: " + project.template);
  for (let index = 0; index < expected.length; index += 1) {
    const item = expected[index], actual = project.installedPackages[index];
    if (item.lockedVersion !== item.version || item.lockedIntegrity !== item.integrity || !actual ||
        actual.installPath !== item.installPath || actual.name !== item.name || actual.version !== item.version ||
        actual.sha256 !== item.sha256 || actual.integrity !== item.integrity || !hex.test(actual.contentsSha256 ?? "")) {
      throw new Error("Portable candidate inventory changed: " + project.template);
    }
  }
}

function assertPortableSource(project: NativeConsumerProject, directory: string): void {
  const files = inventoryPortableConsumerFiles(directory);
  if (!Array.isArray(project.files) || project.files.length !== files.length ||
      files.some((file, index) => project.files?.[index]?.path !== file.path ||
        project.files?.[index]?.size !== file.size || project.files?.[index]?.sha256 !== file.sha256)) {
    throw new Error("Portable consumer file inventory changed: " + project.template);
  }
  checkedInput(directory, project.entry, "file");
  if (!hex.test(project.manifestSha256 ?? "") || !hex.test(project.lockfileSha256 ?? "") || !hex.test(project.projectSha256 ?? "") ||
      fileHash(checkedInput(directory, "package.json", "file")) !== project.manifestSha256 ||
      fileHash(checkedInput(directory, "package-lock.json", "file")) !== project.lockfileSha256 ||
      hashConsumerProject(directory) !== project.projectSha256) throw new Error("Consumer project changed: " + project.template);
}

/**
 * Compare every installed package and declared bin against its archive. The
 * legacy four-argument form is an explicitly unbound structural observation;
 * it is not archive admission or permission to install/execute. Callers with
 * a live admission capability receive a separately bound observation.
 */
export function assertInstalledArchiveSet(directory: string, lock: PortableLock,
  archives: readonly { resolved: string; path: string }[], readArchive: (path: string) => Uint8Array,
  admission?: NpmAdmissionInput): InstalledNpmConsumerReport {
  if (!Array.isArray(archives) || archives.length > 10000 || typeof readArchive !== "function") {
    throw new Error("Invalid installed npm archive inventory");
  }
  let total = 0;
  const snapshots = archives.map(item => {
    if (!item || typeof item.resolved !== "string" || typeof item.path !== "string") throw new Error("Invalid installed npm archive identity");
    const bytes = readArchive(item.path);
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_PORTABLE_ARCHIVE ||
        (total += bytes.byteLength) > MAX_PORTABLE_ARCHIVES) throw new Error("Installed npm archive snapshot is unavailable or exceeds its byte limit");
    return { resolved: item.resolved, bytes: Uint8Array.from(bytes) };
  });
  if (!admission) return inspectInstalledNpmConsumer({ projectDir: directory, lock, archives: snapshots });
  let admittedLock: unknown;
  try { admittedLock = JSON.parse(Buffer.from(admission.lockBytes).toString("utf8")); }
  catch { throw new Error("Invalid admitted npm lock"); }
  if (canonicalObject(admittedLock) !== canonicalObject(lock)) throw new Error("Installed npm lock differs from admission");
  const admitted = consumeArchiveAdmission(admission), byResolution = new Map(admitted.map(item => [item.resolved, item.bytes]));
  if (byResolution.size !== admitted.length || snapshots.length !== admitted.length ||
      new Set(snapshots.map(item => item.resolved)).size !== snapshots.length ||
      snapshots.some(item => !byResolution.has(item.resolved) || !Buffer.from(item.bytes).equals(Buffer.from(byResolution.get(item.resolved)!)))) {
    throw new Error("Installed npm archives differ from admission");
  }
  return verifyInstalledNpmConsumer({ projectDir: directory, admission });
}

function portableArchiveInventory(project: NativeConsumerProject): Map<string, NativeConsumerArchive> {
  assertSafeRelative(project.path);
  const parts = project.path.split("/");
  if (parts[0] !== "tests" || parts[1] !== "reports" || parts[2] !== "native-consumers" ||
      !SLUG.test(parts[3] ?? "") || parts[4] !== "projects") throw new Error("Portable consumer path is not run-scoped");
  if (!Array.isArray(project.archives) || !project.archives.length) throw new Error("Portable consumer archives are required");
  const byPath = new Map<string, NativeConsumerArchive>();
  let previous = "";
  for (const item of project.archives) {
    if (!item || typeof item.resolved !== "string" || !item.resolved || (previous && previous >= item.resolved) ||
        !hex.test(item.sha256 ?? "") || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_PORTABLE_ARCHIVE ||
        typeof item.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity) ||
        Buffer.from(item.integrity.slice(7), "base64").toString("base64") !== item.integrity.slice(7) ||
        item.path !== "tests/reports/native-consumers/" + parts[3] + "/dependency-archives/" + item.sha256 + ".tgz") {
      throw new Error("Portable consumer archive inventory is invalid");
    }
    const prior = byPath.get(item.path);
    if (prior && (prior.size !== item.size || prior.sha256 !== item.sha256 || prior.integrity !== item.integrity)) {
      throw new Error("Portable consumer archive path has conflicting identities");
    }
    previous = item.resolved;
    byPath.set(item.path, item);
  }
  return byPath;
}

/** Snapshot and independently scan every archive before any reconstruction. */
function preparePortableProject(root: string, project: NativeConsumerProject, plan: ExactReleasePlan): PortableSnapshot {
  if (project.retention !== "portable-v1" || !Array.isArray(project.archives)) throw new Error("Portable consumer archives are required");
  const byPath = portableArchiveInventory(project);
  assertCurrentPortablePlan(root, plan);
  const directory = checkedInput(root, project.path, "directory");
  assertPortableSource(project, directory);
  const manifestBytes = readPortableFile(directory, "package.json", 16 * 1024 * 1024);
  const lockBytes = readPortableFile(directory, "package-lock.json", 16 * 1024 * 1024);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>;
  const lock = JSON.parse(lockBytes.toString("utf8")) as PortableLock;
  const snapshots = new Map<string, Uint8Array>();
  let total = 0;
  const readArchive = (path: string): Uint8Array => {
    const existing = snapshots.get(path);
    if (existing) return existing;
    const declared = byPath.get(path);
    if (!declared) throw new Error("Portable consumer archive is not in its inventory");
    const file = checkedInput(root, path, "file");
    const size = lstatSync(file).size;
    if (size !== declared.size || size > MAX_PORTABLE_ARCHIVE || total + size > MAX_PORTABLE_ARCHIVES) throw new Error("Portable consumer archives exceed their size limit or changed");
    const bytes = readFileSync(file);
    if (bytes.byteLength !== declared.size || hash(bytes) !== declared.sha256 ||
        "sha512-" + createHash("sha512").update(bytes).digest("base64") !== declared.integrity) {
      throw new Error("Portable consumer archive changed");
    }
    total += bytes.byteLength;
    snapshots.set(path, bytes);
    return bytes;
  };
  if (!project.sourceManifest || !hex.test(project.sourceManifest.sha256 ?? "") ||
      hash(readPortableFile(root, project.sourceManifest.path, 16 * 1024 * 1024)) !== project.sourceManifest.sha256) {
    throw new Error("Portable consumer source manifest is missing or changed");
  }
  if (!Array.isArray(project.candidateReviews)) throw new Error("Portable consumer candidate reviews are missing");
  const candidateReviews = stagedCandidateReviews(root, project.path.split("/")[3], plan, project.sourceManifest, project.candidateReviews);
  // Only the fixed verifier can mint an admission capability. The receipt is
  // informational and is never used as authority to run package code.
  const { capability, receipt } = verifyArchiveAdmission({ root, planPath: plan.reference.path, sourceManifestPath: project.sourceManifest.path,
    manifestBytes, lockBytes, archives: project.archives.map(item => ({ resolved: item.resolved, bytes: readArchive(item.path) })), candidateReviews });
  if (JSON.stringify(project.admission) !== JSON.stringify(receipt)) throw new Error("Portable consumer admission receipt differs from fresh verification");
  const admission = { capability, manifestBytes, lockBytes };
  assertIndependentNpmConsumer({ manifest, lock, archives: project.archives, readArchive, candidatePackages: plan.packages, admission });
  assertPortableCandidateRecords(project, lock, plan);
  for (const section of dependencySections) {
    const direct = manifest[section] as Record<string, string> | undefined;
    for (const [name, spec] of Object.entries(direct ?? {})) {
      if (!spec.startsWith("file:")) continue;
      const resolved = lock.packages["node_modules/" + name]?.resolved;
      if (!resolved?.startsWith("file:") || spec.slice(5).replace(/^\.\//, "") !== resolved.slice(5).replace(/^\.\//, "")) {
        throw new Error("Portable consumer manifest file dependency differs from its lock");
      }
    }
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    for (const section of dependencySections) {
      if (Object.values(entry[section] ?? {}).some(spec => spec.startsWith("file:"))) {
        throw new Error("Portable consumer does not admit transitive file dependencies");
      }
    }
  }
  for (const archive of project.archives) {
    if (!archive.resolved.startsWith("file:")) continue;
    const local = archive.resolved.slice(5).replace(/^\.\//, "");
    if (hash(readPortableFile(directory, local, MAX_PORTABLE_ARCHIVE)) !== hash(readArchive(archive.path))) {
      throw new Error("Portable local archive differs from verified candidate bytes");
    }
  }
  return { directory, lock, archives: project.archives, readArchive, admission };
}

/**
 * Reconstruct only inside a fresh temporary destination, using archive snapshots
 * that have passed the complete pre-install independence scan.
 */
export async function restorePortableConsumerProject(root: string, project: NativeConsumerProject, destination: string, plan: ExactReleasePlan): Promise<void> {
  const verified = preparePortableProject(root, project, plan);
  if (!isAbsolute(destination) || existsSync(destination)) throw new Error("Portable restore requires a new absolute destination");
  const parent = realpathSync(dirname(destination)), temporary = realpathSync(tmpdir());
  const rel = relative(temporary, parent);
  const fromRoot = relative(realpathSync(root), parent);
  const inRepository = !fromRoot || (fromRoot !== ".." && !fromRoot.startsWith(".." + sep) && !isAbsolute(fromRoot));
  const parentStat = lstatSync(dirname(destination));
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel) || inRepository || !parentStat.isDirectory() ||
      (process.platform !== "win32" && ((parentStat.mode & 0o077) !== 0 || (process.getuid && parentStat.uid !== process.getuid())))) {
    throw new Error("Portable restore destination must be in a temporary workspace outside the repository");
  }
  // 5.0 decision record item 1: no separate npm custody provider. The restore
  // runs offline from the admitted archive cache and is verified afterwards.
  const cache = mkdtempSync(resolve(tmpdir(), "aura3d-consumer-cache-"));
  let restored = false;
  try {
    cpSync(verified.directory, destination, { recursive: true, dereference: false, errorOnExist: true, force: false });
    assertPortableSource(project, destination);
    await seedVerifiedNpmCache({ lock: verified.lock, archives: verified.archives, readArchive: verified.readArchive, cacheDir: cache, admission: verified.admission });
    // Cache preparation may have yielded; bind npm's actual inputs again.
    assertPortableSource(project, destination);
    assertIndependentNpmConsumer({ manifest: JSON.parse(readFileSync(resolve(destination, "package.json"), "utf8")), lock: verified.lock,
      archives: verified.archives, readArchive: verified.readArchive, candidatePackages: plan.packages, admission: verified.admission });
    for (const archive of verified.archives) {
      if (!archive.resolved.startsWith("file:")) continue;
      const local = archive.resolved.slice(5).replace(/^\.\//, "");
      if (hash(readPortableFile(destination, local, MAX_PORTABLE_ARCHIVE)) !== hash(verified.readArchive(archive.path))) {
        throw new Error("Portable restore archive changed");
      }
    }
    const allowed = new Set(["PATH", "TMPDIR", "LANG", "LC_ALL", "TZ", "CI", "SYSTEMROOT", "WINDIR"]);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key)));
    execFileSync("npm", ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier",
      "--cache", cache, "--userconfig", devNull, "--globalconfig", devNull], {
      cwd: destination, env, stdio: "pipe", encoding: "utf8", maxBuffer: 32 * 1024 * 1024
    });
    assertInstalledArchiveSet(destination, verified.lock, verified.archives, verified.readArchive, verified.admission);
    if (fileHash(resolve(destination, "package.json")) !== project.manifestSha256 ||
        fileHash(resolve(destination, "package-lock.json")) !== project.lockfileSha256 ||
        hashConsumerProject(destination) !== project.projectSha256) throw new Error("Portable source or lock changed during restore");
    for (const item of project.installedPackages) {
      const directory = checkedInput(destination, item.installPath, "directory", false);
      const manifestFile = checkedInput(directory, "package.json", "file", false);
      const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as { name?: string; version?: string };
      if (manifest.name !== item.name || manifest.version !== item.version || hashConsumerProject(directory) !== item.contentsSha256) {
        throw new Error("Restored candidate changed: " + project.template + "/" + item.name);
      }
    }
    inspectInstalledRelease(root, destination, plan);
    restored = true;
  } finally {
    rmSync(cache, { recursive: true, force: true });
    if (!restored) rmSync(destination, { recursive: true, force: true });
  }
}

/** Retained source-phase logs are part of the report identity. */
function verifyConsumerLogs(root: string, report: NativeConsumerReport): void {
  const prefix = "tests/reports/native-consumers/" + report.runId + "/logs/";
  const logPaths = new Set<string>();
  for (const check of report.checks) {
    const name = check.logPath.startsWith(prefix) ? check.logPath.slice(prefix.length) : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.log$/.test(name) || logPaths.has(check.logPath) ||
        !Number.isSafeInteger(check.logSize) || (check.logSize ?? -1) < 0 || !hex.test(check.logSha256 ?? "")) {
      throw new Error("Portable consumer log inventory is invalid");
    }
    logPaths.add(check.logPath);
    const bytes = readPortableFile(root, check.logPath, 64 * 1024 * 1024);
    if (bytes.byteLength !== check.logSize || hash(bytes) !== check.logSha256) throw new Error("Portable consumer log changed");
  }
}

/** Verify both current candidate archives and retained projects before reuse. */
export function validateSourceConsumerReport(root: string, reportPath: string, expectedPlan: ExactReleasePlan): NativeConsumerReport {
  if (!expectedPlan?.reference?.sha256) throw new Error("A validated current candidate plan is required");
  const current = loadValidatedReleasePlan(root, expectedPlan.reference.path);
  if (!current || JSON.stringify(current) !== JSON.stringify(expectedPlan)) throw new Error("Candidate plan or staged source changed");
  const report = JSON.parse(readFileSync(isAbsolute(reportPath) ? reportPath : inside(root, reportPath), "utf8")) as NativeConsumerReport;
  if (report.schema !== "aura3d.native-consumers/1" || report.phase !== "source" || report.pass !== true || !SLUG.test(report.runId)) throw new Error("Invalid or failing source consumer report");
  const candidate = report.candidate;
  if (!candidate || candidate.path !== expectedPlan.reference.path || candidate.sha256 !== expectedPlan.reference.sha256 || candidate.version !== expectedPlan.version || JSON.stringify(candidate.packages) !== JSON.stringify(expectedPlan.packages)) throw new Error("Source report candidate does not match the current plan");
  if (report.source?.revision !== expectedPlan.source.commit || report.source.stagedSourceSha256 !== expectedPlan.source.fingerprint || report.source.lockfileSha256 !== expectedPlan.source.lockfileSha256 || fileHash(resolve(root, "pnpm-lock.yaml")) !== report.source.lockfileSha256) throw new Error("Source report identity mismatch");
  if (!hex.test(report.source.stagedSourceSha256) || !hex.test(candidate.sha256) || fileHash(inside(root, candidate.path)) !== candidate.sha256) throw new Error("Invalid source or plan digest");
  for (const p of candidate.packages) {
    const bytes = readFileSync(inside(root, p.tarball));
    if (hash(bytes) !== p.sha256 || `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== p.integrity) throw new Error(`Candidate archive changed: ${p.name}`);
  }
  const required = [...CREATE_AURA3D_TEMPLATES, "react-import"];
  if (!Array.isArray(report.projects) || report.projects.length !== required.length || new Set(report.projects.map(p => p.template)).size !== required.length || required.some(name => !report.projects.some(p => p.template === name))) throw new Error("Source consumer project inventory is incomplete");
  if (!report.toolVersions?.node || !report.toolVersions?.npm) throw new Error("Missing consumer tool versions");
  if (!Array.isArray(report.checks) || !report.checks.length || new Set(report.checks.map(c => c.id)).size !== report.checks.length || report.checks.some(c => c.status !== "passed" || c.exitCode !== 0 || !Array.isArray(c.command) || c.command.length === 0 || !existsSync(inside(root, c.logPath)))) throw new Error("Source consumer checks failed or were skipped");
  if (!report.checks.some(c => c.id === "launcher:install" && c.project === "launcher")) throw new Error("Missing launcher installation check");
  const portableProjects = report.projects.filter(project => project.retention === "portable-v1");
  const packedProjects = report.projects.filter(project => project.retention === "packed-v1");
  if ((portableProjects.length && portableProjects.length !== report.projects.length) ||
      (packedProjects.length && packedProjects.length !== report.projects.length)) throw new Error("Consumer report mixes retention formats");
  if (portableProjects.length || packedProjects.length) verifyConsumerLogs(root, report);
  if (portableProjects.length) {
    checkedInput(root, relative(root, resolve(root, reportPath)).split(sep).join("/"), "file");
    if (!report.source.manifest || !hex.test(report.source.manifest.sha256 ?? "") ||
        hash(readPortableFile(root, report.source.manifest.path, 16 * 1024 * 1024)) !== report.source.manifest.sha256 ||
        portableProjects.some(project => JSON.stringify(project.sourceManifest) !== JSON.stringify(report.source.manifest))) {
      throw new Error("Portable consumer source manifest identity changed");
    }
    if (!Array.isArray(report.candidateReviews)) throw new Error("Portable consumer candidate reviews are missing");
    const candidateReviews = stagedCandidateReviews(root, report.runId, expectedPlan, report.source.manifest, report.candidateReviews);
    if (portableProjects.some(project => JSON.stringify(normalizeReviewReferences(project.candidateReviews)) !== JSON.stringify(candidateReviews))) {
      throw new Error("Portable consumer projects do not share the staged candidate reviews");
    }
  }
  for (const project of report.projects) {
    const expectedPath = project.template === "react-import" ? `tests/reports/native-consumers/${report.runId}/projects/react-import` : `tests/reports/native-consumers/${report.runId}/projects/templates/${project.template}/demo`;
    if (project.path !== expectedPath || project.kind !== (project.template === "react-import" ? "fixture" : "template")) throw new Error(`Unexpected consumer project path: ${project.template}`);
    if (project.retention === "portable-v1") {
      // Portable reports never rely on retained node_modules. Their complete
      // graph and local archive snapshots are checked before later use.
      preparePortableProject(root, project, expectedPlan);
    } else if (project.retention === "packed-v1") {
      assertRetainedPackedProject(root, project, expectedPlan);
    } else {
      if (project.retention !== undefined) throw new Error("Unsupported consumer retention format");
      // Historical synthetic fixtures still exercise their original contract.
      const dir = inside(root, project.path);
      if (!existsSync(inside(dir, project.entry))) throw new Error(`Missing project entry: ${project.template}`);
      if (fileHash(resolve(dir, "package.json")) !== project.manifestSha256 || fileHash(resolve(dir, "package-lock.json")) !== project.lockfileSha256 || hashConsumerProject(dir) !== project.projectSha256) throw new Error(`Consumer project changed: ${project.template}`);
      if (!Array.isArray(project.installedPackages) || !project.installedPackages.length) throw new Error(`Missing installed candidate identities: ${project.template}`);
      for (const installed of project.installedPackages) {
        const p = expectedPlan.packages.find(entry => entry.name === installed.name);
        if (!p || p.version !== installed.version || p.sha256 !== installed.sha256 || p.integrity !== installed.integrity || contentsFor(dir, installed.installPath) !== installed.contentsSha256) throw new Error(`Installed candidate changed: ${project.template}/${installed.name}`);
      }
      const observation = inspectInstalledRelease(root, dir, expectedPlan);
      if (!observation.packages.length) throw new Error(`No installed candidate lock identities: ${project.template}`);
      const actual = installedPackages(dir, expectedPlan);
      if (JSON.stringify(actual) !== JSON.stringify(project.installedPackages)) throw new Error(`Installed candidate inventory changed: ${project.template}`);
    }
    for (const requiredCheck of [...(project.kind === "template" ? ["scaffold"] : []), "install", "build"]) if (!report.checks.some(c => c.project === project.template && c.id === `${project.template}:${requiredCheck}`)) throw new Error(`Missing ${requiredCheck} check: ${project.template}`);
  }
  if (!Array.isArray(report.browser) || report.browser.length !== CREATE_AURA3D_TEMPLATES.length || new Set(report.browser.map(c => c.id)).size !== CREATE_AURA3D_TEMPLATES.length || CREATE_AURA3D_TEMPLATES.some(id => !report.browser.some(c => c.id === id)) || report.browser.some(c => c.status !== "not-run")) throw new Error("Source browser cells must remain not-run");
  return report;
}

function runCommand(root: string, reportDir: string, project: string, id: string, cmd: string, args: string[], cwd: string,
  options: { env?: NodeJS.ProcessEnv; direct?: boolean } = {}): NativeConsumerCheck {
  let output = "";
  let status = 0;
  try {
    output = execFileSync(cmd, cmd === "npm" && !options.direct ? withNpmTransport(args) : args, { cwd, env: options.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    status = typeof failure.status === "number" && failure.status !== 0 ? failure.status : 1;
    output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}\n${failure.message ?? ""}`;
  }
  const logPath = relative(root, resolve(reportDir, "logs", `${project}-${id}.log`));
  mkdirSync(dirname(resolve(root, logPath)), { recursive: true });
  const safeOutput = redactText(output);
  writeFileSync(resolve(root, logPath), safeOutput);
  return { id: `${project}:${id}`, project, command: [cmd, ...args], status: status === 0 ? "passed" : "failed", exitCode: status, logPath,
    logSize: Buffer.byteLength(safeOutput), logSha256: hash(safeOutput) };
}

function installedPackages(project: string, plan: ExactReleasePlan): NativeConsumerProject["installedPackages"] {
  const manifest = JSON.parse(readFileSync(resolve(project, "package.json"), "utf8")) as Record<string, Record<string, string>>;
  const directNames = new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies }));
  const lock = JSON.parse(readFileSync(resolve(project, "package-lock.json"), "utf8")) as { packages?: Record<string, unknown> };
  if (!lock.packages || typeof lock.packages !== "object") throw new Error("Missing npm installed package inventory");
  const list: NativeConsumerProject["installedPackages"] = [];
  for (const installPath of Object.keys(lock.packages).sort()) {
    if (!installPath || !installPath.includes("node_modules/")) continue;
    const p = plan.packages.find(entry => installPath.endsWith(`node_modules/${entry.name}`));
    if (!p) {
      if (/(?:^|\/)node_modules\/@aura3d\//.test(installPath)) throw new Error(`Installed Aura package is absent from candidate: ${installPath}`);
      continue;
    }
    list.push({ name: p.name, installPath, version: p.version, sha256: p.sha256, integrity: p.integrity, contentsSha256: contentsFor(project, installPath) });
  }
  for (const name of directNames) if (plan.packages.some(p => p.name === name) && !list.some(p => p.name === name && p.installPath === `node_modules/${name}`)) throw new Error(`Missing candidate dependency ${name}`);
  if (!list.length) throw new Error("No installed candidate packages");
  return list;
}

interface BundleFile { path: string; size: number; sha256: string }
interface BundleAsset extends BundleFile { target: string }
interface BundleProject { id: string; manifest: BundleFile; lockfile: BundleFile; archives: NativeConsumerArchive[]; assets: BundleAsset[] }
interface PreparedBundleProject {
  id: string; manifestBytes: Buffer; lockBytes: Buffer; manifest: Record<string, unknown>; lock: PortableLock;
  archives: NativeConsumerArchive[]; assets: BundleAsset[]; readBytes: (path: string) => Uint8Array;
  admission: PortableSnapshot["admission"];
  receipt: ReturnType<typeof verifyArchiveAdmission>["receipt"];
}
const canonicalObject = (value: unknown): string => JSON.stringify(value, function (_key, item: unknown) {
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item;
});
export const createPortableSourceEnvironment = (root: string, sourceManifestPath: string): NodeJS.ProcessEnv => {
  const allowed = new Set(["PATH", "TMPDIR", "LANG", "LC_ALL", "TZ", "CI", "SYSTEMROOT", "WINDIR"]);
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key))),
    AURA3D_SOURCE_PROCESS_GUARD: "1", AURA3D_SOURCE_MANIFEST: sourceManifestPath,
    NODE_OPTIONS: `--import=${pathToFileURL(resolve(root, "tools/remote-acr/source-checks.mjs")).href}`,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1", PLAYWRIGHT_BROWSERS_PATH: "/nonexistent/aura3d-browsers-disabled",
    PUPPETEER_SKIP_DOWNLOAD: "1", PUPPETEER_EXECUTABLE_PATH: "/nonexistent/aura3d-browser-disabled", DISPLAY: "" };
};

/** Read, bind and admit the complete pre-supplied input graph before executing code. */
function prepareSourceBundle(root: string, runId: string, plan: ExactReleasePlan, bundlePath: string, sourceManifestPath: string): {
  projects: PreparedBundleProject[]; sourceManifest: { path: string; sha256: string }; candidateReviews: CandidateReviewReference[];
} {
  const sourceManifestBytes = readPortableFile(root, sourceManifestPath, 16 * 1024 * 1024);
  const sourceManifest = { path: sourceManifestPath, sha256: hash(sourceManifestBytes) };
  const bundleBytes = readPortableFile(root, bundlePath, 16 * 1024 * 1024);
  const bundle = JSON.parse(bundleBytes.toString("utf8")) as {
    schema?: string; candidatePlanSha256?: string; sourceManifestSha256?: string; projects?: BundleProject[];
  };
  const required = ["launcher", ...CREATE_AURA3D_TEMPLATES, "react-import"];
  if (bundle.schema !== "aura3d.portable-consumer-input/1" || bundle.candidatePlanSha256 !== plan.reference.sha256 ||
      bundle.sourceManifestSha256 !== sourceManifest.sha256 || !Array.isArray(bundle.projects) || bundle.projects.length !== required.length ||
      new Set(bundle.projects.map(item => item.id)).size !== required.length || required.some(id => !bundle.projects!.some(item => item.id === id))) {
    throw new Error("Portable consumer input bundle does not bind the complete candidate and source inventory");
  }
  const candidateReviews = stagedCandidateReviews(root, runId, plan, sourceManifest, undefined, { path: bundlePath, sha256: hash(bundleBytes) });
  if (process.env.AURA3D_CANDIDATE_REVIEWS_JSON !== undefined) {
    let supplied: unknown;
    try { supplied = JSON.parse(process.env.AURA3D_CANDIDATE_REVIEWS_JSON); } catch { throw new Error("Invalid candidate reviews environment value"); }
    if (JSON.stringify(normalizeReviewReferences(supplied)) !== JSON.stringify(candidateReviews)) throw new Error("Candidate reviews environment differs from staged sidecar");
  }
  const snapshots = new Map<string, Buffer>();
  let total = 0;
  const snapshot = (item: BundleFile, limit: number): Buffer => {
    if (!item || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > limit || !hex.test(item.sha256 ?? "")) throw new Error("Invalid portable consumer input file identity");
    const existing = snapshots.get(item.path);
    if (existing) {
      if (existing.byteLength !== item.size || hash(existing) !== item.sha256) throw new Error("Conflicting portable input file identity");
      return existing;
    }
    const bytes = readPortableFile(root, item.path, limit);
    if (bytes.byteLength !== item.size || hash(bytes) !== item.sha256) throw new Error("Portable consumer input file changed");
    total += bytes.byteLength;
    if (total > 512 * 1024 * 1024) throw new Error("Portable consumer input bundle exceeds its byte limit");
    snapshots.set(item.path, bytes);
    return bytes;
  };
  const projects = required.map(id => {
    const input = bundle.projects!.find(item => item.id === id)!;
    const manifestBytes = snapshot(input.manifest, 16 * 1024 * 1024), lockBytes = snapshot(input.lockfile, 16 * 1024 * 1024);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>;
    const lock = JSON.parse(lockBytes.toString("utf8")) as PortableLock;
    if (!Array.isArray(input.archives) || !input.archives.length || !Array.isArray(input.assets)) throw new Error("Portable consumer input archives and assets are required");
    let previous = "";
    for (const item of input.archives) {
      if (typeof item.resolved !== "string" || !item.resolved || (previous && previous >= item.resolved) ||
          typeof item.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity)) throw new Error("Portable consumer input archive inventory is invalid");
      const bytes = snapshot(item, MAX_PORTABLE_ARCHIVE);
      if ("sha512-" + createHash("sha512").update(bytes).digest("base64") !== item.integrity) throw new Error("Portable consumer input archive integrity changed");
      if (item.resolved.startsWith("file:")) {
        const local = item.resolved.slice(5).replace(/^\.\//, "");
        assertSafeRelative(local);
        if (!/^tarballs\/[A-Za-z0-9._-]+\.tgz$/.test(local)) throw new Error("Portable local archives must use the project tarballs directory");
      }
      previous = item.resolved;
    }
    const targets = new Set<string>();
    for (const item of input.assets) {
      assertSafeRelative(item.target);
      if (targets.has(item.target) || item.target.split("/").some(part => excluded.has(part.toLowerCase()))) throw new Error("Duplicate or unsafe portable asset target");
      for (const part of item.target.split("/")) assertPublicName(part);
      targets.add(item.target); snapshot(item, MAX_PORTABLE_ARCHIVE);
    }
    const readBytes = (path: string): Uint8Array => {
      const bytes = snapshots.get(path);
      if (!bytes) throw new Error("Portable input snapshot is missing");
      return Uint8Array.from(bytes);
    };
    const { capability, receipt } = verifyArchiveAdmission({ root, planPath: plan.reference.path, sourceManifestPath,
      manifestBytes, lockBytes, archives: input.archives.map(item => ({ resolved: item.resolved, bytes: readBytes(item.path) })), candidateReviews });
    const admission = { capability, manifestBytes, lockBytes };
    assertIndependentNpmConsumer({ manifest, lock, archives: input.archives, readArchive: readBytes, candidatePackages: plan.packages, admission });
    return { id, manifestBytes, lockBytes, manifest, lock, archives: input.archives, assets: input.assets, readBytes, admission, receipt };
  });
  const launcher = projects[0];
  const deps = launcher.manifest.dependencies as Record<string, string> | undefined;
  if (launcher.manifest.name !== "aura3d-scaffold-launcher" || launcher.manifest.private !== true || launcher.manifest.type !== "module" ||
      canonicalObject(Object.keys(deps ?? {}).sort()) !== canonicalObject(["@aura3d/asset-index", "create-aura3d"]) ||
      canonicalObject(launcher.manifest) !== canonicalObject({ name: "aura3d-scaffold-launcher", private: true, type: "module", dependencies: deps }) ||
      launcher.assets.length) throw new Error("Portable launcher manifest is invalid");
  const react = projects.find(item => item.id === "react-import")!;
  const reactDeps = react.manifest.dependencies as Record<string, string> | undefined;
  const expectedReact = { name: "aura3d-react-source-consumer", private: true, type: "module", scripts: { build: "tsc --noEmit" },
    dependencies: { "@aura3d/engine": reactDeps?.["@aura3d/engine"], "@aura3d/react": reactDeps?.["@aura3d/react"], react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: { typescript: "^5.8.3", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" } };
  if (typeof reactDeps?.["@aura3d/engine"] !== "string" || typeof reactDeps?.["@aura3d/react"] !== "string" ||
      canonicalObject(react.manifest) !== canonicalObject(expectedReact)) throw new Error("Portable React consumer manifest is invalid");
  // The candidate's own manifest fixes exactly which missing template assets
  // may be supplied, so a bundle cannot substitute arbitrary project files.
  const create = plan.packages.find(item => item.name === "create-aura3d");
  if (!create) throw new Error("Candidate scaffold package is missing");
  const createArchive = launcher.archives.find(item => item.sha256 === create.sha256);
  if (!createArchive) throw new Error("Candidate scaffold archive is missing from the launcher graph");
  const assetFile = inspectNpmArchive(launcher.readBytes(createArchive.path)).files.find(file => file.path === "template-assets.json");
  const assetManifest = assetFile ? JSON.parse(Buffer.from(assetFile.bytes).toString("utf8")) as { schema?: string; templates?: Record<string, { path: string; bytes: number; sha256: string }[]> } : undefined;
  if (assetManifest && assetManifest.schema !== "create-aura3d/template-assets@1") throw new Error("Candidate template asset manifest is invalid");
  for (const project of projects.slice(1)) {
    const expected = (assetManifest?.templates?.[project.id] ?? []).map(item => ({ target: item.path, size: item.bytes, sha256: item.sha256 })).sort((a, b) => a.target.localeCompare(b.target));
    const actual = project.assets.map(item => ({ target: item.target, size: item.size, sha256: item.sha256 })).sort((a, b) => a.target.localeCompare(b.target));
    if (canonicalObject(expected) !== canonicalObject(actual)) throw new Error("Portable template assets differ from the candidate archive: " + project.id);
  }
  return { projects, sourceManifest, candidateReviews };
}

/** Validate a fully supplied bundle without starting npm or executing package code. */
export function validatePortableConsumerInputBundle(root: string, runId: string, plan: ExactReleasePlan, bundlePath: string, sourceManifestPath: string): {
  projectIds: string[]; sourceManifest: { path: string; sha256: string }; candidateReviews: CandidateReviewReference[];
} {
  const prepared = prepareSourceBundle(root, runId, plan, bundlePath, sourceManifestPath);
  return { projectIds: prepared.projects.map(project => project.id), sourceManifest: prepared.sourceManifest, candidateReviews: prepared.candidateReviews };
}

function writeSafeSnapshot(directory: string, path: string, bytes: Uint8Array, allowReplacement = false): void {
  assertSafeRelative(path);
  const rootStat = lstatSync(directory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Portable output root is not a real directory");
  let parent = directory;
  const parts = path.split("/");
  for (const part of parts.slice(0, -1)) {
    assertPublicName(part);
    parent = resolve(parent, part);
    if (!existsSync(parent)) mkdirSync(parent);
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Portable output has an unsafe ancestor");
  }
  assertPublicName(parts[parts.length - 1]);
  const target = resolve(parent, parts[parts.length - 1]);
  if (existsSync(target) || (() => { try { return lstatSync(target).isSymbolicLink(); } catch { return false; } })()) {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || (!allowReplacement && !readFileSync(target).equals(bytes))) throw new Error("Portable input would overwrite a different or unsafe project file");
  }
  writeFileSync(target, bytes);
}

function writePortableInputs(directory: string, project: PreparedBundleProject): void {
  writeSafeSnapshot(directory, "package.json", project.manifestBytes, true);
  writeSafeSnapshot(directory, "package-lock.json", project.lockBytes);
  for (const item of project.archives) {
    if (!item.resolved.startsWith("file:")) continue;
    writeSafeSnapshot(directory, item.resolved.slice(5).replace(/^\.\//, ""), project.readBytes(item.path));
  }
}

function retainPortableTree(source: string, target: string): void {
  cpSync(source, target, { recursive: true, dereference: false, errorOnExist: true, force: false, filter: (path) => {
    const rel = relative(source, path).split(sep).join("/");
    if (!rel) return true;
    const parts = rel.split("/");
    if (parts.some(part => excluded.has(part.toLowerCase())) || rel === "tests/reports") return false;
    for (const part of parts) assertPublicName(part);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("Unsafe retained consumer file");
    return true;
  } });
  const prune = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) prune(resolve(dir, entry.name));
    if (dir !== target && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  };
  prune(target);
}

async function runSource(root: string, runId: string, plan: ExactReleasePlan): Promise<void> {
  const bundlePath = process.env.NATIVE_CONSUMER_BUNDLE_INPUT, stagedManifestPath = process.env.AURA3D_SOURCE_MANIFEST;
  // Without a pre-supplied portable bundle, run the ordinary packed-consumer
  // install of the plan's archives (5.0 decision record item 1).
  if (!bundlePath) { await runPackedSource(root, runId, plan); return; }
  if (!stagedManifestPath) throw new Error("PORTABLE_CONSUMER_SOURCE_PRODUCER_UNAVAILABLE: a portable input bundle requires its gate-bound AURA3D_SOURCE_MANIFEST");
  const sourceManifestPath = `tests/reports/native-capabilities/${runId}/source-manifest.json`;
  if (!readPortableFile(root, sourceManifestPath, 16 * 1024 * 1024).equals(readPortableFile(root, stagedManifestPath, 16 * 1024 * 1024))) {
    throw new Error("Gate-bound source manifest differs from the staged input");
  }
  const prepared = prepareSourceBundle(root, runId, plan, bundlePath, sourceManifestPath);
  const reportDir = resolve(root, "tests/reports/native-consumers", runId);
  if (existsSync(reportDir)) throw new Error(`Run ID already exists: ${runId}`);
  const scratch = mkdtempSync(resolve(tmpdir(), "aura3d-native-consumers-")), env = createPortableSourceEnvironment(root, sourceManifestPath);
  const checks: NativeConsumerCheck[] = [], projects: NativeConsumerProject[] = [];
  let complete = false;
  mkdirSync(resolve(reportDir, "logs"), { recursive: true });
  try {
    const run = (project: string, id: string, cmd: string, args: string[], cwd: string): void => {
      const check = runCommand(root, reportDir, project, id, cmd, args, cwd, { env, direct: true });
      checks.push(check);
      if (check.status !== "passed") throw new Error(`Portable consumer ${project}:${id} failed`);
    };
    const install = async (project: PreparedBundleProject, directory: string): Promise<void> => {
      const cache = mkdtempSync(resolve(tmpdir(), "aura3d-consumer-cache-"));
      try {
        await seedVerifiedNpmCache({ lock: project.lock, archives: project.archives, readArchive: project.readBytes, cacheDir: cache, admission: project.admission });
        assertIndependentNpmConsumer({ manifest: project.manifest, lock: project.lock, archives: project.archives, readArchive: project.readBytes, candidatePackages: plan.packages, admission: project.admission });
        if (fileHash(resolve(directory, "package.json")) !== hash(project.manifestBytes) || fileHash(resolve(directory, "package-lock.json")) !== hash(project.lockBytes)) throw new Error("Portable install graph changed");
        for (const item of project.archives) if (item.resolved.startsWith("file:") &&
            !readPortableFile(directory, item.resolved.slice(5).replace(/^\.\//, ""), MAX_PORTABLE_ARCHIVE).equals(project.readBytes(item.path))) {
          throw new Error("Portable local archive changed before installation");
        }
        run(project.id, "install", "npm", ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier", "--cache", cache, "--userconfig", devNull, "--globalconfig", devNull], directory);
        assertInstalledArchiveSet(directory, project.lock, project.archives, project.readBytes, project.admission);
      } finally { rmSync(cache, { recursive: true, force: true }); }
    };
    const launcher = prepared.projects[0], launcherDir = resolve(scratch, "launcher");
    mkdirSync(launcherDir); writePortableInputs(launcherDir, launcher); await install(launcher, launcherDir);
    const npmVersion = execFileSync("npm", ["--version"], { cwd: scratch, env, encoding: "utf8" }).trim();
    const scaffold = 'import {createA3DProject} from "create-aura3d"; const result=createA3DProject({targetDir:process.argv[1],template:process.argv[2],agent:"all",skills:"core"}); console.log(JSON.stringify(result));';
    for (const project of prepared.projects.slice(1)) {
      const isTemplate = project.id !== "react-import";
      const directory = isTemplate ? resolve(scratch, "templates", project.id, "demo") : resolve(scratch, "react-import");
      mkdirSync(dirname(directory), { recursive: true });
      const substitutions: NativeConsumerProject["substitutions"] = [];
      if (isTemplate) {
        run(project.id, "scaffold", process.execPath, ["--input-type=module", "-e", scaffold, directory, project.id], launcherDir);
        const generated = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as Record<string, unknown>;
        for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
          const before = generated[section] as Record<string, string> | undefined;
          const after = project.manifest[section] as Record<string, string> | undefined;
          for (const [name, value] of Object.entries(before ?? {})) {
            if (!plan.packages.some(item => item.name === name)) continue;
            if (typeof after?.[name] !== "string") throw new Error("Portable scaffold candidate substitution is missing");
            substitutions.push({ section, name, before: value, after: after[name] }); before![name] = after[name];
          }
        }
        if (!substitutions.length || canonicalObject(generated) !== canonicalObject(project.manifest)) throw new Error("Portable scaffold manifest differs from its admitted graph");
        for (const asset of project.assets) {
          writeSafeSnapshot(directory, asset.target, project.readBytes(asset.path));
        }
      } else {
        mkdirSync(resolve(directory, "src"), { recursive: true });
        writeFileSync(resolve(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", jsx: "react-jsx", strict: true, skipLibCheck: true }, include: ["src"] }, null, 2));
        writeFileSync(resolve(directory, "src/main.tsx"), 'import { AuraCanvas } from "@aura3d/react";\nexport { AuraCanvas };\n');
      }
      writePortableInputs(directory, project);
      const pristine = hashConsumerProject(directory, { includeDist: false });
      await install(project, directory);
      inspectInstalledRelease(root, directory, plan);
      const installed = installedPackages(directory, plan);
      run(project.id, "build", "npm", ["run", "build"], directory);
      assertInstalledArchiveSet(directory, project.lock, project.archives, project.readBytes, project.admission);
      if (JSON.stringify(installedPackages(directory, plan)) !== JSON.stringify(installed)) throw new Error("Portable installed candidate changed during build: " + project.id);
      if (hashConsumerProject(directory, { includeDist: false }) !== pristine) throw new Error("Portable consumer build changed scaffold source: " + project.id);
      const retained = isTemplate ? resolve(reportDir, "projects/templates", project.id, "demo") : resolve(reportDir, "projects/react-import");
      mkdirSync(dirname(retained), { recursive: true }); retainPortableTree(directory, retained);
      const archives: NativeConsumerArchive[] = project.archives.map(item => {
        const path = `tests/reports/native-consumers/${runId}/dependency-archives/${item.sha256}.tgz`;
        const target = inside(root, path), bytes = project.readBytes(item.path);
        mkdirSync(dirname(target), { recursive: true });
        if (existsSync(target) && !readFileSync(target).equals(bytes)) throw new Error("Portable retained archive identity collision");
        if (!existsSync(target)) writeFileSync(target, bytes, { flag: "wx" });
        return { resolved: item.resolved, path, size: item.size, sha256: item.sha256, integrity: item.integrity };
      });
      projects.push({ template: project.id, kind: isTemplate ? "template" : "fixture", path: relative(root, retained).split(sep).join("/"),
        entry: isTemplate ? (project.id === "animation-studio" ? "src/render-live-route.ts" : "src/main.ts") : "src/main.tsx", retention: "portable-v1",
        sourceManifest: prepared.sourceManifest, candidateReviews: prepared.candidateReviews, admission: project.receipt, files: inventoryPortableConsumerFiles(retained), archives, manifestSha256: fileHash(resolve(retained, "package.json")),
        lockfileSha256: fileHash(resolve(retained, "package-lock.json")), projectSha256: hashConsumerProject(retained), installedPackages: installed, substitutions });
    }
    const report: NativeConsumerReport = { schema: "aura3d.native-consumers/1", phase: "source", runId, pass: true,
      source: { revision: plan.source.commit, stagedSourceSha256: plan.source.fingerprint, lockfileSha256: plan.source.lockfileSha256, manifest: prepared.sourceManifest },
      candidate: { path: plan.reference.path, sha256: plan.reference.sha256, version: plan.version, packages: plan.packages }, candidateReviews: prepared.candidateReviews,
      toolVersions: { node: process.version, npm: npmVersion }, projects, checks, browser: CREATE_AURA3D_TEMPLATES.map(id => ({ id, status: "not-run" })) };
    writeFileSync(resolve(reportDir, "source.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    validateSourceConsumerReport(root, relative(root, resolve(reportDir, "source.json")), plan);
    complete = true;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    if (!complete) rmSync(reportDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Packed-consumer producer (5.0 decision record item 1). The custody runner is
// dropped; the source pass installs the packed candidate tarballs into fresh
// temporary consumers inside the ACR job. Candidate identity stays bound: each
// archive's SHA-256/SRI is checked against the validated plan before it is
// copied, the generated lock must pin every candidate entry to the plan SRI,
// installed candidate contents are recorded, and only candidate dependency
// specifiers are substituted in the untouched scaffold.
// ---------------------------------------------------------------------------

export const PACKED_CANDIDATE_DIR = ".aura3d-candidate";
type PlanPackage = ExactReleasePlan["packages"][number] & { internalDependencies?: string[] };
export interface PackedConsumerRunner {
  (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): { status: number; output: string };
}
const defaultPackedRunner: PackedConsumerRunner = (command, args, cwd, env) => {
  try {
    const output = execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    return { status: 0, output: String(output ?? "") };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    return { status: typeof failure.status === "number" && failure.status !== 0 ? failure.status : 1,
      output: `${failure.stdout ?? ""}\n${failure.stderr ?? ""}\n${failure.message ?? ""}` };
  }
};

/** Install env: no host npm config/credentials, private cache and home, no browser downloads. */
export function packedConsumerEnvironment(cache: string, home: string): NodeJS.ProcessEnv {
  const allowed = new Set(["PATH", "TMPDIR", "LANG", "LC_ALL", "TZ", "CI", "SYSTEMROOT", "WINDIR",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]);
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key))),
    HOME: home, USERPROFILE: home, npm_config_cache: cache, npm_config_userconfig: devNull, npm_config_globalconfig: devNull,
    npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1", PUPPETEER_SKIP_DOWNLOAD: "1" };
}

/** Candidate archive bytes, rechecked against the plan's SHA-256 and SRI. */
function candidateArchive(root: string, pkg: PlanPackage): Buffer {
  const bytes = readFileSync(inside(root, pkg.tarball));
  if (hash(bytes) !== pkg.sha256 || `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== pkg.integrity) {
    throw new Error(`Candidate archive changed: ${pkg.name}`);
  }
  return bytes;
}

/** Direct candidate names plus their internal dependency closure, in plan order. */
export function candidateClosure(plan: ExactReleasePlan, direct: Iterable<string>): PlanPackage[] {
  const packages = plan.packages as PlanPackage[];
  const pending = [...direct], names = new Set<string>();
  while (pending.length) {
    const name = pending.shift()!;
    if (names.has(name)) continue;
    const entry = packages.find(item => item.name === name);
    if (!entry) throw new Error(`Candidate package is missing: ${name}`);
    names.add(name);
    pending.push(...(entry.internalDependencies ?? []));
  }
  return packages.filter(item => names.has(item.name));
}

// npm's canonical relative form, so neither the manifest nor the lock is rewritten.
const packedSpec = (pkg: PlanPackage): string => `file:${PACKED_CANDIDATE_DIR}/${basename(pkg.tarball)}`;

/**
 * Replace only candidate dependency specifiers with the staged archives and pin
 * the remaining internal closure with `overrides`. Every change is recorded.
 */
export function substitutePackedCandidates(manifest: Record<string, unknown>, plan: ExactReleasePlan): { closure: PlanPackage[]; substitutions: NativeConsumerProject["substitutions"] } {
  const substitutions: NativeConsumerProject["substitutions"] = [];
  const direct = new Set<string>();
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = manifest[section] as Record<string, string> | undefined;
    for (const [name, value] of Object.entries(deps ?? {})) {
      const pkg = (plan.packages as PlanPackage[]).find(item => item.name === name);
      if (!pkg) {
        if (name.startsWith("@aura3d/") || name === "create-aura3d") throw new Error(`Scaffold depends on a package absent from the candidate: ${name}`);
        continue;
      }
      const after = packedSpec(pkg);
      substitutions.push({ section, name, before: value, after });
      deps![name] = after;
      direct.add(name);
    }
  }
  if (!direct.size) throw new Error("Scaffold has no candidate dependency to substitute");
  const closure = candidateClosure(plan, direct);
  const transitive = closure.filter(pkg => !direct.has(pkg.name));
  if (transitive.length) {
    if (manifest.overrides !== undefined) throw new Error("Scaffold already declares overrides; candidate pinning would change them");
    manifest.overrides = Object.fromEntries(transitive.map(pkg => [pkg.name, packedSpec(pkg)]));
    for (const pkg of transitive) substitutions.push({ section: "overrides", name: pkg.name, before: "", after: packedSpec(pkg) });
  }
  return { closure, substitutions };
}

function stagePackedArchives(root: string, directory: string, closure: PlanPackage[]): void {
  mkdirSync(resolve(directory, PACKED_CANDIDATE_DIR), { recursive: true });
  if (new Set(closure.map(pkg => basename(pkg.tarball))).size !== closure.length) throw new Error("Duplicate candidate archive filename");
  for (const pkg of closure) writeFileSync(resolve(directory, PACKED_CANDIDATE_DIR, basename(pkg.tarball)), candidateArchive(root, pkg), { flag: "wx" });
}

/**
 * Bind an installed packed consumer to the plan: every staged archive is the
 * exact candidate, every candidate lock entry carries the plan SRI and points
 * at the staged archive, and no Aura3D package came from anywhere else.
 */
export function assertPackedInstall(root: string, directory: string, plan: ExactReleasePlan, closure: PlanPackage[]): NativeConsumerProject["installedPackages"] {
  for (const pkg of closure) {
    if (!readFileSync(resolve(directory, PACKED_CANDIDATE_DIR, basename(pkg.tarball))).equals(candidateArchive(root, pkg))) {
      throw new Error(`Staged candidate archive changed: ${pkg.name}`);
    }
  }
  const lock = JSON.parse(readFileSync(resolve(directory, "package-lock.json"), "utf8")) as { packages?: Record<string, { resolved?: string; integrity?: string; link?: boolean; version?: string }> };
  if (!lock.packages || typeof lock.packages !== "object") throw new Error("Missing npm installed package inventory");
  for (const [path, entry] of Object.entries(lock.packages)) {
    const match = path.match(/(?:^|\/)node_modules\/((?:@aura3d\/[^/]+)|create-aura3d)$/);
    if (!match) continue;
    const pkg = closure.find(item => item.name === match[1]);
    if (!pkg) throw new Error(`Installed Aura package is outside the candidate closure: ${path}`);
    if (entry.link === true || entry.integrity !== pkg.integrity || entry.resolved !== packedSpec(pkg)) {
      throw new Error(`Installed candidate lock identity mismatch: ${path}`);
    }
  }
  inspectInstalledRelease(root, directory, plan);
  const installed = installedPackages(directory, plan);
  for (const pkg of closure) if (!installed.some(item => item.name === pkg.name)) throw new Error(`Candidate package was not installed: ${pkg.name}`);
  return installed;
}

/** The candidate scaffold's large-asset manifest, read from the archive itself. */
function candidateTemplateAssets(root: string, plan: ExactReleasePlan): Record<string, { path: string; bytes: number; sha256: string }[]> {
  const create = (plan.packages as PlanPackage[]).find(item => item.name === "create-aura3d");
  if (!create) throw new Error("Candidate scaffold package is missing");
  const file = inspectNpmArchive(candidateArchive(root, create)).files.find(item => item.path === "template-assets.json");
  if (!file) return {};
  const manifest = JSON.parse(Buffer.from(file.bytes).toString("utf8")) as { schema?: string; templates?: Record<string, { path: string; bytes: number; sha256: string }[]> };
  if (manifest.schema !== "create-aura3d/template-assets@1" || !manifest.templates || typeof manifest.templates !== "object") throw new Error("Candidate template asset manifest is invalid");
  return manifest.templates;
}

/**
 * Supply large template assets the npm archive omits (normally fetched from the
 * tagged release) from the staged source tree, admitted only by the exact size
 * and digest listed in the candidate archive.
 */
function supplyTemplateAssets(root: string, template: string, directory: string, assets: { path: string; bytes: number; sha256: string }[]): void {
  for (const asset of assets) {
    assertSafeRelative(asset.path);
    const target = resolve(directory, asset.path);
    if (existsSync(target)) {
      if (fileHash(target) !== asset.sha256) throw new Error(`Scaffold asset differs from the candidate manifest: ${template}/${asset.path}`);
      continue;
    }
    const source = inside(root, `packages/create-aura3d/templates/${template}/${asset.path}`);
    const bytes = readFileSync(source);
    if (bytes.byteLength !== asset.bytes || hash(bytes) !== asset.sha256) throw new Error(`Template asset does not match the candidate manifest: ${template}/${asset.path}`);
    writeSafeSnapshot(directory, asset.path, bytes);
  }
}

export const REACT_IMPORT_MANIFEST = (engine: string, react: string): Record<string, unknown> => ({
  name: "aura3d-react-source-consumer", private: true, type: "module", scripts: { build: "tsc --noEmit" },
  dependencies: { "@aura3d/engine": engine, "@aura3d/react": react, react: "^19.0.0", "react-dom": "^19.0.0" },
  devDependencies: { typescript: "^5.8.3", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" }
});

/**
 * Ordinary isolated packed-consumer source phase: scaffold every template from
 * the packed create-aura3d archive, install the packed candidate with npm in a
 * fresh temporary project, build it, and retain the project (without
 * node_modules) together with its lock and staged candidate archives.
 */
export async function runPackedSource(root: string, runId: string, plan: ExactReleasePlan, runner: PackedConsumerRunner = defaultPackedRunner): Promise<NativeConsumerReport> {
  const reportDir = resolve(root, "tests/reports/native-consumers", runId);
  if (existsSync(reportDir)) throw new Error(`Run ID already exists: ${runId}`);
  const assets = candidateTemplateAssets(root, plan);
  const scratch = realpathSync(mkdtempSync(resolve(tmpdir(), "aura3d-packed-consumers-")));
  const cache = resolve(scratch, ".npm-cache"), home = resolve(scratch, ".home");
  mkdirSync(cache); mkdirSync(home);
  const env = packedConsumerEnvironment(cache, home);
  const checks: NativeConsumerCheck[] = [], projects: NativeConsumerProject[] = [];
  let complete = false;
  mkdirSync(resolve(reportDir, "logs"), { recursive: true });
  const run = (project: string, id: string, cmd: string, args: string[], cwd: string): void => {
    const result = runner(cmd, args, cwd, env);
    const logPath = relative(root, resolve(reportDir, "logs", `${project}-${id}.log`)).split(sep).join("/");
    const safeOutput = redactText(result.output);
    writeFileSync(resolve(root, logPath), safeOutput);
    const check: NativeConsumerCheck = { id: `${project}:${id}`, project, command: [cmd, ...args], status: result.status === 0 ? "passed" : "failed",
      exitCode: result.status, logPath, logSize: Buffer.byteLength(safeOutput), logSha256: hash(safeOutput) };
    checks.push(check);
    if (check.status !== "passed") throw new Error(`Packed consumer ${project}:${id} failed (log ${logPath})`);
  };
  const npmInstall = ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier", "--cache", cache, "--userconfig", devNull, "--globalconfig", devNull];
  try {
    const launcherDir = resolve(scratch, "launcher");
    mkdirSync(launcherDir);
    const launcherManifest: Record<string, unknown> = { name: "aura3d-scaffold-launcher", private: true, type: "module", dependencies: { "create-aura3d": plan.version } };
    const launcherSubstitution = substitutePackedCandidates(launcherManifest, plan);
    stagePackedArchives(root, launcherDir, launcherSubstitution.closure);
    writeFileSync(resolve(launcherDir, "package.json"), `${JSON.stringify(launcherManifest, null, 2)}\n`);
    run("launcher", "install", "npm", npmInstall, launcherDir);
    assertPackedInstall(root, launcherDir, plan, launcherSubstitution.closure);
    const npmVersion = runner("npm", ["--version"], scratch, env).output.trim();
    if (!npmVersion) throw new Error("npm version is unavailable");
    const scaffold = 'import {createA3DProject} from "create-aura3d"; const result=createA3DProject({targetDir:process.argv[1],template:process.argv[2],agent:"all",skills:"core"}); console.log(JSON.stringify(result));';
    for (const id of [...CREATE_AURA3D_TEMPLATES, "react-import"]) {
      const isTemplate = id !== "react-import";
      const directory = isTemplate ? resolve(scratch, "templates", id, "demo") : resolve(scratch, "react-import");
      mkdirSync(dirname(directory), { recursive: true });
      let manifest: Record<string, unknown>;
      if (isTemplate) {
        run(id, "scaffold", process.execPath, ["--input-type=module", "-e", scaffold, directory, id], launcherDir);
        supplyTemplateAssets(root, id, directory, assets[id] ?? []);
        manifest = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as Record<string, unknown>;
      } else {
        mkdirSync(resolve(directory, "src"), { recursive: true });
        writeFileSync(resolve(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", jsx: "react-jsx", strict: true, skipLibCheck: true }, include: ["src"] }, null, 2));
        writeFileSync(resolve(directory, "src/main.tsx"), 'import { AuraCanvas } from "@aura3d/react";\nexport { AuraCanvas };\n');
        manifest = REACT_IMPORT_MANIFEST(plan.version, plan.version);
      }
      const { closure, substitutions } = substitutePackedCandidates(manifest, plan);
      stagePackedArchives(root, directory, closure);
      writeFileSync(resolve(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      const pristine = hashConsumerProject(directory, { includeDist: false });
      run(id, "install", "npm", npmInstall, directory);
      const installed = assertPackedInstall(root, directory, plan, closure);
      if (hashConsumerProject(directory, { includeDist: false }) !== pristine) throw new Error("Packed consumer install changed scaffold source: " + id);
      run(id, "build", "npm", ["run", "build"], directory);
      if (JSON.stringify(assertPackedInstall(root, directory, plan, closure)) !== JSON.stringify(installed)) throw new Error("Packed installed candidate changed during build: " + id);
      if (hashConsumerProject(directory, { includeDist: false }) !== pristine) throw new Error("Packed consumer build changed scaffold source: " + id);
      const retained = isTemplate ? resolve(reportDir, "projects/templates", id, "demo") : resolve(reportDir, "projects/react-import");
      mkdirSync(dirname(retained), { recursive: true });
      retainPortableTree(directory, retained);
      projects.push({ template: id, kind: isTemplate ? "template" : "fixture", path: relative(root, retained).split(sep).join("/"),
        entry: isTemplate ? (id === "animation-studio" ? "src/render-live-route.ts" : "src/main.ts") : "src/main.tsx", retention: "packed-v1",
        files: inventoryPortableConsumerFiles(retained), manifestSha256: fileHash(resolve(retained, "package.json")),
        lockfileSha256: fileHash(resolve(retained, "package-lock.json")), projectSha256: hashConsumerProject(retained), installedPackages: installed, substitutions });
    }
    const report: NativeConsumerReport = { schema: "aura3d.native-consumers/1", phase: "source", runId, pass: true,
      source: { revision: plan.source.commit, stagedSourceSha256: plan.source.fingerprint, lockfileSha256: plan.source.lockfileSha256 },
      candidate: { path: plan.reference.path, sha256: plan.reference.sha256, version: plan.version, packages: plan.packages },
      toolVersions: { node: process.version, npm: npmVersion }, projects, checks, browser: CREATE_AURA3D_TEMPLATES.map(id => ({ id, status: "not-run" })) };
    writeFileSync(resolve(reportDir, "source.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    validateSourceConsumerReport(root, relative(root, resolve(reportDir, "source.json")), plan);
    complete = true;
    return report;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    if (!complete) rmSync(reportDir, { recursive: true, force: true });
  }
}

/** Verify a retained packed project against the plan without installing it. */
function assertRetainedPackedProject(root: string, project: NativeConsumerProject, plan: ExactReleasePlan): string {
  const dir = inside(root, project.path);
  if (!existsSync(inside(dir, project.entry))) throw new Error(`Missing project entry: ${project.template}`);
  if (fileHash(resolve(dir, "package.json")) !== project.manifestSha256 || fileHash(resolve(dir, "package-lock.json")) !== project.lockfileSha256 ||
      hashConsumerProject(dir) !== project.projectSha256) throw new Error(`Consumer project changed: ${project.template}`);
  const files = inventoryPortableConsumerFiles(dir);
  if (!Array.isArray(project.files) || canonicalObject(project.files) !== canonicalObject(files)) throw new Error(`Packed consumer file inventory changed: ${project.template}`);
  const manifest = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
  if (!Array.isArray(project.substitutions) || !project.substitutions.length) throw new Error(`Packed consumer substitutions are missing: ${project.template}`);
  const names = new Set<string>();
  for (const item of project.substitutions) {
    const pkg = (plan.packages as PlanPackage[]).find(entry => entry.name === item.name);
    if (!pkg || item.after !== packedSpec(pkg) || manifest[item.section]?.[item.name] !== item.after) throw new Error(`Packed consumer substitution is not a candidate archive: ${project.template}/${item.name}`);
    names.add(item.name);
  }
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "overrides"]) {
    for (const [name, value] of Object.entries(manifest[section] ?? {})) {
      if (typeof value === "string" && value.startsWith("file:") && !project.substitutions.some(item => item.section === section && item.name === name)) {
        throw new Error(`Packed consumer has an unrecorded local dependency: ${project.template}/${name}`);
      }
    }
  }
  const closure = candidateClosure(plan, names);
  const staged = readdirSync(resolve(dir, PACKED_CANDIDATE_DIR)).sort();
  if (canonicalObject(staged) !== canonicalObject(closure.map(pkg => basename(pkg.tarball)).sort())) throw new Error(`Packed consumer archive set differs from its candidate closure: ${project.template}`);
  for (const pkg of closure) if (!readFileSync(resolve(dir, PACKED_CANDIDATE_DIR, basename(pkg.tarball))).equals(candidateArchive(root, pkg))) {
    throw new Error(`Retained candidate archive changed: ${project.template}/${pkg.name}`);
  }
  const lock = JSON.parse(readFileSync(resolve(dir, "package-lock.json"), "utf8")) as { packages?: Record<string, { integrity?: string; resolved?: string }> };
  for (const installed of project.installedPackages ?? []) {
    const pkg = closure.find(entry => entry.name === installed.name);
    const entry = lock.packages?.[installed.installPath];
    if (!pkg || installed.version !== pkg.version || installed.sha256 !== pkg.sha256 || installed.integrity !== pkg.integrity ||
        !entry || entry.integrity !== pkg.integrity || !hex.test(installed.contentsSha256 ?? "")) throw new Error(`Installed candidate changed: ${project.template}/${installed.name}`);
  }
  if (closure.some(pkg => !project.installedPackages.some(item => item.name === pkg.name))) throw new Error(`Packed consumer candidate inventory is incomplete: ${project.template}`);
  return dir;
}

/**
 * Restore a retained packed project into a new temporary directory: copy it,
 * run a lock-pinned `npm ci`, then recheck the candidate lock identities and
 * every installed candidate package against the source-phase record.
 */
export async function restorePackedConsumerProject(root: string, project: NativeConsumerProject, destination: string, plan: ExactReleasePlan,
  runner: PackedConsumerRunner = defaultPackedRunner): Promise<void> {
  if (project.retention !== "packed-v1") throw new Error("Packed consumer project required");
  const retained = assertRetainedPackedProject(root, project, plan);
  if (!isAbsolute(destination) || existsSync(destination)) throw new Error("Packed restore requires a new absolute destination");
  const parent = realpathSync(dirname(destination));
  const rel = relative(realpathSync(tmpdir()), parent), fromRoot = relative(realpathSync(root), parent);
  const inRepository = !fromRoot || (fromRoot !== ".." && !fromRoot.startsWith(".." + sep) && !isAbsolute(fromRoot));
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel) || inRepository) throw new Error("Packed restore destination must be in a temporary workspace outside the repository");
  const work = mkdtempSync(resolve(tmpdir(), "aura3d-packed-restore-"));
  let restored = false;
  try {
    cpSync(retained, destination, { recursive: true, dereference: false, errorOnExist: true, force: false });
    if (hashConsumerProject(destination) !== project.projectSha256) throw new Error(`Packed restore inputs differ: ${project.template}`);
    const cache = resolve(work, "cache"), home = resolve(work, "home");
    mkdirSync(cache); mkdirSync(home);
    const result = runner("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--no-update-notifier", "--cache", cache, "--userconfig", devNull, "--globalconfig", devNull],
      destination, packedConsumerEnvironment(cache, home));
    if (result.status !== 0) throw new Error(`Packed restore install failed for ${project.template}: ${redactText(result.output).slice(-4000)}`);
    if (fileHash(resolve(destination, "package.json")) !== project.manifestSha256 || fileHash(resolve(destination, "package-lock.json")) !== project.lockfileSha256 ||
        hashConsumerProject(destination) !== project.projectSha256) throw new Error(`Packed restore changed source or lock: ${project.template}`);
    const closure = candidateClosure(plan, new Set(project.substitutions.map(item => item.name)));
    const installed = assertPackedInstall(root, destination, plan, closure);
    if (JSON.stringify(installed) !== JSON.stringify(project.installedPackages)) throw new Error(`Restored candidate changed: ${project.template}`);
    restored = true;
  } finally {
    rmSync(work, { recursive: true, force: true });
    if (!restored) rmSync(destination, { recursive: true, force: true });
  }
}

async function runBrowser(root: string, runId: string, sourcePath: string, gatePath: string, plan: ExactReleasePlan): Promise<void> {
  // The gate is evaluated before any browser subprocess is provisioned.
  const gateModulePath = "../native-capability-gate/index.mjs";
  const gateModule = await import(gateModulePath) as { validateAcceptanceGate: (options: { root: string; gatePath: string; sourceReport: string }) => unknown };
  gateModule.validateAcceptanceGate({ root, gatePath, sourceReport: sourcePath });
  const source = validateSourceConsumerReport(root, sourcePath, plan);
  if (source.runId !== runId) throw new Error("Source report run ID mismatch");
  const reportDir = resolve(root, "tests/reports/native-consumers", runId);
  const out = resolve(reportDir, "browser.json");
  if (existsSync(out)) throw new Error("Browser report already exists");
  const work = mkdtempSync(resolve(tmpdir(), "aura3d-consumer-browser-"));
  try {
    const checks: NativeConsumerCheck[] = [];
    for (const project of source.projects.filter(p => p.kind === "template")) {
      const destination = resolve(work, project.template);
      if (project.retention === "packed-v1") await restorePackedConsumerProject(root, project, destination, plan);
      else if (project.retention === "portable-v1") await restorePortableConsumerProject(root, project, destination, plan);
      else throw new Error("Browser acceptance requires portable or packed consumer projects");
      checks.push(runCommand(root, reportDir, project.template, "browser", "npm", ["run", "test:browser"], destination));
    }
    const report = { schema: "aura3d.native-consumers/1", phase: "browser", runId, pass: checks.length === CREATE_AURA3D_TEMPLATES.length && checks.every(c => c.status === "passed"), sourceReport: { path: sourcePath, sha256: fileHash(inside(root, sourcePath)) }, candidate: source.candidate, source: source.source, toolVersions: source.toolVersions, checks };
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    if (!report.pass) process.exitCode = 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function main(argv: string[] = process.argv.slice(2), root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")): Promise<void> {
  function arg(name: string): string | undefined {
    const index = argv.indexOf(name);
    if (index < 0) return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || argv.lastIndexOf(name) !== index) throw new Error(`${name} requires one value`);
    return value;
  }
  const phase = arg("--phase");
  const runId = arg("--run-id");
  const source = arg("--source-report");
  const gate = arg("--gate") ?? "tests/reports/native-capabilities/code-complete-go.json";
  const candidatePath = arg("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
  if (phase === "verify") {
    // Release check: re-verify a retained source report against the current plan.
    const reportPath = source ?? process.env.NATIVE_CONSUMER_SOURCE_REPORT;
    if (!reportPath || runId) throw new Error("Usage: --phase verify --source-report <path> [--candidate-plan <path>]");
    if (!candidatePath) throw new Error("A validated --candidate-plan or A3D_RELEASE_PLAN is required");
    const verifyPlan = loadValidatedReleasePlan(root, candidatePath);
    if (!verifyPlan) throw new Error("Candidate plan is required");
    const report = validateSourceConsumerReport(root, reportPath, verifyPlan);
    console.log(`Clean-install source report verified: ${report.projects.length} projects, ${report.checks.length} checks (${reportPath})`);
    return;
  }
  if ((phase !== "source" && phase !== "browser") || !runId || !SLUG.test(runId)) throw new Error("Usage: --phase source|browser --run-id <id> [--candidate-plan <path>] [--source-report <path>] [--gate <path>] | --phase verify --source-report <path>");
  if (!candidatePath) throw new Error("A validated --candidate-plan or A3D_RELEASE_PLAN is required");
  const plan = loadValidatedReleasePlan(root, candidatePath);
  if (!plan) throw new Error("Candidate plan is required");
  if (phase === "source") {
    if (source) throw new Error("--source-report is only valid for browser phase");
    await runSource(root, runId, plan);
  } else {
    if (!source) throw new Error("Browser phase requires --source-report");
    await runBrowser(root, runId, source, gate, plan);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
