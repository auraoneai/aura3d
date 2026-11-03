/**
 * Validate documentation snippets against the exact packed release candidate.
 *
 * Usage: tsx tools/docs-codeblocks/index.ts --candidate-plan <release-plan.json>
 * `A3D_RELEASE_PLAN` is also accepted. No package is installed or rebuilt.
 *
 * A deliberately illustrative fragment may be preceded by
 * `<!-- aura3d-docs-example: exempt <specific reason> -->`. Exemptions are
 * retained, with location and reason, in the output report rather than hidden.
 * `<!-- aura3d-docs-example: source src/main.ts -->` sets the relative-import
 * context to that repository-local file, relative to the documentation file.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, opendirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, type Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { writeReport, type ReleaseCheck } from "../check-common";
import { loadValidatedReleasePlan } from "../release/exact-release-plan.mjs";

export interface DocBlock {
  readonly file: string;
  readonly line: number;
  readonly lang: string;
  readonly code: string;
  readonly exemption?: string;
  readonly sourceContext?: string;
}

export interface DocBlockDisposition {
  readonly block: DocBlock;
  readonly disposition: "check" | "exempt";
  readonly reason?: string;
}

export interface DocDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly snippetLine?: number;
  readonly code: number;
  readonly message: string;
}

export interface DocTypecheckReport {
  readonly checked: readonly DocBlock[];
  readonly exemptions: readonly { readonly file: string; readonly line: number; readonly lang: string; readonly reason: string }[];
  readonly diagnostics: readonly DocDiagnostic[];
  readonly pass: boolean;
}

interface CandidatePackage {
  readonly name: string;
  readonly version: string;
  readonly tarball: string;
  readonly sha256: string;
}
interface CandidatePlan {
  readonly schema: string;
  readonly version: string;
  readonly source?: Record<string, string>;
  readonly packageCount?: number;
  readonly expectedPackageCount?: number;
  readonly packages: readonly CandidatePackage[];
}
export interface StagedCandidate {
  readonly candidatePlan: string;
  readonly candidatePlanSha256: string;
  readonly version: string;
  readonly source: Readonly<Record<string, string>>;
  readonly packages: readonly CandidatePackage[];
  readonly externalTypes: readonly string[];
}

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const CODE_LANGUAGES = new Set(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]);
const HISTORICAL_DIRS = new Set(["archive", "audit", "audits", "prd", "prds", "upgrade-4.5.0", "upgrade-4.6.0"]);
const DOC_SCAN_EXCLUDED_DIRS = new Set([
  "node_modules", ".git", ".codex", ".cache", ".next", ".turbo", ".output",
  "dist", "build", "out", "coverage", "vendor", "generated", "__generated__"
]);
const MAX_DOC_SCAN_ENTRIES = 100_000;
const MAX_DOC_SCAN_DEPTH = 64;
const MAX_DOC_FILES = 20_000;
const MAX_DOC_BYTES = 16 * 1024 * 1024;
const MAX_SNIPPET_LOCAL_FILES = 512;
const MAX_SNIPPET_LOCAL_BYTES = 64 * 1024 * 1024;

function normalized(path: string): string { return path.split(sep).join("/"); }

function historicalDoc(file: string): boolean {
  const parts = file.split("/");
  return parts[0] === "docs" && (HISTORICAL_DIRS.has(parts[1] ?? "") || (parts[1] === "project" && ["plans", "reviews"].includes(parts[2] ?? "")));
}

interface DocScanState { entries: number; files: number }

function readDocDirectory(root: string, dir: string, state: DocScanState): Dirent[] {
  const entries: Dirent[] = [];
  const handle = opendirSync(dir);
  try {
    for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
      if (++state.entries > MAX_DOC_SCAN_ENTRIES) throw new Error(`documentation discovery exceeded entry limit in ${normalized(relative(root, dir))}`);
      entries.push(entry);
    }
  } finally { handle.closeSync(); }
  return entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function walkDocuments(root: string, dir: string, accept: (name: string) => boolean, state: DocScanState, depth = 0): string[] {
  if (!existsSync(dir)) return [];
  if (depth > MAX_DOC_SCAN_DEPTH) throw new Error(`documentation discovery exceeded depth limit at ${normalized(relative(root, dir))}`);
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) return [];
  if (!stat.isDirectory()) throw new Error(`documentation scope is not a directory: ${normalized(relative(root, dir))}`);
  const found: string[] = [];
  for (const entry of readDocDirectory(root, dir, state)) {
    if (entry.isSymbolicLink() || (entry.isDirectory() && DOC_SCAN_EXCLUDED_DIRS.has(entry.name))) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkDocuments(root, path, accept, state, depth + 1));
    else if (entry.isFile() && accept(entry.name)) {
      if (++state.files > MAX_DOC_FILES) throw new Error("documentation discovery exceeded file limit");
      found.push(normalized(relative(root, path)));
    }
  }
  return found;
}

/** Enumerate documentation sources, including README files without code fences. */
export function discoverDocFiles(root = process.cwd()): string[] {
  const state: DocScanState = { entries: 0, files: 0 };
  const files = ["README.md", "llms.txt", "llms-full.txt"].filter((path) => {
    const full = join(root, path);
    return existsSync(full) && lstatSync(full).isFile();
  });
  state.files += files.length;
  files.push(...walkDocuments(root, join(root, "docs"), (name) => name.endsWith(".md"), state));
  for (const scope of ["apps", "examples"]) {
    files.push(...walkDocuments(root, join(root, scope), (name) => name === "README.md", state));
  }
  const packages = join(root, "packages");
  if (existsSync(packages)) {
    if (!lstatSync(packages).isDirectory()) throw new Error("documentation scope is not a directory: packages");
    for (const entry of readDocDirectory(root, packages, state)) {
      if (!entry.isDirectory() || DOC_SCAN_EXCLUDED_DIRS.has(entry.name)) continue;
      const dir = join(packages, entry.name);
      const manifestPath = join(dir, "package.json");
      const readme = join(dir, "README.md");
      if (!existsSync(manifestPath) || !existsSync(readme)) continue;
      if (!lstatSync(manifestPath).isFile() || !lstatSync(readme).isFile()) continue;
      if (lstatSync(manifestPath).size > MAX_DOC_BYTES) throw new Error(`documentation package manifest exceeds ${MAX_DOC_BYTES} bytes: ${normalized(relative(root, manifestPath))}`);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { private?: boolean };
      if (manifest.private !== true) {
        if (++state.files > MAX_DOC_FILES) throw new Error("documentation discovery exceeded file limit");
        files.push(normalized(relative(root, readme)));
      }
    }
  }
  return [...new Set(files)].sort();
}

