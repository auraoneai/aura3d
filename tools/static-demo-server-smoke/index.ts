import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface StaticDemoServerSmokeReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly command: string;
  readonly outputDir: string | null;
  readonly integrityManifestPath: string | null;
  readonly localServerUrl: string;
  readonly index?: StaticDemoFileCheck;
  readonly demos: readonly {
    readonly id: string;
    readonly html: StaticDemoFileCheck;
    readonly script: StaticDemoFileCheck;
  }[];
  readonly violations: readonly string[];
}

interface StaticDemoFileCheck {
  readonly path: string;
  readonly url: string;
  readonly status: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly integrityMatched: boolean;
  readonly contentOk: boolean;
  readonly contentMarkers: readonly string[];
}

const exportReportPath = "tests/reports/external-demo-static-export.json";
const reportPath = "tests/reports/static-demo-server-smoke.json";
const requiredDemos = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "large-world-streaming",
] as const;

export async function createStaticDemoServerSmokeReport(root = process.cwd()): Promise<StaticDemoServerSmokeReport> {
  const exportReport = readJson(join(root, exportReportPath));
  const outputDir = typeof exportReport?.outputDir === "string" ? exportReport.outputDir : null;
  const integrityManifestPath = typeof exportReport?.integrityManifestPath === "string" ? exportReport.integrityManifestPath : null;
  const outputRoot = outputDir ? join(root, outputDir) : "";
  const manifest = integrityManifestPath ? readJson(join(root, integrityManifestPath)) : null;
  const manifestHashes = new Map(
    (Array.isArray(manifest?.files) ? manifest.files : [])
      .filter(isRecord)
      .map((entry) => [String(entry.path), String(entry.sha256)])
  );
  const exportSourceFreshnessViolations = validateReportSourceFileHashes(root, exportReport, "Static demo export");
  const baseViolations = [
    ...(exportReport?.ok === true ? [] : ["Static export report is missing or failing."]),
    ...exportSourceFreshnessViolations,
    ...(outputDir && existsSync(outputRoot) ? [] : [`Static export output dir is missing: ${outputDir ?? "unknown"}.`]),
    ...(integrityManifestPath && existsSync(join(root, integrityManifestPath)) ? [] : [`Static integrity manifest is missing: ${integrityManifestPath ?? "unknown"}.`]),
  ];
  if (baseViolations.length > 0) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      command: "pnpm verify:static-demo-server-smoke",
      outputDir,
      integrityManifestPath,
      localServerUrl: "",
      demos: [],
      violations: baseViolations
    };
  }

  const server = createServer((request, response) => serveStaticFile(outputRoot, request.url ?? "/", response));
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const localServerUrl = `http://127.0.0.1:${port}`;
  try {
    const index = await fetchStaticDemoFile(root, outputRoot, localServerUrl, join(outputRoot, "index.html"), manifestHashes, expectedContentMarkers("index.html"));
    const demos = await Promise.all(
      (Array.isArray(exportReport?.demos) ? exportReport.demos : [])
        .filter(isRecord)
        .map(async (demo) => {
          const id = String(demo.id);
          const htmlPath = String(demo.outputHtml);
          const scriptPath = String(demo.outputScript);
          const [html, script] = await Promise.all([
            fetchStaticDemoFile(root, outputRoot, localServerUrl, join(root, htmlPath), manifestHashes, expectedContentMarkers(`${id}/index.html`)),
            fetchStaticDemoFile(root, outputRoot, localServerUrl, join(root, scriptPath), manifestHashes, expectedContentMarkers(`${id}/main.js`)),
          ]);
          return {
            id,
            html,
            script
          };
        })
    );
    const violations = [
      ...baseViolations,
      ...(index.status === 200 ? [] : [`index: HTML returned HTTP ${index.status}.`]),
      ...(index.bytes > 100 ? [] : ["index: HTML response is too small."]),
      ...(index.integrityMatched ? [] : ["index: served bytes do not match static integrity manifest."]),
      ...(index.contentOk ? [] : [`index: served bytes do not contain expected content markers: ${index.contentMarkers.join(", ") || "none"}.`]),
      ...(demos.length >= requiredDemos.length ? [] : [`Expected at least ${requiredDemos.length} static demos to be served.`]),
      ...requiredDemos.flatMap((id) => demos.some((demo) => demo.id === id) ? [] : [`Missing required static demo in export: ${id}.`]),
      ...demos.flatMap((demo) => [
        ...(demo.html.status === 200 ? [] : [`${demo.id}: HTML returned HTTP ${demo.html.status}.`]),
        ...(demo.script.status === 200 ? [] : [`${demo.id}: script returned HTTP ${demo.script.status}.`]),
        ...(demo.html.bytes > 100 ? [] : [`${demo.id}: HTML response is too small.`]),
        ...(demo.script.bytes > 10_000 ? [] : [`${demo.id}: script response is too small.`]),
        ...(demo.html.integrityMatched && demo.script.integrityMatched ? [] : [`${demo.id}: served bytes do not match static integrity manifest.`]),
        ...(demo.html.contentOk ? [] : [`${demo.id}: HTML served bytes do not contain expected content markers: ${demo.html.contentMarkers.join(", ") || "none"}.`]),
        ...(demo.script.contentOk ? [] : [`${demo.id}: script served bytes do not contain expected content markers: ${demo.script.contentMarkers.join(", ") || "none"}.`]),
      ])
    ];
    return {
      ok: violations.length === 0,
      generatedAt: new Date().toISOString(),
      command: "pnpm verify:static-demo-server-smoke",
      outputDir,
      integrityManifestPath,
      localServerUrl,
      index,
      demos,
      violations
    };
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  }
}

