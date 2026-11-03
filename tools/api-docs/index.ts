import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stageCandidatePackages } from "../docs-codeblocks/index.js";

export interface PublicPackageApi {
  readonly packageName: string;
  readonly version: string;
  readonly packagePath: string;
  readonly entrypointPath: string;
  readonly exportStatements: readonly string[];
  /** Present for entries derived from the exact packed release candidate. */
  readonly conditions?: readonly { readonly condition: string; readonly target: string | null }[];
  readonly declarations?: readonly { readonly path: string; readonly text: string }[];
}

export interface ApiDocsReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly outputPath: string;
  readonly packages: readonly PublicPackageApi[];
  readonly violations: readonly string[];
}

const defaultOutputPath = "docs/api/public-api.md";
const defaultReportPath = "tests/reports/api-docs.json";
const defaultAppendixPath = "docs/api/public-api.appendix.md";

type ExportTarget = string | null | readonly ExportTarget[] | { readonly [condition: string]: ExportTarget };
type PackedManifest = { readonly name: string; readonly version: string; readonly exports?: ExportTarget; readonly main?: string; readonly types?: string };
export interface PackedPackage { readonly name: string; readonly version: string; readonly sha256: string }

function flattenConditions(target: ExportTarget, condition = "default"): { condition: string; target: string | null }[] {
  if (target === null || typeof target === "string") return [{ condition, target }];
  if (Array.isArray(target)) return target.flatMap((item, index) => flattenConditions(item, `${condition}[${index}]`));
  if (typeof target !== "object") throw new Error(`invalid package export condition ${condition}`);
  return Object.entries(target).flatMap(([name, value]) => flattenConditions(value, condition === "default" ? name : `${condition}.${name}`));
}

function safeTarget(packageDir: string, target: string): string {
  if (!target.startsWith("./") || target.includes("\\") || target.split("/").includes("..")) throw new Error(`invalid packed export target ${target}`);
  const path = resolve(packageDir, target);
  if (!path.startsWith(`${resolve(packageDir)}${sep}`)) throw new Error(`packed export escapes package: ${target}`);
  return path;
}

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`unexpected link in packed package: ${path}`);
    return entry.isDirectory() ? listFiles(path, base) : entry.isFile() ? [`./${normalizePath(relative(base, path))}`] : [];
  });
}

function wildcardCaptures(target: string, files: readonly string[]): string[] {
  if ((target.match(/\*/g) ?? []).length !== 1) throw new Error(`unsupported export pattern ${target}`);
  const [prefix, suffix] = target.split("*");
  return files.filter((file) => file.startsWith(prefix!) && file.endsWith(suffix!) && file.length >= prefix!.length + suffix!.length)
    .map((file) => file.slice(prefix!.length, file.length - suffix!.length || undefined));
}

function declarationFor(target: string): string | undefined {
  if (/\.d\.(?:ts|mts|cts)$/.test(target)) return target;
  if (/\.mjs$/.test(target)) return target.replace(/\.mjs$/, ".d.mts");
  if (/\.cjs$/.test(target)) return target.replace(/\.cjs$/, ".d.cts");
  if (/\.js$/.test(target)) return target.replace(/\.js$/, ".d.ts");
  if (target.endsWith("/")) return `${target}index.d.ts`;
  return undefined;
}

function resolveDeclaration(packageDir: string, from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(safeTarget(packageDir, from)), specifier);
  const converted = base.replace(/\.mjs$/, ".d.mts").replace(/\.cjs$/, ".d.cts").replace(/\.js$/, ".d.ts");
  for (const candidate of [converted, `${converted}.d.ts`, join(converted, "index.d.ts")]) {
    if (!candidate.startsWith(`${resolve(packageDir)}${sep}`)) throw new Error(`declaration reference escapes package: ${from} -> ${specifier}`);
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.d\.(?:ts|mts|cts)$/.test(candidate)) return `./${normalizePath(relative(packageDir, candidate))}`;
  }
  throw new Error(`packed declaration ${from} references missing declaration ${specifier}`);
}