function readDocBlocks(root: string, files: readonly string[]): DocBlock[] {
  return files.flatMap((file) => {
    const path = join(root, file);
    if (lstatSync(path).size > MAX_DOC_BYTES) throw new Error(`documentation file exceeds ${MAX_DOC_BYTES} bytes: ${file}`);
    return extractDocBlocks(file, readFileSync(path, "utf8"));
  });
}

/** Enumerate public markdown and every fenced block, including those not typechecked. */
export function discoverDocBlocks(root = process.cwd()): DocBlock[] {
  return readDocBlocks(root, discoverDocFiles(root));
}

/** Parse markdown fences with their original location and optional explicit exemption. */
export function extractDocBlocks(file: string, markdown: string): DocBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: DocBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const start = lines[index]!.match(/^\s{0,3}(`{3,}|~{3,})([^`]*)$/);
    if (!start) continue;
    const fence = start[1]!;
    const info = start[2]!.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const lang = ({ typescript: "ts", typescriptreact: "tsx", javascript: "js", javascriptreact: "jsx" } as Record<string, string>)[info] ?? info;
    const firstLine = index + 1;
    let exemption: string | undefined;
    let sourceContext: string | undefined;
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const directive = lines[cursor]!.trim().match(/^<!--\s*aura3d-docs-example:\s*(exempt|source)\s+(.+?)\s*-->$/);
      if (!directive) break;
      if (directive[1] === "exempt") {
        if (exemption !== undefined) throw new Error(`${file}:${firstLine} has duplicate exemption directives`);
        exemption = directive[2];
      } else {
        if (sourceContext !== undefined) throw new Error(`${file}:${firstLine} has duplicate source directives`);
        sourceContext = directive[2];
      }
    }
    const body: string[] = [];
    let closed = false;
    while (++index < lines.length) {
      const closing = lines[index]!.trim();
      if (closing.length >= fence.length && [...closing].every((char) => char === fence[0])) { closed = true; break; }
      body.push(lines[index]!);
    }
    if (!closed) throw new Error(`${file}:${firstLine} has an unclosed code fence`);
    blocks.push({ file, line: firstLine, lang, code: body.join("\n"), ...(exemption ? { exemption } : {}), ...(sourceContext ? { sourceContext } : {}) });
  }
  return blocks;
}

