import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { loadValidatedReleasePlan } from "../release/exact-release-plan.mjs";

/** A deliberately bounded reader: archives are data, never installed or executed. */
const MAX_ARCHIVE = 128 * 1024 * 1024;
const MAX_UNPACKED = 512 * 1024 * 1024;
const MAX_FILES = 100_000;
const MAX_DECLARATIONS = 64 * 1024 * 1024;
const MAX_RUNTIME_FILE = 8 * 1024 * 1024;
const MAX_RUNTIME_DATA = 128 * 1024 * 1024;
const MAX_NESTED_MANIFEST_DATA = 8 * 1024 * 1024;
export interface PackageManifest {
  name: string;
  version: string;
  type?: string;
  exports?: unknown;
  main?: string;
  types?: string;
  typings?: string;
  bin?: string | Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}
export interface PackedPackage {
  manifest: PackageManifest;
  files: Map<string, Buffer>;
  paths: string[];
  /** Packed paths intentionally not retained because they exceeded a bound. */
  unavailableFiles?: Map<string, string>;
}
export interface BaselinePackage {
  name: string;
  version: string;
  metadataOrigin: string;
  metadata: string;
  metadataSha256: string;
  archiveOrigin: string;
  integrity: string;
  sha256: string;
  archive: string;
  declarations: { path: string; sha256: string }[];
}
export interface BaselineManifest {
  schema: "aura3d.public-api-baseline/1";
  version: string;
  candidatePlanSha256: string;
  packages: BaselinePackage[];
}
export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
export const sha512 = (bytes: Uint8Array): string => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

function tarString(block: Buffer, start: number, length: number): string {
  return block.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
}
function tarNumber(text: string): number {
  const value = text.replace(/\0.*$/s, "").trim();
  if (!/^[0-7]*$/.test(value)) throw new Error("Unsupported tar numeric field");
  return value ? parseInt(value, 8) : 0;
}
function safePath(path: string): string {
  if (!path.startsWith("package/") || path.includes("\\") || path.includes("\0") || path.split("/").some((p) => p === ".." || p === ".")) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
  return path.slice("package/".length);
}

/** Retains bounded declarations, runtime JS and package scopes as archive data.
 * Rejects links, duplicate paths and malformed headers; never extracts or runs JS. */
export function readPackageArchive(bytes: Buffer): PackedPackage {
  if (bytes.length === 0 || bytes.length > MAX_ARCHIVE) throw new Error("Archive exceeds compressed size limit");
  const tar = gunzipSync(bytes, { maxOutputLength: MAX_UNPACKED });
  const files = new Map<string, Buffer>();
  const paths: string[] = [];
  const seen = new Set<string>();
  const unavailableFiles = new Map<string, string>();
  let declarationBytes = 0;
  let runtimeBytes = 0;
  let nestedManifestBytes = 0;
  let ended = false;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) { ended = true; break; }
    const storedChecksum = tarNumber(tarString(header, 148, 8));
    let actualChecksum = 0;
    for (let i = 0; i < 512; i++) actualChecksum += i >= 148 && i < 156 ? 32 : header[i]!;
    if (storedChecksum !== actualChecksum) throw new Error("Invalid tar header checksum");
    const prefix = tarString(header, 345, 155);
    const name = tarString(header, 0, 100);
    const path = safePath(prefix ? `${prefix}/${name}` : name);
    const type = tarString(header, 156, 1);
    const size = tarNumber(tarString(header, 124, 12));
    const bodyStart = offset + 512;
    if (bodyStart + size > tar.length) throw new Error("Truncated archive entry");
    if (!["", "0", "5"].includes(type)) throw new Error(`Unsupported tar entry type ${type} at ${path}`);
    if (seen.has(path)) throw new Error(`Duplicate archive path: ${path}`);
    seen.add(path);
    if (seen.size > MAX_FILES) throw new Error("Archive contains too many files");
    if (type !== "5") {
      paths.push(path);
      if (path === "package.json" || /\.d\.(?:m|c)?ts$/i.test(path)) {
        declarationBytes += size;
        if (declarationBytes > MAX_DECLARATIONS) throw new Error("Declaration data exceeds limit");
        files.set(path, Buffer.from(tar.subarray(bodyStart, bodyStart + size)));
      } else if (path.endsWith("/package.json")) {
        nestedManifestBytes += size;
        if (nestedManifestBytes > MAX_NESTED_MANIFEST_DATA) unavailableFiles.set(path, "Nested package manifest data exceeds limit");
        else files.set(path, Buffer.from(tar.subarray(bodyStart, bodyStart + size)));
      } else if (/\.(?:m|c)?js$/i.test(path)) {
        if (size > MAX_RUNTIME_FILE) unavailableFiles.set(path, "Runtime file exceeds per-file size limit");
        else if (runtimeBytes + size > MAX_RUNTIME_DATA) unavailableFiles.set(path, "Runtime data exceeds aggregate size limit");
        else {
          runtimeBytes += size;
          files.set(path, Buffer.from(tar.subarray(bodyStart, bodyStart + size)));
        }
      }
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  if (!ended) throw new Error("Archive has no terminating tar block");
  const manifestBytes = files.get("package.json");
  if (!manifestBytes) throw new Error("Archive missing package.json");
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as PackageManifest;
  if (!manifest.name || !manifest.version) throw new Error("Archive missing package identity");
  return { manifest, files, paths: paths.sort(), unavailableFiles };
}