/** Include re-exported declarations, not only the barrel that mentions them. */
function collectDeclarations(packageDir: string, roots: readonly string[]): { path: string; text: string }[] {
  const seen = new Set<string>();
  const result: { path: string; text: string }[] = [];
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = readFileSync(safeTarget(packageDir, path), "utf8");
    result.push({ path, text });
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const dependency = resolveDeclaration(packageDir, path, statement.moduleSpecifier.text);
      if (dependency) visit(dependency);
    }
  };
  roots.forEach(visit);
  return result;
}

/**
 * Inspect packages already staged from verified archives. This is separately
 * testable with a synthetic package tree; the CLI only obtains it through
 * stageCandidatePackages, never from workspace source aliases.
 */
export function collectPackedPackageApis(projectDir: string, packages: readonly PackedPackage[]): readonly PublicPackageApi[] {
  const entries: PublicPackageApi[] = [];
  for (const packed of packages) {
    const packageDir = join(projectDir, "node_modules", ...packed.name.split("/"));
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as PackedManifest;
    if (manifest.name !== packed.name || manifest.version !== packed.version) throw new Error(`packed package identity mismatch: ${packed.name}`);
    const field = manifest.exports ?? (manifest.main ? { ".": { ...(manifest.types ? { types: manifest.types } : {}), default: manifest.main } } : undefined);
    if (!field) throw new Error(`packed package has no public export: ${packed.name}`);
    const object = typeof field === "object" && field !== null && !Array.isArray(field) ? field as Record<string, ExportTarget> : undefined;
    const keys = object ? Object.keys(object) : [];
    if (keys.some((key) => key.startsWith(".")) && keys.some((key) => !key.startsWith("."))) throw new Error(`mixed export subpaths and conditions: ${packed.name}`);
    const subpaths = keys.some((key) => key.startsWith(".")) ? Object.entries(object!) : [[".", field] as [string, ExportTarget]];
    const files = listFiles(packageDir);
    for (const [pattern, target] of subpaths) {
      if (pattern !== "." && !pattern.startsWith("./")) throw new Error(`invalid export subpath ${pattern}`);
      const conditions = flattenConditions(target);
      const hasStar = pattern.includes("*");
      if (hasStar && (pattern.match(/\*/g) ?? []).length !== 1) throw new Error(`unsupported export pattern ${pattern}`);
      const matches = hasStar ? [...new Set(conditions.flatMap(({ target }) => target?.includes("*") ? wildcardCaptures(target, files) : []))].sort() : [""];
      if (hasStar && matches.length === 0) throw new Error(`packed export pattern matches no files: ${packed.name}/${pattern}`);
      for (const match of matches) {
        const subpath = hasStar ? pattern.replace("*", match) : pattern;
        const resolved = conditions.map(({ condition, target }) => ({ condition, target: target === null ? null : target.replace("*", match) }));
        const declarationRoots = new Set<string>();
        const explicitTypes = resolved.some(({ condition }) => condition.split(".").some((part) => part === "types"));
        for (const { condition, target } of resolved) {
          if (target === null) continue;
          const absolute = safeTarget(packageDir, target);
          if (!existsSync(absolute)) throw new Error(`missing packed export target ${packed.name} ${subpath} (${condition}): ${target}`);
          const declaration = declarationFor(target);
          if (declaration && existsSync(safeTarget(packageDir, declaration))) declarationRoots.add(declaration);
          else if ((condition.split(".").includes("types") || (/\.(?:mjs|cjs|js)$/.test(target) && !explicitTypes)) && !declarationRoots.size) {
            throw new Error(`missing packed declaration for ${packed.name} ${subpath}: ${target}`);
          }
        }
        const declarations = collectDeclarations(packageDir, [...declarationRoots].sort());
        const name = subpath === "." ? packed.name : `${packed.name}/${subpath.slice(2)}`;
        entries.push({ packageName: name, version: manifest.version, packagePath: `archive:${packed.name}@${packed.version}#sha256=${packed.sha256}`,
          entrypointPath: [...declarationRoots].sort().join(", ") || "non-code or disabled export", exportStatements: declarations.flatMap((entry) => collectExportStatements(entry.text)), conditions: resolved, declarations });
      }
    }
  }
  return entries.sort((a, b) => apiDocsPackageSortKey(a.packageName).localeCompare(apiDocsPackageSortKey(b.packageName)));
}

