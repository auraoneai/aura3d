import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

/** A dependency name is matched exactly, not by mentions in comments or prose. */
export const DEFAULT_PROHIBITED_PACKAGES = [
  "three", "babylonjs", "@babylonjs/core", "@babylonjs/loaders", "playcanvas",
  "@react-three/fiber", "@react-three/drei"
] as const;

export type DependencySource = "manifest" | "payload" | "lock-importer" | "lock-package" | "lock-snapshot" | "lock-catalog" | "npm-lock-package" | "override";
export type DependencyField = "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies" | "bundledDependencies" | "transitivePeerDependencies" | "peerBindings" | "packageIdentity" | "overrides" | "catalog";

export interface DependencyEdge {
  readonly source: DependencySource;
  /** Manifest path, importer path, lock package/snapshot key, or override owner. */
  readonly owner: string;
  /** Lockfile that contains this edge, for multi-profile audits. */
  readonly document?: string;
  readonly field: DependencyField;
  readonly name: string;
  readonly resolvedName: string;
  /** Explicit alias target before an override changed the locked resolution. */
  readonly specifierName?: string;
  readonly specifier: string;
  readonly resolution?: string;
  /** Full override selector, including nested parent/version qualifiers. */
  readonly selector?: string;
  /** Dependency whose lock resolution contains this peer binding. */
  readonly via?: string;
  readonly alias: boolean;
  readonly optional: boolean;
}

export interface ManifestInventory {
  readonly path: string;
  readonly name: string | null;
  readonly version: string | null;
  readonly private: boolean;
  readonly source: "workspace" | "profile" | "payload";
}

export interface AuditInput {
  readonly path: string;
  readonly kind: "manifest" | "workspace" | "lockfile" | "payload";
  readonly sha256: string;
}

export interface DependencyFinding {
  readonly name: string;
  readonly edge: DependencyEdge;
  /** A lock entry may be stale or unreachable and requires review. */
  readonly disposition: "declared-dependency" | "lock-review" | "override-review";
}

export interface DependencyGraphReport {
  readonly files: AuditInput[];
  readonly manifests: ManifestInventory[];
  readonly lockPackages: string[];
  readonly lockSnapshots: string[];
  readonly npmLockPackages: NpmLockPackage[];
  readonly installProfiles: { readonly path: string; readonly lockfile: string | null; readonly lockVersion: string | null }[];
  readonly payloadEntries: { readonly container: string; readonly path: string; readonly sha256: string; readonly size: number }[];
  readonly edges: DependencyEdge[];
  readonly findings: DependencyFinding[];
  readonly limitations: readonly string[];
}

export interface DependencyGraphOptions {
  /** Already built tarballs or extracted package directories; never fetched here. */
  readonly payloads?: readonly string[];
  /** Standalone installation directories outside the root pnpm workspace. */
  readonly installProfiles?: readonly string[];
  readonly prohibitedPackages?: readonly string[];
}

interface ParsedLock {
  readonly packages: string[];
  readonly snapshots: string[];
  readonly edges: DependencyEdge[];
}

export interface NpmLockPackage {
  readonly document: string;
  readonly path: string;
  readonly installedName: string;
  readonly name: string;
  readonly version: string | null;
  readonly integrity: string | null;
  readonly resolved: string | null;
  readonly license: string | null;
  readonly dev: boolean;
  readonly optional: boolean;
  readonly peer: boolean;
  readonly devOptional: boolean;
  readonly inBundle: boolean;
  readonly link: boolean;
}

type JsonObject = Record<string, unknown>;
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
const ignoredDirectories = new Set(["node_modules", ".git", ".cache", "dist", "coverage"]);

/**
 * Inventory every declared workspace and supplied package payload. Findings are
 * evidence of declarations or lock candidates; they do not establish authorship,
 * execution, reachability, or the absence of copied code.
 *
 * The supported lock format is pnpm v9. Unknown versions and malformed audit
 * inputs fail closed rather than silently producing a partial report.
 */
