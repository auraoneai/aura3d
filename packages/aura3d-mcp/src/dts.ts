// Version-pinned public-surface lookup: reads the INSTALLED @aura3d/* package declarations through the package's
// own `exports` map and answers from the TypeScript checker. Nothing outside the declared entry points is exposed.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

export interface InstalledPackage {
  readonly name: string;
  readonly dir: string;
  readonly version: string;
  readonly manifest: PackageManifest;
}

interface PackageManifest {
  version?: string;
  types?: string;
  typings?: string;
  exports?: unknown;
}

export interface SymbolAnswer {
  readonly ok: boolean;
  readonly package: string;
  readonly version?: string;
  readonly entry?: string;
  readonly name: string;
  readonly kind?: string;
  readonly declaration?: string;
  readonly doc?: string;
  readonly defaults?: readonly string[];
  readonly example?: string;
  readonly error?: string;
  readonly suggestions?: readonly string[];
}

export function findInstalledPackage(projectDir: string, name: string): InstalledPackage | undefined {
  let dir = resolve(projectDir);
  for (;;) {
    const candidate = join(dir, "node_modules", ...name.split("/"));
    const manifestPath = join(candidate, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
      return { name, dir: candidate, version: manifest.version ?? "unknown", manifest };
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function conditionTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["types", "import", "default", "browser"]) {
      const found = conditionTarget(record[key]);
      if (found) return found;
    }
  }
  return undefined;
}

/** Public subpaths declared by the package exports map ("." and "./x"). Wildcard patterns are skipped. */
export function publicSubpaths(pkg: InstalledPackage): string[] {
  const exp = pkg.manifest.exports;
  if (!exp || typeof exp !== "object") return ["."];
  const keys = Object.keys(exp as Record<string, unknown>);
  if (keys.every((k) => !k.startsWith("."))) return ["."];
  return keys.filter((k) => !k.includes("*") && k !== "./package.json");
}

export function resolveTypesEntry(pkg: InstalledPackage, subpath: string | undefined): { entry?: string; error?: string } {
  const key = !subpath || subpath === "." ? "." : subpath.startsWith("./") ? subpath : `./${subpath}`;
  const exp = pkg.manifest.exports;
  let target: string | undefined;
  if (exp && typeof exp === "object" && Object.keys(exp as Record<string, unknown>).some((k) => k.startsWith("."))) {
    const entryValue = (exp as Record<string, unknown>)[key];
    if (entryValue === undefined) return { error: `${pkg.name} does not export "${key}". Public subpaths: ${publicSubpaths(pkg).join(", ")}` };
    const typed = entryValue && typeof entryValue === "object" ? conditionTargetFor(entryValue as Record<string, unknown>, "types") : undefined;
    target = typed ?? conditionTarget(entryValue);
    if (target && !/\.d\.[cm]?ts$/.test(target)) target = target.replace(/\.[cm]?js$/, ".d.ts");
  } else if (key === ".") {
    target = pkg.manifest.types ?? pkg.manifest.typings ?? "index.d.ts";
  } else {
    return { error: `${pkg.name} has no subpath exports.` };
  }
  if (!target) return { error: `${pkg.name} "${key}" has no types entry.` };
  const entry = resolve(pkg.dir, target);
  if (!existsSync(entry)) return { error: `Declaration file ${target} listed by ${pkg.name} "${key}" is missing in the installed package.` };
  return { entry };
}

function conditionTargetFor(record: Record<string, unknown>, key: string): string | undefined {
  return conditionTarget(record[key]);
}

interface CachedProgram {
  readonly mtime: number;
  readonly program: ts.Program;
}
const programs = new Map<string, CachedProgram>();

function programFor(entry: string): ts.Program {
  const mtime = statSync(entry).mtimeMs;
  const cached = programs.get(entry);
  if (cached && cached.mtime === mtime) return cached.program;
  const program = ts.createProgram([entry], {
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"]
  });
  programs.set(entry, { mtime, program });
  return program;
}

const DECL_LIMIT = 3600;

function clipDeclaration(text: string, name: string): string {
  if (text.length <= DECL_LIMIT) return text;
  const lines = text.split("\n");
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length > DECL_LIMIT) break;
    kept.push(line);
    size += line.length + 1;
  }
  return `${kept.join("\n")}\n  // ... ${lines.length - kept.length} more lines; ask get_symbol with "${name}.<member>" for one member`;
}

function kindOf(symbol: ts.Symbol): string {
  const f = symbol.flags;
  if (f & ts.SymbolFlags.Class) return "class";
  if (f & ts.SymbolFlags.Interface) return "interface";
  if (f & ts.SymbolFlags.TypeAlias) return "type";
  if (f & ts.SymbolFlags.Enum) return "enum";
  if (f & ts.SymbolFlags.Function) return "function";
  if (f & (ts.SymbolFlags.Variable | ts.SymbolFlags.Property)) return "const";
  if (f & ts.SymbolFlags.Method) return "method";
  if (f & ts.SymbolFlags.Namespace) return "namespace";
  return "symbol";
}