/** Historical and generated documents remain in the inventory with explicit reasons. */
export function classifyDocBlocks(blocks: readonly DocBlock[]): DocBlockDisposition[] {
  return blocks.map((block) => {
    let reason: string | undefined;
    if (!CODE_LANGUAGES.has(block.lang)) reason = `language ${block.lang || "unlabelled"} is not a TypeScript/JavaScript snippet`;
    else if (block.exemption) reason = block.exemption;
    else if (block.file === "docs/api/public-api.md") reason = "generated declaration inventory, not a standalone example";
    else if (historicalDoc(block.file)) reason = "historical, planning or audit record, not current usage guidance";
    return reason ? { block, disposition: "exempt", reason } : { block, disposition: "check" };
  });
}

function octal(field: Buffer, label: string): number {
  const text = field.toString("utf8").replace(/\0.*$/, "").trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error(`invalid tar ${label}`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) throw new Error(`invalid tar ${label}`);
  return value;
}

function readPax(data: Buffer): Record<string, string> {
  const result: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const end = data.indexOf(0x20, offset);
    if (end < 0) throw new Error("invalid tar PAX record");
    const length = Number(data.subarray(offset, end).toString("utf8"));
    if (!Number.isSafeInteger(length) || length <= end - offset + 1 || offset + length > data.length) throw new Error("invalid tar PAX length");
    const record = data.subarray(end + 1, offset + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals < 1) throw new Error("invalid tar PAX value");
    result[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return result;
}

/** Materialize packed files without ever following links or executing archive contents. */
export function extractPackedArchive(archive: Buffer, destination: string): void {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  const written = new Set<string>();
  let pax: Record<string, string> = {};
  let globalPax: Record<string, string> = {};
  let count = 0;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    if (++count > MAX_ARCHIVE_ENTRIES) throw new Error("archive contains too many entries");
    const expectedChecksum = octal(header.subarray(148, 156), "checksum");
    let checksum = 0;
    for (let i = 0; i < header.length; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]!;
    if (checksum !== expectedChecksum) throw new Error("archive checksum mismatch");
    const size = octal(header.subarray(124, 136), "size");
    const dataStart = offset + 512;
    const next = dataStart + Math.ceil(size / 512) * 512;
    if (next > tar.length) throw new Error("truncated archive");
    const data = tar.subarray(dataStart, dataStart + size);
    const type = String.fromCharCode(header[156] || 48);
    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    if (type === "x" || type === "g") {
      if (type === "g") globalPax = { ...globalPax, ...readPax(data) };
      else pax = readPax(data);
      offset = next;
      continue;
    }
    const attributes = { ...globalPax, ...pax };
    pax = {};
    if (attributes.size !== undefined && Number(attributes.size) !== size) throw new Error("unsupported tar PAX size override");
    const name = attributes.path ?? (prefix ? `${prefix}/${rawName}` : rawName);
    if (name.includes("\\") || name.startsWith("/") || name.split("/").some((part) => part === "..") || !(name === "package" || name.startsWith("package/"))) {
      throw new Error(`unsafe tar path ${name}`);
    }
    // Only regular files are allowed as resolution inputs. Reject links rather than
    // following them, even when a package claims a harmless in-archive target.
    if (type === "1" || type === "2") throw new Error(`archive contains a link: ${name}`);
    if (!["0", "\0", "5"].includes(type)) throw new Error(`unsupported tar entry type ${type}: ${name}`);
    if (type === "0" || type === "\0") {
      const path = name.slice("package/".length);
      if (written.has(path)) throw new Error(`duplicate tar entry ${name}`);
      written.add(path);
      const target = resolve(destination, path);
      if (!target.startsWith(`${resolve(destination)}${sep}`)) throw new Error(`unsafe tar target ${name}`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
    }
    offset = next;
  }
  if (!written.has("package.json")) throw new Error("archive is missing package/package.json");
}

/** Verify each planned archive and stage its actual package exports/declarations. */
export function stageCandidatePackages(root: string, planPath: string, projectDir: string): StagedCandidate {
  const absolutePlan = resolve(root, planPath);
  const planBytes = readFileSync(absolutePlan);
  // Validate exact inventory, archive hashes/integrities and current source
  // identity before consuming any files. This does not rebuild or repack.
  const plan = loadValidatedReleasePlan(root, absolutePlan) as CandidatePlan | null;
  if (!plan) throw new Error("candidate plan is required");
  if (plan.schema !== "aura3d-release-plan/1.0" || !plan.version || !plan.source?.fingerprint || !Array.isArray(plan.packages) || plan.packages.length === 0) throw new Error("invalid or unbound candidate plan");
  if (plan.packageCount !== plan.packages.length || plan.expectedPackageCount !== plan.packages.length) throw new Error("candidate plan package count mismatch");
  const moduleDir = join(projectDir, "node_modules");
  if (existsSync(moduleDir) && readdirSync(moduleDir).length > 0) throw new Error("candidate package staging requires an empty project node_modules");
  mkdirSync(moduleDir, { recursive: true });
  const seen = new Set<string>();
  const externalDependencies = new Set<string>(["@types/node"]);
  for (const entry of plan.packages) {
    if (!/^(?:@aura3d\/[a-z0-9][a-z0-9-]*|create-aura3d)$/.test(entry.name) || seen.has(entry.name) || entry.version !== plan.version || !/^[a-f0-9]{64}$/.test(entry.sha256) || !entry.tarball) throw new Error(`invalid candidate package ${entry.name}`);
    seen.add(entry.name);
    const archivePath = isAbsolute(entry.tarball) ? entry.tarball : resolve(root, entry.tarball);
    const archive = readFileSync(archivePath);
    if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`archive is too large: ${entry.name}`);
    if (createHash("sha256").update(archive).digest("hex") !== entry.sha256) throw new Error(`candidate archive digest mismatch: ${entry.name}`);
    const destination = join(moduleDir, ...entry.name.split("/"));
    mkdirSync(destination, { recursive: true });
    extractPackedArchive(archive, destination);
    const manifest = JSON.parse(readFileSync(join(destination, "package.json"), "utf8")) as {
      name?: string; version?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>;
    };
    if (manifest.name !== entry.name || manifest.version !== entry.version) throw new Error(`archive identity mismatch: ${entry.name}`);
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
      if (!dependency.startsWith("@aura3d/") && dependency !== "create-aura3d") {
        externalDependencies.add(dependency);
        externalDependencies.add(`@types/${dependency.startsWith("@") ? dependency.slice(1).replace("/", "__") : dependency}`);
      }
    }
  }
  if (!seen.has("@aura3d/engine")) throw new Error("candidate plan does not contain @aura3d/engine");
  // Non-Aura libraries and peer types come from the runner's installed toolchain.
  // They are identified in the report; Aura packages never resolve to workspace source.
  const externalTypes: string[] = [];
  const external = join(root, "node_modules");
  for (const name of [...externalDependencies].sort()) {
    const parts = name.split("/");
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error(`invalid external package name: ${name}`);
    const source = join(external, ...parts);
    if (!existsSync(source)) continue;
    const target = join(moduleDir, ...parts);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(source, target, "dir");
    externalTypes.push(name);
  }
  return { candidatePlan: normalized(absolutePlan), candidatePlanSha256: createHash("sha256").update(planBytes).digest("hex"), version: plan.version, source: plan.source, packages: plan.packages, externalTypes: externalTypes.sort() };
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Local context is copied, never linked, and workspace packages are never used as candidate dependencies. */
function admittedLocalFile(root: string, path: string): { readonly ok: boolean; readonly reason?: string } {
  if (!inside(root, path) || path === root) return { ok: false, reason: "escapes the repository" };
  const parts = relative(root, path).split(sep);
  if (parts[0] === "packages" || parts.some((part) => DOC_SCAN_EXCLUDED_DIRS.has(part))) {
    return { ok: false, reason: "is inside a workspace package or excluded dependency/generated directory" };
  }
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current)) return { ok: false, reason: "does not exist" };
    if (lstatSync(current).isSymbolicLink()) return { ok: false, reason: "passes through a symbolic link" };
  }
  if (!lstatSync(path).isFile()) return { ok: false, reason: "is not a regular file" };
  return { ok: true };
}