export function collectDependencyGraph(root: string, options: DependencyGraphOptions = {}): DependencyGraphReport {
  const base = resolve(root);
  const files: AuditInput[] = [];
  const manifests: ManifestInventory[] = [];
  const edges: DependencyEdge[] = [];
  const payloadEntries: { container: string; path: string; sha256: string; size: number }[] = [];
  const npmLockPackages: NpmLockPackage[] = [];
  const installProfiles: { path: string; lockfile: string | null; lockVersion: string | null }[] = [];
  const rootManifestPath = join(base, "package.json");
  const rootManifest = readJson(rootManifestPath);
  const manifestPaths = new Set<string>([rootManifestPath]);
  const workspaceFile = join(base, "pnpm-workspace.yaml");
  const workspacePatterns = manifestWorkspacePatterns(rootManifest);
  if (existsSync(workspaceFile)) {
    const bytes = readFileSync(workspaceFile);
    files.push(inputRecord(base, workspaceFile, "workspace", bytes));
    const workspace = parseWorkspaceYaml(bytes.toString("utf8"));
    workspacePatterns.push(...workspace.patterns);
    for (const [selector, specifier] of workspace.overrides) {
      edges.push(makeOverride("pnpm-workspace.yaml", selector, specifier));
    }
    edges.push(...workspace.edges);
  }
  for (const path of expandWorkspacePatterns(base, workspacePatterns)) manifestPaths.add(path);
  for (const path of [...manifestPaths].sort()) {
    const bytes = readFileSync(path);
    files.push(inputRecord(base, path, "manifest", bytes));
    addManifest(JSON.parse(bytes.toString("utf8")), displayPath(base, path), "workspace", manifests, edges);
  }

  const lockfile = join(base, "pnpm-lock.yaml");
  if (!existsSync(lockfile)) throw new Error(`Missing pnpm lockfile: ${lockfile}`);
  const lockBytes = readFileSync(lockfile);
  files.push(inputRecord(base, lockfile, "lockfile", lockBytes));
  const lock = parsePnpmLock(lockBytes.toString("utf8"));
  edges.push(...lock.edges.map((edge) => ({ ...edge, document: "pnpm-lock.yaml" })));
  const lockPackages = [...lock.packages];
  const lockSnapshots = [...lock.snapshots];
  installProfiles.push({ path: ".", lockfile: "pnpm-lock.yaml", lockVersion: "pnpm:9.0" });

  for (const supplied of options.installProfiles ?? []) {
    const profile = resolve(base, supplied);
    if (profile === base) continue;
    if (lstatSync(profile).isSymbolicLink() || !statSync(profile).isDirectory()) throw new Error(`Install profile must be a directory, not a symlink: ${profile}`);
    const manifestPath = join(profile, "package.json");
    const profileName = displayPath(base, profile);
    if (!manifestPaths.has(manifestPath)) {
      const bytes = readFileSync(manifestPath);
      files.push(inputRecord(base, manifestPath, "manifest", bytes));
      addManifest(JSON.parse(bytes.toString("utf8")), displayPath(base, manifestPath), "profile", manifests, edges);
      manifestPaths.add(manifestPath);
    }
    const pnpmPath = join(profile, "pnpm-lock.yaml");
    const npmPath = join(profile, "package-lock.json");
    const yarnPath = join(profile, "yarn.lock");
    const locks = [pnpmPath, npmPath, yarnPath].filter(existsSync);
    if (locks.length > 1) throw new Error(`Multiple lockfiles require an explicit profile choice: ${profileName}`);
    if (!locks.length) {
      installProfiles.push({ path: profileName, lockfile: null, lockVersion: null });
      continue;
    }
    const lockPath = locks[0];
    if (lockPath === yarnPath) throw new Error(`Unsupported yarn lockfile for install profile ${profileName}`);
    const bytes = readFileSync(lockPath);
    const document = displayPath(base, lockPath);
    files.push(inputRecord(base, lockPath, "lockfile", bytes));
    if (lockPath === pnpmPath) {
      const parsed = parsePnpmLock(bytes.toString("utf8"));
      edges.push(...parsed.edges.map((edge) => ({ ...edge, document })));
      lockPackages.push(...parsed.packages.map((key) => `${document}#${key}`));
      lockSnapshots.push(...parsed.snapshots.map((key) => `${document}#${key}`));
      installProfiles.push({ path: profileName, lockfile: document, lockVersion: "pnpm:9.0" });
    } else {
      const parsed = parseNpmLock(bytes.toString("utf8"), document);
      edges.push(...parsed.edges);
      npmLockPackages.push(...parsed.packages);
      installProfiles.push({ path: profileName, lockfile: document, lockVersion: `npm:${parsed.version}` });
    }
  }

  for (const supplied of options.payloads ?? []) {
    const path = resolve(base, supplied);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Payload may not be a symlink: ${path}`);
    if (statSync(path).isDirectory()) {
      for (const entry of collectPayloadFiles(path)) {
        const bytes = readFileSync(entry);
        const label = displayPath(base, entry);
        payloadEntries.push({ container: displayPath(base, path), path: relative(path, entry).split(sep).join("/"), sha256: digest(bytes), size: bytes.length });
        if (entry.endsWith(`${sep}package.json`)) {
          files.push(inputRecord(base, entry, "manifest", bytes));
          addManifest(JSON.parse(bytes.toString("utf8")), label, "payload", manifests, edges);
        }
      }
    } else {
      const bytes = readPackedBytes(path);
      files.push(inputRecord(base, path, "payload", bytes));
      for (const entry of parsePackedPayload(bytes)) {
        const label = `${displayPath(base, path)}!/${entry.path}`;
        payloadEntries.push({ container: displayPath(base, path), path: entry.path, sha256: digest(entry.bytes), size: entry.bytes.length });
        if (entry.path.endsWith("/package.json")) {
          files.push({ path: label, kind: "manifest", sha256: digest(entry.bytes) });
          addManifest(JSON.parse(entry.bytes.toString("utf8")), label, "payload", manifests, edges);
        }
      }
    }
  }

  const prohibited = new Set(options.prohibitedPackages ?? DEFAULT_PROHIBITED_PACKAGES);
  const findings = edges.flatMap((edge): DependencyFinding[] => {
    const candidates = new Set([edge.resolvedName, ...(edge.specifierName ? [edge.specifierName] : []),
      ...(edge.source === "override" ? selectorPackages(edge.selector ?? edge.name) : [])]);
    return [...candidates].filter((name) => prohibited.has(name)).map((name) => ({
      name, edge,
      disposition: edge.source === "override" ? "override-review" : edge.source.startsWith("lock-") || edge.source === "npm-lock-package" ? "lock-review" : "declared-dependency"
    }));
  });
  return {
    files, manifests, lockPackages, lockSnapshots, npmLockPackages, installProfiles, payloadEntries, edges, findings,
    limitations: [
      "Lock entries include all snapshots and may include unreachable or platform-specific packages.",
      "Standalone profiles and payloads are inspected only when supplied; unlocked profiles do not provide a transitive graph.",
      "Source, generated code and runtime requests need separate audits.",
      "Package-name matches are review evidence and absence of a match does not establish independent authorship."
    ]
  };
}

function addManifest(raw: unknown, path: string, source: "workspace" | "profile" | "payload", manifests: ManifestInventory[], edges: DependencyEdge[]): void {
  const manifest = object(raw, `manifest ${path}`);
  manifests.push({ path, name: stringOrNull(manifest.name), version: stringOrNull(manifest.version), private: manifest.private === true, source });
  if (typeof manifest.name === "string") edges.push(makeEdge(source === "payload" ? "payload" : "manifest", path, "packageIdentity", manifest.name, typeof manifest.version === "string" ? manifest.version : ""));
  const peerMeta = optionalObject(manifest.peerDependenciesMeta);
  for (const field of dependencyFields) {
    const dependencies = optionalObject(manifest[field]);
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== "string") throw new Error(`${path}: ${field}.${name} must be a string`);
      const optional = field === "optionalDependencies" || (field === "peerDependencies" && optionalObject(peerMeta[name]).optional === true);
      edges.push(makeEdge(source === "payload" ? "payload" : "manifest", path, field, name, specifier, undefined, optional));
    }
  }
  const bundled = manifest.bundledDependencies ?? manifest.bundleDependencies;
  if (bundled !== undefined && bundled !== false) {
    const dependencies = optionalObject(manifest.dependencies);
    const names = bundled === true ? Object.keys(dependencies) : bundled;
    if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) throw new Error(`${path}: bundledDependencies must be a list or boolean`);
    for (const name of names) {
      const specifier = dependencies[name];
      if (specifier !== undefined && typeof specifier !== "string") throw new Error(`${path}: dependency ${name} must be a string`);
      edges.push(makeEdge(source === "payload" ? "payload" : "manifest", path, "bundledDependencies", name, typeof specifier === "string" ? specifier : ""));
    }
  }
  for (const [owner, value] of [["overrides", manifest.overrides], ["resolutions", manifest.resolutions], ["pnpm.overrides", optionalObject(manifest.pnpm).overrides]] as const) {
    if (value !== undefined) collectOverrides(value, `${path}:${owner}`, edges);
  }
  const patched = optionalObject(manifest.pnpm).patchedDependencies;
  if (patched !== undefined) collectOverrides(patched, `${path}:pnpm.patchedDependencies`, edges);
  const packageExtensions = optionalObject(manifest.pnpm).packageExtensions;
  if (packageExtensions !== undefined) {
    for (const [selector, rawExtension] of Object.entries(object(packageExtensions, `${path}:pnpm.packageExtensions`))) {
      const extension = object(rawExtension, `${path}:pnpm.packageExtensions.${selector}`);
      edges.push(makeOverride(`${path}:pnpm.packageExtensions`, selector, ""));
      const meta = optionalObject(extension.peerDependenciesMeta);
      for (const field of dependencyFields) {
        for (const [name, specifier] of Object.entries(optionalObject(extension[field]))) {
          if (typeof specifier !== "string") throw new Error(`${path}: package extension ${selector}.${field}.${name} must be a string`);
          const optional = field === "optionalDependencies" || (field === "peerDependencies" && optionalObject(meta[name]).optional === true);
          edges.push(makeEdge("override", `${path}:pnpm.packageExtensions>${selector}`, field, name, specifier, undefined, optional));
        }
      }
    }
  }
}

function collectOverrides(value: unknown, owner: string, edges: DependencyEdge[], ancestors: readonly string[] = []): void {
  for (const [selector, replacement] of Object.entries(object(value, owner))) {
    if (typeof replacement === "string") {
      edges.push(makeOverride(owner, [...ancestors, selector].join(">"), replacement));
    } else if (replacement !== null && typeof replacement === "object" && !Array.isArray(replacement)) {
      collectOverrides(replacement, `${owner}>${selector}`, edges, [...ancestors, selector]);
    } else throw new Error(`${owner}.${selector} must be a string or override mapping`);
  }
}

function selectorPackage(selector: string): string {
  const last = selector.split(">").map((part) => part.trim()).filter((part) => part && part !== ".").at(-1) ?? selector;
  return packageAndVersion(last)?.name ?? last;
}

function selectorPackages(selector: string): string[] {
  return selector.split(">").map((part) => part.trim()).filter((part) => part && part !== ".").map(selectorPackage);
}

function makeOverride(owner: string, selector: string, specifier: string): DependencyEdge {
  return { ...makeEdge("override", owner, "overrides", selectorPackage(selector), specifier), selector };
}

function makeEdge(source: DependencySource, owner: string, field: DependencyField, name: string, specifier: string, resolution?: string, optional = false): DependencyEdge {
  const specifiedName = aliasName(specifier);
  const actual = (resolution ? resolvedPackageName(resolution) : null) ?? specifiedName ?? name;
  return { source, owner, field, name, resolvedName: actual,
    ...(specifiedName && specifiedName !== actual ? { specifierName: specifiedName } : {}),
    specifier: redactDependencySpecifier(specifier), ...(resolution === undefined ? {} : { resolution: redactDependencySpecifier(resolution) }), alias: actual !== name, optional };
}

function redactDependencySpecifier(value: string): string {
  return value.includes("://") ? (redactResolved(value) ?? "") : value;
}

function aliasName(specifier: string): string | null {
  if (!specifier.startsWith("npm:") && !specifier.startsWith("workspace:")) return null;
  const value = specifier.slice(specifier.indexOf(":") + 1);
  return packageAndVersion(value)?.name ?? (validPackageName(value) ? value : null);
}

function resolvedPackageName(resolution: string): string | null {
  const normalized = resolution.startsWith("npm:") ? resolution.slice(4) : resolution;
  return packageAndVersion(normalized)?.name ?? null;
}

function validPackageName(name: string): boolean {
  return /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name);
}

function packageAndVersion(value: string): { name: string; version: string } | null {
  const match = /^((?:@[^/@]+\/)?[^/@]+)@(.+)$/.exec(value);
  return match && validPackageName(match[1]) ? { name: match[1], version: match[2] } : null;
}

/** npm 2/3 package-lock nodes retain location, version, peer and optional edges. */
export function parseNpmLock(text: string, document = "package-lock.json"): { version: number; packages: NpmLockPackage[]; edges: DependencyEdge[] } {
  const lock = object(JSON.parse(text), document);
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) throw new Error(`Unsupported npm lockfile version in ${document}: ${String(lock.lockfileVersion)}`);
  const packageMap = object(lock.packages, `${document}:packages`);
  if (!("" in packageMap)) throw new Error(`Missing root package in ${document}`);
  const packages: NpmLockPackage[] = [];
  const edges: DependencyEdge[] = [];
  for (const [path, raw] of Object.entries(packageMap)) {
    const entry = object(raw, `${document}:packages.${path}`);
    const nameFromPath = installedPackageName(path);
    const target = entry.link === true && typeof entry.resolved === "string" && packageMap[entry.resolved] !== undefined ? optionalObject(packageMap[entry.resolved]) : {};
    const name = stringOrNull(entry.name) ?? stringOrNull(target.name) ?? nameFromPath ?? (path === "" ? stringOrNull(lock.name) ?? "." : null);
    if (!name) throw new Error(`Cannot identify package ${document}:${path}`);
    const installedName = nameFromPath ?? name;
    const version = stringOrNull(entry.version);
    const owner = `${document}#${path || "."}`;
    packages.push({
      document, path, installedName, name, version,
      integrity: stringOrNull(entry.integrity), resolved: redactResolved(stringOrNull(entry.resolved)), license: stringOrNull(entry.license),
      dev: entry.dev === true, optional: entry.optional === true, peer: entry.peer === true,
      devOptional: entry.devOptional === true, inBundle: entry.inBundle === true, link: entry.link === true
    });
    edges.push({ ...makeEdge("npm-lock-package", owner, "packageIdentity", installedName, version ?? "", undefined, entry.optional === true), resolvedName: name, alias: name !== installedName, document });
    const registryName = registryTarballName(stringOrNull(entry.resolved));
    if (registryName && registryName !== name) {
      // A canonical tarball path is an additional review candidate, not proof
      // of the package's contents or authorship.
      edges.push({ ...makeEdge("npm-lock-package", owner, "packageIdentity", installedName, version ?? "", undefined, entry.optional === true),
        resolvedName: registryName, alias: registryName !== installedName, document });
    }
    const peerMeta = optionalObject(entry.peerDependenciesMeta);
    for (const field of dependencyFields) {
      for (const [dependency, specifier] of Object.entries(optionalObject(entry[field]))) {
        if (typeof specifier !== "string") throw new Error(`${owner}:${field}.${dependency} must be a string`);
        const optional = entry.optional === true || field === "optionalDependencies" || (field === "peerDependencies" && optionalObject(peerMeta[dependency]).optional === true);
        edges.push({ ...makeEdge("npm-lock-package", owner, field, dependency, specifier, undefined, optional), document });
      }
    }
    const bundled = entry.bundledDependencies ?? entry.bundleDependencies;
    if (bundled !== undefined && bundled !== false) {
      const dependencies = optionalObject(entry.dependencies);
      const names = bundled === true ? Object.keys(dependencies) : bundled;
      if (!Array.isArray(names) || !names.every((item) => typeof item === "string")) throw new Error(`${owner}: bundledDependencies must be a list or boolean`);
      for (const dependency of names) {
        const specifier = dependencies[dependency];
        if (specifier !== undefined && typeof specifier !== "string") throw new Error(`${owner}: dependency ${dependency} must be a string`);
        edges.push({ ...makeEdge("npm-lock-package", owner, "bundledDependencies", dependency, typeof specifier === "string" ? specifier : "", undefined, entry.optional === true), document });
      }
    }
    for (const field of ["overrides", "resolutions"] as const) {
      if (entry[field] !== undefined) {
        const first = edges.length;
        collectOverrides(entry[field], `${owner}:${field}`, edges);
        for (let i = first; i < edges.length; i++) edges[i] = { ...edges[i], document };
      }
    }
  }
  for (const field of ["overrides", "resolutions"] as const) {
    if (lock[field] !== undefined) {
      const first = edges.length;
      collectOverrides(lock[field], `${document}:${field}`, edges);
      for (let i = first; i < edges.length; i++) edges[i] = { ...edges[i], document };
    }
  }
  return { version: lock.lockfileVersion, packages, edges };
}

