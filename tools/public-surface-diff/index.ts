import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { assertReleaseInventory } from "../release/release-inventory.mjs";
import { loadValidatedReleasePlan, type ExactReleasePlan } from "../release/exact-release-plan.mjs";
import { classifyReleaseChange, validateReleaseKind, type ReleaseChange, type ReleaseKind } from "./patch-compatibility.js";
import { declarationList, previousReleaseVersion, readPackageArchive, sha256, sha512, verifyPackedIdentity, type BaselineManifest, type PackedPackage } from "./prepare-baseline.js";
import { createRuntimeExportAnalyzer, type RuntimeExportSurface } from "./runtime-exports.js";

export interface ExportEntry {
  subpath: string;
  conditions: Record<string, string>;
  declarations: string[];
  asset: boolean;
  /** Ordered condition leaves, including null blockers omitted from conditions. */
  conditionOrder?: string[];
}
export interface Change { package: string; subpath: string; name: string; kind: ReleaseChange["kind"]; classification: ReturnType<typeof classifyReleaseChange>; condition?: string; before?: string; after?: string }
export interface RuntimeCondition {
  package: string;
  subpath: string;
  condition: string;
  before?: RuntimeExportSurface;
  after?: RuntimeExportSurface;
}
function escapeRegex(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function flattenConditions(value: unknown, order: { keys: string[]; hasBlocker: boolean }, path: string[] = []): Record<string, string> {
  if (typeof value === "string") {
    order.keys.push(path.join("/") || "default");
    return { [path.join("/") || "default"]: value };
  }
  if (value === null) {
    order.keys.push(path.join("/") || "default");
    order.hasBlocker = true;
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported export condition");
  return Object.assign({}, ...Object.entries(value).map(([key, target]) => {
    if (key.startsWith(".")) throw new Error(`Nested subpath in export condition: ${key}`);
    return flattenConditions(target, order, [...path, key]);
  }));
}
function declarationTarget(target: string): string {
  return target.replace(/\.mjs$/, ".d.mts").replace(/\.cjs$/, ".d.cts").replace(/\.js$/, ".d.ts");
}
/** Enumerate exact paths from the packed manifest and file listing, including
 * wildcard subpaths and nested conditions. Invalid or missing targets fail. */
export function expandExports(pkg: PackedPackage): ExportEntry[] {
  const raw = pkg.manifest.exports ?? pkg.manifest.main;
  if (!raw) return [];
  const record = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const exportsMap = record && Object.keys(record).some((key) => key.startsWith(".")) ? record : { ".": raw };
  const entries: ExportEntry[] = [];
  type ExportRule = { subpath: string; wildcard: number; conditions: Record<string, string>; order: { keys: string[]; hasBlocker: boolean } };
  const exact = new Map<string, ExportRule>(), patterns: ExportRule[] = [], subpaths = new Set<string>();
  for (const [subpath, value] of Object.entries(exportsMap)) {
    if (!/^\.(?:\/[^.]|$)/.test(subpath) || subpath.includes("..")) throw new Error(`Invalid export subpath ${subpath}`);
    if (/[\\%?#\0]/.test(subpath)) throw new Error(`Cannot safely resolve encoded export subpath ${subpath}`);
    const wildcard = subpath.indexOf("*");
    if (wildcard !== -1 && wildcard !== subpath.lastIndexOf("*")) throw new Error(`Unsupported export wildcard ${subpath}`);
    const order = { keys: [] as string[], hasBlocker: false };
    const conditions = flattenConditions(value, order);
    for (const target of Object.values(conditions)) {
      if (!target.startsWith("./") || target.split("/").includes("..")) throw new Error(`Invalid export target ${target}`);
      if (/[\\%?#\0]/.test(target)) throw new Error(`Cannot safely resolve encoded export target ${target}`);
    }
    const rule = { subpath, wildcard, conditions, order };
    if (wildcard === -1) {
      exact.set(subpath, rule);
      subpaths.add(subpath);
      continue;
    }
    patterns.push(rule);
    if (Object.keys(conditions).length === 0) continue; // retain blocked patterns for precedence
    let matched = false;
    for (const target of Object.values(conditions)) {
      if ((target.match(/\*/g) ?? []).length !== 1) throw new Error(`Cannot enumerate wildcard target ${target} for ${subpath}`);
      const [prefix, suffix] = target.slice(2).split("*");
      const pattern = new RegExp(`^${escapeRegex(prefix!)}([\\s\\S]+)${escapeRegex(suffix!)}$`);
      for (const path of pkg.paths) {
        const substitution = path.match(pattern)?.[1];
        if (!substitution) continue;
        if (/[\\%?#\0]/.test(substitution)) throw new Error(`Cannot safely enumerate wildcard substitution for ${subpath}`);
        subpaths.add(subpath.replace("*", () => substitution));
        matched = true;
      }
    }
    if (!matched) throw new Error(`Wildcard export ${subpath} has no packed targets`);
  }
  // Node prefers an exact key, then the longest pattern prefix and, for equal
  // prefixes, the longest full pattern. Null rules still take precedence.
  patterns.sort((a, b) => b.wildcard - a.wildcard || b.subpath.length - a.subpath.length);
  for (const subpath of subpaths) {
    let rule = exact.get(subpath), substitution = "";
    if (!rule) {
      rule = patterns.find((candidate) => subpath.startsWith(candidate.subpath.slice(0, candidate.wildcard))
        && subpath.endsWith(candidate.subpath.slice(candidate.wildcard + 1))
        && subpath.length >= candidate.subpath.length);
      if (!rule) throw new Error(`Cannot resolve export subpath ${subpath}`);
      substitution = subpath.slice(rule.wildcard, subpath.length - (rule.subpath.length - rule.wildcard - 1));
    }
    const { conditions, order } = rule;
    if (Object.keys(conditions).length === 0) continue; // selected subpath is blocked
    const concreteConditions = Object.fromEntries(Object.entries(conditions).map(([key, target]) =>
      [key, rule.wildcard === -1 ? target : target.replaceAll("*", () => substitution)]));
    for (const target of Object.values(concreteConditions)) if (!pkg.paths.includes(target.slice(2))) throw new Error(`Export target missing from ${pkg.manifest.name}: ${target}`);
    const explicit = Object.entries(concreteConditions).filter(([key]) => key.split("/").includes("types")).map(([, target]) => target.slice(2));
    let declarations = explicit;
    if (!declarations.length) declarations = Object.values(concreteConditions).map((target) => declarationTarget(target).slice(2)).filter((target) => pkg.files.has(target));
    if (!declarations.length && subpath === "." && pkg.manifest.types) declarations = [pkg.manifest.types.replace(/^\.\//, "")];
    declarations = [...new Set(declarations)].sort();
    for (const path of declarations) if (!pkg.files.has(path)) throw new Error(`Declaration missing from ${pkg.manifest.name}: ${path}`);
    const asset = Object.values(concreteConditions).every((target) => !/\.(?:m|c)?js$/.test(target) && !/\.d\.(?:m|c)?ts$/.test(target));
    if (!asset && declarations.length === 0) throw new Error(`No declarations for ${pkg.manifest.name}:${subpath}`);
    entries.push({ subpath, conditions: concreteConditions, declarations, asset, ...(order.hasBlocker ? { conditionOrder: [...order.keys] } : {}) });
  }
  return entries.sort((a, b) => a.subpath.localeCompare(b.subpath));
}
export function verifyBaseline(path: string, candidate: ExactReleasePlan): { manifest: BaselineManifest; packages: Map<string, PackedPackage> } {
  const absolute = resolve(path), root = realpathSync(dirname(absolute));
  const manifest = JSON.parse(readFileSync(absolute, "utf8")) as BaselineManifest;
  if (manifest.schema !== "aura3d.public-api-baseline/1" || manifest.candidatePlanSha256 !== candidate.reference.sha256 || !Array.isArray(manifest.packages) || !manifest.packages.length) throw new Error("Baseline manifest is missing or not bound to candidate plan");
  assertReleaseInventory(manifest.version, manifest.packages.map((entry) => entry.name));
  const packages = new Map<string, PackedPackage>();
  for (const entry of manifest.packages) {
    if (!entry.name || entry.version !== manifest.version || packages.has(entry.name) || !/^sha512-/.test(entry.integrity) || !/^https:\/\/registry\.npmjs\.org\//.test(entry.metadataOrigin) || !/^https:\/\/registry\.npmjs\.org\//.test(entry.archiveOrigin) || isAbsolute(entry.archive)) throw new Error("Invalid baseline package record");
    if (!entry.metadata || isAbsolute(entry.metadata) || !/^[a-f0-9]{64}$/.test(entry.metadataSha256) || entry.metadataOrigin !== `https://registry.npmjs.org/${encodeURIComponent(entry.name)}`) throw new Error(`Invalid metadata identity: ${entry.name}`);
    const metadataPath = realpathSync(resolve(root, entry.metadata));
    if (!metadataPath.startsWith(`${root}${sep}`)) throw new Error("Baseline metadata escapes its manifest directory");
    if (statSync(metadataPath).size > 16 * 1024 * 1024) throw new Error(`Baseline metadata exceeds limit: ${entry.name}`);
    const metadataBytes = readFileSync(metadataPath);
    if (sha256(metadataBytes) !== entry.metadataSha256) throw new Error(`Baseline metadata digest mismatch: ${entry.name}`);
    const metadata = JSON.parse(metadataBytes.toString("utf8")) as { name: string; versions: Record<string, { name: string; version: string; dist?: { tarball?: string; integrity?: string } }> };
    const published = metadata.versions?.[entry.version];
    if (metadata.name !== entry.name || published?.name !== entry.name || published.version !== entry.version || published.dist?.tarball !== entry.archiveOrigin || published.dist.integrity !== entry.integrity) throw new Error(`Baseline metadata does not bind archive: ${entry.name}`);
    // The manifest-stored digest binds this snapshot, not its provenance or freshness.
    if (entry.name === "@aura3d/engine") previousReleaseVersion(metadata.versions, candidate.version, manifest.version);
    const archivePath = realpathSync(resolve(root, entry.archive));
    if (!archivePath.startsWith(`${root}${sep}`)) throw new Error("Baseline archive escapes its manifest directory");
    if (statSync(archivePath).size > 128 * 1024 * 1024) throw new Error(`Baseline archive exceeds limit: ${entry.name}`);
    const bytes = readFileSync(archivePath);
    if (sha256(bytes) !== entry.sha256 || sha512(bytes) !== entry.integrity) throw new Error(`Baseline archive digest mismatch: ${entry.name}`);
    const pkg = readPackageArchive(bytes);
    verifyPackedIdentity(pkg, entry.name, entry.version);
    if (JSON.stringify(declarationList(pkg)) !== JSON.stringify(entry.declarations)) throw new Error(`Baseline declaration digest mismatch: ${entry.name}`);
    packages.set(entry.name, pkg);
  }
  return { manifest, packages };
}
function candidates(plan: ExactReleasePlan): Map<string, PackedPackage> {
  const result = new Map<string, PackedPackage>();
  for (const entry of plan.packages) {
    if (result.has(entry.name)) throw new Error(`Duplicate candidate package ${entry.name}`);
    const bytes = readFileSync(resolve(entry.tarball));
    if (sha256(bytes) !== entry.sha256 || sha512(bytes) !== entry.integrity) throw new Error(`Candidate digest mismatch: ${entry.name}`);
    const pkg = readPackageArchive(bytes);
    verifyPackedIdentity(pkg, entry.name, entry.version);
    result.set(entry.name, pkg);
  }
  return result;
}
function unpackDeclarations(pkg: PackedPackage, parent: string): string {
  const dir = join(parent, "node_modules", ...pkg.manifest.name.split("/"));
  for (const [path, bytes] of pkg.files) {
    // Runtime source remains archive data: only declarations and package scopes
    // are materialized for the existing TypeScript declaration comparison.
    if (path !== "package.json" && !path.endsWith("/package.json") && !/\.d\.(?:m|c)?ts$/i.test(path)) continue;
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return dir;
}
type DeclarationValue = "value" | "type-only" | "unknown";
type SymbolInfo = { name: string; value: boolean; valueVerified: boolean; type: boolean; signature: string; symbol: ts.Symbol; location: ts.Node; removalVersion?: string };

/** The checker can expose a class behind `export type *` with Value flags.
 * Follow the actual export route instead of mistaking its target for a value
 * export. An unresolved route is kept unknown, not guessed from those flags. */
function declarationValues(checker: ts.TypeChecker): (file: ts.SourceFile, name: string) => DeclarationValue {
  const exportsByFile = new Map<ts.SourceFile, Map<string, ts.Symbol>>();
  const cache = new Map<string, DeclarationValue>();
  const exportsOf = (file: ts.SourceFile): Map<string, ts.Symbol> => {
    let entries = exportsByFile.get(file);
    if (!entries) {
      const module = checker.getSymbolAtLocation(file);
      entries = new Map(module ? checker.getExportsOfModule(module).map((symbol) => [symbol.name, symbol]) : []);
      exportsByFile.set(file, entries);
    }
    return entries;
  };
  const targetOf = (symbol: ts.Symbol): ts.Symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const moduleFile = (specifier: ts.Expression | undefined): ts.SourceFile | undefined => {
    if (!specifier) return undefined;
    return checker.getSymbolAtLocation(specifier)?.getDeclarations()?.find(ts.isSourceFile);
  };
  const combine = (states: DeclarationValue[]): DeclarationValue =>
    states.includes("value") ? "value" : states.includes("unknown") ? "unknown" : "type-only";

  const resolveValue = (file: ts.SourceFile, name: string, seen: Set<string>): DeclarationValue => {
    const key = `${file.fileName}\0${name}`;
    const cached = cache.get(key);
    if (cached) return cached;
    if (seen.has(key) || seen.size > 256) return "unknown";
    const nextSeen = new Set(seen).add(key);
    const exported = exportsOf(file).get(name);
    if (!exported) return "unknown";
    const target = targetOf(exported);
    if (!(target.flags & ts.SymbolFlags.Value)) return "type-only";
    const own = (exported.getDeclarations() ?? []).filter((node) => node.getSourceFile() === file);
    const viaImport = (local: ts.Symbol | undefined): DeclarationValue => {
      if (!local) return "unknown";
      if (!(local.flags & ts.SymbolFlags.Alias)) return local.flags & ts.SymbolFlags.Value ? "value" : "type-only";
      const states: DeclarationValue[] = [];
      for (const node of local.getDeclarations() ?? []) {
        let declaration: ts.ImportDeclaration | undefined;
        let imported = "default";
        let typeOnly = false;
        if (ts.isImportSpecifier(node)) {
          const clause = node.parent.parent;
          declaration = ts.isImportDeclaration(clause.parent) ? clause.parent : undefined;
          imported = node.propertyName?.text ?? node.name.text;
          typeOnly = node.isTypeOnly || clause.isTypeOnly;
        } else if (ts.isImportClause(node)) {
          declaration = ts.isImportDeclaration(node.parent) ? node.parent : undefined;
          typeOnly = node.isTypeOnly;
        } else if (ts.isNamespaceImport(node)) {
          const clause = node.parent;
          declaration = ts.isImportDeclaration(clause.parent) ? clause.parent : undefined;
          typeOnly = clause.isTypeOnly;
          if (!typeOnly && declaration && moduleFile(declaration.moduleSpecifier)) { states.push("value"); continue; }
        } else if (ts.isImportEqualsDeclaration(node) && node.isTypeOnly) {
          states.push("type-only");
          continue;
        } else {
          states.push("unknown");
          continue;
        }
        if (typeOnly) states.push("type-only");
        else {
          const child = moduleFile(declaration?.moduleSpecifier);
          states.push(child ? resolveValue(child, imported, nextSeen) : "unknown");
        }
      }
      return states.length ? combine(states) : "unknown";
    };
    let result: DeclarationValue;
    if (own.length) {
      result = combine(own.map((node): DeclarationValue => {
        if (ts.isExportSpecifier(node)) {
          const declaration = node.parent.parent;
          if (node.isTypeOnly || declaration.isTypeOnly) return "type-only";
          if (!declaration.moduleSpecifier) return viaImport(checker.getExportSpecifierLocalTargetSymbol(node));
          const child = moduleFile(declaration.moduleSpecifier);
          return child ? resolveValue(child, node.propertyName?.text ?? node.name.text, nextSeen) : "unknown";
        }
        if (ts.isNamespaceExport(node)) return node.parent.isTypeOnly ? "type-only" : "value";
        if (ts.isExportDeclaration(node)) return node.isTypeOnly ? "type-only" : "value";
        return "value";
      }));
    } else {
      const states: DeclarationValue[] = [];
      for (const statement of file.statements) {
        if (!ts.isExportDeclaration(statement) || statement.exportClause || !statement.moduleSpecifier) continue;
        const child = moduleFile(statement.moduleSpecifier);
        if (!child) { states.push("unknown"); continue; }
        const childSymbol = exportsOf(child).get(name);
        if (!childSymbol || targetOf(childSymbol) !== target) continue;
        states.push(statement.isTypeOnly ? "type-only" : resolveValue(child, name, nextSeen));
      }
      result = states.length ? combine(states) : "unknown";
    }
    if (result !== "unknown") cache.set(key, result);
    return result;
  };
  return (file, name) => resolveValue(file, name, new Set());
}

function symbols(checker: ts.TypeChecker, file: ts.SourceFile, valueOf: (file: ts.SourceFile, name: string) => DeclarationValue): Map<string, SymbolInfo> {
  const module = checker.getSymbolAtLocation(file);
  const result = new Map<string, SymbolInfo>();
  // A script (non-module) declaration file, such as `vite-client.d.ts`, declares
  // ambient modules and exports nothing importable. It has no export names to
  // compare; its text is compared as a whole where the entrypoints are paired.
  if (!module && !ts.isExternalModule(file)) return result;
  if (!module) throw new Error(`Declaration is not a module: ${file.fileName}`);
  for (const exported of checker.getExportsOfModule(module)) {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const aliasDeclarations = exported.getDeclarations() ?? [];
    const declarations = target.getDeclarations() ?? [];
    const location = declarations[0] ?? aliasDeclarations[0] ?? file;
    const signature = declarations.map((d) => d.getText().replace(/\s+/g, " ").trim()).sort().join(" | ");
    if (!signature) throw new Error(`Unresolved exported symbol ${exported.name} in ${file.fileName}`);
    const docs = aliasDeclarations.map((node) => {
      let owner: ts.Node = ts.isExportSpecifier(node) ? node.parent.parent : node;
      if (ts.isVariableDeclaration(owner) && ts.isVariableDeclarationList(owner.parent) && ts.isVariableStatement(owner.parent.parent)) owner = owner.parent.parent;
      return owner.getFullText();
    }).join("\n");
    const removalVersion = docs.match(/(?:remov(?:al|ed)|until)\D{0,60}(\d+\.\d+\.\d+)/i)?.[1];
    const constEnum = declarations.length > 0 && declarations.every((node) => ts.isEnumDeclaration(node)
      && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ConstKeyword));
    const value = !constEnum && !!(target.flags & ts.SymbolFlags.Value) ? valueOf(file, exported.name) : "type-only";
    result.set(exported.name, { name: exported.name, value: value !== "type-only", valueVerified: value !== "unknown", type: !!(target.flags & ts.SymbolFlags.Type), signature, symbol: target, location, removalVersion });
  }
  return result;
}
/** Compare the declaration dependency closure when TypeScript's nominal private
 * class members make the two physically separate package copies incompatible.
 * Equal source text alone is insufficient: referenced hidden types may change. */
/** Hard bounds for declaration-closure walks. A closure follows every identifier
 * through compiler libraries as well as package declarations, so its size is
 * driven by the surface a symbol reaches, not by the number of packages. The
 * per-closure cap bounds one exported symbol's reach (including the lib and
 * ambient types it touches); the global cap grows with the number of compared
 * entrypoints so a many-entrypoint release is not rejected for its breadth,
 * while a runaway walk still fails hard. */
export const DECLARATION_CLOSURE_PER_ENTRYPOINT_LIMIT = 200_000;
export const DECLARATION_CLOSURE_GLOBAL_LIMIT_PER_ENTRYPOINT = 400_000;
export interface DeclarationClosureBudget {
  readonly perEntrypoint: number;
  readonly global: number;
  /** Symbols visited by all closures so far. */
  spent: number;
}
export function createDeclarationClosureBudget(entrypoints: number, limits: { perEntrypoint?: number; globalPerEntrypoint?: number } = {}): DeclarationClosureBudget {
  const perEntrypoint = limits.perEntrypoint ?? DECLARATION_CLOSURE_PER_ENTRYPOINT_LIMIT;
  const globalPerEntrypoint = limits.globalPerEntrypoint ?? DECLARATION_CLOSURE_GLOBAL_LIMIT_PER_ENTRYPOINT;
  return { perEntrypoint, global: Math.max(1, entrypoints) * globalPerEntrypoint, spent: 0 };
}
/** What one symbol contributes to a closure: its declaration texts and the
 * symbols its declarations name. Cached per symbol so the many closures of one
 * run share the (expensive) syntax walk. */
export interface ClosureNode { readonly texts: readonly string[]; readonly dependencies: readonly ts.Symbol[] }
export interface DeclarationClosureCache { readonly nodes: Map<ts.Symbol, ClosureNode>; readonly digests: Map<ts.Symbol, string> }
export function createDeclarationClosureCache(): DeclarationClosureCache { return { nodes: new Map(), digests: new Map() }; }
/** Digest of the sorted declaration texts reachable from `root`. Equal digests mean
 * equal closures. Results are cached per root symbol because barrel entrypoints
 * re-export the same symbols many times. */
/** Digest of every declaration file of one extracted package (relative path and bytes). */
export function declarationFilesDigest(root: string): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.mts") || entry.name.endsWith(".d.cts")) files.push(path);
    }
  };
  walk(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(`${relative(root, file)}\0${createHash("sha256").update(readFileSync(file)).digest("hex")}\n`);
  return hash.digest("hex");
}
/** True when every package's declaration files are byte-identical on both sides: no declaration can have changed. */
export function allDeclarationsIdentical(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): boolean {
  if (before.size !== after.size) return false;
  for (const [name, dir] of before) {
    const other = after.get(name);
    if (!other || declarationFilesDigest(dir) !== declarationFilesDigest(other)) return false;
  }
  return true;
}
export function declarationClosure(checker: ts.TypeChecker, root: ts.Symbol, budget: DeclarationClosureBudget, label = "<symbol>", cache: DeclarationClosureCache = createDeclarationClosureCache()): string {
  const known = cache.digests.get(root);
  if (known !== undefined) return known;
  const digest = computeDeclarationClosure(checker, root, budget, label, cache.nodes);
  cache.digests.set(root, digest);
  return digest;
}
function computeDeclarationClosure(checker: ts.TypeChecker, root: ts.Symbol, budget: DeclarationClosureBudget, label: string, nodes: Map<ts.Symbol, ClosureNode>): string {
  const resolveAlias = (input: ts.Symbol): ts.Symbol => input.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(input) : input;
  const nodeOf = (symbol: ts.Symbol): ClosureNode => {
    const cached = nodes.get(symbol);
    if (cached) return cached;
    const texts: string[] = [], dependencies: ts.Symbol[] = [];
    for (const node of symbol.getDeclarations() ?? []) {
      texts.push(`${symbol.name}:${node.getText().replace(/\s+/g, " ").trim()}`);
      const visitNode = (child: ts.Node): void => {
        if (ts.isIdentifier(child)) {
          const dependency = checker.getSymbolAtLocation(child);
          if (dependency) dependencies.push(dependency);
        }
        ts.forEachChild(child, visitNode);
      };
      ts.forEachChild(node, visitNode);
    }
    const created = { texts, dependencies };
    nodes.set(symbol, created);
    return created;
  };
  const visited = new Set<ts.Symbol>();
  const contents: string[] = [];
  const pending: ts.Symbol[] = [root];
  while (pending.length) {
    const symbol = resolveAlias(pending.pop()!);
    if (visited.has(symbol)) continue;
    visited.add(symbol);
    budget.spent += 1;
    if (visited.size > budget.perEntrypoint) {
      throw new Error(`Declaration dependency closure exceeds limit: ${label} reaches more than ${budget.perEntrypoint} symbols`);
    }
    if (budget.spent > budget.global) {
      throw new Error(`Declaration dependency closures exceed the global limit of ${budget.global} symbols at ${label}`);
    }
    const node = nodeOf(symbol);
    contents.push(...node.texts);
    for (const dependency of node.dependencies) pending.push(dependency);
  }
  const hash = createHash("sha256");
  for (const text of contents.sort()) hash.update(text).update("\0");
  return hash.digest("hex");
}
/** A retarget is conservatively treated as a break: matching declarations do
 * not establish the actual exports of the newly targeted runtime file. */
export function compareEntryConditions(name: string, before: ExportEntry, after: ExportEntry | undefined, release: ReleaseKind, version: string): Change[] {
  const changes: Change[] = [];
  const add = (kind: ReleaseChange["kind"], field: string, beforeTarget?: string, afterTarget?: string) => {
    const change = { kind, ...(beforeTarget !== undefined ? { before: beforeTarget } : {}), ...(afterTarget !== undefined ? { after: afterTarget } : {}) };
    changes.push({ package: name, subpath: before.subpath, name: field, ...change, classification: classifyReleaseChange(change, release, version) });
  };
  if (!after) { add("subpath-removal", before.subpath); return changes; }
  for (const [condition, target] of Object.entries(before.conditions)) {
    if (!Object.hasOwn(after.conditions, condition)) add("condition-removal", condition, target);
    else if (after.conditions[condition] !== target) add("condition-target-change", condition, target, after.conditions[condition]);
  }
  // Conditions are ordered: moving or inserting a branch before a retained
  // branch can select a different target even when every target string matches.
  const oldOrder = before.conditionOrder ?? Object.keys(before.conditions), newOrder = after.conditionOrder ?? Object.keys(after.conditions);
  const oldKeys = new Set(oldOrder), newKeys = new Set(newOrder);
  const oldRetained = oldOrder.filter((key) => newKeys.has(key));
  const newRetained = newOrder.filter((key) => oldKeys.has(key));
  const lastRetained = newOrder.reduce((last, key, index) => oldKeys.has(key) ? index : last, -1);
  const insertedEarlier = newOrder.some((key, index) => index < lastRetained && !oldKeys.has(key));
  if (insertedEarlier || oldRetained.some((key, index) => key !== newRetained[index])) {
    add("condition-order-change", "<condition-order>", JSON.stringify(oldOrder), JSON.stringify(newOrder));
  }
  return changes;
}

/** Select only a declaration whose condition is safely associated with this
 * runtime branch. Nested type conditions must match the same branch; ambiguous
 * or later-priority type branches are not silently applied to another one. */
function declarationForCondition(entry: ExportEntry, condition: string, target: string): string | undefined {
  const entries = Object.entries(entry.conditions);
  const runtimeIndex = entries.findIndex(([key]) => key === condition);
  const parts = condition.split("/");
  const explicit = entries.flatMap(([key, value], index) => {
    const components = key.split("/"), typeIndex = components.indexOf("types");
    return typeIndex < 0 ? [] : [{ value: value.slice(2), index, prefix: components.slice(0, typeIndex), suffix: components.slice(typeIndex + 1) }];
  });
  const inferred = declarationTarget(target).slice(2);
  const matches = explicit.filter((item) => item.suffix.length === 0
    && item.prefix.every((part, index) => parts[index] === part)
    && (item.index < runtimeIndex || item.value === inferred));
  if (matches.length) {
    const longest = Math.max(...matches.map((item) => item.prefix.length));
    const choices = [...new Set(matches.filter((item) => item.prefix.length === longest).map((item) => item.value))];
    return choices.length === 1 ? choices[0] : undefined;
  }
  if (explicit.length) return undefined;
  if (entry.declarations.includes(inferred)) return inferred;
  return entry.declarations.length === 1 ? entry.declarations[0] : undefined;
}

/** Compare packed condition targets, declarations and statically known runtime
 * export names. Unknown runtime bodies or export mechanisms always fail closed. */
export function diffPackedSurfaces(baseline: Map<string, PackedPackage>, candidate: Map<string, PackedPackage>, version: string, release: ReleaseKind): {
  pass: boolean;
  changes: Change[];
  diagnostics: string[];
  /** Compiler errors with an equivalent on the published baseline, or in third-party declarations: reported, not blocking. */
  inheritedDiagnostics: string[];
  inheritedRuntimeDiagnostics: string[];
  packagesCompared: number;
  runtimeExportsVerified: boolean;
  runtimeDiagnostics: string[];
  runtimeExports: RuntimeCondition[];
} {
  mkdirSync(resolve("tests/reports"), { recursive: true });
  const temp = mkdtempSync(resolve("tests/reports/aura3d-api-diff-"));
  try {
    const oldDirs = new Map<string, string>(), newDirs = new Map<string, string>();
    for (const [name, pkg] of baseline) oldDirs.set(name, unpackDeclarations(pkg, join(temp, "before")));
    for (const [name, pkg] of candidate) newDirs.set(name, unpackDeclarations(pkg, join(temp, "after")));
    const oldEntriesByPackage = new Map([...baseline].map(([name, pkg]) => [name, expandExports(pkg)]));
    const newEntriesByPackage = new Map([...candidate].map(([name, pkg]) => [name, expandExports(pkg)]));
    const oldAnalyzers = new Map([...baseline].map(([name, pkg]) => [name, createRuntimeExportAnalyzer(pkg)]));
    const newAnalyzers = new Map([...candidate].map(([name, pkg]) => [name, createRuntimeExportAnalyzer(pkg)]));
    const pairs: { name: string; entry: ExportEntry; before: string; after: string }[] = [];
    const runtimeWork: { report: RuntimeCondition; beforeDecl?: string; afterDecl?: string }[] = [];
    const changes: Change[] = [];
    for (const [name, oldPkg] of baseline) {
      const newPkg = candidate.get(name);
      if (!newPkg) {
        const kind = "package-removal" as const;
        changes.push({ package: name, subpath: ".", name, kind, classification: classifyReleaseChange({ kind }, release, version) });
      }
      const binNames = (pkg: PackedPackage | undefined): string[] => {
        if (!pkg?.manifest.bin) return [];
        return typeof pkg.manifest.bin === "string" ? [pkg.manifest.name.split("/").at(-1)!] : Object.keys(pkg.manifest.bin);
      };
      const candidateBins = new Set(binNames(newPkg));
      for (const bin of binNames(oldPkg)) if (!candidateBins.has(bin)) {
        const kind = "bin-removal" as const;
        changes.push({ package: name, subpath: ".", name: bin, kind, classification: classifyReleaseChange({ kind }, release, version) });
      }
      const oldEntries = oldEntriesByPackage.get(name)!;
      const newEntries = newEntriesByPackage.get(name) ?? [];
      const byPath = new Map(newEntries.map((entry) => [entry.subpath, entry]));
      for (const entry of oldEntries) {
        const replacement = byPath.get(entry.subpath);
        changes.push(...compareEntryConditions(name, entry, replacement, release, version));
        if (!replacement || entry.asset || replacement.asset) continue;
        // Each declared condition must be represented; pair every old declaration
        // with its matching condition where possible and otherwise the default one.
        for (const decl of entry.declarations) {
          const key = Object.keys(entry.conditions).find((k) => entry.conditions[k]?.slice(2) === decl);
          const mapped = key ? replacement.conditions[key]?.slice(2) : undefined;
          const newDecl = mapped && replacement.declarations.includes(mapped) ? mapped : replacement.declarations[0];
          if (!newDecl) throw new Error(`No candidate declaration for ${name}:${entry.subpath}`);
          pairs.push({ name, entry, before: join(oldDirs.get(name)!, decl), after: join(newDirs.get(name)!, newDecl) });
        }
      }
    }
    for (const name of [...new Set([...baseline.keys(), ...candidate.keys()])].sort()) {
      const oldEntries = new Map((oldEntriesByPackage.get(name) ?? []).map((entry) => [entry.subpath, entry]));
      const newEntries = new Map((newEntriesByPackage.get(name) ?? []).map((entry) => [entry.subpath, entry]));
      for (const subpath of [...new Set([...oldEntries.keys(), ...newEntries.keys()])].sort()) {
        const oldEntry = oldEntries.get(subpath), newEntry = newEntries.get(subpath);
        const conditions = [...new Set([...Object.keys(oldEntry?.conditions ?? {}), ...Object.keys(newEntry?.conditions ?? {})])].sort();
        for (const condition of conditions) {
          if (condition.split("/").includes("types")) continue;
          const oldTarget = oldEntry?.conditions[condition], newTarget = newEntry?.conditions[condition];
          if (!(oldTarget && !oldEntry?.asset) && !(newTarget && !newEntry?.asset)) continue;
          const before = oldTarget ? oldAnalyzers.get(name)!.analyze(oldTarget, condition) : undefined;
          const after = newTarget ? newAnalyzers.get(name)!.analyze(newTarget, condition) : undefined;
          const beforeDecl = oldTarget && oldEntry && !oldEntry.asset ? declarationForCondition(oldEntry, condition, oldTarget) : undefined;
          const afterDecl = newTarget && newEntry && !newEntry.asset ? declarationForCondition(newEntry, condition, newTarget) : undefined;
          runtimeWork.push({
            report: { package: name, subpath, condition, ...(before ? { before } : {}), ...(after ? { after } : {}) },
            ...(beforeDecl ? { beforeDecl: join(oldDirs.get(name)!, beforeDecl) } : {}),
            ...(afterDecl ? { afterDecl: join(newDirs.get(name)!, afterDecl) } : {})
          });
        }
      }
    }
    const paths = [...new Set([
      ...pairs.flatMap((pair) => [pair.before, pair.after]),
      ...runtimeWork.flatMap((item) => [item.beforeDecl, item.afterDecl].filter((path): path is string => !!path))
    ])];
    const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, noEmit: true, skipLibCheck: false, strict: true, types: [], noErrorTruncation: true };
    const host = ts.createCompilerHost(options);
    const packedManifests = new Map<string, string>();
    for (const dir of oldDirs.values()) packedManifests.set(join(dir, "package.json"), "before");
    for (const dir of newDirs.values()) packedManifests.set(join(dir, "package.json"), "after");
    const readHostFile = host.readFile.bind(host);
    host.readFile = (path) => {
      const contents = readHostFile(path), side = packedManifests.get(resolve(path));
      if (!contents || !side) return contents;
      // Prevent TypeScript's same-name/version package redirect from merging
      // physically different before/after archives. Only the compiler's
      // in-memory identity is tagged; the packed manifest stays untouched.
      const manifest = JSON.parse(contents) as { version?: string };
      if (typeof manifest.version !== "string") return contents;
      manifest.version += `${manifest.version.includes("+") ? "." : "+"}aura3d-diff.${side}`;
      return JSON.stringify(manifest);
    };
    const program = ts.createProgram(paths, options, host);
    const checker = program.getTypeChecker();
    // Compiler errors. The published baseline's own declaration errors (and errors in
    // third-party declarations) cannot be repaired by this release, so only errors
    // that appear on the candidate side with no equivalent on the baseline side block.
    // Positions are dropped from the equivalence key because the files differ.
    const sideOf = (path: string): "before" | "after" | undefined => { const first = path.split(sep)[0]; return first === "before" || first === "after" ? first : undefined; };
    const compilerErrors = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error).map((d) => {
      const file = d.file ? relative(temp, d.file.fileName) : "", message = ts.flattenDiagnosticMessageText(d.messageText, " ");
      const normalize = (text: string) => text.replaceAll(`${temp}${sep}`, "").replace(/(^|[\\/"'])(?:before|after)([\\/]node_modules[\\/])/g, "$1<side>$2");
      // The baseline and candidate copies share one compiler program, so a `declare global`
      // block that both define can collide across sides (TS2717 and similar, with the
      // earlier declaration in `relatedInformation`). That is produced by the comparison
      // harness, not by either archive on its own: classify it as cross-side.
      const crossSide = (d.relatedInformation ?? []).some((related) => related.file && sideOf(relative(temp, related.file.fileName)) !== undefined && sideOf(relative(temp, related.file.fileName)) !== sideOf(file));
      return { side: crossSide ? undefined : sideOf(file), key: normalize(`${file}|TS${d.code}|${message}`), text: `${crossSide ? "[cross-side] " : ""}${file}:${d.start ?? 0} TS${d.code} ${message}` };
    });
    const baselineErrorKeys = new Set(compilerErrors.filter((error) => error.side === "before").map((error) => error.key));
    const introducedErrors = compilerErrors.filter((error) => error.side === "after" && !baselineErrorKeys.has(error.key));
    const diagnostics: string[] = introducedErrors.map((error) => error.text);
    const inheritedDiagnostics = compilerErrors.filter((error) => !introducedErrors.includes(error)).map((error) => error.text);
    const valueOf = declarationValues(checker);
    const symbolCache = new Map<string, Map<string, SymbolInfo>>();
    const symbolsFor = (path: string, name: string, subpath: string): Map<string, SymbolInfo> => {
      const cached = symbolCache.get(path);
      if (cached) return cached;
      const file = program.getSourceFile(path);
      if (!file) throw new Error(`Cannot load declarations for ${name}:${subpath}`);
      const result = symbols(checker, file, valueOf);
      for (const symbol of result.values()) {
        if (!symbol.valueVerified) diagnostics.push(`${relative(temp, path)}: cannot verify whether declaration ${JSON.stringify(symbol.name)} is a runtime value`);
      }
      symbolCache.set(path, result);
      return result;
    };
    const closureBudget = createDeclarationClosureBudget(pairs.length), closureCache = createDeclarationClosureCache();
    // Byte-identical declaration files on every package cannot hold a declaration change; the cross-program symbol
    // comparison is nominal for classes with private members and can report a false change for large namespace re-exports.
    const declarationsIdentical = allDeclarationsIdentical(oldDirs, newDirs);
    for (const pair of declarationsIdentical ? [] : pairs) {
      const before = symbolsFor(pair.before, pair.name, pair.entry.subpath), after = symbolsFor(pair.after, pair.name, pair.entry.subpath);
      const ambientBefore = program.getSourceFile(pair.before), ambientAfter = program.getSourceFile(pair.after);
      if (ambientBefore && ambientAfter && (!ts.isExternalModule(ambientBefore) || !ts.isExternalModule(ambientAfter))) {
        // Ambient declaration files: any textual change (or a module/script flip)
        // is a declaration change because no named exports exist to compare.
        const normalize = (file: ts.SourceFile) => `${ts.isExternalModule(file) ? "module" : "script"}:${file.text.replace(/\s+/g, " ").trim()}`;
        const beforeText = normalize(ambientBefore), afterText = normalize(ambientAfter);
        if (beforeText !== afterText) {
          const change = { kind: "declaration-change" as const, before: beforeText, after: afterText };
          changes.push({ package: pair.name, subpath: pair.entry.subpath, name: "<ambient declarations>", ...change, classification: classifyReleaseChange(change, release, version) });
        }
        continue;
      }
      for (const symbol of before.values()) {
        const next = after.get(symbol.name);
        const report = (kind: ReleaseChange["kind"], beforeText?: string, afterText?: string) => changes.push({ package: pair.name, subpath: pair.entry.subpath, name: symbol.name, kind, before: beforeText, after: afterText, classification: classifyReleaseChange({ kind, before: beforeText, after: afterText, removalVersion: symbol.removalVersion }, release, version) });
        if (symbol.value && !next?.value) report("value-removal");
        if (symbol.type && !next?.type) report("type-removal");
        if (!next) continue;
        let compatible = true;
        if (symbol.value && next.value) compatible &&= checker.isTypeAssignableTo(checker.getTypeOfSymbolAtLocation(next.symbol, next.location), checker.getTypeOfSymbolAtLocation(symbol.symbol, symbol.location));
        if (symbol.type && next.type) {
          const oldType = checker.getDeclaredTypeOfSymbol(symbol.symbol), newType = checker.getDeclaredTypeOfSymbol(next.symbol);
          compatible &&= checker.isTypeAssignableTo(oldType, newType) && checker.isTypeAssignableTo(newType, oldType);
        }
        if (!compatible && symbol.signature === next.signature) {
          const label = `${pair.name}${pair.entry.subpath === "." ? "" : pair.entry.subpath.slice(1)}#${symbol.name}`;
          if (declarationClosure(checker, symbol.symbol, closureBudget, label, closureCache) === declarationClosure(checker, next.symbol, closureBudget, label, closureCache)) compatible = true;
        }
        if (!compatible || diagnostics.length > 0) report("declaration-change", symbol.signature, next.signature);
      }
    }
    const runtimeDiagnostics: string[] = [], inheritedRuntimeDiagnostics: string[] = [];
    for (const { report, beforeDecl, afterDecl } of runtimeWork) {
      const scope = `${report.package}:${report.subpath} [${report.condition}]`;
      for (const [side, surface, declaration] of [
        ["baseline", report.before, beforeDecl],
        ["candidate", report.after, afterDecl]
      ] as const) {
        if (!surface) continue;
        for (const issue of surface.issues) runtimeDiagnostics.push(`${side} ${scope}: ${issue}`);
        if (!declaration) {
          runtimeDiagnostics.push(`${side} ${scope}: cannot safely associate a declaration with this runtime condition`);
          continue;
        }
        if (!surface.verified) continue;
        const declared = symbolsFor(declaration, report.package, report.subpath);
        for (const symbol of declared.values()) {
          if (!symbol.valueVerified) {
            runtimeDiagnostics.push(`${side} ${scope}: declaration value ${JSON.stringify(symbol.name)} is unverified`);
          } else if (symbol.value && symbol.name === "export=") {
            runtimeDiagnostics.push(`${side} ${scope}: export= declaration cannot be safely reconciled with runtime names`);
          } else if (symbol.value && !surface.names.includes(symbol.name)) {
            // A published baseline whose declarations over-promise its runtime cannot be
            // repaired by this release; the same defect on the candidate still blocks.
            (side === "baseline" ? inheritedRuntimeDiagnostics : runtimeDiagnostics).push(`${side} ${scope}: declared value ${JSON.stringify(symbol.name)} is missing from ${surface.target}`);
          }
        }
      }
      if (!report.before?.verified || !report.after?.verified) continue;
      const afterNames = new Set(report.after.names);
      const beforeSymbols = beforeDecl ? symbolsFor(beforeDecl, report.package, report.subpath) : undefined;
      for (const name of report.before.names) {
        if (afterNames.has(name)) continue;
        const kind = "runtime-export-removal" as const;
        const removalVersion = beforeSymbols?.get(name)?.removalVersion;
        changes.push({
          package: report.package, subpath: report.subpath, condition: report.condition, name, kind,
          before: report.before.target, after: report.after.target,
          classification: classifyReleaseChange({ kind, removalVersion }, release, version)
        });
      }
    }
    const runtimeExports = runtimeWork.map((item) => item.report);
    const runtimeExportsVerified = runtimeExports.every((item) => (!item.before || item.before.verified) && (!item.after || item.after.verified));
    const declarationDiagnostics = [...new Set(diagnostics)], runtimeProblems = [...new Set(runtimeDiagnostics)];
    const pass = declarationDiagnostics.length === 0 && runtimeProblems.length === 0 && runtimeExportsVerified
      && changes.every((change) => change.classification.compatible);
    return { pass, changes, diagnostics: declarationDiagnostics, inheritedDiagnostics, inheritedRuntimeDiagnostics: [...new Set(inheritedRuntimeDiagnostics)], packagesCompared: baseline.size, runtimeExportsVerified, runtimeDiagnostics: runtimeProblems, runtimeExports };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
function option(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baselinePath = option("--baseline-manifest"), planPath = option("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN, kind = option("--release-kind"), out = option("--out");
  if (!baselinePath || !planPath || !out || !["patch", "minor", "major"].includes(kind ?? "")) throw new Error("Usage: public-surface-diff --baseline-manifest <file> --candidate-plan <plan> --release-kind patch|minor|major --out <file>");
  const plan = loadValidatedReleasePlan(process.cwd(), planPath);
  if (!plan) throw new Error("Validated candidate plan required");
  const baseline = verifyBaseline(baselinePath, plan);
  validateReleaseKind(baseline.manifest.version, plan.version, kind as ReleaseKind);
  const result = diffPackedSurfaces(baseline.packages, candidates(plan), plan.version, kind as ReleaseKind);
  const pass = result.pass;
  const report = { schema: "aura3d.public-surface-diff/2", generatedAt: new Date().toISOString(), baselineVersion: baseline.manifest.version, baselineManifestSha256: sha256(readFileSync(baselinePath)), candidate: plan.reference, candidateVersion: plan.version, releaseKind: kind, ...result };
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  if (!pass) process.exitCode = 1;
  console.log(`packed API diff: ${pass ? "PASS" : "FAIL"}; ${result.changes.filter((change) => change.classification.breaking).length} breaking changes; ${result.diagnostics.length} declaration diagnostics; ${result.runtimeDiagnostics.length} runtime diagnostics; runtime exports ${result.runtimeExportsVerified ? "verified" : "unverified"}`);
}
