// `aura3d info`: which Aura3D is installed in this project and what its public API looks like, read from the INSTALLED
// declarations through the TypeScript checker (so the answer matches the version the project builds against, not a doc).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { cliPackageRoot, cliVersion, findAuraMonorepoRoot, findInstalledPackage, optionValue, positionals, type AgentToolIo, type InstalledPackage } from "./shared.js";

export const INFO_SCHEMA = "aura3d.info/1";
export const INFO_USAGE =
  "aura3d info [projectDir] [--json] [--members]       installed versions + @aura3d/engine API surface summary\n" +
  "aura3d info --name <export>[.<member>] [--json]    members and one-line signatures of one export (e.g. --name material)";

export interface SurfaceExport {
  readonly name: string;
  readonly kind: "function" | "class" | "const" | "namespace" | "type" | "interface" | "enum" | "other";
  /** For namespace-like values (`material`, `lights`, ...): their member names. */
  readonly members?: readonly string[];
  /** Carries a JSDoc @deprecated tag: do not use in new code. */
  readonly deprecated?: boolean;
}

export interface EngineSurface {
  readonly package: string;
  readonly version: string;
  /** "installed" = node_modules declarations; "workspace" = Aura3D monorepo source. */
  readonly source: "installed" | "workspace";
  readonly entry: string;
  readonly exports: readonly SurfaceExport[];
}

export interface InfoReport {
  readonly schema: typeof INFO_SCHEMA;
  readonly ok: boolean;
  readonly project: string;
  readonly cli: { readonly version: string; readonly root: string };
  readonly node: string;
  readonly packages: readonly { readonly name: string; readonly installed?: string; readonly declared?: string }[];
  readonly project_files: { readonly packageJson: boolean; readonly assetManifest: boolean; readonly typedAssets: boolean; readonly assetCount?: number; readonly llmsTxt: boolean; readonly skills: readonly string[] };
  readonly engine?: {
    readonly version: string; readonly source: "installed" | "workspace"; readonly entry: string;
    readonly counts: Readonly<Record<string, number>>;
    readonly namespaces: readonly { readonly name: string; readonly members: readonly string[] }[];
    readonly functions: readonly string[];
    readonly classes: readonly string[];
    /** Value exports tagged @deprecated (excluded from the lists above). */
    readonly deprecated: readonly string[];
  };
  readonly warnings: readonly string[];
  readonly next: readonly string[];
}

function typesEntryOf(pkg: InstalledPackage): string | undefined {
  const exp = pkg.manifest.exports;
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["types", "import", "default"]) { const found = pick(record[key]); if (found) return found; }
    }
    return undefined;
  };
  let target: string | undefined;
  if (exp && typeof exp === "object" && "." in (exp as Record<string, unknown>)) target = pick((exp as Record<string, unknown>)["."]);
  target ??= pkg.manifest.types ?? pkg.manifest.typings ?? "index.d.ts";
  if (!/\.d\.[cm]?ts$/.test(target)) target = target.replace(/\.[cm]?js$/, ".d.ts");
  const entry = resolve(pkg.dir, target);
  return existsSync(entry) ? entry : undefined;
}

/** Where the engine's public declarations live for this project: the installed package, else the monorepo source. */
export function locateEngine(projectDir: string): { entry: string; version: string; source: "installed" | "workspace"; packageName: string } | { error: string } {
  const pkg = findInstalledPackage(projectDir, "@aura3d/engine");
  if (pkg) {
    const entry = typesEntryOf(pkg);
    if (entry) return { entry, version: pkg.version, source: "installed", packageName: "@aura3d/engine" };
    return { error: `@aura3d/engine ${pkg.version} is installed but its declaration entry is missing (${pkg.dir}).` };
  }
  const repo = findAuraMonorepoRoot(projectDir);
  if (repo) {
    const registry = JSON.parse(readFileSync(join(repo, "aura.exports.json"), "utf8")) as { entries?: Record<string, { source?: string }> };
    const source = registry.entries?.["."]?.source;
    if (source && existsSync(join(repo, source))) {
      let version = "workspace";
      try { version = (JSON.parse(readFileSync(join(repo, "packages", "engine", "package.json"), "utf8")) as { version?: string }).version ?? version; } catch { /* keep */ }
      return { entry: join(repo, source), version, source: "workspace", packageName: "@aura3d/engine" };
    }
  }
  return { error: "@aura3d/engine is not installed in this project (looked in node_modules upward). Run `npm install @aura3d/engine`." };
}