function registryTarballName(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const dash = parts.lastIndexOf("-");
    if (dash < 1 || dash !== parts.length - 2) return null;
    const basename = parts[dash - 1]!;
    const archive = parts[dash + 1]!;
    if (!archive.startsWith(`${basename}-`) || !archive.endsWith(".tgz")) return null;
    const scope = dash > 1 && parts[dash - 2]!.startsWith("@") ? `${parts[dash - 2]}/` : "";
    const name = `${scope}${basename}`;
    return validPackageName(name) ? name : null;
  } catch {
    return null;
  }
}

function installedPackageName(path: string): string | null {
  if (path === "") return null;
  const parts = path.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "") || path.includes("\\")) throw new Error(`Unsafe npm lock package path ${path}`);
  const index = parts.lastIndexOf("node_modules");
  if (index < 0) return null; // An npm workspace package outside node_modules.
  if (index + 1 >= parts.length) throw new Error(`Unsupported npm lock package path ${path}`);
  const remainder = parts.slice(index + 1);
  if ((remainder[0].startsWith("@") && remainder.length !== 2) || (!remainder[0].startsWith("@") && remainder.length !== 1)) throw new Error(`Unsupported npm lock package path ${path}`);
  const name = remainder.join("/");
  if (!validPackageName(name)) throw new Error(`Invalid npm lock package name ${name}`);
  return name;
}