function localImportCandidates(base: string): string[] {
  const extension = extname(base);
  const replacement: Record<string, readonly string[]> = {
    ".js": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
    ".mjs": [".mts", ".d.mts", ".mjs"],
    ".cjs": [".cts", ".d.cts", ".cjs"]
  };
  if (replacement[extension]) return replacement[extension]!.map((candidate) => base.slice(0, -extension.length) + candidate);
  if (extension) return [base];
  const extensions = [".ts", ".tsx", ".d.ts", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
  return [...extensions.map((suffix) => base + suffix), ...extensions.map((suffix) => join(base, `index${suffix}`))];
}

interface LocalCopyState { readonly copied: Set<string>; readonly files: Map<string, string>; bytes: number }

function stageLocalImports(
  root: string, projectDir: string, stagedRoot: string, sourceFile: string, code: string, state: LocalCopyState,
  block: DocBlock, diagnostics: DocDiagnostic[]
): void {
  const parsed = ts.preProcessFile(code, true, true);
  const imports = [...parsed.importedFiles, ...parsed.referencedFiles];
  for (const reference of imports) {
    const specifier = reference.fileName;
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
    if (specifier.includes("\\")) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `local import ${specifier} uses an unsupported path separator` });
      continue;
    }
    const requested = resolve(dirname(sourceFile), specifier);
    if (!inside(root, requested)) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `local import ${specifier} escapes the repository` });
      continue;
    }
    if (inside(projectDir, requested)) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `local import ${specifier} enters the isolated candidate project` });
      continue;
    }
    const candidate = localImportCandidates(requested).find((path) => existsSync(path) && !lstatSync(path).isDirectory());
    if (!candidate) continue; // TypeScript reports unresolved imports with their snippet location.
    const admission = admittedLocalFile(root, candidate);
    if (!admission.ok) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `local import ${specifier} ${admission.reason}` });
      continue;
    }
    const extension = extname(candidate).toLowerCase();
    if (![".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].includes(extension)) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `local import ${specifier} has an unsupported source format` });
      continue;
    }
    if (state.copied.has(candidate)) continue;
    const size = lstatSync(candidate).size;
    if (size > MAX_DOC_BYTES || state.copied.size >= MAX_SNIPPET_LOCAL_FILES || state.bytes + size > MAX_SNIPPET_LOCAL_BYTES) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `local import ${specifier} exceeds the snippet context budget` });
      continue;
    }
    const text = readFileSync(candidate, "utf8");
    state.copied.add(candidate);
    state.bytes += size;
    const target = join(stagedRoot, relative(root, candidate));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    state.files.set(normalized(resolve(target)), normalized(relative(root, candidate)));
    if (extension !== ".json") stageLocalImports(root, projectDir, stagedRoot, candidate, text, state, block, diagnostics);
  }
}

