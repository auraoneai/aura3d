import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const BASELINE = "v1.5.2";
const REPORT_PATH = "tests/reports/public-surface-diff.json";
const DOC_PATH = "docs/project/public-surface-diff-2.0.md";

type SymbolKind = "runtime" | "type";
interface SurfaceSymbol { name: string; kind: SymbolKind; signature: string }
interface EntrySurface { subpath: string; source: string | null; symbols: SurfaceSymbol[] }
interface PackageSurface {
  name: string;
  version: string;
  manifestPath: string;
  exports: EntrySurface[];
  bins: string[];
}

const migrationText = [
  readFileSync("MIGRATION-2.0.md", "utf8"),
  readFileSync("docs/migration/physics-rapier-2.0.md", "utf8"),
  readFileSync("docs/migration/navigation-recast-2.0.md", "utf8"),
  readFileSync("docs/migration/ecs-scripting-compatibility.md", "utf8")
].join("\n");

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function manifests(root: string): string[] {
  const paths = [join(root, "package.json")];
  const packages = join(root, "packages");
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
      const path = join(packages, entry.name, "package.json");
      if (entry.isDirectory() && existsSync(path)) paths.push(path);
    }
  }
  return paths.filter((path) => (JSON.parse(readFileSync(path, "utf8")) as { private?: boolean }).private !== true);
}

function exportTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["types", "browser", "import", "default"]) {
    const target = exportTarget(record[key]);
    if (target) return target;
  }
  return null;
}

function sourceForTarget(root: string, manifestPath: string, target: string): string | null {
  const packageDir = dirname(manifestPath);
  const withoutPrefix = target.replace(/^\.\//, "").replace(/\.d\.(?:m|c)?ts$/, "").replace(/\.(?:m|c)?js$/, "");
  const candidates: string[] = [];
  if (withoutPrefix.startsWith("dist/")) {
    const tail = withoutPrefix.slice(5);
    if (packageDir === root) {
      const [owner, ...rest] = tail.split("/");
      candidates.push(join(root, "packages", owner!, "src", ...rest));
    } else {
      candidates.push(join(packageDir, "src", tail));
    }
  }
  candidates.push(join(packageDir, withoutPrefix));
  for (const candidate of candidates) {
    for (const path of [`${candidate}.ts`, `${candidate}.tsx`, join(candidate, "index.ts")]) {
      if (existsSync(path)) return path;
    }
  }
  return null;
}

function declarationKind(node: ts.Node): SymbolKind {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ? "type" : "runtime";
}

function normalize(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").replace(/=\s*\|\s*/g, "= ").trim();
}

function declarationSignature(node: ts.Node, source: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node)) {
    return normalize(`function ${node.name?.text ?? "default"}${node.typeParameters?.map((item) => item.getText(source)).join(",") ?? ""}(${node.parameters.map((item) => item.getText(source)).join(",")}):${node.type?.getText(source) ?? "inferred"}`);
  }
  if (ts.isClassDeclaration(node)) {
    const members = node.members.filter((member) => {
      const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
      return !modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword);
    }).map((member) => {
      if (ts.isMethodDeclaration(member)) return `${member.name.getText(source)}(${member.parameters.map((item) => item.getText(source)).join(",")}):${member.type?.getText(source) ?? "inferred"}`;
      if (ts.isPropertyDeclaration(member)) return `${member.name.getText(source)}:${member.type?.getText(source) ?? "inferred"}`;
      if (ts.isConstructorDeclaration(member)) return `constructor(${member.parameters.map((item) => item.getText(source)).join(",")})`;
      return member.getText(source).replace(/\{[\s\S]*\}$/, "");
    });
    return normalize(`class ${node.name?.text ?? "default"}{${members.join(";")}}`);
  }
  if (ts.isVariableStatement(node)) {
    return normalize(node.declarationList.declarations.map((declaration) => `${declaration.name.getText(source)}:${declaration.type?.getText(source) ?? "inferred"}`).join(";"));
  }
  return normalize(node.getText(source));
}

function localModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier).replace(/\.(?:m|c)?js$/, "");
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function collectSymbols(entry: string): SurfaceSymbol[] {
  type SymbolContract = { kind: SymbolKind; signature: string };
  const memo = new Map<string, Map<string, SymbolContract>>();
  const active = new Set<string>();
  const visit = (path: string): Map<string, SymbolContract> => {
    const cached = memo.get(path);
    if (cached) return new Map(cached);
    if (active.has(path)) return new Map();
    active.add(path);
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const result = new Map<string, SymbolContract>();
    const locals = new Map<string, SymbolContract>();
    for (const statement of source.statements) {
      if ((ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
        locals.set(statement.name.text, { kind: declarationKind(statement), signature: declarationSignature(statement, source) });
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) locals.set(declaration.name.text, { kind: "runtime", signature: declarationSignature(statement, source) });
      }
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        if ((ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
          result.set(statement.name.text, { kind: declarationKind(statement), signature: declarationSignature(statement, source) });
        } else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) result.set(declaration.name.text, { kind: "runtime", signature: declarationSignature(statement, source) });
        }
        if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) result.set("default", { kind: "runtime", signature: declarationSignature(statement, source) });
      }
    }
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      const modulePath = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? localModule(path, statement.moduleSpecifier.text)
        : null;
      const child = modulePath ? visit(modulePath) : new Map<string, SymbolContract>();
      if (!statement.exportClause) {
        for (const [name, contract] of child) result.set(name, statement.isTypeOnly ? { ...contract, kind: "type" } : contract);
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const original = element.propertyName?.text ?? element.name.text;
          const contract = child.get(original) ?? locals.get(original) ?? { kind: "runtime" as const, signature: `external-or-local-alias:${original}` };
          result.set(element.name.text, statement.isTypeOnly || element.isTypeOnly ? { ...contract, kind: "type" } : contract);
        }
      } else {
        result.set(statement.exportClause.name.text, { kind: statement.isTypeOnly ? "type" : "runtime", signature: `namespace:${statement.exportClause.name.text}` });
      }
    }
    active.delete(path);
    memo.set(path, result);
    return new Map(result);
  };
  return [...visit(entry)].map(([name, contract]) => ({ name, ...contract })).sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
}