function redactResolved(value: string | null): string | null {
  if (!value) return value;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

/** Parse the relevant pnpm 9 lock sections without loading or installing packages. */
export function parsePnpmLock(text: string): ParsedLock {
  const packages: string[] = [];
  const snapshots: string[] = [];
  const edges: DependencyEdge[] = [];
  let section = "";
  let owner = "";
  let group = "";
  let nestedName = "";
  let pending: { name: string; specifier?: string; version?: string } | undefined;
  let version = "";
  const importers = new Set<string>();
  const optionalPeers = new Set<string>();
  const addResolutionPeers = (source: "lock-importer" | "lock-package" | "lock-snapshot" | "lock-catalog", dependency: string,
    resolution: string | undefined, optional: boolean): void => {
    // Local paths and URLs are opaque, not pnpm's parenthesized peer suffixes.
    if (!resolution || !resolution.includes("(") || /^(?:link|file|https?|git|github):/i.test(resolution)) return;
    for (const peer of peerBindings(resolution)) {
      edges.push({ ...makeEdge(source, owner, "peerBindings", peer.name, peer.version, peer.version, optional), via: dependency });
    }
  };
  const flush = (): void => {
    if (!pending) return;
    if (!pending.specifier && !pending.version) throw new Error(`Incomplete lock importer dependency ${owner}:${pending.name}`);
    const source = section === "catalogs" ? "lock-catalog" : "lock-importer";
    const field = section === "catalogs" ? "catalog" : group as DependencyField;
    const optional = group === "optionalDependencies";
    edges.push(makeEdge(source, owner, field, pending.name, pending.specifier ?? pending.version!, pending.version, optional));
    addResolutionPeers(source, pending.name, pending.version, optional);
    pending = undefined;
  };
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/\t/.test(line.slice(0, line.length - line.trimStart().length))) throw new Error(`Unsupported tab indentation in pnpm lock line ${index + 1}`);
    const indent = line.length - line.trimStart().length;
    const content = line.slice(indent);
    if (indent === 0) {
      flush();
      const pair = yamlPair(content, index + 1);
      section = pair.key;
      owner = group = nestedName = "";
      if (section === "lockfileVersion") version = pair.value;
      continue;
    }
    if (section === "overrides" || section === "patchedDependencies") {
      if (indent === 2) {
        const pair = yamlPair(content, index + 1);
        if (!pair.value || pair.value.startsWith("{") || pair.value.startsWith("[")) throw new Error(`Unsupported lock override at line ${index + 1}`);
        edges.push(makeOverride(`pnpm-lock.yaml${section === "patchedDependencies" ? ":patchedDependencies" : ""}`, pair.key, pair.value));
      } else throw new Error(`Unsupported lock override at line ${index + 1}`);
      continue;
    }
    if (section === "catalogs") {
      if (indent === 2) {
        flush();
        const pair = yamlPair(content, index + 1);
        if (pair.value && pair.value !== "{}") throw new Error(`Unsupported lock catalog at line ${index + 1}`);
        owner = pair.key;
      } else if (indent === 4 && owner) {
        flush();
        const pair = yamlPair(content, index + 1);
        if (pair.value && (pair.value.startsWith("{") || pair.value.startsWith("["))) throw new Error(`Unsupported lock catalog dependency at line ${index + 1}`);
        pending = { name: pair.key, ...(pair.value ? { version: pair.value } : {}) };
      } else if (indent === 6 && pending) {
        const pair = yamlPair(content, index + 1);
        if (pair.key === "specifier") pending.specifier = pair.value;
        else if (pair.key === "version") pending.version = pair.value;
        else throw new Error(`Unsupported lock catalog field ${pair.key} at line ${index + 1}`);
      } else throw new Error(`Unsupported lock catalog syntax at line ${index + 1}`);
      continue;
    }
    if (!["importers", "packages", "snapshots"].includes(section)) continue;
    if (indent === 2) {
      flush();
      const pair = yamlPair(content, index + 1);
      owner = pair.key;
      group = nestedName = "";
      if (section === "importers") importers.add(owner);
      if (section === "packages") packages.push(owner);
      if (section === "snapshots") {
        snapshots.push(owner);
        for (const peer of peerBindings(owner)) edges.push(makeEdge("lock-snapshot", owner, "peerBindings", peer.name, peer.version, peer.version));
      }
      if (section === "packages" || section === "snapshots") {
        const parsed = packageAndVersion(owner);
        if (parsed) edges.push(makeEdge(section === "packages" ? "lock-package" : "lock-snapshot", owner, "packageIdentity", parsed.name, parsed.version));
      }
      if (pair.value && pair.value !== "{}") throw new Error(`Unsupported lock owner at line ${index + 1}`);
      continue;
    }
    if (!owner) throw new Error(`Lock entry missing owner at line ${index + 1}`);
    if (indent === 4) {
      flush();
      const pair = yamlPair(content, index + 1);
      group = pair.key;
      nestedName = "";
      if ((dependencyFields as readonly string[]).includes(group) || group === "transitivePeerDependencies" || group === "peerDependenciesMeta") {
        if (pair.value && pair.value !== "{}" && pair.value !== "[]") throw new Error(`Unsupported lock dependency group at line ${index + 1}`);
      }
      continue;
    }
    const dependencyGroup = (dependencyFields as readonly string[]).includes(group);
    if (section === "importers" && dependencyGroup) {
      if (indent === 6) {
        flush();
        const pair = yamlPair(content, index + 1);
        if (pair.value && (pair.value.startsWith("{") || pair.value.startsWith("["))) throw new Error(`Unsupported inline lock dependency at line ${index + 1}`);
        pending = { name: pair.key, ...(pair.value ? { version: pair.value } : {}) };
      } else if (indent === 8 && pending) {
        const pair = yamlPair(content, index + 1);
        if (pair.key === "specifier") pending.specifier = pair.value;
        else if (pair.key === "version") pending.version = pair.value;
        else throw new Error(`Unsupported lock dependency field ${pair.key} at line ${index + 1}`);
      } else throw new Error(`Unsupported importer dependency at line ${index + 1}`);
    } else if (group === "peerDependenciesMeta") {
      if (indent === 6) {
        const pair = yamlPair(content, index + 1);
        nestedName = pair.key;
        if (pair.value) {
          if (/^\{\s*optional\s*:\s*true\s*\}$/.test(pair.value)) optionalPeers.add(`${section}\0${owner}\0${nestedName}`);
          else if (!/^\{\s*optional\s*:\s*false\s*\}$/.test(pair.value) && pair.value !== "{}") throw new Error(`Unsupported peer metadata at line ${index + 1}`);
        }
      }
      else if (indent === 8 && nestedName) {
        const pair = yamlPair(content, index + 1);
        if (pair.key !== "optional" || !["true", "false"].includes(pair.value)) throw new Error(`Unsupported peer metadata at line ${index + 1}`);
        if (pair.value === "true") optionalPeers.add(`${section}\0${owner}\0${nestedName}`);
      } else throw new Error(`Unsupported peer metadata at line ${index + 1}`);
    } else if ((section === "packages" || section === "snapshots") && dependencyGroup && indent === 6) {
      const pair = yamlPair(content, index + 1);
      if (!pair.value || pair.value.startsWith("{") || pair.value.startsWith("[")) throw new Error(`Unsupported snapshot dependency at line ${index + 1}`);
      const source = section === "packages" ? "lock-package" : "lock-snapshot";
      const optional = group === "optionalDependencies";
      edges.push(makeEdge(source, owner, group as DependencyField, pair.key, pair.value, pair.value, optional));
      addResolutionPeers(source, pair.key, pair.value, optional);
    } else if ((section === "packages" || section === "snapshots") && group === "transitivePeerDependencies" && indent === 6 && content.startsWith("- ")) {
      const name = scalar(content.slice(2));
      edges.push(makeEdge(section === "packages" ? "lock-package" : "lock-snapshot", owner, "transitivePeerDependencies", name, ""));
    } else if (dependencyGroup || group === "transitivePeerDependencies") throw new Error(`Unsupported lock dependency syntax at line ${index + 1}`);
  }
  flush();
  if (version !== "9.0") throw new Error(`Unsupported pnpm lockfile version ${JSON.stringify(version)}; expected 9.0`);
  if (!importers.has(".")) throw new Error("Pnpm lockfile is missing its root importer");
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const sectionName = edge.source === "lock-package" ? "packages" : edge.source === "lock-snapshot" ? "snapshots" : edge.source === "lock-importer" ? "importers" : "";
    if (edge.field === "peerDependencies" && optionalPeers.has(`${sectionName}\0${edge.owner}\0${edge.name}`)) edges[i] = { ...edge, optional: true };
  }
  return { packages, snapshots, edges };
}

