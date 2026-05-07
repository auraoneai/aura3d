import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageSizeEntry {
  path: string;
  bytes: number;
}

export interface PackageSizeReport {
  ok: boolean;
  generatedAt: string;
  releaseRunId: string;
  totalBytes: number;
  files: PackageSizeEntry[];
}

function walkFiles(dir: string, root: string, out: PackageSizeEntry[] = []): PackageSizeEntry[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walkFiles(path, root, out);
    else out.push({ path: relative(root, path), bytes: stats.size });
  }
  return out;
}

export function collectPackageSizes(root = process.cwd()): PackageSizeReport {
  const files = walkFiles(join(root, "dist"), root).sort((a, b) => a.path.localeCompare(b.path));
  const totalBytes = files.reduce((sum, entry) => sum + entry.bytes, 0);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-package-size-run",
    totalBytes,
    files
  };
}

function writeReport(root: string, report: PackageSizeReport): void {
  const reportPaths = [
    join(root, "tests", "reports", "package-size.json"),
    join(root, "tests", "reports", "final-package-size.json")
  ];
  for (const path of reportPaths) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const report = collectPackageSizes(root);
  writeReport(root, report);
  console.log(`Package size report wrote ${report.files.length} files, ${report.totalBytes} bytes total.`);
}
