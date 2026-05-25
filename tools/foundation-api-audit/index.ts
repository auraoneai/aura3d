import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectPublicPackageApis } from "../api-docs/index.js";

export interface V3ApiAuditPackage {
  readonly packageName: string;
  readonly packageDir: string;
  readonly entrypointPath: string;
  readonly exportCount: number;
  readonly hasPackageExport: boolean;
  readonly hasPackageTypes: boolean;
  readonly hasPackageImport: boolean;
  readonly hasTsconfigPath: boolean;
  readonly documentedInPublicApi: boolean;
  readonly documentedInV3Map: boolean;
  readonly hasRootSubpathExport: boolean;
  readonly rootSubpath?: string;
  readonly violations: readonly string[];
}

export interface V3ApiAuditReport {
  readonly schema: "g3d-foundation-api-audit/v1";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly packageCount: number;
  readonly privatePackages: readonly string[];
  readonly packages: readonly V3ApiAuditPackage[];
  readonly violations: readonly string[];
  readonly futurePackages: readonly {
    readonly packageName: string;
    readonly expectedAtMilestone: string;
    readonly exists: boolean;
  }[];
}

const root = process.cwd();

export function createV3ApiAuditReport(workspaceRoot = root): V3ApiAuditReport {
  const rootPackage = readJson(join(workspaceRoot, "package.json"));
  const tsconfig = readJson(join(workspaceRoot, "tsconfig.base.json"));
  const publicApiDocs = readText(join(workspaceRoot, "docs/api/public-api.md"));
  const apiMap = readText(join(workspaceRoot, "docs/project/v3-roadmap-public-api-map.md"));
  const packages = collectPublicPackageApis(workspaceRoot);
  const privatePackages = collectPrivatePackages(workspaceRoot);
  const rootExports = rootPackage.exports ?? {};
  const tsconfigPaths = tsconfig.compilerOptions?.paths ?? {};

  const auditedPackages = packages.map((pkg): V3ApiAuditPackage => {
    const packageJson = readJson(join(workspaceRoot, pkg.packagePath, "package.json"));
    const packageExport = packageJson.exports?.["."];
    const rootSubpath = rootSubpathFor(pkg.packageName);
    const violations: string[] = [];
    const hasPackageExport = Boolean(packageExport);
    const hasPackageTypes = typeof packageExport?.types === "string";
    const hasPackageImport = typeof packageExport?.import === "string";
    const hasTsconfigPath = Array.isArray(tsconfigPaths[pkg.packageName]) && tsconfigPaths[pkg.packageName]?.includes(pkg.entrypointPath);
    const documentedInPublicApi = publicApiDocs.includes(`## ${pkg.packageName}`);
    const documentedInV3Map = apiMap.includes(`\`${pkg.packageName}\``);
    const hasRootSubpathExport = pkg.packageName === "@galileo3d/engine"
      ? true
      : rootSubpath !== undefined && typeof rootExports[rootSubpath] === "string";

    if (!hasPackageExport) violations.push(`${pkg.packageName} is missing package exports["."].`);
    if (!hasPackageTypes) violations.push(`${pkg.packageName} exports["."] is missing a types target.`);
    if (!hasPackageImport) violations.push(`${pkg.packageName} exports["."] is missing an import target.`);
    if (!hasTsconfigPath) violations.push(`${pkg.packageName} is missing a tsconfig.base.json path alias to ${pkg.entrypointPath}.`);
    if (!documentedInPublicApi) violations.push(`${pkg.packageName} is missing from docs/api/public-api.md.`);
    if (!documentedInV3Map) violations.push(`${pkg.packageName} is missing from docs/project/v3-roadmap-public-api-map.md.`);
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
      documentedInV3Map,
      hasRootSubpathExport,
      ...(rootSubpath ? { rootSubpath } : {}),
      violations
    };
  });

  const futurePackages = [
    {
      packageName: "@galileo3d/workflows",
      expectedAtMilestone: "Milestone 4 - Workflow SDK Package",
      exists: existsSync(join(workspaceRoot, "packages/workflows/package.json"))
    }
  ];
  const violations = auditedPackages.flatMap((pkg) => pkg.violations);
  if (!privatePackages.includes("@galileo3d/test-utils")) {
    violations.push("@galileo3d/test-utils must remain private and excluded from public package docs.");
  }
  if (!auditedPackages.some((pkg) => pkg.packageName === "@galileo3d/product-studio")) {
    violations.push("@galileo3d/product-studio must be part of the V3 public API surface.");
  }

  return {
    schema: "g3d-foundation-api-audit/v1",
    generatedAt: new Date().toISOString(),
    pass: violations.length === 0,
    packageCount: auditedPackages.length,
    privatePackages,
    packages: auditedPackages,
    violations,
    futurePackages
  };
}

export function writeV3ApiAuditReport(workspaceRoot = root, outputPath = "tests/reports/foundation-api-audit.json"): V3ApiAuditReport {
  const report = createV3ApiAuditReport(workspaceRoot);
  const fullOutputPath = resolve(workspaceRoot, outputPath);
  mkdirSync(resolve(workspaceRoot, "tests/reports"), { recursive: true });
  writeFileSync(fullOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && process.argv[1].endsWith("tools/foundation-api-audit/index.ts")) {
  const report = writeV3ApiAuditReport();
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
  if (!packageName.startsWith("@galileo3d/")) return undefined;
  const leaf = packageName.slice("@galileo3d/".length);
  if (leaf === "engine" || leaf === "test-utils") return undefined;
  return `./${leaf}`;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