function peerBindings(snapshot: string): { name: string; version: string }[] {
  const peers: { name: string; version: string }[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < snapshot.length; i++) {
    if (snapshot[i] === "(") {
      if (depth++ === 0) start = i + 1;
    } else if (snapshot[i] === ")") {
      if (--depth < 0) throw new Error(`Malformed lock snapshot ${snapshot}`);
      if (depth === 0) {
        const parsed = packageAndVersion(snapshot.slice(start, i));
        if (parsed) {
          peers.push(parsed);
          peers.push(...peerBindings(snapshot.slice(start, i)));
        }
      }
    }
  }
  if (depth !== 0) throw new Error(`Malformed lock snapshot ${snapshot}`);
  return peers;
}

function yamlPair(content: string, line: number): { key: string; value: string } {
  let quote = "";
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quote === "'" && char === "'" && content[i + 1] === "'") { i++; continue; }
    if (quote === '"' && char === "\\") { i++; continue; }
    if (quote ? char === quote : char === "'" || char === '"') { quote = quote ? "" : char; continue; }
    if (!quote && char === ":" && (i + 1 === content.length || /\s/.test(content[i + 1]))) {
      return { key: scalar(content.slice(0, i).trim()), value: scalar(content.slice(i + 1).trim()) };
    }
  }
  throw new Error(`Unsupported YAML mapping at line ${line}`);
}