/** Compile each applicable block as its own module; no repository path aliases are used. */
export function typecheckDocBlocks(blocks: readonly DocBlock[], options: { readonly projectDir: string; readonly sourceRoot?: string }): DocTypecheckReport {
  const dispositions = classifyDocBlocks(blocks);
  const checked = dispositions.filter((entry) => entry.disposition === "check").map((entry) => entry.block);
  const exemptions = dispositions.filter((entry) => entry.disposition === "exempt").map(({ block, reason }) => ({ file: block.file, line: block.line, lang: block.lang, reason: reason! }));
  const scratch = join(options.projectDir, "snippets");
  mkdirSync(scratch, { recursive: true });
  const projectDir = resolve(options.projectDir);
  const sourceRoot = options.sourceRoot === undefined ? undefined : resolve(options.sourceRoot);
  const stagedRoot = resolve(scratch, "repository");
  const copied: LocalCopyState = { copied: new Set(), files: new Map(), bytes: 0 };
  const names = new Map<string, DocBlock>();
  const diagnostics: DocDiagnostic[] = [];
  checked.forEach((block, index) => {
    let context: string | undefined;
    if (sourceRoot) {
      const document = resolve(sourceRoot, block.file);
      if (isAbsolute(block.file) || block.file.includes("\\") || !inside(sourceRoot, document)) {
        diagnostics.push({ file: block.file, line: block.line, code: 900003, message: "documentation path escapes the source root" });
      } else {
        context = block.sourceContext === undefined ? document : resolve(dirname(document), block.sourceContext);
        if (block.sourceContext !== undefined) {
          const admission = isAbsolute(block.sourceContext) || block.sourceContext.includes("\\") || inside(projectDir, context)
            ? { ok: false, reason: "must be a relative repository path" } : admittedLocalFile(sourceRoot, context);
          if (!admission.ok) {
            diagnostics.push({ file: block.file, line: block.line, code: 900003, message: `source context ${block.sourceContext} ${admission.reason}` });
            context = undefined;
          }
        }
      }
    } else if (block.sourceContext !== undefined) {
      diagnostics.push({ file: block.file, line: block.line, code: 900003, message: "source context requires a source root" });
    }
    const directory = context && sourceRoot ? resolve(stagedRoot, relative(sourceRoot, dirname(context))) : scratch;
    mkdirSync(directory, { recursive: true });
    let suffix = 0;
    let path = resolve(directory, `__aura_doc_snippet_${index}.${block.lang}`);
    while (existsSync(path) || (sourceRoot && inside(stagedRoot, path) && existsSync(join(sourceRoot, relative(stagedRoot, path))))) {
      path = resolve(directory, `__aura_doc_snippet_${index}_${++suffix}.${block.lang}`);
    }
    writeFileSync(path, `${block.code}\nexport {};\n`);
    names.set(normalized(path), block);
    if (context && sourceRoot) stageLocalImports(sourceRoot, projectDir, stagedRoot, context, block.code, copied, block, diagnostics);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, block.code);
    let meaningful = false;
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
        if (/@ts-(?:ignore|nocheck|expect-error)\b/.test(scanner.getTokenText())) diagnostics.push({ file: block.file, line: block.line, code: 900001, message: "compiler suppression in an applicable snippet; use an explicit documented exemption for intentional negative examples" });
      } else if (token !== ts.SyntaxKind.WhitespaceTrivia && token !== ts.SyntaxKind.NewLineTrivia) meaningful = true;
    }
    if (!meaningful) diagnostics.push({ file: block.file, line: block.line, code: 900002, message: "applicable snippet contains no code" });
  });
  if (checked.length) {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: false,
      types: existsSync(join(options.projectDir, "node_modules", "@types", "node")) ? ["node"] : [],
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"]
    };
    const host = ts.createCompilerHost(compilerOptions);
    const tsLibDir = dirname(ts.getDefaultLibFilePath(compilerOptions));
    const workspaceNodeModules = sourceRoot ? join(sourceRoot, "node_modules") : undefined;
    const projectReal = realpathSync(projectDir);
    const tsLibReal = realpathSync(tsLibDir);
    const workspaceNodeModulesReal = workspaceNodeModules && existsSync(workspaceNodeModules) ? realpathSync(workspaceNodeModules) : undefined;
    const stagedReal = existsSync(stagedRoot) ? realpathSync(stagedRoot) : undefined;
    const inStagedRoot = (path: string): boolean => inside(stagedRoot, resolve(path)) || !!stagedReal && inside(stagedReal, resolve(path));
    const allowed = (path: string): boolean => {
      const absolute = resolve(path);
      if (!sourceRoot) return true;
      if (inside(projectDir, absolute) || inside(projectReal, absolute) || inside(tsLibDir, absolute) || inside(tsLibReal, absolute)) return true;
      const externalRoot = workspaceNodeModules && inside(workspaceNodeModules, absolute) ? workspaceNodeModules
        : workspaceNodeModulesReal && inside(workspaceNodeModulesReal, absolute) ? workspaceNodeModulesReal : undefined;
      if (!externalRoot) return false;
      // External peer types can follow the existing package-manager symlinks to
      // their installed dependencies; Aura packages must come from the candidate.
      return !relative(externalRoot, absolute).split(sep).some((part) =>
        part === "@aura3d" || part.startsWith("@aura3d+") || part === "create-aura3d" || part.startsWith("create-aura3d@"));
    };
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    host.getSourceFile = (path, ...args) => allowed(path) ? getSourceFile(path, ...args) : undefined;
    host.fileExists = (path) => allowed(path) && fileExists(path);
    host.readFile = (path) => allowed(path) ? readFile(path) : undefined;
    host.resolveModuleNames = (moduleNames, containingFile) => moduleNames.map((name) => {
      if (isAbsolute(name) || (sourceRoot && (name.startsWith("./") || name.startsWith("../")) && !inStagedRoot(resolve(dirname(containingFile), name))
        && (inStagedRoot(containingFile) || names.has(normalized(resolve(containingFile)))))) return undefined;
      const resolved = ts.resolveModuleName(name, containingFile, compilerOptions, host).resolvedModule;
      if (resolved && (name.startsWith("@aura3d/") || name === "create-aura3d")) {
        const real = ts.sys.realpath?.(resolved.resolvedFileName) ?? resolved.resolvedFileName;
        if (!inside(projectReal, resolve(real))) return undefined;
      }
      return resolved;
    });
    const program = ts.createProgram([...names.keys()], compilerOptions, host);
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
      const snippet = diagnostic.file && names.get(normalized(resolve(diagnostic.file.fileName)));
      const copiedFile = diagnostic.file && copied.files.get(normalized(resolve(diagnostic.file.fileName)));
      const diagnosticLine = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line ?? 0;
      diagnostics.push(snippet
        ? { file: snippet.file, line: snippet.line, snippetLine: diagnosticLine + 1, code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") }
        : { file: copiedFile ?? (diagnostic.file ? normalized(diagnostic.file.fileName) : "<compiler>"), line: diagnosticLine + 1, code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") });
    }
  }
  return { checked, exemptions, diagnostics, pass: checked.length > 0 && diagnostics.length === 0 };
}