const programs = new Map<string, { mtime: number; program: ts.Program }>();
function programFor(entry: string): ts.Program {
  const mtime = statSync(entry).mtimeMs;
  const cached = programs.get(entry);
  if (cached && cached.mtime === mtime) return cached.program;
  const program = ts.createProgram([entry], {
    noEmit: true, skipLibCheck: true, types: [], allowImportingTsExtensions: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"]
  });
  programs.set(entry, { mtime, program });
  return program;
}

function moduleExports(entry: string): { checker: ts.TypeChecker; symbols: ts.Symbol[] } {
  const program = programFor(entry);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry);
  const moduleSymbol = sf ? checker.getSymbolAtLocation(sf) : undefined;
  if (!moduleSymbol) throw new Error(`${entry} is not a module.`);
  return { checker, symbols: checker.getExportsOfModule(moduleSymbol) };
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/** Callable or object members of a value, i.e. what an agent writes after the dot (`material.pbr`). */
function valueMembers(checker: ts.TypeChecker, symbol: ts.Symbol): string[] {
  if (!(symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.ValueModule | ts.SymbolFlags.Property))) return [];
  const type = checker.getTypeOfSymbol(symbol);
  if (type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike) || checker.isArrayType(type) || checker.isTupleType(type) || type.getProperties().length === 0) return [];
  const props = type.getProperties().filter((p) => !p.name.startsWith("_") && !p.name.startsWith("__@"));
  // A namespace is an object with at least one callable member (`material.pbr`); a plain constant table is not.
  if (!props.some((p) => checker.getTypeOfSymbol(p).getCallSignatures().length > 0)) return [];
  return props.map((p) => p.name).sort();
}

function kindOf(symbol: ts.Symbol, members: readonly string[]): SurfaceExport["kind"] {
  const f = symbol.flags;
  if (f & ts.SymbolFlags.Class) return "class";
  if (f & ts.SymbolFlags.Function) return "function";
  if (f & ts.SymbolFlags.Enum) return "enum";
  if (f & (ts.SymbolFlags.Variable | ts.SymbolFlags.ValueModule)) return members.length > 0 ? "namespace" : "const";
  if (f & ts.SymbolFlags.Interface) return "interface";
  if (f & ts.SymbolFlags.TypeAlias) return "type";
  return "other";
}