function scalar(raw: string): string {
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) throw new Error("Unterminated YAML single-quoted scalar");
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.startsWith('"')) return JSON.parse(raw) as string;
  if (/^[&*!|>]/.test(raw)) throw new Error(`Unsupported YAML scalar: ${raw}`);
  return raw.replace(/\s+#.*$/, "");
}

function parseWorkspaceYaml(text: string): { patterns: string[]; overrides: [string, string][]; edges: DependencyEdge[] } {
  const patterns: string[] = [];
  const overrides: [string, string][] = [];
  const edges: DependencyEdge[] = [];
  let section = "";
  let selector = "";
  let group = "";
  let metadataName = "";
  const optionalPeers = new Set<string>();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const content = line.slice(indent);
    if (indent === 0) {
      const pair = yamlPair(content, index + 1);
      section = pair.key;
      selector = group = metadataName = "";
      if (["packages", "overrides", "patchedDependencies", "packageExtensions", "catalog", "catalogs"].includes(section) && pair.value && pair.value !== "[]" && pair.value !== "{}") throw new Error(`Unsupported workspace ${section} at line ${index + 1}`);
    } else if (section === "packages") {
      if (indent !== 2 || !content.startsWith("- ")) throw new Error(`Unsupported workspace pattern at line ${index + 1}`);
      patterns.push(scalar(content.slice(2).trim()));
    } else if (section === "overrides" || section === "patchedDependencies") {
      if (indent !== 2) throw new Error(`Unsupported workspace override at line ${index + 1}`);
      const pair = yamlPair(content, index + 1);
      if (!pair.value || pair.value.startsWith("{") || pair.value.startsWith("[")) throw new Error(`Unsupported workspace override at line ${index + 1}`);
      overrides.push([pair.key, pair.value]);
    } else if (section === "packageExtensions") {
      if (indent === 2) {
        const pair = yamlPair(content, index + 1);
        if (pair.value && pair.value !== "{}") throw new Error(`Unsupported package extension at line ${index + 1}`);
        selector = pair.key;
        edges.push(makeOverride("pnpm-workspace.yaml:packageExtensions", selector, ""));
        group = metadataName = "";
      } else if (indent === 4 && selector) {
        const pair = yamlPair(content, index + 1);
        group = pair.key;
        if (((dependencyFields as readonly string[]).includes(group) || group === "peerDependenciesMeta") && pair.value && pair.value !== "{}") throw new Error(`Unsupported package extension group at line ${index + 1}`);
      } else if (indent === 6 && selector && (dependencyFields as readonly string[]).includes(group)) {
        const pair = yamlPair(content, index + 1);
        if (!pair.value || pair.value.startsWith("{") || pair.value.startsWith("[")) throw new Error(`Unsupported package extension dependency at line ${index + 1}`);
        edges.push(makeEdge("override", `pnpm-workspace.yaml:packageExtensions>${selector}`, group as DependencyField, pair.key, pair.value, undefined, group === "optionalDependencies"));
      } else if (indent === 6 && selector && group === "peerDependenciesMeta") {
        const pair = yamlPair(content, index + 1);
        metadataName = pair.key;
        if (pair.value && pair.value !== "{}") {
          if (/^\{\s*optional\s*:\s*true\s*\}$/.test(pair.value)) optionalPeers.add(`${selector}\0${metadataName}`);
          else if (!/^\{\s*optional\s*:\s*false\s*\}$/.test(pair.value)) throw new Error(`Unsupported package extension metadata at line ${index + 1}`);
        }
      } else if (indent === 8 && selector && group === "peerDependenciesMeta" && metadataName) {
        const pair = yamlPair(content, index + 1);
        if (pair.key !== "optional" || !["true", "false"].includes(pair.value)) throw new Error(`Unsupported package extension metadata at line ${index + 1}`);
        if (pair.value === "true") optionalPeers.add(`${selector}\0${metadataName}`);
      } else if ((dependencyFields as readonly string[]).includes(group) || group === "peerDependenciesMeta") throw new Error(`Unsupported package extension syntax at line ${index + 1}`);
    } else if (section === "catalog" || section === "catalogs") {
      if (section === "catalogs" && indent === 2) {
        const pair = yamlPair(content, index + 1);
        selector = pair.key;
        if (pair.value && pair.value !== "{}") throw new Error(`Unsupported workspace catalog at line ${index + 1}`);
      } else if ((section === "catalog" && indent === 2) || (section === "catalogs" && indent === 4 && selector)) {
        const pair = yamlPair(content, index + 1);
        if (!pair.value || pair.value.startsWith("{") || pair.value.startsWith("[")) throw new Error(`Unsupported workspace catalog entry at line ${index + 1}`);
        edges.push(makeEdge("override", `pnpm-workspace.yaml:${section}${selector ? `>${selector}` : ""}`, "catalog", pair.key, pair.value));
      } else throw new Error(`Unsupported workspace catalog syntax at line ${index + 1}`);
    }
  }
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const marker = "pnpm-workspace.yaml:packageExtensions>";
    if (edge.owner.startsWith(marker) && edge.field === "peerDependencies" && optionalPeers.has(`${edge.owner.slice(marker.length)}\0${edge.name}`)) edges[i] = { ...edge, optional: true };
  }
  return { patterns, overrides, edges };
}

