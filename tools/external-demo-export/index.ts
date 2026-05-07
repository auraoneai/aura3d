import { build, type Plugin } from "esbuild";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { cpus, platform, release, totalmem } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface ExternalDemoExportEntry {
  readonly id: string;
  readonly sourceEntry: string;
  readonly outputHtml: string;
  readonly outputScript: string;
  readonly bytes: number;
}

interface ExternalDemoExportReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly command: string;
  readonly version: string | null;
  readonly gitSha: string | null;
  readonly outputDir: string;
  readonly demos: readonly ExternalDemoExportEntry[];
  readonly environment: {
    readonly platform: NodeJS.Platform;
    readonly release: string;
    readonly arch: string;
    readonly cpuModel: string;
    readonly cpuCount: number;
    readonly totalMemoryBytes: number;
    readonly ci: boolean;
  };
  readonly violations: readonly string[];
}

const demoIds = ["product-configurator", "architecture-viewer", "game-slice"] as const;
const reportPath = "tests/reports/external-demo-static-export.json";

export async function buildExternalDemoExport(root = process.cwd(), outputDir?: string): Promise<ExternalDemoExportReport> {
  const packageVersion = readPackageVersion(root);
  const relativeOutputDir = outputDir ?? process.env.G3D_EXTERNAL_DEMO_EXPORT_DIR ?? `release-artifacts/external-demos/${packageVersion ?? "unknown"}`;
  const resolvedOutputDir = isAbsolute(relativeOutputDir) ? relativeOutputDir : join(root, relativeOutputDir);
  const violations: string[] = [];

  rmSync(resolvedOutputDir, { recursive: true, force: true });
  mkdirSync(resolvedOutputDir, { recursive: true });

  const demos: ExternalDemoExportEntry[] = [];

  for (const id of demoIds) {
    const sourceHtml = join(root, "examples", id, "index.html");
    const sourceEntry = join(root, "examples", id, "main.ts");
    const demoOutputDir = join(resolvedOutputDir, id);
    const outputHtml = join(demoOutputDir, "index.html");
    const outputScript = join(demoOutputDir, "main.js");

    if (!existsSync(sourceHtml)) violations.push(`Missing source HTML for ${id}: ${relative(root, sourceHtml)}`);
    if (!existsSync(sourceEntry)) violations.push(`Missing source entry for ${id}: ${relative(root, sourceEntry)}`);
    if (!existsSync(sourceHtml) || !existsSync(sourceEntry)) continue;

    mkdirSync(demoOutputDir, { recursive: true });
    writeFileSync(outputHtml, rewriteDemoHtml(readFileSync(sourceHtml, "utf8")));

    await build({
      entryPoints: [sourceEntry],
      outfile: outputScript,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      minify: true,
      treeShaking: true,
      plugins: [workspacePackagePlugin(root)],
      logLevel: "silent"
    });

    demos.push({
      id,
      sourceEntry: relative(root, sourceEntry),
      outputHtml: relative(root, outputHtml),
      outputScript: relative(root, outputScript),
      bytes: statSync(outputScript).size
    });
  }

  writeFileSync(join(resolvedOutputDir, "index.html"), buildIndexHtml(packageVersion, demos));

  const report: ExternalDemoExportReport = {
    ok: violations.length === 0 && demos.length === demoIds.length,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-external-demo-export-run",
    command: "pnpm build:external-demos",
    version: packageVersion,
    gitSha: gitSha(root),
    outputDir: relativeOutputDir,
    demos,
    environment: {
      platform: platform(),
      release: release(),
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      ci: process.env.CI === "true"
    },
    violations
  };
  writeReport(root, report);
  return report;
}

function rewriteDemoHtml(source: string): string {
  return source.replace("./main.js", "./main.js");
}

function buildIndexHtml(version: string | null, demos: readonly ExternalDemoExportEntry[]): string {
  const links = demos.map((demo) => `<li><a href="./${demo.id}/">${demo.id}</a> (${demo.bytes} bytes)</li>`).join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Galileo3D External Demo Export</title>
  </head>
  <body>
    <main>
      <h1>Galileo3D External Demo Export</h1>
      <p>Version ${version ?? "unknown"}</p>
      <ul>
${links}
      </ul>
    </main>
  </body>
</html>
`;
}

function workspacePackagePlugin(root: string): Plugin {
  return {
    name: "galileo3d-workspace-packages",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@galileo3d\/[^/]+$/ }, (args) => {
        const packageName = args.path.replace(/^@galileo3d\//, "");
        const path = join(root, "packages", packageName, "src", "index.ts");
        return existsSync(path) ? { path } : undefined;
      });
    }
  };
}

function readPackageVersion(root: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function gitSha(root: string): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function writeReport(root: string, report: ExternalDemoExportReport): void {
  const outputPath = join(root, reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await buildExternalDemoExport();
  console.log(JSON.stringify({
    ok: report.ok,
    outputDir: report.outputDir,
    demos: report.demos.map((demo) => ({ id: demo.id, bytes: demo.bytes })),
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
