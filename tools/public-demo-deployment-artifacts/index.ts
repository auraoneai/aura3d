import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface PublicDemoDeploymentArtifactIngestOptions {
  readonly root?: string;
  readonly artifactRoots: readonly string[];
  readonly dryRun?: boolean;
  readonly noAudit?: boolean;
}

interface PublicDemoDeploymentArtifactIngestResult {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly noAudit: boolean;
  readonly artifactRoots: readonly string[];
  readonly copiedFiles: number;
  readonly skippedFiles: number;
  readonly copied: readonly {
    readonly artifactRoot: string;
    readonly path: string;
  }[];
  readonly skipped: readonly {
    readonly artifactRoot: string;
    readonly path?: string;
    readonly reason: string;
  }[];
  readonly auditResults: readonly {
    readonly command: string;
    readonly ok: boolean;
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
  }[];
}

const allowedReportPaths = new Set([
  "tests/reports/public-demo-deployment-smoke.json",
  "tests/reports/public-demo-deployment-runbook.md",
  "tests/reports/external-parity-production-readiness.json",
  "tests/reports/external-parity-external-evidence-readiness.json",
  "tests/reports/external-parity-external-evidence-missing-artifacts.md",
  "tests/reports/external-parity-broad-parity-readiness.json",
  "tests/reports/external-parity-completion-audit.json",
  "tests/reports/external-parity-completion-audit-runbook.md",
  "tests/reports/external-parity-report-freshness.json",
]);
const targetByArtifactPath = new Map([
  ...[...allowedReportPaths].map((path) => [path, path] as const),
  ...[...allowedReportPaths].map((path) => [path.split("/").at(-1) ?? path, path] as const),
]);

const auditCommands = [
  ["pnpm", ["audit:external-parity-production-readiness"]],
  ["pnpm", ["audit:external-parity-external-evidence-readiness"]],
  ["pnpm", ["audit:v4-broad-parity"]],
  ["pnpm", ["audit:v4-completion"]],
  ["pnpm", ["verify:external-parity-report-freshness"]],
] as const;

export function ingestPublicDemoDeploymentReportArtifacts(options: PublicDemoDeploymentArtifactIngestOptions): PublicDemoDeploymentArtifactIngestResult {
  const root = options.root ?? process.cwd();
  const dryRun = options.dryRun === true;
  const noAudit = options.noAudit === true;
  const copied: PublicDemoDeploymentArtifactIngestResult["copied"] extends readonly (infer Entry)[] ? Entry[] : never = [];
  const skipped: PublicDemoDeploymentArtifactIngestResult["skipped"] extends readonly (infer Entry)[] ? Entry[] : never = [];

  for (const artifactRoot of options.artifactRoots) {
    const absoluteArtifactRoot = resolve(root, artifactRoot);
    if (!existsSync(absoluteArtifactRoot)) {
      skipped.push({ artifactRoot, reason: "artifact directory missing" });
      continue;
    }
    for (const filePath of listFiles(absoluteArtifactRoot)) {
      const relativePath = normalizePath(relative(absoluteArtifactRoot, filePath));
      const targetRelativePath = targetByArtifactPath.get(relativePath);
      if (!targetRelativePath) {
        skipped.push({ artifactRoot, path: relativePath, reason: "not a public deployment report artifact" });
        continue;
      }
      const targetPath = join(root, targetRelativePath);
      copied.push({ artifactRoot, path: targetRelativePath });
      if (!dryRun) {
        mkdirSync(dirname(targetPath), { recursive: true });
        copyFileSync(filePath, targetPath);
      }
    }
  }

  const auditResults = dryRun || noAudit ? [] : auditCommands.map(([command, args]) => {
    const child = spawnSync(command, args, { cwd: root, stdio: "pipe", encoding: "utf8" });
    return {
      command: [command, ...args].join(" "),
      ok: child.status === 0,
      exitCode: child.status,
      stdout: child.stdout.trim(),
      stderr: child.stderr.trim(),
    };
  });

  return {
    ok: skipped.every((entry) => entry.reason !== "artifact directory missing") && copied.length > 0,
    dryRun,
    noAudit,
    artifactRoots: options.artifactRoots,
    copiedFiles: copied.length,
    skippedFiles: skipped.length,
    copied,
    skipped,
    auditResults,
  };
}

function listFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const noAudit = process.argv.includes("--no-audit");
  const artifactRoots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (artifactRoots.length === 0) {
    throw new Error("Usage: pnpm ingest:public-demo-deployment-reports [--dry-run] [--no-audit] <artifact-dir>...");
  }
  const result = ingestPublicDemoDeploymentReportArtifacts({ artifactRoots, dryRun, noAudit });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