function manifestWorkspacePatterns(manifest: JsonObject): string[] {
  if (manifest.workspaces === undefined) return [];
  const value = Array.isArray(manifest.workspaces) ? manifest.workspaces : object(manifest.workspaces, "workspaces").packages;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error("package.json workspaces must be a list of patterns");
  return [...value];
}

function expandWorkspacePatterns(root: string, patterns: string[]): string[] {
  const inclusions = patterns.filter((pattern) => !pattern.startsWith("!"));
  const exclusions = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => workspaceRegex(pattern.slice(1)));
  const found = new Set<string>();
  for (const pattern of inclusions) {
    if (isAbsolute(pattern) || pattern.split("/").includes("..") || /[{}[\]]/.test(pattern)) throw new Error(`Unsupported or unsafe workspace pattern ${pattern}`);
    const segments = pattern.replace(/^\.\//, "").replace(/\/$/, "").split("/");
    const visit = (directory: string, index: number): void => {
      if (index === segments.length) {
        const manifest = join(directory, "package.json");
        const rel = relative(root, directory).split(sep).join("/");
        if (existsSync(manifest) && !exclusions.some((rule) => rule.test(rel))) found.add(manifest);
        return;
      }
      const segment = segments[index];
      if (segment === "**") visit(directory, index + 1);
      if (!existsSync(directory)) return;
      const matcher = segment === "**" ? null : segmentRegex(segment);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (ignoredDirectories.has(entry.name) || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
        if (matcher && !matcher.test(entry.name)) continue;
        if (entry.isSymbolicLink()) throw new Error(`Workspace pattern matched a symlink: ${join(directory, entry.name)}`);
        visit(join(directory, entry.name), segment === "**" ? index : index + 1);
      }
    };
    visit(root, 0);
  }
  return [...found];
}

function segmentRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`);
}

function workspaceRegex(pattern: string): RegExp {
  if (isAbsolute(pattern) || pattern.split("/").includes("..") || /[{}[\]]/.test(pattern)) throw new Error(`Unsupported or unsafe workspace exclusion ${pattern}`);
  const parts = pattern.replace(/^\.\//, "").replace(/\/$/, "").split("/");
  return new RegExp(`^${parts.map((part) => part === "**" ? ".*" : segmentRegex(part).source.slice(1, -1)).join("/")}$`);
}

function collectPayloadFiles(root: string): string[] {
  const files: string[] = [];
  let bytes = 0;
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Payload contains symlink: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        bytes += statSync(path).size;
        files.push(path);
        if (files.length > 100_000 || bytes > 256 * 1024 * 1024) throw new Error(`Package payload exceeds inspection limits: ${root}`);
      }
    }
  };
  visit(root);
  if (!files.some((path) => path === join(root, "package.json"))) throw new Error(`No root package manifest in payload directory ${root}`);
  return files.sort();
}

/** Read packed source for separate content review without extracting or following archive paths. */
export function readPackagePayload(path: string): { path: string; bytes: Buffer }[] {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Payload may not be a symlink: ${path}`);
  if (stat.isDirectory()) return collectPayloadFiles(path).map((file) => ({ path: relative(path, file).split(sep).join("/"), bytes: readFileSync(file) }));
  return parsePackedPayload(readPackedBytes(path));
}

function readPackedBytes(path: string): Buffer {
  if (statSync(path).size > 256 * 1024 * 1024) throw new Error(`Compressed package payload exceeds inspection limits: ${path}`);
  const bytes = readFileSync(path);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`Unsupported package payload format (gzip tar required): ${path}`);
  return bytes;
}

/** Read only regular files; do not extract archive paths or follow links. */
function parsePackedPayload(compressed: Buffer): { path: string; bytes: Buffer }[] {
  const tar = gunzipSync(compressed, { maxOutputLength: 256 * 1024 * 1024 });
  const entries: { path: string; bytes: Buffer }[] = [];
  const names = new Set<string>();
  let offset = 0;
  let longPath: string | undefined;
  let paxPath: string | undefined;
  let terminated = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) { terminated = true; break; }
    const expectedChecksum = tarNumber(header.subarray(148, 156));
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== expectedChecksum) throw new Error("Invalid package archive checksum");
    const size = tarNumber(header.subarray(124, 136));
    if (offset + size > tar.length) throw new Error("Truncated package archive");
    const data = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    const type = header[156];
    const text = (start: number, end: number): string => header.subarray(start, end).toString("utf8").replace(/\0.*$/, "");
    const prefix = text(345, 500);
    const name = paxPath ?? longPath ?? (prefix ? `${prefix}/${text(0, 100)}` : text(0, 100));
    if (type === 120 || type === 103) { // POSIX extended header
      const values = parsePax(data);
      if (type === 103 && values.path) throw new Error("Global archive path override is unsupported");
      if (Object.keys(values).some((key) => key === "size" || key === "linkpath" || key.startsWith("GNU.sparse"))) throw new Error("Unsupported archive PAX entry metadata");
      if (type === 120) paxPath = values.path;
      continue;
    }
    if (type === 76) { longPath = data.toString("utf8").replace(/\0.*$/, ""); continue; }
    paxPath = longPath = undefined;
    if (!name.startsWith("package/") && name !== "package") throw new Error(`Unsafe package archive path ${name}`);
    if (name.split("/").some((part) => part === ".." || part === ".") || name.includes("\\") || /[\r\n\0]/.test(name)) throw new Error(`Unsafe package archive path ${name}`);
    if (names.has(name)) throw new Error(`Duplicate package archive entry ${name}`);
    names.add(name);
    if (type === 53) continue; // directory
    if (type !== 0 && type !== 48) throw new Error(`Unsupported package archive entry type ${type} for ${name}`);
    entries.push({ path: name, bytes: data });
    if (entries.length > 100_000) throw new Error("Too many package archive entries");
  }
  if (!terminated || !entries.some((entry) => entry.path === "package/package.json")) throw new Error("Package archive is incomplete or lacks its root manifest");
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function tarNumber(bytes: Buffer): number {
  const raw = bytes.toString("ascii").replace(/\0.*$/, "").trim();
  if (!/^[0-7]*$/.test(raw)) throw new Error("Unsupported package archive numeric field");
  const value = parseInt(raw || "0", 8);
  if (!Number.isSafeInteger(value)) throw new Error("Package archive numeric field exceeds safe limits");
  return value;
}

function parsePax(data: Buffer): Record<string, string> {
  const result: Record<string, string> = {};
  for (let cursor = 0; cursor < data.length;) {
    const space = data.indexOf(32, cursor);
    if (space < 0) throw new Error("Malformed package archive PAX record");
    const count = Number(data.subarray(cursor, space).toString("ascii"));
    if (!Number.isSafeInteger(count) || count <= space - cursor + 2 || cursor + count > data.length || data[cursor + count - 1] !== 10) throw new Error("Malformed package archive PAX length");
    const record = data.subarray(space + 1, cursor + count - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals < 1) throw new Error("Malformed package archive PAX value");
    result[record.slice(0, equals)] = record.slice(equals + 1);
    cursor += count;
  }
  return result;
}

function readJson(path: string): JsonObject {
  return object(JSON.parse(readFileSync(path, "utf8")), path);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function optionalObject(value: unknown): JsonObject {
  return value === undefined ? {} : object(value, "value");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function displayPath(root: string, path: string): string {
  const result = relative(root, path).split(sep).join("/");
  return result || ".";
}

function inputRecord(root: string, path: string, kind: AuditInput["kind"], bytes: Buffer): AuditInput {
  return { path: displayPath(root, path), kind, sha256: digest(bytes) };
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