async function fetchStaticDemoFile(
  root: string,
  outputRoot: string,
  localServerUrl: string,
  fullPath: string,
  manifestHashes: ReadonlyMap<string, string>,
  contentMarkers: readonly string[]
): Promise<StaticDemoFileCheck> {
  const path = relative(root, fullPath);
  const url = `${localServerUrl}/${relative(outputRoot, fullPath).split(sep).join("/")}`;
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  const text = bytes.toString("utf8");
  return {
    path,
    url,
    status: response.status,
    bytes: bytes.byteLength,
    sha256: digest,
    integrityMatched: manifestHashes.get(path) === digest,
    contentOk: contentMarkers.every((marker) => text.includes(marker)),
    contentMarkers,
  };
}

function expectedContentMarkers(relativePath: string): readonly string[] {
  if (relativePath === "index.html") {
    return requiredDemos.map((id) => `./${id}/`);
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

function serveStaticFile(outputRoot: string, requestUrl: string, response: ServerResponse): void {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = resolve(outputRoot, `.${normalize(requested)}`);
  if (!fullPath.startsWith(resolve(outputRoot))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentType(fullPath) });
  createReadStream(fullPath).pipe(response);
}

function contentType(path: string): string {
  const extension = extname(path);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateReportSourceFileHashes(root: string, report: Record<string, unknown> | null, label: string): readonly string[] {
  if (!report) return [`${label} report is missing.`];
  const entries = Array.isArray(report.sourceFileHashes) ? report.sourceFileHashes.filter(isRecord) : [];
  if (entries.length === 0) {
    return [`${label} report does not include sourceFileHashes for current source freshness.`];
  }
  const violations: string[] = [];
  for (const entry of entries) {
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
      violations.push(`${label} report contains a malformed sourceFileHashes entry.`);
      continue;
    }
    const sourcePath = join(root, entry.path);
    if (!existsSync(sourcePath)) {
      violations.push(`${label} source is missing: ${entry.path}.`);
      continue;
    }
    const currentHash = sha256(readFileSync(sourcePath));
    if (currentHash !== entry.sha256) {
      violations.push(`${label} is stale because source changed after export: ${entry.path}.`);
    }
  }
  return violations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeReport(root: string, report: StaticDemoServerSmokeReport): void {
  const outputPath = join(root, reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createStaticDemoServerSmokeReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    outputDir: report.outputDir,
    demos: report.demos.length,
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