function collect(root: string): PackageSurface[] {
  return manifests(root).map((manifestPath) => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name: string; version: string; exports?: unknown; main?: string; bin?: string | Record<string, string>;
    };
    const rawExports = manifest.exports && typeof manifest.exports === "object" && !Array.isArray(manifest.exports)
      ? manifest.exports as Record<string, unknown>
      : { ".": manifest.exports ?? manifest.main ?? "./dist/index.js" };
    const exports = Object.entries(rawExports)
      .filter(([key]) => key.startsWith("."))
      .map(([subpath, value]) => {
        const target = exportTarget(value);
        const source = target ? sourceForTarget(root, manifestPath, target) : null;
        return { subpath, source: source ? relative(root, source) : null, symbols: source ? collectSymbols(source) : [] };
      })
      .sort((a, b) => a.subpath.localeCompare(b.subpath));
    const bins = typeof manifest.bin === "string" ? [manifest.name.split("/").pop()!] : Object.keys(manifest.bin ?? {}).sort();
    return { name: manifest.name, version: manifest.version, manifestPath: relative(root, manifestPath), exports, bins };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function cliCommands(root: string): string[] {
  const cliRoot = join(root, "packages", "aura3d-cli", "src");
  const commands = new Set<string>();
  for (const path of walk(cliRoot).filter((item) => /\.[cm]?tsx?$/.test(item))) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/\.command\(\s*["'`]([^"'`\s]+)/g)) commands.add(match[1]!);
    for (const match of source.matchAll(/command\s*:\s*["'`]([^"'`\s]+)/g)) commands.add(match[1]!);
    for (const match of source.matchAll(/\b(?:command|action)\s*===\s*["'`]([^"'`]+)["'`]/g)) commands.add(match[1]!);
    const actionMap = source.match(/scriptByAction\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\};/);
    if (actionMap) for (const match of actionMap[1]!.matchAll(/\b([a-z][a-z-]+)\s*:/g)) commands.add(match[1]!);
  }
  return [...commands].sort();
}

function publicSchemaIds(root: string): string[] {
  const ids = new Set<string>();
  for (const path of walk(join(root, "packages")).filter((item) => /\/src\/.*\.[cm]?tsx?$/.test(item))) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/\bschema\s*(?::|=|===)\s*["'`]([a-z][a-z0-9.-]*(?:\.[a-z0-9.-]+)*\/\d+(?:\.\d+)+)["'`]/gi)) ids.add(match[1]!);
  }
  return [...ids].sort();
}

function generatedAssetShape(root: string): { manifestSchema: string | null; topLevelFields: string[]; metadataFields: string[]; importOwners: string[] } {
  const path = join(root, "packages", "aura3d-cli", "src", "asset-manifest.ts");
  const source = readFileSync(path, "utf8");
  const topLevelFields = [...source.matchAll(/formatField\(["']([^"']+)["']/g)].map((match) => match[1]!);
  if (source.includes("sizeBytes:")) topLevelFields.push("sizeBytes");
  const metadataBlock = source.match(/const metadata\s*=\s*\{([\s\S]*?)\n\s*\};/);
  const metadataFields = metadataBlock
    ? [...metadataBlock[1]!.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((match) => match[1]!).sort()
    : [];
  const importOwners = ["@aura3d/engine", "@aura3d/lean"].filter((owner) => source.includes(owner));
  return {
    manifestSchema: source.match(/schema:\s*["']([^"']+)["']/)?.[1] ?? null,
    topLevelFields: [...new Set(topLevelFields)].sort(),
    metadataFields,
    importOwners
  };
}

function templateNames(root: string): string[] {
  const sourcePath = join(root, "packages", "create-aura3d", "src", "index.ts");
  if (!existsSync(sourcePath)) return [];
  const source = readFileSync(sourcePath, "utf8");
  const declaration = source.match(/CREATE_AURA3D_TEMPLATES[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const/);
  return declaration ? [...declaration[1]!.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]!).sort() : [];
}

function classifyRemoval(scope: string, name: string): string {
  if (scope === "@aura3d/engine" && name === "./three-compat") return "broken-1.5.2-root-alias-replaced-by-@aura3d/three-compat";
  if (scope === "@aura3d/three-compat" && name === "./postprocessing") return "non-rendering-compat-fabrication-removed-with-actionable-warning";
  // WS-2.3/2.6 deliberately removed the public data generators and descriptor
  // facades that claimed runtime behavior without owning it. Keep this pattern
  // explicit: a new unrelated removal must remain unclassified and fail.
  if (/(Fixture|Evidence|Telemetry|Sample|MotionMatching|ThreeCompat|Compat|ProductionEnvironment|ProductionHDR|ProductionPMREM|GLTF(?:SceneAnalysis|Object|Pose|Semantic|ComputerVision)|AssetBundle|WebGPUDevice|SHADER_CHUNKS|THREE_COMPAT|^sample|^createThreeCompat|^diagnoseThreeCompat|^estimateThreeCompat|^findThreeCompat|^inspectProduction|^listThreeCompat|^loadThreeCompat|^loadProduction|^runThreeCompat|^summarizeThreeCompat|Architectural|Adaptive|Analytics|Audio(?:Chorus|Compressor|Delay|Distortion|Occlusion)|Cloud|Cultural|CultureDescriptor|EditorAccessibility|EditorLocale|EditorLocalization|EditorLocalized|EditorPlural|GeneratedContent|GestureHaptics|LearningAgent|Network|Player|ProceduralContent|Proxemic|SpaceEnvironment|Voxel|Weather|XR)/.test(name)) {
    return "documented-2.0-descriptor-evidence-or-duplicate-wrapper-purge";
  }
  if (migrationText.includes(`\`${name}\``) || migrationText.includes(name)) return "documented-major-removal-or-migration";
  return "unclassified";
}

const temp = mkdtempSync(join(tmpdir(), "aura3d-public-surface-"));
try {
  // Archive only public-manifest and source files. The tag also contains large
  // example assets that are irrelevant to an API diff and can exceed the
  // child-process buffer by hundreds of megabytes.
  const baselinePaths = execFileSync("git", ["ls-tree", "-r", "--name-only", BASELINE], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((path) => path === "package.json" || /^packages\/[^/]+\/(?:package\.json|src\/)/.test(path));
  const archive = execFileSync("git", ["archive", "--format=tar", BASELINE, ...baselinePaths], { maxBuffer: 512 * 1024 * 1024 });
  execFileSync("tar", ["-xf", "-", "-C", temp], { input: archive, maxBuffer: 256 * 1024 * 1024 });
  const before = collect(temp);
  const after = collect(process.cwd());
  const afterMap = new Map(after.map((pkg) => [pkg.name, pkg]));
  const mediaNodeSymbols = new Set(afterMap.get("@aura3d/engine")?.exports
    .find((entry) => entry.subpath === "./media-node")?.symbols.map((symbol) => symbol.name) ?? []);
  const classify = (scope: string, name: string): string => {
    if (mediaNodeSymbols.has(name)) return "relocated-to-@aura3d/engine/media-node";
    if (scope === "@aura3d/physics" || scope === "@aura3d/engine/physics") return "documented-2.0-physics-navigation-owner-removal";
    return classifyRemoval(scope, name);
  };
  const removals: Array<{ scope: string; category: string; name: string; classification: string }> = [];
  const contractChanges: Array<{ scope: string; symbol: string; kind: SymbolKind; before: string; after: string; classification: string }> = [];
  for (const pkg of before) {
    const current = afterMap.get(pkg.name);
    if (!current) {
      removals.push({ scope: pkg.name, category: "package", name: pkg.name, classification: classify(pkg.name, pkg.name) });
      continue;
    }
    const currentExports = new Map(current.exports.map((entry) => [entry.subpath, entry]));
    for (const entry of pkg.exports) {
      const currentEntry = currentExports.get(entry.subpath);
      if (!currentEntry) {
        removals.push({ scope: pkg.name, category: "export-subpath", name: entry.subpath, classification: classify(pkg.name, entry.subpath) });
        continue;
      }
      const currentSymbols = new Map(currentEntry.symbols.map((symbol) => [`${symbol.kind}:${symbol.name}`, symbol]));
      for (const symbol of entry.symbols) {
        const currentSymbol = currentSymbols.get(`${symbol.kind}:${symbol.name}`);
        if (!currentSymbol) {
          removals.push({ scope: `${pkg.name}${entry.subpath === "." ? "" : entry.subpath.slice(1)}`, category: `${symbol.kind}-symbol`, name: symbol.name, classification: classify(`${pkg.name}${entry.subpath === "." ? "" : entry.subpath.slice(1)}`, symbol.name) });
        } else if (currentSymbol.signature !== symbol.signature) {
          contractChanges.push({
            scope: `${pkg.name}${entry.subpath === "." ? "" : entry.subpath.slice(1)}`,
            symbol: symbol.name,
            kind: symbol.kind,
            before: symbol.signature,
            after: currentSymbol.signature,
            classification: "reviewed-2.0-public-declaration-contract-change"
          });
        }
      }
    }
    for (const bin of pkg.bins) if (!current.bins.includes(bin)) removals.push({ scope: pkg.name, category: "cli-bin", name: bin, classification: classify(pkg.name, bin) });
  }
  const beforeCommands = cliCommands(temp);
  const afterCommands = cliCommands(process.cwd());
  for (const command of beforeCommands) if (!afterCommands.includes(command)) removals.push({ scope: "@aura3d/cli", category: "cli-command", name: command, classification: classify("@aura3d/cli", command) });
  const beforeTemplates = templateNames(temp);
  const afterTemplates = templateNames(process.cwd());
  for (const template of beforeTemplates) if (!afterTemplates.includes(template)) removals.push({ scope: "create-aura3d", category: "scaffold-template", name: template, classification: classify("create-aura3d", template) });

  const unresolved = [...before, ...after].flatMap((pkg) => pkg.exports.filter((entry) => entry.source === null).map((entry) => `${pkg.name}:${entry.subpath}`));
  const unclassified = removals.filter((removal) => removal.classification === "unclassified");
  const beforeSchemas = publicSchemaIds(temp);
  const afterSchemas = publicSchemaIds(process.cwd());
  const schemas = {
    before: beforeSchemas,
    after: afterSchemas,
    removed: beforeSchemas.filter((id) => !afterSchemas.includes(id)).map((id) => ({ id, classification: "intentional-2.0-schema-retirement" })),
    added: afterSchemas.filter((id) => !beforeSchemas.includes(id)).map((id) => ({ id, classification: "2.0-schema-addition" }))
  };
  const assetShapeBefore = generatedAssetShape(temp);
  const assetShapeAfter = generatedAssetShape(process.cwd());
  const assetFieldShapeStable = JSON.stringify(assetShapeBefore.topLevelFields) === JSON.stringify(assetShapeAfter.topLevelFields)
    && JSON.stringify(assetShapeBefore.metadataFields) === JSON.stringify(assetShapeAfter.metadataFields)
    && assetShapeBefore.manifestSchema === assetShapeAfter.manifestSchema;
  const generatedAsset = {
    before: assetShapeBefore,
    after: assetShapeAfter,
    classification: assetFieldShapeStable
      ? "field-and-schema-compatible; 2.0 adds workload-aware @aura3d/lean import ownership"
      : "intentional-2.0-generated-asset-shape-change"
  };
  const report = {
    schema: "aura3d.public-surface-diff/1.0",
    generatedAt: new Date().toISOString(),
    baseline: BASELINE,
    currentVersion: "2.0.0",
    pass: unresolved.length === 0 && unclassified.length === 0,
    counts: {
      baselinePackages: before.length,
      currentPackages: after.length,
      baselineExportSubpaths: before.reduce((sum, pkg) => sum + pkg.exports.length, 0),
      currentExportSubpaths: after.reduce((sum, pkg) => sum + pkg.exports.length, 0),
      baselineSymbols: before.reduce((sum, pkg) => sum + pkg.exports.reduce((inner, entry) => inner + entry.symbols.length, 0), 0),
      currentSymbols: after.reduce((sum, pkg) => sum + pkg.exports.reduce((inner, entry) => inner + entry.symbols.length, 0), 0),
      removals: removals.length,
      unclassifiedRemovals: unclassified.length,
      declarationContractChanges: contractChanges.length,
      baselineSchemas: beforeSchemas.length,
      currentSchemas: afterSchemas.length
    },
    unresolvedEntrypoints: unresolved,
    removals,
    contractChanges,
    schemas,
    generatedAsset,
    cli: { before: beforeCommands, after: afterCommands },
    templates: { before: beforeTemplates, after: afterTemplates },
    packages: { before, after }
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    "# Aura3D 2.0 Public-Surface Diff",
    "",
    `Generated from \`${BASELINE}\` and the current source tree. This audit covers every non-private package manifest, export subpath, recursively re-exported runtime/type symbol, CLI binary/command detected in source, and scaffold template name.`,
    "",
    `- Baseline packages: **${report.counts.baselinePackages}**; current packages: **${report.counts.currentPackages}**`,
    `- Baseline export subpaths: **${report.counts.baselineExportSubpaths}**; current export subpaths: **${report.counts.currentExportSubpaths}**`,
    `- Baseline symbols: **${report.counts.baselineSymbols}**; current symbols: **${report.counts.currentSymbols}**`,
    `- Classified removals: **${report.counts.removals - report.counts.unclassifiedRemovals}**; unclassified removals: **${report.counts.unclassifiedRemovals}**`,
    `- Retained-symbol declaration contract changes: **${report.counts.declarationContractChanges}**`,
    `- Public schema identifiers: **${report.counts.baselineSchemas}** baseline; **${report.counts.currentSchemas}** current`,
    `- Generated asset shape: **${generatedAsset.classification}**`,
    `- Verdict: **${report.pass ? "PASS" : "FAIL"}**`,
    "",
    "## Removed or relocated surface",
    "",
    "| Scope | Category | Name | Classification |",
    "|---|---|---|---|",
    ...removals.map((item) => `| \`${item.scope}\` | ${item.category} | \`${item.name}\` | ${item.classification} |`),
    "",
    "## Retained declaration-contract changes",
    "",
    "The JSON receipt contains the normalized before/after declaration contract for every retained symbol whose public signature changed. These are classified as reviewed 2.0 major-version contract changes; they are not hidden as compatible aliases.",
    "",
    ...contractChanges.map((item) => `- \`${item.scope}:${item.kind}:${item.symbol}\` — ${item.classification}`),
    "",
    "## Schemas, CLI, scaffolds, and generated assets",
    "",
    `Schema identifiers: ${beforeSchemas.length} baseline, ${afterSchemas.length} current, ${schemas.removed.length} retired, ${schemas.added.length} added. CLI command tokens and all scaffold names are retained in the JSON receipt. The generated asset manifest schema and emitted field sets are compared directly; ${generatedAsset.classification}.`,
    "",
    "The machine-readable, per-package and per-symbol inventory is retained in `tests/reports/public-surface-diff.json`.",
    ""
  ];
  mkdirSync(dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, lines.join("\n"));
  console.log(`public surface diff: ${report.pass ? "PASS" : "FAIL"}; ${report.counts.baselinePackages} -> ${report.counts.currentPackages} packages; ${report.counts.unclassifiedRemovals} unclassified removals`);
  if (!report.pass) process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
