/** Discover and build the complete supported example catalog against one packed candidate.
 *
 * Source and browser checks are deliberately separate. This program never starts a browser.
 * Existing consumers are copied without changing their files; an isolated parent manifest maps
 * their declared Aura3D workspace dependencies to the exact candidate archives. The parent
 * manifest and every capability example's added source files are retained as explicit harness work;
 * a capability project is otherwise an untouched create-aura3d scaffold.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { loadValidatedReleasePlan, inspectInstalledRelease } from "../release/exact-release-plan.mjs";
import { assertIndependentNpmConsumer, assertIndependentNpmGraph, inspectIndependentNpmConsumer, seedVerifiedNpmCache } from "../release/portable-npm-lock.mjs";
import type { NpmAdmissionInput } from "../release/portable-npm-lock.mjs";
import { verifyArchiveAdmission, verifyArchiveAdmissionBatch } from "../release/archive-admission.mjs";
import type { ArchiveAdmissionReceipt, SourceEvidenceReference } from "../release/archive-admission.mjs";
import { createA3DProject } from "../../packages/create-aura3d/src/index";
import { extractPackedArchive } from "../docs-codeblocks/index";

export interface ExampleCatalogEntry {
  readonly id: string;
  readonly kind: "starter-example" | "documented-example";
  readonly sourcePath: string;
}
export interface ExampleCheck {
  readonly id: string;
  readonly status: string;
  readonly checks?: readonly { readonly id: string; readonly status: string; readonly exitCode?: number | null }[];
}

const ignored = new Set([".git", "node_modules", "dist", "build", "coverage", "test-results", "playwright-report", ".cache", "reports"]);
const shared = new Set(["common", "wow-common", "shared", "native-capabilities"]);
const diagnosticNames = /^(?:wow-|regression-|three-compat-|legacy-|v9-|threejs-parity-)|(?:-check|-evidence)$/;
const nonPublicLabel = /^(?:internal|diagnostic|retained|removed-from-public-showcase|prototype|blocked|index route|local development|development showcase|playable-showcase|game-layer diagnostic|support-only)/i;
const publicLabel = /^(?:starter example|library demo|release-ready candidate)/i;

function readmeMarksNonPublic(text: string, publicDocumentation: boolean): boolean {
  const classification = /^[ \t]*(?:[-*][ \t]*)?(?:\*\*)?(?:classification|status)(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*`?([^`;\r\n]+)/im.exec(text)?.[1]?.trim();
  if (classification && (nonPublicLabel.test(classification) || /^removed\s+from\s+(?:the\s+)?public\b/i.test(classification))) return true;
  if (/\binternal[- ]only\s*:\s*(?:this|the)\s+(?:app|route|example|project|directory)\b/i.test(text)) return true;
  if (/^[ \t]*internal(?:[ \t]+[a-z][\w-]*){0,5}[ \t]+(?:fixture|diagnostic)\b/im.test(text)) return true;
  const removed = /\bthis\s+(?:app|route|example|project|directory)\s+(?:is|was|has been)\s+removed\s+from\s+(?:the\s+)?public(?:\s+(?:\d+(?:\.\d+)*\s+)?showcase)?\b/i.exec(text);
  if (removed && (!publicDocumentation || !/\bshowcase\b/i.test(removed[0]))) return true;
  if (!publicDocumentation) return /\bnot (?:a |an )?public\b/i.test(text);
  // Public docs can name a supported example whose subfeatures are not public,
  // or whose showcase promotion was removed. Only a route-level denial excludes it.
  return /\b(?:this(?:\s+(?:app|route|example|project|directory))?|the\s+(?:app|route|example|project|directory))\s+(?:is|was)\s+not\s+(?:a |an )?public\b(?!\s+(?:\d+(?:\.\d+)*\s+)?showcase\b)/i.test(text);
}

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path: string): any => JSON.parse(readFileSync(path, "utf8"));
const portable = (path: string) => path.split(sep).join("/");
const redactSensitiveText = (text: string) => text
  .replace(/(https:\/\/[^\s"'<>?]+)\?[^\s"'<>]+/gi, "$1?[redacted]")
  .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[redacted]")
  .replace(/((?:access[_-]?token|authorization|password|secret|sig|sas)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, "$1[redacted]");
const safeLogText = (text: string) => redactSensitiveText(text)
  .replace(/((?:api[-_]?key|credential|private[-_]?key|token)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, "$1[redacted]")
  .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[redacted]@");

export interface ExampleRetainedFile {
  /** Portable path relative to the inventoried directory. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

const privateDirectories = new Set([".git", ".ssh", ".aws", ".azure", ".gcloud", ".gnupg", ".kube", ".docker", ".config", ".codex"]);
const privateFiles = new Set([".npmrc", ".netrc", ".pypirc", ".yarnrc", ".yarnrc.yml", ".git-credentials", ".dockercfg", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);

function assertRetainableName(name: string): void {
  const lower = name.toLowerCase();
  if (/[\\\0\r\n]/.test(name) || privateDirectories.has(lower) || privateFiles.has(lower) ||
      /^\.env(?:$|[._-])/.test(lower) || /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(lower)) {
    // Do not include a sensitive path or file content in a build log.
    throw new Error("Example contains a private, configuration or nonportable path");
  }
}

/**
 * Inventory every regular file that will actually be retained or served.
 * Unlike source discovery, this intentionally includes nested dist, build,
 * reports and other output directories. Only dependency trees may be omitted.
 * Symlinks and special files fail closed rather than disappearing from a hash.
 */
export function collectExampleRetainedFiles(directory: string, options: { readonly excludeNodeModules?: boolean; readonly rejectNodeModules?: boolean; readonly rejectEmptyDirectories?: boolean } = {}): ExampleRetainedFile[] {
  const root = resolve(directory);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("Example inventory root must be a real directory");
  const files: ExampleRetainedFile[] = [];
  const visit = (current: string): void => {
    const start = files.length;
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      assertRetainableName(entry.name);
      const absolute = resolve(current, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Example contains an unverified symlink");
      if (options.rejectNodeModules && entry.name.toLowerCase() === "node_modules") throw new Error("Example output contains a dependency tree");
      if (options.excludeNodeModules && entry.name.toLowerCase() === "node_modules") {
        if (!stat.isDirectory()) throw new Error("Example dependency tree is not a directory");
        continue;
      }
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) {
        const bytes = readFileSync(absolute);
        if (/\.(?:js|mjs|cjs|ts|tsx|jsx|json|html|css|svg|md|txt|log|xml|yaml|yml)$/i.test(entry.name)) {
          const text = bytes.toString("utf8");
          if (redactSensitiveText(text) !== text) throw new Error("Example contains credential-like text");
        }
        files.push({ path: portable(relative(root, absolute)), sha256: hash(bytes), bytes: bytes.byteLength });
      } else throw new Error("Example contains an unsupported filesystem entry");
    }
    // File-only staging cannot recreate an empty directory. Refuse rather
    // than silently changing a source or served directory's semantics.
    if (options.rejectEmptyDirectories && current !== root && files.length === start) throw new Error("Example contains an empty retained directory");
  };
  visit(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Hash the exact sorted file inventory; each row already binds the file bytes. */
export function exampleRetainedFilesDigest(files: readonly ExampleRetainedFile[]): string {
  return hash(JSON.stringify(files));
}

/** Recompute the complete retained wrapper and served-output identities. */
export function assertExampleRetainedIdentity(wrapper: string, dist: string, project: {
  readonly retainedFiles: readonly ExampleRetainedFile[];
  readonly retainedSha256: string;
  readonly outputFiles: readonly ExampleRetainedFile[];
  readonly outputSha256: string;
}): void {
  const retainedFiles = collectExampleRetainedFiles(wrapper, { excludeNodeModules: true, rejectEmptyDirectories: true });
  if (!Array.isArray(project.retainedFiles) || JSON.stringify(retainedFiles) !== JSON.stringify(project.retainedFiles) ||
      exampleRetainedFilesDigest(retainedFiles) !== project.retainedSha256) throw new Error("retained example file inventory changed");
  const outputFiles = collectExampleRetainedFiles(dist, { rejectNodeModules: true, rejectEmptyDirectories: true });
  if (!Array.isArray(project.outputFiles) || JSON.stringify(outputFiles) !== JSON.stringify(project.outputFiles) ||
      exampleRetainedFilesDigest(outputFiles) !== project.outputSha256) throw new Error("built browser artifact is missing or changed");
}

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function classifications(root: string): Map<string, string> {
  const file = resolve(root, "docs/project/showcase/apps-classification.md");
  if (!existsSync(file)) throw new Error(`Missing required classification: ${file}`);
  const labels = new Map<string, string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (!match) continue;
    const raw = match[1]!.trim().replace(/^\/+|\/+$/g, "");
    const label = match[2]!.trim();
    const parts = raw.split("/");
    if (parts.length > 2 || (parts.length === 2 && !["apps", "examples"].includes(parts[0]!))) continue;
    const name = parts.at(-1)!;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) continue;
    // The label definitions table is not a route table.
    if (label.endsWith(".") && parts.length === 1 && /^[a-z ]+$/.test(name)) continue;
    const key = parts.length === 2 ? raw : (existsSync(resolve(root, "examples", name)) && !existsSync(resolve(root, "apps", name)) ? `examples/${name}` : `apps/${name}`);
    if (!labels.has(key)) labels.set(key, label);
  }
  return labels;
}

export interface ExampleExemption { readonly sourcePath: string; readonly reason: string; }

