import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectPublicPackageApis } from "../api-docs/index.js";

export interface FoundationApiAuditPackage {
  readonly packageName: string;
  readonly packageDir: string;
  readonly entrypointPath: string;
  readonly exportCount: number;
  readonly hasPackageExport: boolean;
  readonly hasPackageTypes: boolean;
  readonly hasPackageImport: boolean;
  readonly hasTsconfigPath: boolean;
  readonly documentedInPublicApi: boolean;
  readonly documentedInFoundationMap: boolean;
  readonly hasRootSubpathExport: boolean;
  readonly rootSubpath?: string;
  readonly violations: readonly string[];
}

export interface FoundationApiAuditReport {
  readonly schema: "a3d-foundation-api-audit";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly packageCount: number;
  readonly privatePackages: readonly string[];
  readonly packages: readonly FoundationApiAuditPackage[];
  readonly violations: readonly string[];
  readonly futurePackages: readonly {
    readonly packageName: string;
    readonly expectedAtMilestone: string;
    readonly exists: boolean;
  }[];
}

const root = process.cwd();

export function createFoundationApiAuditReport(workspaceRoot = root): FoundationApiAuditReport {
  const rootPackage = readJson(join(workspaceRoot, "package.json"));
  const tsconfig = readJson(join(workspaceRoot, "tsconfig.base.json"));
  const publicApiDocs = readText(join(workspaceRoot, "docs/api/public-api.md"));
  const apiMap = publicApiDocs;
  const packages = collectPublicPackageApis(workspaceRoot);
  const privatePackages = collectPrivatePackages(workspaceRoot);
  const rootExports = rootPackage.exports ?? {};
  const tsconfigPaths = tsconfig.compilerOptions?.paths ?? {};

  const auditedPackages = packages.map((pkg): FoundationApiAuditPackage => {
    const packageJson = readJson(join(workspaceRoot, pkg.packagePath, "package.json"));
    const packageExport = packageJson.exports?.["."];
    const rootSubpath = rootSubpathFor(pkg.packageName);
    const violations: string[] = [];
    const hasPackageExport = Boolean(packageExport);
    const hasPackageTypes = typeof packageExport?.types === "string";
    const hasPackageImport = typeof packageExport?.import === "string";
    const hasTsconfigPath = Array.isArray(tsconfigPaths[pkg.packageName]) && tsconfigPaths[pkg.packageName]?.includes(pkg.entrypointPath);
    const documentedInPublicApi = publicApiDocs.includes(`## ${pkg.packageName}`);
    const documentedInFoundationMap = apiMap.includes(`## ${pkg.packageName}`) || apiMap.includes(`\`${pkg.packageName}\``);
    const hasRootSubpathExport = pkg.packageName === "@aura3d/engine"
      ? true
      : rootSubpath !== undefined && typeof rootExports[rootSubpath] === "string";

    if (!hasPackageExport) violations.push(`${pkg.packageName} is missing package exports["."].`);
    if (!hasPackageTypes) violations.push(`${pkg.packageName} exports["."] is missing a types target.`);
    if (!hasPackageImport) violations.push(`${pkg.packageName} exports["."] is missing an import target.`);
    if (!hasTsconfigPath) violations.push(`${pkg.packageName} is missing a tsconfig.base.json path alias to ${pkg.entrypointPath}.`);
    if (!documentedInPublicApi) violations.push(`${pkg.packageName} is missing from docs/api/public-api.md.`);
    if (!documentedInFoundationMap) violations.push(`${pkg.packageName} is missing from docs/api/public-api.md contextual package coverage.`);
    if (rootSubpath && !hasRootSubpathExport) violations.push(`${pkg.packageName} is missing root package export ${rootSubpath}.`);
    if (pkg.exportStatements.length === 0) violations.push(`${pkg.packageName} has no public export declarations.`);

    return {
      packageName: pkg.packageName,
      packageDir: pkg.packagePath,
      entrypointPath: pkg.entrypointPath,
      exportCount: pkg.exportStatements.length,
      hasPackageExport,
      hasPackageTypes,
      hasPackageImport,
      hasTsconfigPath,
      documentedInPublicApi,
      documentedInFoundationMap,
      hasRootSubpathExport,
      ...(rootSubpath ? { rootSubpath } : {}),
      violations
    };
  });

  const futurePackages = [
    {
      packageName: "@aura3d/workflows",
      expectedAtMilestone: "Milestone 4 - Workflow SDK Package",
      exists: existsSync(join(workspaceRoot, "packages/workflows/package.json"))
    }
  ];
  const violations = auditedPackages.flatMap((pkg) => pkg.violations);
  if (!privatePackages.includes("@aura3d/test-utils")) {
    violations.push("@aura3d/test-utils must remain private and excluded from public package docs.");
  }
  if (!auditedPackages.some((pkg) => pkg.packageName === "@aura3d/product-studio")) {
    violations.push("@aura3d/product-studio must be part of the Foundation public API surface.");
  }

  return {
    schema: "a3d-foundation-api-audit",
    generatedAt: new Date().toISOString(),
    pass: violations.length === 0,
    packageCount: auditedPackages.length,
    privatePackages,
    packages: auditedPackages,
    violations,
    futurePackages
  };
}

export function writeFoundationApiAuditReport(workspaceRoot = root, outputPath = "tests/reports/foundation-api-audit.json"): FoundationApiAuditReport {
  const report = createFoundationApiAuditReport(workspaceRoot);
  const fullOutputPath = resolve(workspaceRoot, outputPath);
  mkdirSync(resolve(workspaceRoot, "tests/reports"), { recursive: true });
  writeFileSync(fullOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && process.argv[1].endsWith("tools/foundation-api-audit/index.ts")) {
  const report = writeFoundationApiAuditReport();
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
  }
}

function collectPrivatePackages(workspaceRoot: string): string[] {
  const packagesRoot = join(workspaceRoot, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name, "package.json"))
    .filter((path) => existsSync(path))
    .map((path) => readJson(path))
    .filter((pkg) => pkg.private === true)
    .map((pkg) => String(pkg.name))
    .sort();
}

function rootSubpathFor(packageName: string): string | undefined {
  if (!packageName.startsWith("@aura3d/")) return undefined;
  const leaf = packageName.slice("@aura3d/".length);
  if (leaf === "engine" || leaf === "test-utils") return undefined;
  return `./${leaf}`;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