export function readEngineSurface(entry: string, meta: { version: string; source: "installed" | "workspace"; packageName: string; base?: string }): EngineSurface {
  const { checker, symbols } = moduleExports(entry);
  const exports: SurfaceExport[] = symbols.map((exported) => {
    const symbol = resolveAlias(checker, exported);
    let members: string[] = [];
    try { members = valueMembers(checker, symbol); } catch { members = []; }
    const kind = kindOf(symbol, members);
    // A callable const that also has members (e.g. `model`) stays a function-like const; list members only for namespaces.
    const callable = kind === "namespace" && checker.getTypeOfSymbol(symbol).getCallSignatures().length > 0;
    const deprecated = [exported, symbol].some((s) => s.getJsDocTags(checker).some((t) => t.name === "deprecated"));
    return { name: exported.name, kind: callable ? "function" : kind, ...(kind === "namespace" && !callable ? { members } : {}), ...(deprecated ? { deprecated: true } : {}) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { package: meta.packageName, version: meta.version, source: meta.source, entry: meta.base ? relative(meta.base, entry) : entry, exports };
}

export interface ExportDetail {
  readonly name: string;
  readonly kind: SurfaceExport["kind"];
  readonly signature: string;
  readonly doc?: string;
  readonly members?: readonly { readonly name: string; readonly signature: string; readonly doc?: string }[];
  /** Keys of a callable's first (options) parameter. */
  readonly options?: readonly { readonly name: string; readonly type: string; readonly doc?: string }[];
}

const oneLine = (text: string, max = 220): string => { const t = text.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

/** One export (or `export.member`) with its members' one-line signatures. Unknown names return close suggestions. */
export function describeExport(entry: string, dotted: string): ExportDetail | { error: string; suggestions: readonly string[] } {
  const { checker, symbols } = moduleExports(entry);
  const [head, ...rest] = dotted.split(".");
  const exported = symbols.find((s) => s.name === head);
  if (!exported) return { error: `"${head}" is not exported from @aura3d/engine.`, suggestions: closeNames(head ?? "", symbols.map((s) => s.name)) };
  let symbol = resolveAlias(checker, exported);
  for (const member of rest) {
    const next = checker.getTypeOfSymbol(symbol).getProperty(member);
    if (!next) return { error: `"${symbol.name}" has no member "${member}".`, suggestions: closeNames(member, checker.getTypeOfSymbol(symbol).getProperties().map((p) => p.name)) };
    symbol = next;
  }
  const members = valueMembers(checker, symbol);
  const typeText = (s: ts.Symbol): string => {
    if (s.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) return checker.typeToString(checker.getDeclaredTypeOfSymbol(s), undefined, ts.TypeFormatFlags.NoTruncation);
    return checker.typeToString(checker.getTypeOfSymbol(s), undefined, ts.TypeFormatFlags.NoTruncation);
  };
  const docOf = (s: ts.Symbol): string | undefined => { const d = ts.displayPartsToString(s.getDocumentationComment(checker)).trim(); return d ? oneLine(d, 200) : undefined; };
  const type = checker.getTypeOfSymbol(symbol);
  const detailMembers = members.length > 0 && type.getCallSignatures().length === 0
    ? members.map((name) => { const m = type.getProperty(name)!; return { name, signature: oneLine(typeText(m)), ...(docOf(m) ? { doc: docOf(m)! } : {}) }; })
    : undefined;
  // For a callable: the keys of its first parameter's object type, i.e. the options an agent may pass.
  let options: { name: string; type: string; doc?: string }[] | undefined;
  const signature = type.getCallSignatures()[0];
  const param = signature?.getParameters()[0];
  if (param && !detailMembers) {
    const paramType = checker.getNonNullableType(checker.getTypeOfSymbol(param));
    const props = paramType.flags & ts.TypeFlags.Object || paramType.isIntersection() ? checker.getPropertiesOfType(paramType) : [];
    if (props.length) options = props.slice(0, 80).map((p) => ({ name: p.name, type: oneLine(checker.typeToString(checker.getTypeOfSymbol(p)), 120), ...(docOf(p) ? { doc: docOf(p)! } : {}) }));
  }
  return {
    name: dotted,
    kind: signature && !detailMembers ? (symbol.flags & ts.SymbolFlags.Class ? "class" : "function") : kindOf(symbol, members),
    signature: oneLine(typeText(symbol), detailMembers ? 160 : 600),
    ...(docOf(symbol) ? { doc: docOf(symbol)! } : {}),
    ...(detailMembers ? { members: detailMembers } : {}),
    ...(options ? { options } : {})
  };
}

/** Names close to `wanted` (substring either way, or edit distance <= 2). */
export function closeNames(wanted: string, names: readonly string[], limit = 8): string[] {
  const w = wanted.toLowerCase();
  const distance = (a: string, b: string): number => {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]!; dp[0] = i;
      for (let j = 1; j <= b.length; j++) { const tmp = dp[j]!; dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
    }
    return dp[b.length]!;
  };
  return [...new Set(names)]
    .map((n) => ({ n, d: n.toLowerCase().includes(w) || (w.length > 2 && w.includes(n.toLowerCase())) ? 0 : distance(w, n.toLowerCase()) }))
    .filter((x) => x.d <= 2)
    .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
    .slice(0, limit)
    .map((x) => x.n);
}

function installedAuraPackages(projectDir: string): { name: string; installed?: string; declared?: string }[] {
  let declared: Record<string, string> = {};
  try {
    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    declared = { ...pkg.devDependencies, ...pkg.dependencies };
  } catch { /* no package.json */ }
  const names = new Set(Object.keys(declared).filter((n) => n.startsWith("@aura3d/") || n === "create-aura3d"));
  for (const base of ["@aura3d/engine", "@aura3d/cli", "@aura3d/react", "create-aura3d"]) names.add(base);
  const scoped = join(projectDir, "node_modules", "@aura3d");
  if (existsSync(scoped)) for (const n of readdirSync(scoped)) names.add(`@aura3d/${n}`);
  return [...names].sort().map((name) => {
    const installed = findInstalledPackage(projectDir, name);
    return { name, ...(installed ? { installed: installed.version } : {}), ...(declared[name] ? { declared: declared[name] } : {}) };
  }).filter((p) => p.installed || p.declared);
}

export function buildInfoReport(projectDir: string): InfoReport {
  const root = resolve(projectDir);
  const warnings: string[] = [];
  const packages = installedAuraPackages(root);
  for (const p of packages) if (p.declared && !p.installed && !p.declared.startsWith("workspace:")) warnings.push(`${p.name} is declared (${p.declared}) but not installed: run npm install.`);
  const manifestPath = join(root, "aura.assets.json");
  let assetCount: number | undefined;
  if (existsSync(manifestPath)) {
    try { const m = JSON.parse(readFileSync(manifestPath, "utf8")) as { assets?: unknown[] | Record<string, unknown> }; assetCount = Array.isArray(m.assets) ? m.assets.length : m.assets ? Object.keys(m.assets).length : 0; } catch { warnings.push("aura.assets.json is not valid JSON."); }
  }
  const skills = [".claude/skills", ".cursor/skills", ".agents/skills"].filter((d) => existsSync(join(root, d)));
  const located = locateEngine(root);
  let engine: InfoReport["engine"];
  if ("error" in located) warnings.push(located.error);
  else {
    try {
      const surface = readEngineSurface(located.entry, { version: located.version, source: located.source, packageName: located.packageName, base: root });
      const counts: Record<string, number> = {};
      for (const e of surface.exports) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      const live = surface.exports.filter((e) => !e.deprecated);
      engine = {
        version: surface.version, source: surface.source, entry: surface.entry, counts,
        namespaces: live.filter((e) => e.kind === "namespace").map((e) => ({ name: e.name, members: e.members ?? [] })),
        functions: live.filter((e) => e.kind === "function").map((e) => e.name),
        classes: live.filter((e) => e.kind === "class").map((e) => e.name),
        deprecated: surface.exports.filter((e) => e.deprecated && !["interface", "type"].includes(e.kind)).map((e) => e.name)
      };
      const cli = cliVersion();
      const minor = (v: string): string => v.split(".").slice(0, 2).join(".");
      if (located.source === "installed" && /^\d+\.\d+/.test(cli) && /^\d+\.\d+/.test(located.version) && minor(cli) !== minor(located.version)) {
        warnings.push(`@aura3d/cli ${cli} and @aura3d/engine ${located.version} are on different minor versions; checks may describe a different API.`);
      }
    } catch (error) { warnings.push(`Could not read the engine declarations: ${String((error as Error).message ?? error)}`); }
  }
  return {
    schema: INFO_SCHEMA,
    ok: engine !== undefined,
    project: root,
    cli: { version: cliVersion(), root: cliPackageRoot() },
    node: process.version,
    packages,
    project_files: {
      packageJson: existsSync(join(root, "package.json")), assetManifest: existsSync(manifestPath),
      typedAssets: existsSync(join(root, "src", "aura-assets.ts")), ...(assetCount !== undefined ? { assetCount } : {}),
      llmsTxt: existsSync(join(root, "llms.txt")), skills
    },
    ...(engine ? { engine } : {}),
    warnings,
    next: [
      "aura3d examples \"<what you are building>\"   find a working scene to copy",
      "aura3d info --name <export>                  members and signatures of one export (material, lights, camera ...)",
      "aura3d validate                              static checks before building",
      "aura3d render                                build, screenshot and diagnose the app"
    ]
  };
}

export function formatInfo(report: InfoReport, showMembers: boolean): string {
  const lines = [`aura3d info: @aura3d/cli ${report.cli.version}, node ${report.node}`];
  for (const p of report.packages) lines.push(`  ${p.name.padEnd(22)} ${p.installed ?? "not installed"}${p.declared ? `  (package.json: ${p.declared})` : ""}`);
  const files = report.project_files;
  lines.push(`  project: package.json ${files.packageJson ? "yes" : "no"}, aura.assets.json ${files.assetManifest ? `yes (${files.assetCount ?? "?"} assets)` : "no"}, src/aura-assets.ts ${files.typedAssets ? "yes" : "no"}, llms.txt ${files.llmsTxt ? "yes" : "no"}${files.skills.length ? `, skills in ${files.skills.join(", ")}` : ""}`);
  if (report.engine) {
    const e = report.engine;
    lines.push("", `@aura3d/engine ${e.version} (${e.source}, ${e.entry})`, `  exports: ${Object.entries(e.counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    lines.push("  namespaces (write namespace.member(...)):");
    for (const ns of e.namespaces) {
      const list = showMembers || ns.members.length <= 10 ? ns.members.join(", ") : `${ns.members.slice(0, 10).join(", ")}, … +${ns.members.length - 10} (--members or --name ${ns.name})`;
      lines.push(`    ${ns.name.padEnd(16)} ${list}`);
    }
    const fns = showMembers || e.functions.length <= 40 ? e.functions.join(", ") : `${e.functions.slice(0, 40).join(", ")}, … +${e.functions.length - 40} (--members)`;
    lines.push(`  functions: ${fns}`);
    if (e.classes.length) lines.push(`  classes: ${e.classes.join(", ")}`);
    if (e.deprecated.length) lines.push(`  deprecated (do not use in new code): ${e.deprecated.join(", ")}`);
  }
  for (const w of report.warnings) lines.push(`WARNING ${w}`);
  lines.push("", "next:", ...report.next.map((n) => `  ${n}`));
  return lines.join("\n");
}

export function formatDetail(detail: ExportDetail): string {
  const lines = [`${detail.name}  [${detail.kind}]`, `  ${detail.signature}`];
  if (detail.doc) lines.push(`  ${detail.doc}`);
  for (const m of detail.members ?? []) lines.push(`  .${m.name}: ${m.signature}${m.doc ? `\n      ${m.doc}` : ""}`);
  if (detail.options?.length) lines.push("  options:", ...detail.options.map((o) => `    ${o.name}: ${o.type}${o.doc ? `  // ${o.doc}` : ""}`));
  return lines.join("\n");
}

export async function infoCommand(argv: readonly string[], io: AgentToolIo): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) { io.stdout(INFO_USAGE); return 0; }
  const projectDir = resolve(io.cwd, positionals(argv, new Set(["--name"]))[0] ?? ".");
  const json = argv.includes("--json");
  const name = optionValue(argv, "--name");
  if (name) {
    const located = locateEngine(projectDir);
    if ("error" in located) { io.stderr(located.error); return 1; }
    const detail = describeExport(located.entry, name);
    if ("error" in detail) {
      if (json) io.stdout(JSON.stringify({ ok: false, ...detail }, null, 2));
      else io.stderr(`${detail.error}${detail.suggestions.length ? ` Did you mean: ${detail.suggestions.join(", ")}?` : ""}`);
      return 1;
    }
    io.stdout(json ? JSON.stringify({ ok: true, version: located.version, ...detail }, null, 2) : formatDetail(detail));
    return 0;
  }
  const report = buildInfoReport(projectDir);
  io.stdout(json ? JSON.stringify(report, null, 2) : formatInfo(report, argv.includes("--members")));
  return report.ok ? 0 : 1;
}