/** Current source-derived public route inventory; no generated report or Git checkout required. */
export function discoverExampleCatalog(root: string): { entries: ExampleCatalogEntry[]; exemptions: ExampleExemption[] } {
  root = resolve(root);
  const labels = classifications(root);
  const gatesFile = resolve(root, "tools/showcase-library/route-gates.json");
  if (!existsSync(gatesFile)) throw new Error(`Missing required route gates: ${gatesFile}`);
  const gates = readJson(gatesFile);
  if (!Array.isArray(gates.routes)) throw new Error("Route gates lack a routes array");
  const gateClasses = new Map<string, string>(gates.routes.map((entry: any) => [`apps/${entry.id}`, entry.releaseClass]));
  const references = new Set<string>();
  const publicReferences = new Set<string>();
  // Published game URLs can use a public slug (`/apps/chroma-roll/`) that is
  // not a source directory. The site catalog maps each slug to its source
  // folder; resolve such a mention to that folder instead of a missing example.
  const routeAliases = new Map<string, string>();
  const siteCatalogFile = resolve(root, "tools/site/games.catalog.json");
  if (existsSync(siteCatalogFile)) {
    for (const entry of readJson(siteCatalogFile).games ?? []) {
      const slug = typeof entry?.url === "string" ? /^\/apps\/([a-z0-9][a-z0-9-]*)\/$/.exec(entry.url)?.[1] : undefined;
      if (!slug || typeof entry.appFolder !== "string" || slug === entry.appFolder) continue;
      if (existsSync(resolve(root, "apps", slug)) || !existsSync(resolve(root, "apps", entry.appFolder))) continue;
      routeAliases.set(`apps/${slug}`, `apps/${entry.appFolder}`);
    }
  }
  // Route tiers use public documentation and retained spec/gate file references. Scan source
  // directly: source-job images intentionally need not contain Git metadata.
  for (const base of ["docs", "tests/browser", "tests/unit", "tools", "packages", "README.md", "llms.txt"]) {
    const source = resolve(root, base);
    for (const file of existsSync(source) && lstatSync(source).isFile() ? [source] : walkFiles(source)) {
      if (!/\.(?:md|txt|ts|tsx|js|mjs|cjs|json)$/.test(file)) continue;
      if (base === "packages" && !/\.md$/.test(file)) continue;
      // The ACR source pass writes its staged-file list (every path in the
      // candidate) here; it is a file inventory, not a reference to a route.
      if (portable(relative(root, file)) === "tools/remote-acr/.source5-manifest.txt") continue;
      const text = readFileSync(file, "utf8");
      const isDocument = base === "docs" || base === "packages" || base === "README.md" || base === "llms.txt";
      // Docs and retained specs also use root-relative and ../ links. Preserve
      // their route identity without matching an unrelated nested vendor path.
      const pattern = isDocument
        ? /(?<![\w/.-])(?:\/|(?:\.{1,2}\/)+)?(apps|examples)\/([a-z0-9][a-z0-9-]*)(?![a-z0-9-])/g
        : /(?<![\w/.-])(?:\/|(?:\.{1,2}\/)+)?(apps|examples)\/([a-z0-9][a-z0-9-]*)\/[a-zA-Z0-9_.-]+/g;
      for (const match of text.matchAll(pattern)) {
        if (match[2]!.endsWith("-")) continue; // prose globs such as apps/showcase-*
        const mentioned = `${match[1]}/${match[2]}`;
        const route = routeAliases.get(mentioned) ?? mentioned;
        references.add(route);
        const docPath = portable(relative(root, file));
        // Include the documentation hub and the reader-facing sections it links.
        // A missing source must still enter the catalog and fail validation.
        if (/^docs\/(?:agents|animation|animation-studio|api|concepts|examples|guides|migration|rendering|templates|workflows)\//.test(docPath) ||
            /^docs\/[^/]+\.(?:md|txt)$/.test(docPath) || ["README.md", "llms.txt"].includes(docPath) ||
            /^packages\/[^/]+\/README\.md$/.test(docPath)) publicReferences.add(route);
      }
    }
  }
  const candidates = new Set<string>([...labels.keys(), ...gateClasses.keys(), ...references]);
  const entries: ExampleCatalogEntry[] = [];
  const exemptions: ExampleExemption[] = [];
  for (const path of [...candidates].sort()) {
    const [directory, name] = path.split("/");
    if (!name) continue;
    const gate = gateClasses.get(path);
    const label = labels.get(path);
    const definedPublic = Boolean((gate && /^release-ready candidate$/i.test(gate)) || (label && publicLabel.test(label)));
    // This directory contains shared port CSS/diagnostics, not a standalone example.
    // A public classification, public documentation, browser entry, or fixture host
    // instead leaves it in the catalog so a future supported route cannot disappear.
    const portSupport = path === "apps/showcase-port-shared" && existsSync(resolve(root, path)) &&
      !publicReferences.has(path) && !existsSync(resolve(root, path, "index.html")) &&
      !existsSync(resolve(root, path, "package.json")) &&
      !existsSync(resolve(root, "tests/fixtures", name, "index.html"));
    // Explicit non-public classifications take precedence over a documentation mention.
    if (!definedPublic && (shared.has(name) || portSupport)) { exemptions.push({ sourcePath: path, reason: name === "native-capabilities" ? "validated as individually enumerated capability scenarios" : "support-only source directory" }); continue; }
    const nonPublic = gate && !/^release-ready candidate$/i.test(gate) ? gate : (label && nonPublicLabel.test(label) ? label : undefined);
    if (nonPublic) {
      exemptions.push({ sourcePath: path, reason: `non-public classification: ${nonPublic}` });
      continue;
    }
    if (!definedPublic && diagnosticNames.test(name)) { exemptions.push({ sourcePath: path, reason: "diagnostic route naming convention" }); continue; }
    const readme = resolve(root, path, "README.md");
    if (!definedPublic && existsSync(readme) && readmeMarksNonPublic(readFileSync(readme, "utf8"), publicReferences.has(path))) { exemptions.push({ sourcePath: path, reason: "README explicitly marks the route non-public" }); continue; }
    // A leftover directory holding only untracked build output (for example a
    // removed route's copied public/ decoders) is not an example source.
    const hasSource = existsSync(resolve(root, path)) && readdirSync(resolve(root, path)).some((name) => name !== "public" && !ignored.has(name));
    if (!definedPublic && (!references.has(path) || (!hasSource && !publicReferences.has(path)))) {
      exemptions.push({ sourcePath: path, reason: "no current public documentation or classified example" });
      continue;
    }
    if (directory !== "apps" && directory !== "examples") continue;
    const starter = Boolean(label && /^starter example/i.test(label));
    entries.push({ id: starter ? `starter-example:${name}` : `documented-example:${path}`, kind: starter ? "starter-example" : "documented-example", sourcePath: path });
  }
  return { entries, exemptions };
}
export function collectSupportedExampleCatalog(root: string): ExampleCatalogEntry[] { return discoverExampleCatalog(root).entries; }

/** Require every expected case exactly once, including explicit install/build outcomes. */
export function validateExampleChecks(catalog: readonly { readonly id: string }[], cases: readonly ExampleCheck[]): string[] {
  const errors: string[] = [];
  const expected = new Set(catalog.map((entry) => entry.id));
  if (expected.size !== catalog.length || !catalog.length) errors.push("example catalog is empty or contains duplicate IDs");
  const found = new Map<string, ExampleCheck>();
  for (const result of cases) {
    if (found.has(result.id)) errors.push(`${result.id}: duplicate result`);
    found.set(result.id, result);
    if (!expected.has(result.id)) errors.push(`${result.id}: unexpected result`);
  }
  for (const id of expected) {
    const result = found.get(id);
    if (!result) { errors.push(`${id}: missing result`); continue; }
    if (result.status !== "passed") errors.push(`${id}: result is ${result.status || "missing"}`);
    const checks = result.checks ?? [];
    for (const required of ["install", "build"]) {
      const matches = checks.filter((check) => check.id === required);
      if (matches.length !== 1 || matches[0]?.status !== "passed" || matches[0]?.exitCode !== 0) errors.push(`${id}: ${required} did not pass exactly once`);
    }
    for (const check of checks) if (check.status !== "passed" || check.exitCode !== 0) errors.push(`${id}: ${check.id} is ${check.status || "missing"}`);
  }
  return errors;
}

function arrayExport(file: string, exportName: string): readonly ts.Expression[] {
  if (!existsSync(file)) throw new Error(`Missing catalog source ${file}`);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) for (const decl of statement.declarationList.declarations) {
    if (!ts.isIdentifier(decl.name) || decl.name.text !== exportName || !decl.initializer) continue;
    let value: ts.Expression = decl.initializer;
    while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
    if (!ts.isArrayLiteralExpression(value)) throw new Error(`${exportName} must be a static array`);
    return value.elements;
  }
  throw new Error(`Missing ${exportName} in ${file}`);
}