/** Keep scaffold command checks tied to templates actually present in the tarball. */
export function checkScaffoldCommands(blocks: readonly DocBlock[], projectDir: string): { readonly errors: readonly string[]; readonly productViewerPresent: boolean } {
  const templateDir = join(projectDir, "node_modules", "create-aura3d", "templates");
  if (!existsSync(templateDir)) return { errors: ["packed create-aura3d is missing its templates directory"], productViewerPresent: false };
  const templates = new Set(readdirSync(templateDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  const errors: string[] = [];
  let productViewerPresent = false;
  for (const block of blocks) {
    if (!["bash", "sh"].includes(block.lang) || block.exemption || historicalDoc(block.file)) continue;
    for (const [offset, rawLine] of block.code.split("\n").entries()) {
      const line = rawLine.trim();
      if (!/\bnpx\s+create-aura3d(?:@[^\s]+)?\b/.test(line)) continue;
      const template = line.match(/--template(?:=|\s+)([^\s#]+)/)?.[1];
      if (template === "product-viewer") productViewerPresent = true;
      if (template && !templates.has(template)) errors.push(`${block.file}:${block.line + offset + 1}: template ${template} is absent from packed create-aura3d`);
    }
  }
  return { errors, productViewerPresent };
}

function argument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function main(): void {
  const root = process.cwd();
  const plan = argument("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
  if (!plan) throw new Error("--candidate-plan or A3D_RELEASE_PLAN is required; source aliases are not a packed-candidate check");
  const scratch = mkdtempSync(join(tmpdir(), "aura3d-doc-snippets-"));
  try {
    const candidate = stageCandidatePackages(root, plan, scratch);
    const files = discoverDocFiles(root);
    const blocks = readDocBlocks(root, files);
    const result = typecheckDocBlocks(blocks, { projectDir: scratch, sourceRoot: root });
    const commands = checkScaffoldCommands(blocks, scratch);
    const checks: ReleaseCheck[] = [
      { id: "docs-codeblocks-discovered", pass: result.checked.length > 0, detail: `${result.checked.length} applicable snippets` },
      { id: "docs-codeblocks-compile", pass: result.diagnostics.length === 0, detail: result.diagnostics.length ? `${result.diagnostics.length} snippet diagnostics` : "all applicable snippets compile against the packed candidate" },
      { id: "docs-scaffold-templates", pass: commands.errors.length === 0, detail: commands.errors.length ? commands.errors.join("; ") : "documented scaffold templates are present in the packed candidate" },
      { id: "docs-public-scaffold-command-present", pass: commands.productViewerPresent, detail: "documentation includes a product-viewer scaffold command" }
    ];
    writeReport("tests/reports/docs-codeblocks.json", "aura3d-docs-codeblocks/2", checks, {
      candidate, discovery: { scopes: ["root guidance", "docs/**/*.md", "public package README.md", "apps/**/README.md", "examples/**/README.md"], files },
      checked: result.checked, exemptions: result.exemptions, diagnostics: result.diagnostics, commands
    });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(`docs-codeblocks: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
