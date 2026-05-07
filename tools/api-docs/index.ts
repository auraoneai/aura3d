import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface PublicPackageApi {
  readonly packageName: string;
  readonly version: string;
  readonly packagePath: string;
  readonly entrypointPath: string;
  readonly exportStatements: readonly string[];
}

export interface ApiDocsReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly outputPath: string;
  readonly packages: readonly PublicPackageApi[];
  readonly violations: readonly string[];
}

const defaultOutputPath = "docs/api/public-api.md";

export function collectPublicPackageApis(root = process.cwd()): readonly PublicPackageApi[] {
  const packagesRoot = join(root, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
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
      return {
        packageName: packageJson.name,
        version: packageJson.version,
        packagePath: relativePackagePath,
        entrypointPath: relativeEntrypointPath,
        exportStatements: collectExportStatements(readFileSync(entrypointPath, "utf8"))
      };
    })
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function renderApiDocs(packages: readonly PublicPackageApi[]): string {
  const lines: string[] = [
    "# Galileo3D Public API Reference",
    "",
    "This file is generated from every non-private package entrypoint under `packages/*/src/index.ts`.",
    "It documents the public export surface that package consumers can import today.",
    "",
    "Regenerate and verify it with:",
    "",
    "```sh",
    "pnpm verify:api-docs",
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
    lines.push(
      "",
      `## ${pkg.packageName}`,
      "",
      `- Version: \`${pkg.version}\``,
      `- Package manifest: \`${pkg.packagePath}/package.json\``,
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
  return `${lines.join("\n")}`;
}

export function validateApiDocs(root = process.cwd(), outputPath = defaultOutputPath): ApiDocsReport {
  const packages = collectPublicPackageApis(root);
  const rendered = renderApiDocs(packages);
  const absoluteOutputPath = join(root, outputPath);
  const current = existsSync(absoluteOutputPath) ? readFileSync(absoluteOutputPath, "utf8") : "";
  const violations: string[] = [];

  if (current !== rendered) {
    violations.push(`${outputPath} is not current with package entrypoint exports. Run pnpm verify:api-docs -- --write.`);
  }
  for (const pkg of packages) {
    if (pkg.exportStatements.length === 0) {
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

export function writeApiDocs(root = process.cwd(), outputPath = defaultOutputPath): void {
  const rendered = renderApiDocs(collectPublicPackageApis(root));
  const absoluteOutputPath = join(root, outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, rendered);
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

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const shouldWrite = process.argv.includes("--write");
  if (shouldWrite) {
    writeApiDocs();
  }
  const report = validateApiDocs();
  console.log(JSON.stringify({
    ok: report.ok,
    outputPath: report.outputPath,
    packages: report.packages.length,
    exportDeclarations: report.packages.reduce((total, pkg) => total + pkg.exportStatements.length, 0),
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