export function collectPublicPackageApis(root = process.cwd()): readonly PublicPackageApi[] {
  const packagesRoot = join(root, "packages");
  const rootPackageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    readonly name?: string;
    readonly version?: string;
    readonly private?: boolean;
  };
  const rootEngineApi = rootPackageJson.private === true ? [] : [{
    packageName: rootPackageJson.name ?? "@aura3d/engine",
    version: rootPackageJson.version ?? "0.0.0",
    packagePath: ".",
    entrypointPath: "packages/engine/src/index.ts",
    exportStatements: collectExportStatements(readFileSync(join(root, "packages", "engine", "src", "index.ts"), "utf8"))
  }];
  return [
    ...rootEngineApi,
    ...readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name))
    .filter((packageDir) => existsSync(join(packageDir, "package.json")))
    .map((packageDir) => {
      const packageJsonPath = join(packageDir, "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        readonly name?: string;
        readonly version?: string;
        readonly private?: boolean;
      };
      return { packageDir, packageJson };
    })
    .filter(({ packageJson }) => packageJson.private !== true)
    .map(({ packageDir, packageJson }) => {
      const entrypointPath = join(packageDir, "src", "index.ts");
      const relativePackagePath = normalizePath(relative(root, packageDir));
      const relativeEntrypointPath = normalizePath(relative(root, entrypointPath));
      if (!packageJson.name) {
        throw new Error(`${relativePackagePath}/package.json is missing name`);
      }
      if (!packageJson.version) {
        throw new Error(`${relativePackagePath}/package.json is missing version`);
      }
      if (!existsSync(entrypointPath)) {
        throw new Error(`${relativeEntrypointPath} is missing`);
      }
      return [
        {
          packageName: packageJson.name,
          version: packageJson.version,
          packagePath: relativePackagePath,
          entrypointPath: relativeEntrypointPath,
          exportStatements: collectExportStatements(readFileSync(entrypointPath, "utf8"))
        },
        ...additionalExportSubpaths(root, packageDir, packageJson)
      ];
    })
    .flat()
  ].sort((a, b) => apiDocsPackageSortKey(a.packageName).localeCompare(apiDocsPackageSortKey(b.packageName)));
}

/**
 * Public `exports` subpaths beyond `.`, documented as their own sections.
 *
 * WS-2.2 introduced `@aura3d/physics/solverless`, `@aura3d/physics/world` and
 * `@aura3d/engine/rendering/webgpu` so that a lean import does not drag a rigid-body solver or a
 * WebGPU device onto the critical path. Each is a **public entry point**, and this generator only read
 * `src/index.ts` — so those surfaces would have shipped undocumented, which is precisely the kind of
 * gap that lets a public API drift away from what is written down.
 */
function additionalExportSubpaths(
  root: string,
  packageDir: string,
  packageJson: { readonly name?: string; readonly version?: string }
): PublicPackageApi[] {
  const exportsField = (JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    readonly exports?: Record<string, unknown>;
  }).exports;
  if (!exportsField) return [];
  const results: PublicPackageApi[] = [];
  for (const subpath of Object.keys(exportsField)) {
    if (subpath === ".") continue;
    const name = subpath.replace(/^\.\//, "");
    const sourcePath = join(packageDir, "src", `${name}.ts`);
    if (!existsSync(sourcePath)) continue;
    results.push({
      packageName: `${packageJson.name}/${name}`,
      version: packageJson.version ?? "0.0.0",
      packagePath: normalizePath(relative(root, packageDir)),
      entrypointPath: normalizePath(relative(root, sourcePath)),
      exportStatements: collectExportStatements(readFileSync(sourcePath, "utf8"))
    });
  }
  return results;
}

