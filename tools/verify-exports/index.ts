import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ExportViolation {
  packageName: string;
  message: string;
}

export interface ExportReport {
  ok: boolean;
  packages: string[];
  violations: ExportViolation[];
}

interface PackageJson {
  name?: string;
  private?: boolean;
  exports?: Record<string, unknown>;
  types?: string;
  main?: string;
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function getPackageDirs(root: string): string[] {
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name))
    .sort();
}

export interface VerifyExportsOptions {
  readonly packages?: readonly string[];
}

export function verifyExports(root = process.cwd(), options: VerifyExportsOptions = {}): ExportReport {
  const packageFilter = options.packages ? new Set(options.packages.map((name) => name.replace("@galileo3d/", ""))) : undefined;
  const packageDirs = getPackageDirs(root).filter((dir) => {
    if (!packageFilter) return true;
    return packageFilter.has(dir.split(/[\\/]/).at(-1) ?? "");
  });
  const violations: ExportViolation[] = [];
  const packages: string[] = [];
  const publicPackages: string[] = [];

  for (const dir of packageDirs) {
    const manifestPath = join(dir, "package.json");
    const indexPath = join(dir, "src", "index.ts");
    if (!existsSync(manifestPath)) {
      violations.push({ packageName: dir, message: "Missing package.json." });
      continue;
    }
    const manifest = readJson(manifestPath);
    const name = manifest.name ?? dir;
    packages.push(name);
    if (manifest.private !== true) publicPackages.push(name);

    if (!existsSync(indexPath)) {
      violations.push({ packageName: name, message: "Missing src/index.ts public barrel." });
    }

    const exportsMap = manifest.exports;
    if (!exportsMap || typeof exportsMap !== "object" || !("." in exportsMap)) {
      violations.push({ packageName: name, message: "Package must expose only an explicit \".\" export." });
    } else {
      if (Object.keys(exportsMap).some((key) => key !== ".")) {
        violations.push({ packageName: name, message: "Unapproved package subpath export found." });
      }
      const mainExport = exportsMap["."];
      if (typeof mainExport === "object" && mainExport !== null) {
        const exportObject = mainExport as Record<string, unknown>;
        if (exportObject.types !== "./dist/index.d.ts") {
          violations.push({ packageName: name, message: "Package export types must point to ./dist/index.d.ts." });
        }
        if (exportObject.import !== "./dist/index.js") {
          violations.push({ packageName: name, message: "Package export import must point to ./dist/index.js." });
        }
      } else if (mainExport !== "./dist/index.js") {
        violations.push({ packageName: name, message: "Package string export must point to ./dist/index.js." });
      }
    }

    if (manifest.types !== undefined && manifest.types !== "./dist/index.d.ts") {
      violations.push({ packageName: name, message: "Package types must point to ./dist/index.d.ts." });
    }
    if (manifest.main !== undefined && manifest.main !== "./dist/index.js") {
      violations.push({ packageName: name, message: "Package main must point to ./dist/index.js." });
    }
  }

  const rootManifestPath = join(root, "package.json");
  if (existsSync(rootManifestPath)) {
    const rootManifest = readJson(rootManifestPath);
    const rootExports = rootManifest.exports;
    if (!rootExports || typeof rootExports !== "object") {
      violations.push({ packageName: rootManifest.name ?? "root", message: "Root package must define exports." });
    } else {
      for (const packageName of publicPackages) {
        const shortName = packageName.replace("@galileo3d/", "");
        if (!(`./${shortName}` in rootExports)) {
          violations.push({ packageName: rootManifest.name ?? "root", message: `Missing root export ./${shortName}.` });
        }
      }
    }
  }

  return { ok: violations.length === 0, packages, violations };
}

function writeReport(root: string, report: ExportReport): void {
  const path = join(root, "tests", "reports", "exports.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const rootArg = process.argv[2] === "--root" ? process.argv[3] : undefined;
  const packagesIndex = process.argv.indexOf("--packages");
  const packages = packagesIndex === -1 ? undefined : process.argv[packagesIndex + 1]?.split(",").map((entry) => entry.trim()).filter(Boolean);
  const root = rootArg ?? process.cwd();
  const report = verifyExports(root, packages === undefined ? {} : { packages });
  writeReport(root, report);
  if (!report.ok) {
    console.error(JSON.stringify(report.violations, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Export verification passed for ${report.packages.length} packages.`);
  }
}