export function collectCapabilityCatalog(root: string): { id: string; kind: "capability-example"; sourcePath: string }[] {
  const sourcePath = "examples/native-capabilities/index.ts";
  return arrayExport(resolve(root, sourcePath), "NATIVE_CAPABILITY_SCENARIOS").map((node) => {
    if (!ts.isObjectLiteralExpression(node)) throw new Error("Capability scenario must be an object literal");
    const field = node.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText().replace(/["']/g, "") === "id");
    if (!field || !ts.isPropertyAssignment(field) || !ts.isStringLiteral(field.initializer) || !/^[a-z0-9-]+$/.test(field.initializer.text)) throw new Error("Capability scenario lacks a literal ID");
    return { id: `capability-example:${field.initializer.text}`, kind: "capability-example" as const, sourcePath };
  });
}

function contentIdentity(dir: string): string {
  const digest = createHash("sha256");
  for (const file of walkFiles(dir)) digest.update(portable(relative(dir, file))).update("\0").update(readFileSync(file)).update("\0");
  return digest.digest("hex");
}
function packageContentHash(directory: string): string {
  const digest = createHash("sha256");
  let count = 0;
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules") continue; // nested packages have separate lock entries
      const absolute = resolve(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Candidate package contains an unverified symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) { digest.update(portable(relative(directory, absolute))).update("\0").update(readFileSync(absolute)).update("\0"); count += 1; }
    }
  };
  visit(directory);
  if (!count) throw new Error(`Candidate package is empty: ${directory}`);
  return digest.digest("hex");
}
function installedPackageContents(wrapper: string, plan: { packages: readonly { name: string }[] }): { path: string; sha256: string }[] {
  const lock = readJson(resolve(wrapper, "package-lock.json"));
  if (!lock.packages || typeof lock.packages !== "object") throw new Error("Installed package lock lacks package entries");
  const results: { path: string; sha256: string }[] = [];
  for (const path of Object.keys(lock.packages).sort()) {
    if (!plan.packages.some((entry) => path === `node_modules/${entry.name}` || path.endsWith(`/node_modules/${entry.name}`))) continue;
    results.push({ path, sha256: packageContentHash(safePath(wrapper, path)) });
  }
  if (!results.length) throw new Error("No installed candidate package contents");
  return results;
}
function validateInstalledRecords(root: string, wrapper: string, plan: any, identities: any[], contents: any[], archiveHashes: Map<string, string>): void {
  const lock = readJson(resolve(wrapper, "package-lock.json"));
  if (!lock.packages || !Array.isArray(identities) || !Array.isArray(contents)) throw new Error("Missing installed lock or package observations");
  const expected: any[] = [], paths: string[] = [];
  for (const [path, observed] of Object.entries(lock.packages) as [string, any][]) {
    const candidate = plan.packages.find((entry: any) => path === `node_modules/${entry.name}` || path.endsWith(`/node_modules/${entry.name}`));
    if (!candidate) continue;
    if (observed.integrity !== candidate.integrity || observed.version !== candidate.version) throw new Error(`Installed lock differs from candidate: ${path}`);
    expected.push({ name: candidate.name, version: candidate.version, integrity: observed.integrity, resolved: observed.resolved, tarball: candidate.tarball, sha256: candidate.sha256 });
    paths.push(path);
    let expectedContent = archiveHashes.get(candidate.name);
    if (!expectedContent) {
      const scratch = mkdtempSync(resolve(tmpdir(), "aura3d-example-archive-"));
      try {
        extractPackedArchive(readFileSync(resolve(root, candidate.tarball)), scratch);
        const archiveManifest = readJson(resolve(scratch, "package.json"));
        if (archiveManifest.name !== candidate.name || archiveManifest.version !== candidate.version) throw new Error(`Candidate archive manifest mismatch: ${candidate.name}`);
        expectedContent = packageContentHash(scratch);
        archiveHashes.set(candidate.name, expectedContent);
      } finally { rmSync(scratch, { recursive: true, force: true }); }
    }
    const observedContent = contents.find((entry) => entry.path === path);
    if (!observedContent || observedContent.sha256 !== expectedContent) throw new Error(`Installed package bytes differ from candidate archive: ${path}`);
  }
  if (!paths.length || JSON.stringify(expected) !== JSON.stringify(identities) || contents.length !== paths.length || new Set(contents.map((entry) => entry.path)).size !== paths.length) throw new Error("Installed package inventory differs from lock");
}
function inside(root: string, child: string): boolean { return child === root || child.startsWith(`${root}${sep}`); }
function safePath(root: string, path: string): string {
  if (typeof path !== "string" || !path || isAbsolute(path) || /[\\\0\r\n]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Expected a safe relative retained path");
  const absolute = resolve(root, path);
  if (!inside(root, absolute)) throw new Error("Path escapes retained root");
  let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Retained path contains a symlink");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return absolute;
}

/** Verify a source report before any browser project can consume it. */
export function validateExampleSourceReport(root: string, reportPath: string, candidatePlanPath: string): any {
  root = resolve(root);
  const planBytes = readFileSync(resolve(root, candidatePlanPath));
  const plan = loadValidatedReleasePlan(root, candidatePlanPath);
  if (!plan) throw new Error("Missing validated candidate plan");
  const report = readJson(resolve(root, reportPath));
  if (report.schema !== "aura3d.native-consumers/1" || report.phase !== "source" || report.pass !== true || report.browser !== "not-run" || report.candidateSha256 !== hash(planBytes) || JSON.stringify(report.source) !== JSON.stringify(plan.source) || JSON.stringify(report.packages) !== JSON.stringify(plan.packages) || report.lockfileSha256 !== plan.source.lockfileSha256) throw new Error("Example source report is failed, malformed, or for another candidate");
  if (!Array.isArray(report.cases) || !Array.isArray(report.projects) || typeof report.runId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(report.runId)) throw new Error("Example source report lacks cases or projects");
  const sourceManifestPath = `tests/reports/native-capabilities/${report.runId}/source-manifest.json`;
  const planPath = portable(relative(root, resolve(root, candidatePlanPath)));
  if (typeof plan.source.manifestSha256 !== "string") throw new Error("Example source report lacks a staged source identity");
  const candidateReviews = readExampleCandidateReviews(root, report.runId, { sourceManifestPath, sourceManifestSha256: plan.source.manifestSha256,
    planPath, candidateSha256: hash(planBytes) }, process.env.AURA3D_CANDIDATE_REVIEWS_JSON);
  if (JSON.stringify(candidateReviewRefs(report.candidateReviews, report.runId)) !== JSON.stringify(candidateReviews)) throw new Error("Example report candidate reviews differ from the retained envelope");
  const catalog = [...collectSupportedExampleCatalog(root), ...collectCapabilityCatalog(root)];
  const errors = validateExampleChecks(catalog, report.cases);
  const archiveHashes = new Map<string, string>();
  const retainedArchiveSnapshots = new Map<string, Uint8Array>();
  const admissions: { id: string; expected: unknown; manifestBytes: Uint8Array; lockBytes: Uint8Array; archives: readonly { resolved: string; bytes: Uint8Array }[] }[] = [];
  const projects = new Map<string, any>();
  for (const project of report.projects) {
    if (!project || projects.has(project.id)) { errors.push(`Duplicate or invalid project: ${project?.id}`); continue; }
    projects.set(project.id, project);
  }
  for (const item of report.cases) {
    const expected = catalog.find((entry) => entry.id === item.id);
    if (!expected || item.kind !== expected.kind || item.sourcePath !== expected.sourcePath) errors.push(`${item.id}: catalog metadata mismatch`);
    for (const check of item.checks ?? []) {
      try {
        if (!Array.isArray(check.command) || !check.command.length) throw new Error("no executed command");
        if (hash(readFileSync(safePath(root, check.logPath))) !== check.logSha256) throw new Error("command log missing or changed");
      } catch (error) { errors.push(`${item.id}: ${check.id} ${String(error)}`); }
    }
    const project = projects.get(item.id);
    if (!project || item.project !== project.path) { errors.push(`${item.id}: missing retained project`); continue; }
    try {
      const dir = safePath(root, project.path);
      const wrapper = safePath(root, project.wrapperPath);
      if (JSON.stringify(candidateReviewRefs(project.candidateReviews, report.runId)) !== JSON.stringify(candidateReviews)) throw new Error("Example project candidate reviews differ from the retained envelope");
      if (!inside(wrapper, dir)) throw new Error("consumer escapes retained wrapper");
      if (contentIdentity(wrapper) !== project.sourceSha256 || hash(readFileSync(resolve(wrapper, "package.json"))) !== project.manifestSha256 || hash(readFileSync(resolve(wrapper, "package-lock.json"))) !== project.lockSha256) throw new Error("project, manifest or lockfile digest changed");
      const dist = resolve(dir, "dist");
      const output = safePath(dist, project.outputEntry);
      if (!existsSync(output) || !lstatSync(output).isFile()) throw new Error("built browser artifact is missing");
      assertExampleRetainedIdentity(wrapper, dist, project);
      if (!Array.isArray(project.installedPackages) || !project.installedPackages.length) throw new Error("no exact candidate packages recorded");
      const graph = verifyExampleInstalledInputs(root, wrapper, plan, project.verifiedArchives, report.runId, undefined, retainedArchiveSnapshots);
      admissions.push({ id: item.id, expected: project.admission, ...graph });
      validateInstalledRecords(root, wrapper, plan, project.installedPackages, project.installedPackageContents, archiveHashes);
    } catch (error) { errors.push(`${item.id}: ${String(error)}`); }
  }
  if (projects.size !== catalog.length) errors.push("retained projects do not match the catalog");
  if (!errors.length) {
    try {
      const receipts = verifyArchiveAdmissionBatch({ root, sourceManifestPath, planPath, candidateReviews,
        consumers: admissions.map(({ manifestBytes, lockBytes, archives }) => ({ manifestBytes, lockBytes, archives })) });
      for (const [index, item] of admissions.entries()) if (JSON.stringify(receipts[index]) !== JSON.stringify(item.expected)) errors.push(`${item.id}: archive admission changed`);
    } catch { errors.push("Example archive admission could not be independently verified"); }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return report;
}

interface RunCheck { id: string; status: "passed" | "failed"; command: string[]; exitCode: number | null; logPath: string; logSha256: string; }
/** Resolve source scripts to an allowlisted argv list, without a shell or npm lifecycle hooks. */
export function sourceScriptCommands(scripts: Record<string, string>, name: string, active: readonly string[] = []): string[][] {
  if (active.includes(name)) throw new Error(`Recursive source script: ${[...active, name].join(" -> ")}`);
  const script = scripts[name];
  if (typeof script !== "string" || !script.trim()) throw new Error(`Missing source script ${name}`);
  if (scripts[`pre${name}`] || scripts[`post${name}`]) throw new Error(`Source script ${name} has lifecycle hooks that cannot be silently skipped`);
  const commands: string[][] = [];
  for (const part of script.split(/\s*&&\s*/)) {
    if (!part || /["'`$|;<>\\\n\r]/.test(part)) throw new Error(`Unsafe source script ${name}: ${part}`);
    const argv = part.trim().split(/\s+/);
    if (argv.some((arg) => safeLogText(arg) !== arg)) throw new Error(`Source script ${name} contains credential-bearing arguments`);
    if (argv[0] === "npm" && argv[1] === "run" && argv.length === 3 && /^[a-zA-Z0-9:_-]+$/.test(argv[2]!)) {
      commands.push(...sourceScriptCommands(scripts, argv[2]!, [...active, name]));
      continue;
    }
    if (argv[0] === "tsc" && !argv.some((arg) => /^(?:-w|--watch|--build|-b)(?:=|$)/.test(arg))) { commands.push(argv); continue; }
    if (argv[0] === "vite" && argv[1] === "build" && !argv.some((arg) => /^(?:-w|--watch)(?:=|$)/.test(arg))) { commands.push(argv); continue; }
    throw new Error(`Source script ${name} invokes an unapproved command: ${part}`);
  }
  return commands;
}
function run(root: string, project: string, logDir: string, id: string, command: string, args: string[], env: NodeJS.ProcessEnv): RunCheck {
  mkdirSync(logDir, { recursive: true });
  const result = spawnSync(command, args, { cwd: project, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const log = resolve(logDir, `${id}.log`);
  writeFileSync(log, safeLogText(`${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${String(result.error)}\n` : ""}`));
  return { id, status: result.status === 0 ? "passed" : "failed", command: [command, ...args], exitCode: result.status, logPath: portable(relative(root, log)), logSha256: hash(readFileSync(log)) };
}
function runSequence(root: string, project: string, wrapper: string, logDir: string, id: string, commands: string[][], env: NodeJS.ProcessEnv): RunCheck {
  const steps: RunCheck[] = [];
  for (const [index, argv] of commands.entries()) {
    const step = run(root, project, logDir, `${id}-${index + 1}`, resolve(wrapper, "node_modules/.bin", argv[0]!), argv.slice(1), env);
    steps.push(step);
    if (step.status !== "passed") break;
  }
  const log = resolve(logDir, `${id}.log`);
  writeFileSync(log, steps.map((step) => `${step.command.join(" ")}\n${readFileSync(resolve(root, step.logPath), "utf8")}`).join("\n"));
  // The aggregate retains each command and its redacted output. Do not leave
  // unreported per-step logs outside the candidate-bound check inventory.
  for (const step of steps) unlinkSync(resolve(root, step.logPath));
  const failure = steps.find((step) => step.status !== "passed");
  return { id, status: !failure && steps.length === commands.length && commands.length > 0 ? "passed" : "failed", command: commands.flatMap((command, index) => index ? ["&&", ...command] : command), exitCode: failure ? failure.exitCode : 0, logPath: portable(relative(root, log)), logSha256: hash(readFileSync(log)) };
}
function failed(root: string, logDir: string, id: string, message: string): RunCheck {
  mkdirSync(logDir, { recursive: true });
  const log = resolve(logDir, `${id}.log`);
  writeFileSync(log, `${safeLogText(message)}\n`);
  return { id, status: "failed", command: [], exitCode: null, logPath: portable(relative(root, log)), logSha256: hash(readFileSync(log)) };
}
function internalPassed(root: string, logDir: string, id: string, command: string[], message: string): RunCheck {
  mkdirSync(logDir, { recursive: true });
  const log = resolve(logDir, `${id}.log`);
  writeFileSync(log, `${message}\n`);
  return { id, status: "passed", command, exitCode: 0, logPath: portable(relative(root, log)), logSha256: hash(readFileSync(log)) };
}
function copyProject(source: string, target: string): void {
  cpSync(source, target, { recursive: true, filter: (path) => {
    const parts = relative(source, path).split(sep);
    if (lstatSync(path).isSymbolicLink()) throw new Error("Consumer contains a symlink");
    if (parts.some((part) => ignored.has(part))) return false;
    for (const part of parts.filter(Boolean)) assertRetainableName(part);
    return true;
  } });
}

const STAGED_PUBLIC_EXTENSIONS = /\.(?:glb|gltf|bin|png|jpe?g|webp|avif|ktx2|hdr|exr|wav|mp3|ogg|json|svg|woff2?|ttf|otf|css|basis|wasm|m?js)$/i;

function relativeSpecifiers(file: string, text: string): string[] {
  const out: string[] = [];
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) out.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  } else if (/\.css$/.test(file)) {
    for (const match of text.matchAll(/@import\s+(?:url\()?["']([^"')]+)["']/g)) out.push(match[1]!);
  } else if (/\.html$/.test(file)) {
    for (const match of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) out.push(match[1]!);
  }
  return out.filter((specifier) => specifier.startsWith("."));
}

function rootAbsoluteUrls(text: string): string[] {
  return [...text.matchAll(/["'`](\/[A-Za-z0-9_][A-Za-z0-9_./-]*)["'`]/g)].map((match) => match[1]!).filter((url) => STAGED_PUBLIC_EXTENSIONS.test(url) && !url.includes(".."));
}

/**
 * The repository dev server serves `public/` and the repository root at `/`.
 * Resolve a root-absolute URL the way it does, never into package source,
 * dependency trees or VCS metadata.
 */
export function rootServedFile(root: string, url: string, publicDirs: readonly string[] = []): string | undefined {
  const path = url.slice(1);
  const first = path.split("/")[0]!;
  // A staged sibling app's own public/ is also served at `/` when that app is
  // the page (port wrappers keep their game's assets there).
  for (const candidate of [resolve(root, "public", path), ...(["packages", "node_modules", ".git", "src"].includes(first) ? [] : [resolve(root, path)]),
    ...publicDirs.map((directory) => resolve(root, directory, path))]) {
    if (candidate.startsWith(`${resolve(root)}${sep}`) && existsSync(candidate) && lstatSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/** Keys an example reads from the repo-root typed asset map, mapped to their `/aura-assets/` URLs. */
function rootAssetUrls(assetMap: string, exampleText: string): string[] {
  const keys = new Set<string>();
  for (const match of exampleText.matchAll(/\bassets(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g)) keys.add(match[1] ?? match[2]!);
  const urls: string[] = [];
  let current: string | undefined;
  for (const line of assetMap.split("\n")) {
    const key = /^ {2}"([^"]+)": \{\s*$/.exec(line)?.[1];
    if (key) { current = key; continue; }
    const url = current && keys.has(current) ? /^ {4}url: "(\/[^"]+)",?\s*$/.exec(line)?.[1] : undefined;
    if (url) { urls.push(url); current = undefined; }
  }
  return urls;
}

/**
 * Stage the out-of-project source an example imports by relative path, exactly
 * as it exists in the source tree: a sibling `apps/<name>` or `examples/<name>`
 * directory (port wrappers mounting an `examples/*-port`, shared port support)
 * or a single repo-root module such as `src/aura-assets.ts`. Workspace package
 * source is never staged; those imports must resolve through the candidate
 * archives. Root `public/` files the staged sources name by root-absolute URL
 * (and the `/aura-assets/` files of the root asset-map keys they read) are
 * copied into a harness public directory. Every staged path is returned for
 * the report's harness record; nothing in the example itself is changed.
 */
export function stageExampleDependencies(root: string, wrapper: string, project: string, hosts: readonly string[] = []): { staged: string[]; publicFiles: string[]; publicDirs: string[] } {
  const staged: string[] = [], publicFiles = new Set<string>(), publicDirs: string[] = [];
  const named = new Set<string>();
  const pending = [project, ...hosts];
  const scanned = new Set<string>();
  let assetMapText: string | undefined;
  const exampleText: string[] = [];
  while (pending.length) {
    const unit = pending.shift()!;
    const files = lstatSync(unit).isDirectory() ? walkFiles(unit) : [unit];
    for (const file of files) {
      if (scanned.has(file)) continue;
      scanned.add(file);
      const rootFile = resolve(root, relative(wrapper, file));
      if (/(?:^|[\\/])tsconfig[\w.-]*\.json$/.test(file)) {
        // A shared compiler config (`extends: ../../tsconfig.base.json`) is
        // staged with its extends chain. Its workspace `paths` point at package
        // source that is not staged, so TypeScript falls back to the installed
        // candidate packages.
        let config: any;
        try { config = ts.parseConfigFileTextToJson(file, readFileSync(file, "utf8")).config; } catch { config = undefined; }
        for (const parent of [config?.extends].flat().filter((value: unknown): value is string => typeof value === "string" && value.startsWith("."))) {
          const source = resolve(dirname(rootFile), parent.endsWith(".json") ? parent : `${parent}.json`);
          const fromRoot = portable(relative(root, source));
          if (fromRoot.startsWith("../") || !existsSync(source) || existsSync(resolve(wrapper, fromRoot))) continue;
          const destination = resolve(wrapper, fromRoot);
          mkdirSync(dirname(destination), { recursive: true });
          cpSync(source, destination);
          staged.push(fromRoot);
          pending.push(destination);
        }
        continue;
      }
      // Build-tool configs are the consumer's own; a root config that aliases
      // workspace source must not be staged into the candidate-only build.
      if (!/\.(?:[cm]?[jt]sx?|css|html)$/.test(file) || /(?:^|[\\/])(?:vite|vitest|playwright)\.config\.[cm]?[jt]s$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (portable(relative(root, rootFile)) !== "src/aura-assets.ts") {
        exampleText.push(text);
        for (const url of rootAbsoluteUrls(text)) {
          named.add(url);
        }
      }
      for (const specifier of relativeSpecifiers(file, text)) {
        const target = resolve(dirname(rootFile), specifier.split(/[?#]/)[0]!);
        const fromRoot = portable(relative(root, target));
        if (fromRoot.startsWith("../") || isAbsolute(fromRoot) || existsSync(resolve(wrapper, fromRoot))) continue;
        const parts = fromRoot.split("/");
        if (parts[0] === "packages" || parts.includes("node_modules")) continue;
        let source: string | undefined;
        if ((parts[0] === "apps" || parts[0] === "examples") && parts.length >= 2) source = resolve(root, parts[0], parts[1]!);
        else {
          const base = target.replace(/\.js$/, "");
          source = [target, `${base}.ts`, `${base}.tsx`, `${target}.ts`, resolve(target, "index.ts")].find((candidate) => existsSync(candidate) && lstatSync(candidate).isFile());
        }
        if (!source || !existsSync(source)) continue;
        const destination = resolve(wrapper, relative(root, source));
        if (existsSync(destination)) continue;
        if (lstatSync(source).isDirectory()) copyProject(source, destination);
        else { mkdirSync(dirname(destination), { recursive: true }); cpSync(source, destination); }
        staged.push(portable(relative(root, source)));
        if (lstatSync(source).isDirectory() && existsSync(resolve(source, "public"))) publicDirs.push(`${portable(relative(root, source))}/public`);
        if (portable(relative(root, source)) === "src/aura-assets.ts") assetMapText = readFileSync(source, "utf8");
        else pending.push(destination);
      }
    }
  }
  if (assetMapText) for (const url of rootAssetUrls(assetMapText, exampleText.join("\n"))) named.add(url);
  for (const url of named) if (!existsSync(resolve(project, "public", url.slice(1))) && rootServedFile(root, url, publicDirs)) publicFiles.add(url.slice(1));
  // Staged stylesheets and glTF files carry their own references (font files,
  // external buffers and images); follow them so the staged file is complete.
  const followed = [...publicFiles];
  while (followed.length) {
    const path = followed.shift()!;
    const file = rootServedFile(root, `/${path}`, publicDirs);
    if (!file || !/\.(?:css|gltf)$/i.test(path)) continue;
    const text = readFileSync(file, "utf8");
    const references = /\.css$/i.test(path)
      ? [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)].map((match) => (match[1] ?? match[2])!)
      : (() => { try { const gltf = JSON.parse(text); return [...(gltf.buffers ?? []), ...(gltf.images ?? [])].map((item: any) => item?.uri).filter((uri: unknown): uri is string => typeof uri === "string"); } catch { return []; } })();
    for (const reference of references) {
      if (/^(?:data:|[a-z]+:\/\/|#)/i.test(reference)) continue;
      const url = reference.startsWith("/") ? reference.split(/[?#]/)[0]! : new URL(reference, `http://x/${path}`).pathname;
      const next = decodeURIComponent(url).slice(1);
      if (!publicFiles.has(next) && !existsSync(resolve(project, "public", next)) && rootServedFile(root, `/${next}`, publicDirs)) { publicFiles.add(next); followed.push(next); }
    }
  }
  return { staged, publicFiles: [...publicFiles].sort(), publicDirs };
}

/** create-aura3d template that every capability project is scaffolded from (it ships the admitted barbarian). */
export const CAPABILITY_SCAFFOLD_TEMPLATE = "mini-game" as const;
/** The only project files a capability project adds or replaces; everything else is the untouched scaffold. */
export const CAPABILITY_PROJECT_FILES = Object.freeze(["src/main.ts", "src/scenario.ts"] as const);

/**
 * Scaffold an untouched create-aura3d project, then add only the capability
 * source: the scenario module and the scene module the scaffold's own
 * index.html imports. Manifest, configs, index.html, typed assets and public
 * files are exactly the scaffold's output.
 */
export function makeCapabilityProject(root: string, project: string, id: string): string[] {
  const scaffold = createA3DProject({ targetDir: project, template: CAPABILITY_SCAFFOLD_TEMPLATE, rootDir: resolve(root, "packages/create-aura3d") });
  if (scaffold.missingAssets.length) throw new Error(`Capability scaffold lacks template assets: ${scaffold.missingAssets.map((entry) => entry.path).join(", ")}`);
  if (!/<script type="module" src="\.\/src\/main\.ts"><\/script>/.test(readFileSync(resolve(project, "index.html"), "utf8"))) throw new Error("Capability scaffold entry must import src/main.ts");
  const assetManifest = readJson(resolve(project, "aura.assets.json"));
  const asset = assetManifest.assets?.find((item: any) => item.id === "kaykitBarbarian");
  if (!asset || asset.license !== "CC0" || !asset.animations?.includes("Idle") || !/^sha256-[a-f0-9]{64}$/i.test(asset.hash)) throw new Error("Capability asset requires admitted CC0 provenance and an inspected Idle clip");
  if (`sha256-${hash(readFileSync(resolve(project, "public/aura-assets/kaykit-barbarian.glb")))}` !== asset.hash) throw new Error("Capability asset bytes differ from the admitted asset hash");
  cpSync(resolve(root, "examples/native-capabilities/index.ts"), resolve(project, "src/scenario.ts"));
  writeFileSync(resolve(project, "src/main.ts"), `import { assets } from "./aura-assets";
import { mountNativeCapabilityScenario, queryNativeScenarioBounds } from "./scenario";
const scenarioId: string = ${JSON.stringify(id)};
void mountNativeCapabilityScenario(${JSON.stringify(id)}, { target: "#app", asset: assets.kaykitBarbarian, animationClip: "Idle" }).then(app => {
  if (scenarioId === "bounds-query") {
    try {
      const hit = queryNativeScenarioBounds(app);
      const vector = (value: readonly number[]) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
      if (!hit || hit.nodeName !== "subject" || !Number.isFinite(hit.distance) || hit.distance <= 0 ||
          !vector(hit.point) || !vector(hit.normal) || Math.hypot(...hit.normal) < 0.5 ||
          Math.abs(hit.point[0] + 1) > 0.0001 || Math.abs(hit.point[1] - 0.8) > 0.0001 ||
          Math.abs(hit.point[2] - (6 - hit.distance)) > 0.001) {
        throw new Error("Bounds query returned an invalid subject hit.");
      }
      (window as any).__AURA_EXAMPLE_BOUNDS_HIT__ = hit;
    } catch (error) {
      app.dispose();
      throw error;
    }
  }
  (window as any).__AURA_EXAMPLE_APP__ = app;
  document.body.dataset.aura3dReady = "true";
}).catch(error => { document.body.dataset.aura3dError = String(error); throw error; });
`);
  return [...CAPABILITY_PROJECT_FILES];
}

function standaloneHarness(root: string, wrapper: string, project: string, entry: ExampleCatalogEntry): { manifest: any; files: string[]; outputEntry: string } {
  let html = resolve(project, "index.html");
  const files = ["aura-example.vite.mjs", "aura-example.tsconfig.json"];
  if (!existsSync(html)) {
    const fixture = `tests/fixtures/${entry.sourcePath.split("/").at(-1)}`;
    if (!existsSync(resolve(root, fixture, "index.html"))) throw new Error(`Missing package.json and browser entry point in ${entry.sourcePath}`);
    copyProject(resolve(root, fixture), resolve(wrapper, fixture));
    files.push(`${fixture} (documented browser host)`);
    html = resolve(wrapper, fixture, "index.html");
  }
  const staging = stageExampleDependencies(root, wrapper, project, html.startsWith(`${project}${sep}`) ? [] : [dirname(html)]);
  files.push(...staging.staged.map((path) => `${path} (staged source dependency)`));
  let publicRelative: string | undefined;
  if (staging.publicFiles.length) {
    // One Vite publicDir: the example's own public files plus the root public
    // files its sources name, copied unchanged into a recorded harness folder.
    const harnessPublic = resolve(wrapper, "aura-example-public");
    if (existsSync(resolve(project, "public"))) copyProject(resolve(project, "public"), harnessPublic);
    for (const path of staging.publicFiles) {
      mkdirSync(dirname(resolve(harnessPublic, path)), { recursive: true });
      cpSync(rootServedFile(root, `/${path}`, staging.publicDirs)!, resolve(harnessPublic, path));
    }
    publicRelative = "aura-example-public";
    files.push(...staging.publicFiles.map((path) => `aura-example-public/${path} (staged root public file)`));
  }
  const rootManifest = readJson(resolve(root, "package.json"));
  const vite = rootManifest.devDependencies?.vite, typescript = rootManifest.devDependencies?.typescript;
  if (!vite || !typescript) throw new Error("Source manifest must declare Vite and TypeScript for standalone harnesses");
  const discovered = new Set<string>();
  for (const file of walkFiles(wrapper).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:")) discovered.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const versions = { ...rootManifest.dependencies, ...rootManifest.devDependencies, ...rootManifest.optionalDependencies };
  const dependencies: Record<string, string> = {};
  for (const name of discovered) {
    if (/^(?:three|babylonjs|@babylonjs\/)/.test(name)) throw new Error(`Example imports a prohibited external 3D engine: ${name}`);
    if (name.startsWith("@aura3d/") || name === "create-aura3d") dependencies[name] = "workspace:*";
    else if (typeof versions[name] === "string") dependencies[name] = versions[name];
    else throw new Error(`Standalone example does not declare a version for dependency ${name}`);
  }
  // The config and manifest are new harness files outside the untouched example, and are
  // retained and recorded; missing external imports or relative support remain build failures.
  const projectRelative = portable(relative(wrapper, project));
  const htmlRelative = portable(relative(wrapper, html));
  writeFileSync(resolve(wrapper, "aura-example.vite.mjs"), `import { defineConfig } from "vite";\nimport { existsSync } from "node:fs";\nimport { dirname, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";\nconst root = dirname(fileURLToPath(import.meta.url));\nconst project = resolve(root, ${JSON.stringify(projectRelative)});\nconst publicDir = ${publicRelative ? `resolve(root, ${JSON.stringify(publicRelative)})` : `resolve(project, "public")`};\nexport default defineConfig({ root, publicDir: existsSync(publicDir) ? publicDir : false, build: { outDir: resolve(project, "dist"), emptyOutDir: true, rollupOptions: { input: resolve(root, ${JSON.stringify(htmlRelative)}) } } });\n`);
  writeFileSync(resolve(wrapper, "aura-example.tsconfig.json"), `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: true, noEmit: true }, include: [`${projectRelative}/**/*.ts`, `${projectRelative}/**/*.tsx`, `${portable(dirname(htmlRelative))}/**/*.ts`] }, null, 2)}\n`);
  return { manifest: { dependencies, devDependencies: { typescript, vite } }, files, outputEntry: htmlRelative };
}

function wrapperDependencies(manifest: any, plan: any): Record<string, string> {
  const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies } as Record<string, string>;
  for (const name of Object.keys(declared)) if (/^(?:three|babylonjs|@babylonjs\/)/.test(name)) throw new Error(`Consumer declares a prohibited external 3D engine: ${name}`);
  const candidates = new Map<string, any>(plan.packages.map((entry: any) => [entry.name, entry]));
  const queue = Object.keys(declared).filter((name) => candidates.has(name));
  for (const name of Object.keys(declared)) if ((name.startsWith("@aura3d/") || name === "create-aura3d") && !candidates.has(name)) throw new Error(`Missing candidate package ${name}`);
  while (queue.length) {
    const name = queue.shift()!;
    const entry = candidates.get(name)!;
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) throw new Error(`Candidate package lacks a valid digest: ${name}`);
    const local = `aura-candidates/${entry.sha256}.tgz`;
    declared[name] = `file:${local}`;
    for (const dependency of entry.internalDependencies ?? []) if (!declared[dependency]?.startsWith("file:")) queue.push(dependency);
  }
  for (const [name, version] of Object.entries(declared)) if (version.startsWith("workspace:") || version.startsWith("file:") && !candidates.has(name)) throw new Error(`Dependency ${name} requires an unstaged local workspace/file`);
  return declared;
}

interface ExampleInstallInput {
  readonly id: string;
  readonly manifestSha256: string;
  readonly lockPath: string;
  readonly lockSha256: string;
  readonly archives: readonly { readonly resolved: string; readonly path: string }[];
}

interface ExampleInstallBundle {
  readonly schema: "aura3d.native-example-locks/1";
  readonly runId: string;
  readonly candidateSha256: string;
  readonly sourceInputDigest: string;
  readonly examples: readonly ExampleInstallInput[];
}

function candidateReviewRefs(value: unknown, runId: string): SourceEvidenceReference[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(runId) || !Array.isArray(value) || value.length > 10000) throw new Error("Invalid example candidate review inventory");
  const prefix = `tests/reports/native-source-inputs/${runId}/candidate-reviews/`;
  let previous = "";
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "path,sha256") throw new Error("Invalid example candidate review reference");
    const { path, sha256 } = item as { path?: unknown; sha256?: unknown };
    if (typeof path !== "string" || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256) ||
        path !== `${prefix}${sha256}.json` || (previous && previous >= path)) throw new Error("Invalid or unordered example candidate review reference");
    previous = path;
    return { path, sha256 };
  });
}

/** Read the retained envelope; environment values can only agree with it. */
export function readExampleCandidateReviews(root: string, runId: string, context: { readonly sourceManifestPath: string; readonly sourceManifestSha256: string; readonly planPath: string; readonly candidateSha256: string }, environmentValue?: string): SourceEvidenceReference[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(runId)) throw new Error("Invalid example candidate review run");
  const envelopePath = safePath(root, `tests/reports/native-source-inputs/${runId}/inputs.json`);
  const stat = lstatSync(envelopePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > 16 * 1024 * 1024) throw new Error("Invalid example candidate review envelope");
  const envelope = readJson(envelopePath);
  if (envelope?.schema !== "aura3d.native-portable-inputs/1" || envelope.runId !== runId ||
      envelope.sourceManifest?.path !== context.sourceManifestPath || envelope.sourceManifest?.sha256 !== context.sourceManifestSha256 ||
      envelope.candidatePlan?.path !== context.planPath || envelope.candidatePlan?.sha256 !== context.candidateSha256 ||
      !Array.isArray(envelope.files)) throw new Error("Example candidate review envelope does not match the source and candidate");
  const refs = candidateReviewRefs(envelope.candidateReviews, runId);
  if (environmentValue !== undefined) {
    let supplied: unknown;
    try { supplied = JSON.parse(environmentValue); } catch { throw new Error("Invalid example candidate review environment"); }
    if (JSON.stringify(candidateReviewRefs(supplied, runId)) !== JSON.stringify(refs)) throw new Error("Example candidate review environment differs from the retained envelope");
  }
  for (const ref of refs) {
    const entries = envelope.files.filter((entry: any) => entry?.path === ref.path);
    const file = safePath(root, ref.path), reviewStat = lstatSync(file);
    if (entries.length !== 1 || entries[0]?.sha256 !== ref.sha256 || !reviewStat.isFile() || reviewStat.size < 1 ||
        reviewStat.size > 16 * 1024 * 1024 || entries[0]?.size !== reviewStat.size || hash(readFileSync(file)) !== ref.sha256) {
      throw new Error("Example candidate review differs from the retained envelope");
    }
  }
  return refs;
}

/**
 * The source job must supply a candidate-bound, complete set of locks and
 * locally available tarballs. The bundle is data, never an instruction to
 * install: the complete graph and every archive are checked again below.
 */
export function readExampleInstallBundle(root: string, path: string | undefined, runId: string, candidateSha256: string, sourceInputDigest: string, expectedIds: readonly string[]): ExampleInstallBundle {
  if (!path) throw new Error("Example source checks require NATIVE_EXAMPLE_LOCK_INPUT before any install");
  const file = safePath(root, path);
  const stat = lstatSync(file);
  if (!stat.isFile()) throw new Error("Example lock input must be a regular file");
  if (stat.size > 16 * 1024 * 1024) throw new Error("Example lock input exceeds its size limit");
  const bytes = readFileSync(file);
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Example lock input exceeds its size limit");
  const bundle = JSON.parse(bytes.toString("utf8")) as ExampleInstallBundle;
  if (bundle?.schema !== "aura3d.native-example-locks/1" || bundle.runId !== runId || bundle.candidateSha256 !== candidateSha256 ||
      bundle.sourceInputDigest !== sourceInputDigest || !Array.isArray(bundle.examples)) throw new Error("Example lock input does not match this source candidate and run");
  for (const entry of bundle.examples) {
    if (!entry || typeof entry.id !== "string" || !/^[a-f0-9]{64}$/.test(entry.manifestSha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(entry.lockSha256 ?? "") || typeof entry.lockPath !== "string" || !entry.lockPath ||
        !Array.isArray(entry.archives) || entry.archives.some((archive: ExampleInstallInput["archives"][number]) => !archive || typeof archive.resolved !== "string" || !archive.resolved ||
          typeof archive.path !== "string" || !archive.path)) throw new Error("Example lock input has an incomplete entry");
  }
  const ids = bundle.examples.map((entry) => entry?.id);
  if (new Set(ids).size !== ids.length || new Set(expectedIds).size !== expectedIds.length || ids.length !== expectedIds.length ||
      expectedIds.some((id) => !ids.includes(id))) throw new Error("Example lock input does not contain the exact catalog");
  return bundle;
}

/** Verify a lock and immutable archive snapshots before package installation. */
export function prepareExampleLockedInstall(root: string, wrapper: string, entry: ExampleInstallInput, plan: { readonly packages: readonly { readonly name: string; readonly version: string; readonly sha256: string; readonly integrity: string }[] }, context?: { readonly sourceManifestPath: string; readonly planPath: string; readonly candidateReviews?: readonly SourceEvidenceReference[] }): { readonly archives: readonly { readonly resolved: string; readonly bytes: Uint8Array }[]; readonly lock: unknown; readonly manifestSha256: string; readonly lockSha256: string; readonly admission: NpmAdmissionInput; readonly receipt: ArchiveAdmissionReceipt } {
  if (!entry || typeof entry.id !== "string" || !/^[a-f0-9]{64}$/.test(entry.manifestSha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(entry.lockSha256 ?? "") || !Array.isArray(entry.archives)) throw new Error("Invalid example lock entry");
  const manifestFile = resolve(wrapper, "package.json");
  const manifestBytes = readFileSync(manifestFile);
  if (hash(manifestBytes) !== entry.manifestSha256) throw new Error("Example wrapper manifest differs from its verified lock input");
  const lockFile = safePath(root, entry.lockPath);
  const lockStat = lstatSync(lockFile);
  if (!lockStat.isFile()) throw new Error("Example lock must be a regular file");
  if (lockStat.size > 16 * 1024 * 1024) throw new Error("Example lock exceeds its size limit");
  const lockBytes = readFileSync(lockFile);
  if (lockBytes.byteLength > 16 * 1024 * 1024 || hash(lockBytes) !== entry.lockSha256) throw new Error("Example lock changed or exceeds its size limit");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const lock = JSON.parse(lockBytes.toString("utf8"));
  // Reject forbidden names, aliases and incomplete graphs before opening any
  // dependency archive. Local bytes still need independently reviewed admission.
  assertIndependentNpmGraph({ manifest, lock });
  if (!context?.sourceManifestPath || !context.planPath) throw new Error("Example candidate archive admission is unavailable");
  const snapshots = new Map<string, Uint8Array>();
  let snapshotBytes = 0;
  const readArchive = (path: string): Uint8Array => {
    const prior = snapshots.get(path);
    if (prior) return prior;
    const file = safePath(root, path);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error("Example dependency archive is unavailable or too large");
    if (snapshotBytes + stat.size > 256 * 1024 * 1024) throw new Error("Example dependency archives exceed the total size limit");
    const bytes = readFileSync(file);
    snapshotBytes += bytes.byteLength;
    if (snapshotBytes > 256 * 1024 * 1024) throw new Error("Example dependency archives exceed the total size limit");
    snapshots.set(path, bytes);
    return bytes;
  };
  const archiveSnapshots = entry.archives.map((item) => ({ resolved: item.resolved, bytes: readArchive(item.path) }));
  const { receipt, capability } = verifyArchiveAdmission({ root, sourceManifestPath: context.sourceManifestPath, planPath: context.planPath,
    manifestBytes, lockBytes, archives: archiveSnapshots, candidateReviews: context.candidateReviews });
  const admission = { capability, manifestBytes, lockBytes };
  assertIndependentNpmConsumer({ manifest, lock, archives: entry.archives, readArchive, candidatePackages: plan.packages, admission });
  for (const item of entry.archives) if (item.resolved.startsWith("file:")) {
    const bytes = readArchive(item.path);
    const localPath = `aura-candidates/${hash(bytes)}.tgz`;
    if (item.resolved !== `file:${localPath}`) throw new Error("Example local candidate differs from the verified archive");
    const local = safePath(wrapper, localPath);
    mkdirSync(dirname(local), { recursive: true });
    if (existsSync(local)) {
      if (!lstatSync(local).isFile() || hash(readFileSync(local)) !== hash(bytes)) throw new Error("Example local candidate changed");
    } else writeFileSync(local, bytes, { flag: "wx" });
  }
  writeFileSync(resolve(wrapper, "package-lock.json"), lockBytes, { flag: "wx" });
  return { archives: archiveSnapshots, lock, manifestSha256: entry.manifestSha256, lockSha256: entry.lockSha256, admission, receipt };
}

export interface ExampleVerifiedArchive { readonly resolved: string; readonly path: string; readonly sha256: string; }

/** Retain exactly the preverified snapshots, deduplicated by their content digest. */
export function stageExampleVerifiedArchives(root: string, outputDir: string, snapshots: readonly { readonly resolved: string; readonly bytes: Uint8Array }[]): ExampleVerifiedArchive[] {
  const directory = safePath(root, portable(relative(root, resolve(outputDir, "dependency-archives"))));
  mkdirSync(directory, { recursive: true });
  const seen = new Set<string>();
  const result: ExampleVerifiedArchive[] = [];
  for (const snapshot of snapshots) {
    if (typeof snapshot.resolved !== "string" || !snapshot.resolved || seen.has(snapshot.resolved)) throw new Error("Example archive resolutions must be unique");
    seen.add(snapshot.resolved);
    const digest = hash(snapshot.bytes);
    const path = portable(relative(root, resolve(directory, `${digest}.tgz`)));
    const file = safePath(root, path);
    if (existsSync(file)) {
      if (!lstatSync(file).isFile() || hash(readFileSync(file)) !== digest) throw new Error("Retained example archive changed");
    } else writeFileSync(file, snapshot.bytes, { flag: "wx" });
    result.push({ resolved: snapshot.resolved, path, sha256: digest });
  }
  return result.sort((a, b) => a.resolved < b.resolved ? -1 : a.resolved > b.resolved ? 1 : 0);
}

function verifyExampleInstalledInputs(root: string, wrapper: string, plan: { readonly packages: readonly { readonly name: string; readonly version: string; readonly sha256: string; readonly integrity: string }[] }, archives: readonly ExampleVerifiedArchive[], runId: string, admission?: NpmAdmissionInput, snapshots = new Map<string, Uint8Array>()): { manifestBytes: Uint8Array; lockBytes: Uint8Array; archives: { resolved: string; bytes: Uint8Array }[] } {
  if (!Array.isArray(archives)) throw new Error("Example lacks verified dependency archives");
  const prefix = `tests/reports/native-examples-catalog/${runId}/dependency-archives/`;
  const manifestBytes = readFileSync(resolve(wrapper, "package.json")), lockBytes = readFileSync(resolve(wrapper, "package-lock.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")), lock = JSON.parse(lockBytes.toString("utf8"));
  assertIndependentNpmGraph({ manifest, lock });
  const readArchive = (path: string): Uint8Array => {
    const item = archives.find((entry) => entry.path === path);
    if (!item || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") || path !== `${prefix}${item.sha256}.tgz`) throw new Error("Invalid retained example archive identity");
    const prior = snapshots.get(path);
    if (prior) {
      if (hash(prior) !== item.sha256) throw new Error("Retained example archive snapshot changed");
      return prior;
    }
    const file = safePath(root, path);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error("Retained example archive is not an allowed regular file");
    const bytes = readFileSync(file);
    if (hash(bytes) !== item.sha256) throw new Error("Retained example archive changed");
    snapshots.set(path, bytes);
    return bytes;
  };
  let previous: string | undefined;
  for (const item of archives) {
    if (!item || typeof item.resolved !== "string" || !item.resolved || typeof item.path !== "string" ||
        (previous !== undefined && previous >= item.resolved)) throw new Error("Invalid retained example archive order or identity");
    readArchive(item.path);
    previous = item.resolved;
  }
  const input = { manifest, lock,
    archives: archives.map(({ resolved, path }) => ({ resolved, path })), readArchive, candidatePackages: plan.packages, admission };
  if (admission) assertIndependentNpmConsumer(input);
  else inspectIndependentNpmConsumer(input); // Inspection never authorizes an install.
  for (const item of archives) if (item.resolved.startsWith("file:")) {
    const local = safePath(wrapper, item.resolved.slice(5).replace(/^\.\//, ""));
    if (!lstatSync(local).isFile() || hash(readFileSync(local)) !== item.sha256) throw new Error("Retained local candidate differs from its verified archive");
  }
  return { manifestBytes, lockBytes, archives: archives.map(({ resolved, path }) => ({ resolved, bytes: readArchive(path) })) };
}

/** npm sees only the isolated cache and cannot run lifecycle scripts or access the network. */
export function exampleOfflineNpmCommand(cache: string, userConfig: string, globalConfig: string): string[] {
  const common = ["--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", cache, "--userconfig", userConfig, "--globalconfig", globalConfig];
  return ["ci", ...common];
}

function exampleEnvironment(wrapper: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${resolve(wrapper, "node_modules/.bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`, NODE_PATH: "" };
  for (const key of Object.keys(env)) {
    if (/^(?:NODE_AUTH_TOKEN|(?:GH_|GITHUB_|NPM_|PYPI_|TWINE_|UV_).*(?:TOKEN|SECRET|PASSWORD|AUTH|KEY))$/i.test(key)) delete env[key];
  }
  return env;
}

async function produceSource(root: string, runId: string, candidatePath: string, lockInputPath: string | undefined): Promise<void> {
  const plan = loadValidatedReleasePlan(root, candidatePath);
  if (!plan) throw new Error("A validated --candidate-plan is required");
  const planPath = resolve(root, candidatePath);
  const candidateSha256 = hash(readFileSync(planPath));
  const sourceManifestPath = `tests/reports/native-capabilities/${runId}/source-manifest.json`;
  // The source runner retains these same staged-manifest bytes at this stable
  // run-scoped path, which later validators can independently recheck.
  if (!lstatSync(safePath(root, sourceManifestPath)).isFile() || hash(readFileSync(safePath(root, sourceManifestPath))) !== plan.source?.manifestSha256) throw new Error("Example source checks require the retained staged source manifest");
  if (typeof plan.source.manifestSha256 !== "string") throw new Error("Example source checks lack a staged source identity");
  const relativePlanPath = portable(relative(root, planPath));
  const candidateReviews = readExampleCandidateReviews(root, runId, { sourceManifestPath, sourceManifestSha256: plan.source.manifestSha256,
    planPath: relativePlanPath, candidateSha256 }, process.env.AURA3D_CANDIDATE_REVIEWS_JSON);
  const npmVersion = spawnSync("npm", ["--version"], { cwd: root, encoding: "utf8" });
  if (npmVersion.status !== 0 || !npmVersion.stdout.trim()) throw new Error("Cannot determine npm version for source-consumer report");
  const catalog = discoverExampleCatalog(root);
  const entries = [...catalog.entries, ...collectCapabilityCatalog(root)];
  const sourceInputDigest = plan.source?.inputDigest ?? plan.source?.fingerprint;
  if (typeof sourceInputDigest !== "string" || !sourceInputDigest) throw new Error("Candidate plan lacks a source input identity");
  const installBundle = readExampleInstallBundle(root, lockInputPath, runId, candidateSha256, sourceInputDigest, entries.map((entry) => entry.id));
  const outputDir = safePath(root, `tests/reports/native-examples-catalog/${runId}`);
  if (existsSync(outputDir)) throw new Error("Example source run ID already exists");
  mkdirSync(outputDir, { recursive: true });
  const projects: any[] = [], cases: any[] = [];
  const archiveHashes = new Map<string, string>();
  for (const entry of entries) {
    const suffix = entry.id.replace(/[^a-z0-9-]+/gi, "-");
    const retainedWrapper = resolve(outputDir, "projects", suffix), logs = resolve(outputDir, "logs", suffix);
    if (existsSync(retainedWrapper)) throw new Error(`Run ID already has a project: ${retainedWrapper}`);
    // Outside the checkout so an undeclared dependency cannot resolve through its node_modules.
    const wrapper = mkdtempSync(resolve(tmpdir(), "aura3d-example-"));
    const project = resolve(wrapper, entry.kind === "capability-example" ? `examples/native-capability/${entry.id.split(":")[1]}` : entry.sourcePath);
    const retainedProject = resolve(retainedWrapper, relative(wrapper, project));
    const checks: RunCheck[] = [];
    let projectRecord: any;
    let cacheDir: string | undefined;
    try {
      const harness = entry.kind === "capability-example" ? makeCapabilityProject(root, project, entry.id.split(":")[1]!) : (copyProject(resolve(root, entry.sourcePath), project), []);
      if (entry.kind === "documented-example" && entry.sourcePath.startsWith("examples/")) {
        const sharedPath = resolve(root, "examples/shared");
        if (existsSync(sharedPath)) { copyProject(sharedPath, resolve(wrapper, "examples/shared")); harness.push("examples/shared (source support)"); }
      }
      if (entry.sourcePath.startsWith("apps/")) for (const name of ["common", "wow-common"]) {
        const sharedPath = resolve(root, "apps", name);
        if (existsSync(sharedPath)) { copyProject(sharedPath, resolve(wrapper, "apps", name)); harness.push(`apps/${name} (source support)`); }
      }
      const manifestFile = resolve(project, "package.json");
      const isStandalone = !existsSync(manifestFile);
      if (entry.kind !== "capability-example" && !isStandalone) {
        // A wrapper app that mounts a sibling example (`*-port`) or reads a
        // repo-root module builds only if that source is staged beside it.
        const staging = stageExampleDependencies(root, wrapper, project);
        harness.push(...staging.staged.map((path) => `${path} (staged source dependency)`));
        // Vite's default publicDir is the project's own public/; add only the
        // root-served files its sources name that it does not already carry.
        for (const path of staging.publicFiles) {
          const destination = resolve(project, "public", path);
          mkdirSync(dirname(destination), { recursive: true });
          cpSync(rootServedFile(root, `/${path}`, staging.publicDirs)!, destination);
          harness.push(`${portable(relative(wrapper, destination))} (staged root public file)`);
        }
      }
      // Standalone examples stage their dependencies (and fixture host) in standaloneHarness.
      const standalone = isStandalone ? standaloneHarness(root, wrapper, project, entry as ExampleCatalogEntry) : undefined;
      if (standalone) harness.push(...standalone.files);
      const manifest = standalone?.manifest ?? readJson(manifestFile);
      if (!isStandalone && (typeof manifest.scripts?.build !== "string" || !manifest.scripts.build.trim())) throw new Error(`Missing build script in ${entry.sourcePath}`);
      const scripts = Object.values(manifest.scripts ?? {}).join(" ");
      const buildCommands = isStandalone ? [] : sourceScriptCommands(manifest.scripts, "build");
      const typeCommands = !isStandalone && manifest.scripts.typecheck ? sourceScriptCommands(manifest.scripts, "typecheck") : [];
      const deps = wrapperDependencies(manifest, plan);
      writeFileSync(resolve(wrapper, "package.json"), `${JSON.stringify({ name: "aura3d-example-install-wrapper", private: true, type: "module", dependencies: deps }, null, 2)}\n`);
      const installInput = installBundle.examples.find((candidate) => candidate.id === entry.id)!;
      const verified = prepareExampleLockedInstall(root, wrapper, installInput, plan, { sourceManifestPath, planPath: relativePlanPath, candidateReviews });
      const verifiedArchives = stageExampleVerifiedArchives(root, outputDir, verified.archives);
      // Revalidate the retained bytes and the local candidate files before any
      // cache preparation or package-manager invocation.
      verifyExampleInstalledInputs(root, wrapper, plan, verifiedArchives, runId, verified.admission);
      const before = contentIdentity(project);
      const env = exampleEnvironment(wrapper);
      cacheDir = mkdtempSync(resolve(tmpdir(), "aura3d-example-cache-"));
      const npmCache = resolve(cacheDir, "npm-cache");
      mkdirSync(npmCache);
      const userConfig = resolve(cacheDir, "user.conf"), globalConfig = resolve(cacheDir, "global.conf");
      writeFileSync(userConfig, ""); writeFileSync(globalConfig, "");
      let cacheCheck: RunCheck;
      try {
        await seedVerifiedNpmCache({ lock: verified.lock, archives: verifiedArchives, cacheDir: npmCache, admission: verified.admission,
          readArchive: (path) => {
            const row = verifiedArchives.find((item) => item.path === path);
            if (!row) throw new Error("Unknown verified example archive");
            const bytes = readFileSync(safePath(root, path));
            if (hash(bytes) !== row.sha256) throw new Error("Verified example archive changed before cache preparation");
            return bytes;
          }
        });
        cacheCheck = internalPassed(root, logs, "cache-prepare", ["internal:seedVerifiedNpmCache"], "Verified local archives seeded into an isolated offline cache.");
      } catch {
        cacheCheck = failed(root, logs, "cache-prepare", "Verified dependency cache preparation failed");
      }
      if (cacheCheck.status !== "passed") checks.push(failed(root, logs, "install", "Verified dependency cache preparation failed; install was not started"));
      else if (hash(readFileSync(resolve(wrapper, "package.json"))) !== verified.manifestSha256 || hash(readFileSync(resolve(wrapper, "package-lock.json"))) !== verified.lockSha256) checks.push(failed(root, logs, "install", "Verified manifest or lock changed before install"));
      else checks.push(run(root, wrapper, logs, "install", "npm", exampleOfflineNpmCommand(npmCache, userConfig, globalConfig), env));
      checks.push(cacheCheck);
      const wrapperBeforeBuild = contentIdentity(wrapper);
      if (checks[0]?.status === "passed" && isStandalone) {
        checks.push(run(root, wrapper, logs, "typecheck", resolve(wrapper, "node_modules/.bin/tsc"), ["--project", resolve(wrapper, "aura-example.tsconfig.json"), "--noEmit"], env));
        checks.push(run(root, wrapper, logs, "build", resolve(wrapper, "node_modules/.bin/vite"), ["build", "--config", resolve(wrapper, "aura-example.vite.mjs")], env));
      } else if (checks[0]?.status === "passed") checks.push(runSequence(root, project, wrapper, logs, "build", buildCommands, env));
      else checks.push(failed(root, logs, "build", "Build not run because install failed"));
      if (!isStandalone && checks[0]?.status === "passed" && typeCommands.length && !buildCommands.some((command) => command[0] === "tsc")) checks.push(runSequence(root, project, wrapper, logs, "typecheck", typeCommands, env));
      else if (!isStandalone && !buildCommands.some((command) => command[0] === "tsc")) checks.push(failed(root, logs, "typecheck", "Missing explicit typecheck script or TypeScript build step"));
      if (contentIdentity(project) !== before) checks.push(failed(root, logs, "unmodified", "Build changed consumer source files"));
      if (contentIdentity(wrapper) !== wrapperBeforeBuild) checks.push(failed(root, logs, "harness-unmodified", "Build changed the harness, lockfile, or shared source files"));
      const installed = checks[0]?.status === "passed" ? inspectInstalledRelease(root, wrapper, plan) : undefined;
      const contents = installed ? installedPackageContents(wrapper, plan) : [];
      if (installed) validateInstalledRecords(root, wrapper, plan, installed.packages, contents, archiveHashes);
      const dist = resolve(project, "dist");
      const nestedEntry = standalone?.outputEntry ?? `${portable(relative(wrapper, project))}/index.html`;
      const outputEntry = ["index.html", nestedEntry].find((name) => existsSync(resolve(dist, name)));
      if (!outputEntry) checks.push(failed(root, logs, "output", "Build did not produce the expected index.html in dist"));
      const lockFile = resolve(wrapper, "package-lock.json");
      const lock = existsSync(lockFile) ? readJson(lockFile) : undefined;
      const retainedFiles = collectExampleRetainedFiles(wrapper, { excludeNodeModules: true, rejectEmptyDirectories: true });
      const outputFiles = existsSync(dist) ? collectExampleRetainedFiles(dist, { rejectNodeModules: true, rejectEmptyDirectories: true }) : [];
      projectRecord = { id: entry.id, path: portable(relative(root, retainedProject)), wrapperPath: portable(relative(root, retainedWrapper)), sourceSha256: contentIdentity(wrapper), retainedFiles, retainedSha256: exampleRetainedFilesDigest(retainedFiles), manifestSha256: hash(readFileSync(resolve(wrapper, "package.json"))), lockSha256: existsSync(lockFile) ? hash(readFileSync(lockFile)) : null, outputEntry: outputEntry ?? null, outputFiles, outputSha256: existsSync(dist) ? exampleRetainedFilesDigest(outputFiles) : null, verifiedArchives, candidateReviews, admission: verified.receipt, installedPackages: installed?.packages ?? [], installedPackageContents: contents, toolVersions: { typescript: lock?.packages?.["node_modules/typescript"]?.version ?? null, vite: lock?.packages?.["node_modules/vite"]?.version ?? null }, harness: { wrapperManifest: portable(relative(root, resolve(retainedWrapper, "package.json"))), generatedFiles: harness }, declaredScripts: scripts };
    } catch (error) {
      if (!checks.some((check) => check.id === "install")) checks.push(failed(root, logs, "install", String(error)));
      if (!checks.some((check) => check.id === "build")) checks.push(failed(root, logs, "build", "Build not run due to preparation failure"));
      else checks.push(failed(root, logs, "identity", String(error)));
    } finally {
      if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
      try {
        // Validate the complete tree before copying even failed preparations;
        // otherwise a failed run could retain private data outside its report.
        collectExampleRetainedFiles(wrapper, { excludeNodeModules: true, rejectEmptyDirectories: true });
        mkdirSync(dirname(retainedWrapper), { recursive: true });
        cpSync(wrapper, retainedWrapper, { recursive: true, filter: (path) => {
          if (lstatSync(path).isSymbolicLink()) throw new Error("Refusing unverified retained symlink");
          if (relative(wrapper, path).split(sep).some((part) => part.toLowerCase() === "node_modules")) return false;
          for (const part of relative(wrapper, path).split(sep).filter(Boolean)) assertRetainableName(part);
          return true;
        } });
        // Recheck a failed run's retained tree too, so an unsafe copy is
        // removed even when there is no successful project report to bind it.
        collectExampleRetainedFiles(retainedWrapper, { rejectEmptyDirectories: true });
      } catch {
        rmSync(retainedWrapper, { recursive: true, force: true });
        projectRecord = undefined;
        checks.push(failed(root, logs, "retained-identity", "Retained example could not be safely staged"));
      } finally { rmSync(wrapper, { recursive: true, force: true }); }
    }
    if (projectRecord) {
      try {
        assertExampleRetainedIdentity(retainedWrapper, resolve(retainedProject, "dist"), projectRecord);
      } catch (error) { checks.push(failed(root, logs, "retained-identity", String(error))); }
    }
    if (projectRecord) projects.push(projectRecord);
    cases.push({ id: entry.id, kind: entry.kind, sourcePath: entry.sourcePath, project: projectRecord?.path ?? null, status: checks.every((check) => check.status === "passed") ? "passed" : "failed", checks });
  }
  const failures = validateExampleChecks(entries, cases);
  const report = { schema: "aura3d.native-consumers/1", phase: "source", runId, candidateSha256, candidatePlan: relativePlanPath, candidateReviews, source: plan.source, stagedSourceSha256: plan.source?.inputDigest ?? plan.source?.fingerprint, lockfileSha256: plan.source.lockfileSha256, packages: plan.packages, toolVersions: { node: process.version, npm: npmVersion.stdout.trim() }, generatedAt: new Date().toISOString(), pass: failures.length === 0, failures, cases, projects, exemptions: catalog.exemptions, browser: "not-run" };
  mkdirSync(outputDir, { recursive: true });
  const out = resolve(outputDir, "examples-source.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
  console.log(`Example source report: ${portable(relative(root, out))}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error(`Missing value for ${name}`);
    return args[index + 1];
  };
  const phase = option("--phase") ?? "source";
  const runId = option("--run-id");
  const candidate = option("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
  const lockInput = option("--lock-input") ?? process.env.NATIVE_EXAMPLE_LOCK_INPUT;
  if (phase !== "source") throw new Error("This source producer accepts --phase source only; browser acceptance uses its own gated spec");
  if (!runId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(runId) || !candidate) throw new Error("Provide --phase source --run-id <id> --candidate-plan <validated-plan>");
  await produceSource(process.cwd(), runId, candidate, lockInput);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => { console.error(error); process.exitCode = 1; });
}