function apiDocsPackageSortKey(packageName: string): string {
  if (packageName === "create-aura3d") return "@aura3d/core/create-aura3d";
  return packageName;
}

export function readApiDocsAppendix(root = process.cwd(), appendixPath = defaultAppendixPath): string | undefined {
  const absoluteAppendixPath = join(root, appendixPath);
  return existsSync(absoluteAppendixPath) ? readFileSync(absoluteAppendixPath, "utf8") : undefined;
}

export function renderApiDocs(packages: readonly PublicPackageApi[], appendix?: string): string {
  const packed = packages.some((pkg) => pkg.conditions !== undefined);
  const lines: string[] = [
    "# Aura3D Public API Reference",
    "",
    packed ? "This file is generated from verified packed package export conditions and declarations." : "This file is a generated inventory of source export declarations.",
    packed ? "Each section identifies its candidate archive and every published condition; declarations include relative re-exports." : "Installed availability requires the matching packed-candidate consumer checks.",
    "",
    packed ? "**Agents: do not read this file whole.** It is the exhaustive declaration inventory for gates and diffs. For tasks, use `docs/agents/api-surface.md`." : "**Agents: do not read this file whole.** It is the exhaustive declaration dump (roughly 40k tokens) kept for gates and diffs. For `@aura3d/engine` start at [`root-exports.md`](root-exports.md) (generated from the real root entry `packages/engine/src/public/index.ts`; the `@aura3d/engine` section below lists a legacy entry file). For tasks, use `docs/agents/api-surface.md`.",
    "",
    "Generate and verify the packed reference using a reviewed candidate plan:",
    "",
    "```sh",
    "pnpm verify:api-docs -- --candidate-plan path/to/candidate-plan.json --write",
    "pnpm verify:api-docs -- --candidate-plan path/to/candidate-plan.json",
    "```",
    "",
    "## Packages",
    "",
    "| Package | Version | Entrypoint | Export declarations |",
    "|---|---:|---|---:|"
  ];

  for (const pkg of packages) {
    lines.push(`| \`${pkg.packageName}\` | \`${pkg.version}\` | \`${pkg.entrypointPath}\` | ${pkg.exportStatements.length} |`);
  }

  for (const pkg of packages) {
    if (pkg.conditions) {
      lines.push("", `## ${pkg.packageName}`, "", `- Version: \`${pkg.version}\``, `- Packed identity: \`${pkg.packagePath}\``, "", "### Export conditions", "");
      for (const { condition, target } of pkg.conditions) lines.push(`- \`${condition}\`: ${target === null ? "blocked" : `\`${target}\``}`);
      if (!pkg.declarations?.length) lines.push("", "This export has no TypeScript declaration (non-code or explicitly blocked target).");
      for (const declaration of pkg.declarations ?? []) lines.push("", `### \`${declaration.path}\``, "", "```ts", declaration.text.trimEnd(), "```");
      continue;
    }
    lines.push(
      "",
      `## ${pkg.packageName}`,
      "",
      `- Version: \`${pkg.version}\``,
      `- Package manifest: \`${pkg.packagePath === "." ? "package.json" : `${pkg.packagePath}/package.json`}\``,
      `- Public entrypoint: \`${pkg.entrypointPath}\``,
      "",
      "### Export Declarations",
      "",
      "```ts"
    );
    lines.push(...pkg.exportStatements);
    lines.push("```");
  }

  lines.push("");
  const rendered = `${lines.join("\n")}`;
  return appendix ? `${rendered}\n${appendix.trimEnd()}\n` : rendered;
}