export function declarationList(pkg: PackedPackage): { path: string; sha256: string }[] {
  return [...pkg.files].filter(([path]) => /\.d\.(?:m|c)?ts$/i.test(path))
    .map(([path, bytes]) => ({ path, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
}
export function verifyPackedIdentity(pkg: PackedPackage, name: string, version: string): void {
  if (pkg.manifest.name !== name || pkg.manifest.version !== version) throw new Error(`Archive identity mismatch for ${name}@${version}`);
}
const parseVersion = (value: string): number[] | null => {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
};
function compareVersion(a: string, b: string): number {
  const av = parseVersion(a), bv = parseVersion(b);
  if (!av || !bv) throw new Error(`Invalid stable package version: ${a}, ${b}`);
  return av[0]! - bv[0]! || av[1]! - bv[1]! || av[2]! - bv[2]!;
}
/** Select from an engine registry metadata snapshot; an explicit version may
 * confirm that selection but must not replace it with an older release. */
export function previousReleaseVersion(versions: Record<string, unknown>, candidateVersion: string, requestedVersion?: string): string {
  if (!versions || typeof versions !== "object" || Array.isArray(versions) || !parseVersion(candidateVersion)) throw new Error("Invalid engine versions or candidate version");
  const previous = Object.keys(versions).filter((version) => parseVersion(version) && compareVersion(version, candidateVersion) < 0).sort(compareVersion).at(-1);
  if (!previous) throw new Error("No valid prior published release version");
  if (requestedVersion !== undefined && requestedVersion !== previous) throw new Error(`Baseline version ${requestedVersion} is not the immediately preceding stable release ${previous} in engine metadata for ${candidateVersion}`);
  return previous;
}
interface MetadataVersion { name: string; version: string; dist?: { tarball?: string; integrity?: string } }
interface Metadata { name: string; versions: Record<string, MetadataVersion> }
async function fetchLimited(url: string, limit: number): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "registry.npmjs.org" || parsed.username || parsed.password) throw new Error(`Untrusted registry URL: ${url}`);
  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Registry request failed: ${url} (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) { await reader.cancel(); throw new Error(`Registry response exceeds limit: ${url}`); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
async function metadataFor(name: string): Promise<{ metadata: Metadata; origin: string; bytes: Buffer }> {
  const origin = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const bytes = await fetchLimited(origin, 16 * 1024 * 1024);
  const metadata = JSON.parse(bytes.toString("utf8")) as Metadata;
  if (metadata.name !== name || !metadata.versions || typeof metadata.versions !== "object") throw new Error(`Invalid registry metadata for ${name}`);
  return { metadata, origin, bytes };
}

/** Fetch only the reviewed prior inventory. The plan is validated before any request. */
export async function prepareBaseline(planPath: string, outputPath: string, previousVersion?: string): Promise<BaselineManifest> {
  const plan = loadValidatedReleasePlan(process.cwd(), planPath);
  if (!plan) throw new Error("A validated candidate plan is required");
  const engine = await metadataFor("@aura3d/engine");
  const version = previousReleaseVersion(engine.metadata.versions, plan.version, previousVersion);
  // Query a reviewed name inventory, including names removed from the candidate.
  // If the shared inventory cannot supply the prior release, fail rather than omit it.
  const inventory = await import("../release/release-inventory.mjs") as { publicPackageNames?: (v: string) => readonly string[] };
  if (typeof inventory.publicPackageNames !== "function") throw new Error("Versioned public package name inventory is required for baseline preparation");
  const names = [...inventory.publicPackageNames(version)];
  if (names.length === 0 || new Set(names).size !== names.length || !names.includes("@aura3d/engine")) throw new Error("Invalid prior package inventory");
  const output = resolve(outputPath);
  const archivesDir = join(dirname(output), `${basename(output, ".json")}-archives`);
  mkdirSync(archivesDir, { recursive: true });
  const packages: BaselinePackage[] = [];
  for (const name of names.sort()) {
    const { metadata, origin, bytes: metadataBytes } = name === "@aura3d/engine" ? engine : await metadataFor(name);
    const published: MetadataVersion | undefined = metadata.versions[version];
    if (!published || published.name !== name || published.version !== version || !published.dist?.tarball || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(published.dist.integrity ?? "")) throw new Error(`Missing verified prior release metadata for ${name}@${version}`);
    const archive = await fetchLimited(published.dist.tarball, MAX_ARCHIVE);
    if (sha512(archive) !== published.dist.integrity) throw new Error(`Registry integrity mismatch for ${name}@${version}`);
    const packed = readPackageArchive(archive);
    verifyPackedIdentity(packed, name, version);
    const declarations = declarationList(packed);
    if (declarations.length === 0) throw new Error(`No declarations in ${name}@${version}`);
    const digest = sha256(archive);
    const filename = `${digest}.tgz`;
    const metadataDigest = sha256(metadataBytes);
    const metadataFilename = `${metadataDigest}.json`;
    writeFileSync(join(archivesDir, filename), archive);
    writeFileSync(join(archivesDir, metadataFilename), metadataBytes);
    packages.push({ name, version, metadataOrigin: origin, metadata: `${basename(archivesDir)}/${metadataFilename}`, metadataSha256: metadataDigest, archiveOrigin: published.dist.tarball, integrity: published.dist.integrity!, sha256: digest, archive: `${basename(archivesDir)}/${filename}`, declarations });
  }
  const baseline: BaselineManifest = { schema: "aura3d.public-api-baseline/1", version, candidatePlanSha256: plan.reference.sha256, packages };
  writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}
function option(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = option("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
  const output = option("--out");
  if (!plan || !output) throw new Error("Usage: prepare-baseline --candidate-plan <plan> --out <manifest> [--baseline-version <version>]");
  await prepareBaseline(plan, output, option("--baseline-version"));
}
