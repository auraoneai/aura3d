import { build, type Plugin } from "esbuild";
import { createHash } from "node:crypto";
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
  readonly sha256: {
    readonly html: string;
    readonly script: string;
  };
}

interface SourceFileHash {
  readonly path: string;
  readonly sha256: string;
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
  readonly integrityManifestPath: string;
  readonly publicDeploymentManifestPath: string;
  readonly deploymentCommandPlanPath: string;
  readonly rollbackPlanPath: string;
  readonly sourceFileHashes: readonly SourceFileHash[];
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

interface PublicDeploymentManifest {
  readonly schemaVersion: "a3d-public-demo-deployment";
  readonly generatedAt: string;
  readonly version: string | null;
  readonly outputDir: string;
  readonly requiredCommand: "A3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment";
  readonly files: readonly {
    readonly id: string;
    readonly localPath: string;
    readonly publicPath: string;
    readonly sha256: string;
    readonly minBytes: number;
    readonly contentMarkers: readonly string[];
  }[];
  readonly sourceFileHashes: readonly SourceFileHash[];
}

const demoIds = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "large-world-streaming",
] as const;
const reportPath = "tests/reports/external-demo-static-export.json";

export async function buildExternalDemoExport(root = process.cwd(), outputDir?: string): Promise<ExternalDemoExportReport> {
  const packageVersion = readPackageVersion(root);
  const relativeOutputDir = outputDir ?? process.env.A3D_EXTERNAL_DEMO_EXPORT_DIR ?? `release-artifacts/external-demos/${packageVersion ?? "unknown"}`;
  const resolvedOutputDir = isAbsolute(relativeOutputDir) ? relativeOutputDir : join(root, relativeOutputDir);
  const violations: string[] = [];
  const sourceFiles = new Set<string>([
    "tools/external-demo-export/index.ts",
    "package.json",
  ]);

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
    addSourceFile(root, sourceFiles, sourceHtml);
    addSourceFile(root, sourceFiles, sourceEntry);

    mkdirSync(demoOutputDir, { recursive: true });
    writeFileSync(outputHtml, rewriteDemoHtml(readFileSync(sourceHtml, "utf8")));

    const result = await build({
      entryPoints: [sourceEntry],
      outfile: outputScript,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      minify: true,
      treeShaking: true,
      metafile: true,
      plugins: [nodeBuiltinsBrowserStubPlugin(), workspacePackagePlugin(root)],
      logLevel: "silent"
    });
    for (const input of Object.keys(result.metafile.inputs)) {
      addSourceFile(root, sourceFiles, input);
    }

    demos.push({
      id,
      sourceEntry: relative(root, sourceEntry),
      outputHtml: relative(root, outputHtml),
      outputScript: relative(root, outputScript),
      bytes: statSync(outputScript).size,
      sha256: {
        html: sha256(outputHtml),
        script: sha256(outputScript)
      }
    });
  }

  writeFileSync(join(resolvedOutputDir, "index.html"), buildIndexHtml(packageVersion, demos));
  const sourceFileHashes = hashSourceFiles(root, [...sourceFiles].sort((left, right) => left.localeCompare(right)));
  const integrityManifestPath = join(resolvedOutputDir, "static-integrity-manifest.json");
  writeFileSync(integrityManifestPath, `${JSON.stringify({
    schemaVersion: "a3d-static-demo-integrity",
    generatedAt: new Date().toISOString(),
    version: packageVersion,
    gitSha: gitSha(root),
    outputDir: relativeOutputDir,
    rollbackPlan: "docs/project/deployment-rollback.md",
    files: [
      {
        path: relative(root, join(resolvedOutputDir, "index.html")),
        sha256: sha256(join(resolvedOutputDir, "index.html"))
      },
      ...demos.flatMap((demo) => [
        { path: demo.outputHtml, sha256: demo.sha256.html },
        { path: demo.outputScript, sha256: demo.sha256.script }
      ])
    ],
    sourceFileHashes
  }, null, 2)}\n`);
  const publicDeploymentManifestPath = join(resolvedOutputDir, "public-deployment-manifest.json");
  const publicDeploymentManifest = buildPublicDeploymentManifest(root, relativeOutputDir, resolvedOutputDir, packageVersion, demos, sourceFileHashes);
  writeFileSync(publicDeploymentManifestPath, `${JSON.stringify(publicDeploymentManifest, null, 2)}\n`);
  const deploymentCommandPlanPath = join(resolvedOutputDir, "deployment-command-plan.json");
  writeFileSync(deploymentCommandPlanPath, `${JSON.stringify(buildDeploymentCommandPlan(relativeOutputDir, publicDeploymentManifest), null, 2)}\n`);

  const report: ExternalDemoExportReport = {
    ok: violations.length === 0 && demos.length === demoIds.length,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.A3D_RELEASE_RUN_ID ?? "standalone-external-demo-export-run",
    command: "pnpm build:external-demos",
    version: packageVersion,
    gitSha: gitSha(root),
    outputDir: relativeOutputDir,
    demos,
    integrityManifestPath: relative(root, integrityManifestPath),
    publicDeploymentManifestPath: relative(root, publicDeploymentManifestPath),
    deploymentCommandPlanPath: relative(root, deploymentCommandPlanPath),
    rollbackPlanPath: "docs/project/deployment-rollback.md",
    sourceFileHashes,
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

function buildDeploymentCommandPlan(outputDir: string, manifest: PublicDeploymentManifest): Record<string, unknown> {
  return {
    schemaVersion: "a3d-public-demo-deployment-command-plan",
    generatedAt: new Date().toISOString(),
    outputDir,
    claimBoundary: "This command plan only describes how to deploy and verify the static demo artifact. Production readiness remains blocked until a durable HTTPS origin serves bytes that match the manifest and passes public deployment smoke validation.",
    filesToDeploy: manifest.files.map((file) => ({
      id: file.id,
      localPath: file.localPath,
      publicPath: file.publicPath,
      sha256: file.sha256,
      minBytes: file.minBytes,
      contentMarkers: file.contentMarkers,
    })),
    sourceFileHashes: manifest.sourceFileHashes,
    uploadRequirements: [
      "Upload every file listed in filesToDeploy.",
      "Preserve each file's publicPath relative to the public HTTPS origin root.",
      "Do not rewrite, minify, gzip-only, or transform bytes before validation; the public response body must match sha256.",
      "Serve HTML as text/html and JavaScript as text/javascript or application/javascript.",
    ],
    githubPagesWorkflow: ".github/workflows/public-demo-deploy.yml",
    githubPagesWorkflowNotes: [
      "The workflow builds the static export, runs local static-server smoke validation, deploys the exact artifact to GitHub Pages, and then runs verify:public-demo-deployment against the Pages URL.",
      "A workflow pass is public deployment evidence only when the uploaded public-demo-deployment-smoke and external-parity-production-readiness reports are retained with the run and the deployed URL is durable.",
      "Local production readiness remains blocked until tests/reports/public-demo-deployment-smoke.json is generated against a durable HTTPS origin in the current evidence set.",
    ],
    validationCommands: [
      "pnpm build:external-demos",
      "pnpm verify:static-demo-server-smoke",
      "A3D_PUBLIC_DEMO_URL=https://demo.your-real-domain.com/ pnpm verify:public-demo-deployment",
      "pnpm audit:external-parity-production-readiness",
      "pnpm audit:external-parity-broad-parity",
      "pnpm audit:external-parity-completion",
      "pnpm verify:external-parity-report-freshness",
    ],
    blockedUntilPublicValidationPasses: [
      "production-ready language",
      "public deployment readiness",
      "Unity/Unreal replacement language",
      "broad better-than-Three.js/Babylon language",
    ],
  };
}

function buildPublicDeploymentManifest(root: string, outputDir: string, resolvedOutputDir: string, version: string | null, demos: readonly ExternalDemoExportEntry[], sourceFileHashes: readonly SourceFileHash[]): PublicDeploymentManifest {
  const indexPath = relative(root, join(resolvedOutputDir, "index.html"));
  return {
    schemaVersion: "a3d-public-demo-deployment",
    generatedAt: new Date().toISOString(),
    version,
    outputDir,
    requiredCommand: "A3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
    files: [
      deploymentFile(root, "index", indexPath, "index.html", 100),
      ...demos.flatMap((demo) => [
        deploymentFile(root, `${demo.id}:html`, demo.outputHtml, `${demo.id}/index.html`, 100),
        deploymentFile(root, `${demo.id}:script`, demo.outputScript, `${demo.id}/main.js`, 10_000),
      ]),
    ],
    sourceFileHashes,
  };
}

function deploymentFile(root: string, id: string, localPath: string, publicPath: string, minBytes: number): PublicDeploymentManifest["files"][number] {
  return {
    id,
    localPath,
    publicPath,
    sha256: sha256(join(root, localPath)),
    minBytes,
    contentMarkers: expectedContentMarkers(publicPath),
  };
}

function rewriteDemoHtml(source: string): string {
  return source.replace("./main.ts", "./main.js").replace("./main.js", "./main.js");
}

function buildIndexHtml(version: string | null, demos: readonly ExternalDemoExportEntry[]): string {
  const links = demos.map((demo) => `<li><a href="./${demo.id}/">${demo.id}</a> (${demo.bytes} bytes)</li>`).join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aura3D External Demo Export</title>
  </head>
  <body>
    <main>
      <h1>Aura3D External Demo Export</h1>
      <p>Version ${version ?? "unknown"}</p>
      <ul>
${links}
      </ul>
    </main>
  </body>
</html>
`;
}

function expectedContentMarkers(relativePath: string): readonly string[] {
  if (relativePath === "index.html") {
    return demoIds.map((id) => `./${id}/`);
  }
  if (relativePath.endsWith("/index.html")) {
    return [
      "<script type=\"module\" src=\"./main.js\"></script>",
      "Aura3D",
    ];
  }
  const demoId = relativePath.split("/", 1)[0] ?? "";
  const canvasTestId = {
    "product-configurator": "product-configurator-canvas",
    "architecture-viewer": "architecture-viewer-canvas",
    "game-slice": "game-slice-canvas",
    "racing-showcase": "racing-showcase-canvas",
    "large-world-streaming": "large-world-canvas",
  }[demoId];
  return canvasTestId ? [canvasTestId] : [];
}

function workspacePackagePlugin(root: string): Plugin {
  return {
    name: "aura3d-workspace-packages",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@aura3d\/[^/]+$/ }, (args) => {
        const packageName = args.path.replace(/^@aura3d\//, "");
        const path = join(root, "packages", packageName, "src", "index.ts");
        return existsSync(path) ? { path } : undefined;
      });
    }
  };
}

function nodeBuiltinsBrowserStubPlugin(): Plugin {
  return {
    name: "aura3d-browser-node-builtin-stubs",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^node:/ }, (args) => ({
        path: args.path,
        namespace: "node-browser-stub"
      }));
      buildApi.onLoad({ filter: /.*/, namespace: "node-browser-stub" }, (args) => ({
        contents: browserStubModule(args.path),
        loader: "js"
      }));
    }
  };
}

function browserStubModule(specifier: string): string {
  const unavailable = `const unavailable = () => { throw new Error(${JSON.stringify(`${specifier} is not available in browser demo exports.`)}); };\n`;
  if (specifier === "node:crypto") {
    return `${unavailable}export const createHash = unavailable;\nexport default {};\n`;
  }
  if (specifier === "node:fs" || specifier === "node:fs/promises") {
    return `${unavailable}export const existsSync = unavailable;\nexport const readFileSync = unavailable;\nexport const statSync = unavailable;\nexport const writeFileSync = unavailable;\nexport default {};\n`;
  }
  if (specifier === "node:module") {
    return `${unavailable}export const createRequire = unavailable;\nexport default {};\n`;
  }
  if (specifier === "node:path") {
    return `${unavailable}export const dirname = unavailable;\nexport const extname = unavailable;\nexport const join = unavailable;\nexport const relative = unavailable;\nexport const resolve = unavailable;\nexport default {};\n`;
  }
  if (specifier === "node:vm") {
    return `${unavailable}export const Script = unavailable;\nexport const createContext = unavailable;\nexport const runInContext = unavailable;\nexport default {};\n`;
  }
  return `${unavailable}export default {};\n`;
}

function addSourceFile(root: string, sourceFiles: Set<string>, path: string): void {
  const relativePath = normalizeSourcePath(root, path);
  if (!relativePath) return;
  if (relativePath.startsWith("node_modules/")) return;
  if (relativePath.startsWith("release-artifacts/")) return;
  if (relativePath.startsWith("tests/reports/")) return;
  if (relativePath.startsWith("test-results/")) return;
  if (!existsSync(join(root, relativePath)) || !statSync(join(root, relativePath)).isFile()) return;
  sourceFiles.add(relativePath);
}

function normalizeSourcePath(root: string, path: string): string | null {
  const relativePath = isAbsolute(path) ? relative(root, path) : path;
  const normalized = relativePath.split("\\").join("/");
  if (normalized.length === 0 || normalized.startsWith("../")) return null;
  return normalized;
}

function hashSourceFiles(root: string, sourceFiles: readonly string[]): readonly SourceFileHash[] {
  return sourceFiles
    .filter((path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile())
    .map((path) => ({ path, sha256: sha256(join(root, path)) }));
}

function readPackageVersion(root: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
    integrityManifestPath: report.integrityManifestPath,
    publicDeploymentManifestPath: report.publicDeploymentManifestPath,
    deploymentCommandPlanPath: report.deploymentCommandPlanPath,
    demos: report.demos.map((demo) => ({ id: demo.id, bytes: demo.bytes })),
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