export function validateApiDocs(root = process.cwd(), outputPath = defaultOutputPath, packages = collectPublicPackageApis(root)): ApiDocsReport {
  const rendered = renderApiDocs(packages, readApiDocsAppendix(root));
  const absoluteOutputPath = join(root, outputPath);
  const current = existsSync(absoluteOutputPath) ? readFileSync(absoluteOutputPath, "utf8") : "";
  const violations: string[] = [];

  if (current !== rendered) {
    violations.push(`${outputPath} is not current with package entrypoint exports. Run pnpm verify:api-docs -- --write.`);
  }
  for (const pkg of packages) {
    if (pkg.exportStatements.length === 0 && !pkg.conditions) {
      violations.push(`${pkg.entrypointPath} has no public export declarations.`);
    }
  }

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    outputPath,
    packages,
    violations
  };
}

export function writeApiDocs(root = process.cwd(), outputPath = defaultOutputPath, packages = collectPublicPackageApis(root)): void {
  const rendered = renderApiDocs(packages, readApiDocsAppendix(root));
  const absoluteOutputPath = join(root, outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, rendered);
}

export function writeApiDocsReport(report: ApiDocsReport, root = process.cwd(), reportPath = defaultReportPath): void {
  const absoluteReportPath = join(root, reportPath);
  mkdirSync(dirname(absoluteReportPath), { recursive: true });
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function collectExportStatements(source: string): readonly string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) {
      continue;
    }
    if (current.length === 0 && !line.startsWith("export ")) {
      continue;
    }
    current.push(line);
    if (line.endsWith(";") || isInlineExportDeclaration(current)) {
      statements.push(normalizeExportStatement(current.join(" ")));
      current = [];
    }
  }
  if (current.length > 0) {
    statements.push(normalizeExportStatement(current.join(" ")));
  }
  return statements;
}

function isInlineExportDeclaration(lines: readonly string[]): boolean {
  const statement = lines.join(" ");
  return /^export\s+(interface|function|class|const|let|var|type|enum)\s+/.test(statement) && braceBalance(statement) === 0;
}

function normalizeExportStatement(statement: string): string {
  return statement.replace(/\s+/g, " ").trim();
}

function braceBalance(value: string): number {
  let balance = 0;
  for (const char of value) {
    if (char === "{") balance += 1;
    if (char === "}") balance -= 1;
  }
  return balance;
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

/**
 * `--out <root-relative path>` writes/verifies the packed reference somewhere
 * other than the checked-in docs/api/public-api.md (the source pass emits the
 * candidate-generated reference into its report directory).
 */
export function apiDocsOutputPath(argv: readonly string[]): string {
  const index = argv.indexOf("--out");
  if (index < 0) return defaultOutputPath;
  const value = argv[index + 1];
  if (!value || value.startsWith("--") || argv.lastIndexOf("--out") !== index) throw new Error("--out requires one root-relative path");
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..") || !value.endsWith(".md")) {
    throw new Error(`--out must be a root-relative .md path: ${value}`);
  }
  return value;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const root = process.cwd();
    const planIndex = process.argv.indexOf("--candidate-plan");
    const plan = planIndex >= 0 ? process.argv[planIndex + 1] : process.env.A3D_RELEASE_PLAN;
    if (!plan || plan.startsWith("--")) throw new Error("--candidate-plan or A3D_RELEASE_PLAN is required to generate documentation from packed declarations");
    const outputPath = apiDocsOutputPath(process.argv.slice(2));
    const scratch = mkdtempSync(join(tmpdir(), "aura3d-api-docs-"));
    try {
      const candidate = stageCandidatePackages(root, plan, scratch);
      const packages = collectPackedPackageApis(scratch, candidate.packages);
      if (process.argv.includes("--write")) writeApiDocs(root, outputPath, packages);
      const report = validateApiDocs(root, outputPath, packages);
      writeApiDocsReport(report, root);
      console.log(JSON.stringify({ ok: report.ok, candidatePlan: candidate.candidatePlan, candidatePlanSha256: candidate.candidatePlanSha256,
        outputPath: report.outputPath, packages: report.packages.length, violations: report.violations }, null, 2));
      if (!report.ok) process.exitCode = 1;
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  } catch (error) {
    console.error(`api-docs: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