function declarationText(symbol: ts.Symbol): string {
  const decls = symbol.declarations ?? [];
  const texts = decls.slice(0, 6).map((decl) => {
    // Variable declarations print as `const x: T`; use the whole statement for the `export declare` form.
    const node = ts.isVariableDeclaration(decl) && ts.isVariableDeclarationList(decl.parent) && ts.isVariableStatement(decl.parent.parent) ? decl.parent.parent : decl;
    return node.getText().replace(/\n\s*\/\*\*[\s\S]*?\*\/\s*\n/g, "\n");
  });
  return texts.join("\n");
}

function tagText(tag: ts.JSDocTagInfo): string {
  return ts.displayPartsToString(tag.text ?? []).trim();
}

function defaultsOf(symbol: ts.Symbol, checker: ts.TypeChecker, doc: string): string[] {
  const out: string[] = [];
  for (const tag of symbol.getJsDocTags(checker)) {
    if (tag.name === "default" || tag.name === "defaultValue") out.push(`${tagText(tag)}`);
  }
  for (const m of doc.matchAll(/\bdefaults?\s*(?:to|is|:|=)\s*([^.\n]{1,80})/gi)) out.push(m[1]!.trim());
  // Per-member @default tags of an interface or type literal.
  const type = symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class) ? checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  if (type) {
    for (const prop of type.getProperties().slice(0, 80)) {
      for (const tag of prop.getJsDocTags(checker)) {
        if (tag.name === "default" || tag.name === "defaultValue") out.push(`${prop.name} = ${tagText(tag)}`);
      }
    }
  }
  return [...new Set(out)].slice(0, 12);
}

export interface SymbolLookupOptions {
  readonly projectDir: string;
  readonly name: string;
  readonly subpath?: string;
  readonly pkg?: string;
  /** Example finder supplied by the docs layer when the declaration has no @example. */
  readonly exampleFor?: (name: string) => string | undefined;
}

export function getSymbol(options: SymbolLookupOptions): SymbolAnswer {
  const pkgName = options.pkg ?? "@aura3d/engine";
  const base = { package: pkgName, name: options.name };
  if (!/^@aura3d\/[a-z0-9-]+$|^create-aura3d$/.test(pkgName)) return { ...base, ok: false, error: `Only @aura3d/* packages can be inspected, got "${pkgName}".` };
  const pkg = findInstalledPackage(options.projectDir, pkgName);
  if (!pkg) return { ...base, ok: false, error: `${pkgName} is not installed in ${options.projectDir} (looked in node_modules upward). Install it first, for example: npm install ${pkgName}` };
  const resolved = resolveTypesEntry(pkg, options.subpath);
  if (!resolved.entry) return { ...base, ok: false, version: pkg.version, error: resolved.error };
  const program = programFor(resolved.entry);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(resolved.entry);
  const moduleSymbol = sourceFile ? checker.getSymbolAtLocation(sourceFile) : undefined;
  if (!sourceFile || !moduleSymbol) return { ...base, ok: false, version: pkg.version, error: "The declaration entry is not a module." };
  const exported = checker.getExportsOfModule(moduleSymbol);
  const [head, ...rest] = options.name.split(".");
  const wanted = exported.find((s) => s.name === head);
  const entryRel = resolved.entry.slice(pkg.dir.length + 1);
  if (!wanted) {
    const lower = (head ?? "").toLowerCase();
    const suggestions = exported.map((s) => s.name).filter((n) => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase())).slice(0, 12);
    return { ...base, ok: false, version: pkg.version, entry: entryRel, error: `"${head}" is not exported from ${pkgName}${options.subpath ? `/${options.subpath.replace(/^\.\//, "")}` : ""}.`, suggestions };
  }
  let symbol = wanted.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(wanted) : wanted;
  for (const member of rest) {
    const type = checker.getTypeOfSymbol(symbol);
    const declared = symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias) ? checker.getDeclaredTypeOfSymbol(symbol) : undefined;
    const next = declared?.getProperty(member) ?? type.getProperty(member) ?? (symbol.exports ? symbol.exports.get(member as ts.__String) : undefined);
    if (!next) {
      const names = (declared ?? type).getProperties().map((p) => p.name).slice(0, 40);
      return { ...base, ok: false, version: pkg.version, entry: entryRel, error: `"${head}" has no member "${member}".`, suggestions: names };
    }
    symbol = next;
  }
  const doc = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  const exampleTag = symbol.getJsDocTags(checker).find((t) => t.name === "example");
  const example = exampleTag ? tagText(exampleTag) : options.exampleFor?.(options.name);
  return {
    ...base,
    ok: true,
    version: pkg.version,
    entry: entryRel,
    kind: kindOf(symbol),
    declaration: clipDeclaration(declarationText(symbol), options.name),
    doc: doc || undefined,
    defaults: defaultsOf(symbol, checker, doc),
    example
  };
}
