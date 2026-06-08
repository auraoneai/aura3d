import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { basename, dirname, relative, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { addAsset, validateAssets } from "../../packages/aura3d-cli/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

interface SketchfabDownloadInfo {
  readonly uid: string;
  readonly name: string;
  readonly license: string;
  readonly assetPath: string;
  readonly format: "glb" | "gltf";
  readonly downloadedBytes: number;
}

interface RenderSmokeResult {
  readonly pass: boolean;
  readonly url: string;
  readonly ready: boolean;
  readonly backend: string | null;
  readonly drawCalls: number | null;
  readonly screenshotPath: string;
  readonly screenshotBytes: number;
  readonly profile: {
    readonly litPixels: number;
    readonly uniqueBuckets: number;
    readonly centerObjectPixels: number;
  };
  readonly consoleErrors: readonly string[];
}

type SketchfabDownloadResponse = Record<string, { readonly url?: string; readonly size?: number } | undefined>;

const workspace = resolve("tests/reports/sketchfab-asset-corpus-workspace");
const modelUid = process.env.SKETCHFAB_MODEL_UID?.trim() || "01371cd3990f4d9587d40244b5e2a0a8";
const token = process.env.SKETCHFAB_API_TOKEN?.trim();
const checks: ReleaseCheck[] = [];

rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
writeFileSync(resolve(workspace, "package.json"), JSON.stringify({ type: "module", scripts: { build: "echo sketchfab-asset-corpus-build" } }, null, 2));

if (!token) {
  checks.push({
    id: "sketchfab-api-token-present",
    pass: false,
    detail: "SKETCHFAB_API_TOKEN is missing; no secret value was inspected or recorded."
  });
  writeSketchfabMarkdown(undefined, checks);
  writeReport("tests/reports/sketchfab-asset-corpus.json", "aura3d-sketchfab-asset-corpus", checks, { workspace: repoRelative(workspace), modelUid });
} else {
  checks.push({
    id: "sketchfab-api-token-present",
    pass: true,
    detail: "SKETCHFAB_API_TOKEN was supplied through the process environment and was not written to disk."
  });

  const download = downloadSketchfabAsset(workspace, modelUid, token);
  checks.push({
    id: "sketchfab-download",
    pass: existsSync(resolve(workspace, download.assetPath)) && statSync(resolve(workspace, download.assetPath)).size > 0,
    detail: `${download.name} ${download.format} downloaded into ignored test workspace (${download.downloadedBytes} bytes).`
  });

  const addResult = addAsset({ projectDir: workspace, file: download.assetPath, name: "sketchfabCc0" });
  checks.push({
    id: "sketchfab-assets-add",
    pass: addResult.ok,
    detail: addResult.messages.join("; ")
  });

  const validation = validateAssets({ projectDir: workspace });
  const manifestAsset = validation.manifest.assets.find((entry) => entry.id === "sketchfabCc0");
  checks.push({
    id: "sketchfab-assets-validate",
    pass: validation.ok && Boolean(manifestAsset),
    detail: validation.ok && manifestAsset
      ? `manifest asset format=${manifestAsset.format}, materials=${manifestAsset.materials.length}, textures=${manifestAsset.textures.length}, animations=${manifestAsset.animations.length}`
      : validation.messages.join("; ")
  });
  checks.push({
    id: "sketchfab-typegen-created",
    pass: existsSync(resolve(workspace, "src/aura-assets.ts")),
    detail: "src/aura-assets.ts generated for the Sketchfab asset."
  });

  const renderSmoke = await runSketchfabRenderSmoke(workspace);
  checks.push({
    id: "sketchfab-browser-render",
    pass: renderSmoke.pass,
    detail: renderSmoke.pass
      ? `browser render ready=${renderSmoke.ready}, backend=${renderSmoke.backend ?? "unknown"}, drawCalls=${renderSmoke.drawCalls ?? "unknown"}, litPixels=${renderSmoke.profile.litPixels}, centerObjectPixels=${renderSmoke.profile.centerObjectPixels}, buckets=${renderSmoke.profile.uniqueBuckets}`
      : `browser render failed: ready=${renderSmoke.ready}, backend=${renderSmoke.backend ?? "unknown"}, drawCalls=${renderSmoke.drawCalls ?? "unknown"}, litPixels=${renderSmoke.profile.litPixels}, centerObjectPixels=${renderSmoke.profile.centerObjectPixels}, buckets=${renderSmoke.profile.uniqueBuckets}, consoleErrors=${renderSmoke.consoleErrors.join(" | ")}`
  });

  writeSketchfabMarkdown(download, checks);
  writeReport("tests/reports/sketchfab-asset-corpus.json", "aura3d-sketchfab-asset-corpus", checks, {
    workspace: repoRelative(workspace),
    modelUid: download.uid,
    modelName: download.name,
    license: download.license,
    assetPath: download.assetPath,
    format: download.format,
    manifestAsset,
    validationWarnings: validation.warnings,
    renderSmoke
  });
}

function downloadSketchfabAsset(projectDir: string, uid: string, apiToken: string): SketchfabDownloadInfo {
  const metadata = fetchSketchfabDownloadMetadata(uid, apiToken);
  const glbUrl = metadata.glb?.url;
  const gltfUrl = metadata.gltf?.url;
  const name = process.env.SKETCHFAB_MODEL_NAME?.trim() || "Mermaid2";
  const license = process.env.SKETCHFAB_MODEL_LICENSE?.trim() || "CC0 Public Domain";

  if (glbUrl) {
    const target = "assets/external/sketchfab-cc0/model.glb";
    const bytes = downloadFile(glbUrl, resolve(projectDir, target));
    return { uid, name, license, assetPath: target, format: "glb", downloadedBytes: bytes };
  }

  if (!gltfUrl) {
    throw new Error("Sketchfab download metadata did not include a glb or gltf download URL.");
  }

  const archivePath = resolve(projectDir, "sketchfab-download.zip");
  const extractDir = resolve(projectDir, "sketchfab-extracted");
  const bytes = downloadFile(gltfUrl, archivePath);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  execFileSync("unzip", ["-q", archivePath, "-d", extractDir], { maxBuffer: 20 * 1024 * 1024 });
  const assetPath = normalizeGltfArchive(projectDir, extractDir, "assets/external/sketchfab-cc0");
  return { uid, name, license, assetPath, format: "gltf", downloadedBytes: bytes };
}

function fetchSketchfabDownloadMetadata(uid: string, apiToken: string): SketchfabDownloadResponse {
  const url = `https://api.sketchfab.com/v3/models/${uid}/download`;
  for (const scheme of ["Token", "Bearer"]) {
    const response = curlText(url, [`Authorization: ${scheme} ${apiToken}`]);
    if (response.status >= 200 && response.status < 300) {
      return JSON.parse(response.body) as SketchfabDownloadResponse;
    }
    if (response.status !== 401 && response.status !== 403) {
      throw new Error(`Sketchfab download metadata returned HTTP ${response.status}.`);
    }
  }
  throw new Error("Sketchfab download metadata rejected the supplied token.");
}

function curlText(url: string, headers: readonly string[]): { readonly body: string; readonly status: number } {
  const marker = "\n__AURA3D_HTTP_STATUS__:";
  const output = execFileSync("curl", [
    "-L",
    "--silent",
    "--show-error",
    "--max-time",
    "90",
    ...headers.flatMap((header) => ["-H", header]),
    "--write-out",
    `${marker}%{http_code}`,
    url
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error("curl response did not include an HTTP status marker.");
  const body = output.slice(0, markerIndex);
  const status = Number(output.slice(markerIndex + marker.length).trim());
  return { body, status };
}

function downloadFile(url: string, target: string): number {
  mkdirSync(dirname(target), { recursive: true });
  execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "180", "--output", target, url], {
    maxBuffer: 20 * 1024 * 1024
  });
  return statSync(target).size;
}

async function runSketchfabRenderSmoke(projectDir: string): Promise<RenderSmokeResult> {
  const port = 4797;
  const url = `http://127.0.0.1:${port}`;
  const screenshotPath = "tests/reports/sketchfab-asset-corpus-render.png";
  writeRenderApp(projectDir);
  execFileSync(resolve("node_modules/.bin/vite"), ["build"], {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024
  });

  const server = spawn(resolve("node_modules/.bin/vite"), ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForServer(url, server);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        await page.waitForSelector("canvas", { timeout: 30_000 });
      } catch (error) {
        consoleErrors.push(error instanceof Error ? error.message : String(error));
        return {
          pass: false,
          url,
          ready: false,
          backend: null,
          drawCalls: null,
          screenshotPath,
          screenshotBytes: 0,
          profile: { litPixels: 0, uniqueBuckets: 0, centerObjectPixels: 0 },
          consoleErrors
        };
      }
      const ready = await page.locator("body").getAttribute("data-aura3d-ready", { timeout: 30_000 }).then((value) => value === "true").catch(() => false);
      const diagnosticsText = await page.getByText(/backend:|draw calls:/).allTextContents().catch(() => []);
      const canvas = page.locator("canvas").first();
      const profile = await canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement;
        const gl = target.getContext("webgl2", { preserveDrawingBuffer: true }) ?? target.getContext("webgl", { preserveDrawingBuffer: true });
        if (!gl) return { litPixels: 0, uniqueBuckets: 0, centerObjectPixels: 0 };
        const pixels = new Uint8Array(target.width * target.height * 4);
        gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const buckets = new Set<string>();
        let litPixels = 0;
        let centerObjectPixels = 0;
        for (let y = 0; y < target.height; y += 4) {
          for (let x = 0; x < target.width; x += 4) {
            const offset = (y * target.width + x) * 4;
            const r = pixels[offset] ?? 0;
            const g = pixels[offset + 1] ?? 0;
            const b = pixels[offset + 2] ?? 0;
            const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
            if (luminance > 35) {
              litPixels += 1;
              buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
              if (x > target.width * 0.25 && x < target.width * 0.75 && y > target.height * 0.2 && y < target.height * 0.8) {
                centerObjectPixels += 1;
              }
            }
          }
        }
        return { litPixels, uniqueBuckets: buckets.size, centerObjectPixels };
      });
      const screenshot = await page.screenshot({ fullPage: false });
      writeFileSync(resolve(screenshotPath), screenshot);
      const backend = parseDiagnostics(diagnosticsText, "backend");
      const drawCalls = Number(parseDiagnostics(diagnosticsText, "draw calls")) || null;
      return {
        pass: ready && profile.litPixels > 2_000 && profile.centerObjectPixels > 400 && profile.uniqueBuckets > 16 && consoleErrors.length === 0,
        url,
        ready,
        backend,
        drawCalls,
        screenshotPath,
        screenshotBytes: screenshot.byteLength,
        profile,
        consoleErrors
      };
    } finally {
      await browser.close();
    }
  } finally {
    stopServer(server);
  }
}

function writeRenderApp(projectDir: string): void {
  const engineLink = resolve(projectDir, "node_modules/@aura3d/engine");
  mkdirSync(dirname(engineLink), { recursive: true });
  symlinkSync(process.cwd(), engineLink, "dir");
  writeFileSync(resolve(projectDir, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura3D Sketchfab Asset Smoke</title>
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; background: #080d15; }
      body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);
  writeFileSync(resolve(projectDir, "src/main.ts"), `import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.sketchfabCc0, label: "Sketchfab CC0 asset" },
  style: "studio asset inspection",
  environment: "charcoal sweep, plinth, softbox reflection cards",
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  effects: ["bloom"],
  interaction: "orbit",
  acceptanceCriteria: [
    "downloaded Sketchfab asset is visible",
    "asset is centered and lit",
    "canvas reports asset readiness"
  ]
} as const);

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: promptPlanToScene(plan)
});
`);
}

async function waitForServer(url: string, server: ChildProcess): Promise<void> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < 30_000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite server exited early with code ${server.exitCode}: ${await collectProcessOutput(server)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Vite server did not become ready at ${url}: ${lastError}`);
}

function stopServer(server: ChildProcess): void {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
}

async function collectProcessOutput(server: ChildProcess): Promise<string> {
  const chunks: string[] = [];
  server.stdout?.on("data", (chunk) => chunks.push(String(chunk)));
  server.stderr?.on("data", (chunk) => chunks.push(String(chunk)));
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  return chunks.join("\n").slice(-2000);
}

function parseDiagnostics(textParts: readonly string[], key: string): string | null {
  const text = textParts.join("\n");
  const match = new RegExp(`${key}:\\s*([^\\n]+)`, "i").exec(text);
  return match?.[1]?.trim() ?? null;
}

function normalizeGltfArchive(projectDir: string, sourceDir: string, targetDir: string): string {
  const gltfFile = listFiles(sourceDir)
    .filter((file) => file.toLowerCase().endsWith(".gltf"))
    .sort((a, b) => scoreGltfName(a) - scoreGltfName(b))[0];
  if (!gltfFile) throw new Error("Sketchfab glTF archive did not contain a .gltf file.");

  const sourceJson = JSON.parse(readFileSync(gltfFile, "utf8")) as {
    readonly buffers?: readonly { readonly uri?: string }[];
    readonly images?: readonly { readonly uri?: string }[];
  };

  for (const uri of referencedUris(sourceJson)) {
    const decoded = decodeURIComponent(uri);
    const source = resolve(dirname(gltfFile), decoded);
    const target = resolve(projectDir, targetDir, decoded);
    if (!source.startsWith(sourceDir) || !existsSync(source)) {
      throw new Error(`Sketchfab glTF referenced file missing: ${uri}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }

  const normalizedPath = `${targetDir}/scene.gltf`;
  mkdirSync(resolve(projectDir, targetDir), { recursive: true });
  writeFileSync(resolve(projectDir, normalizedPath), JSON.stringify(sourceJson, null, 2));
  return normalizedPath;
}

function referencedUris(gltf: {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string }[];
}): string[] {
  return [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => Boolean(uri))
    .filter((uri) => !uri.startsWith("data:") && !/^[a-z]+:\/\//i.test(uri) && !uri.startsWith("/"));
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function scoreGltfName(path: string): number {
  const name = basename(path).toLowerCase();
  if (name === "scene.gltf") return 0;
  if (name === "model.gltf") return 1;
  return 2;
}

function writeSketchfabMarkdown(download: SketchfabDownloadInfo | undefined, currentChecks: readonly ReleaseCheck[]): void {
  const lines = [
    "# Sketchfab Asset Corpus Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This document records authenticated Sketchfab CC0 asset evidence for the",
    "`UnifiedPRD.md` bring-your-own-assets claim. Downloaded model files",
    "live only under ignored `tests/reports/` workspace paths and are not",
    "committed.",
    "",
    "## Summary",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...currentChecks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    "",
    "## Source And License",
    "",
    ...(download
      ? [
          `- Source: Sketchfab API model \`${download.name}\` (\`${download.uid}\`).`,
          `- License: ${download.license}.`,
          `- Imported asset path: \`${download.assetPath}\`.`,
          `- Format tested: ${download.format}.`,
          "- Browser render proof: `tests/reports/sketchfab-asset-corpus-render.png` is generated locally and `tests/reports/sketchfab-asset-corpus.json` records readiness, backend, draw calls, and screenshot pixel profile.",
          `- Local workspace: \`${relative(process.cwd(), workspace)}\`.`
        ]
      : ["- Not run because `SKETCHFAB_API_TOKEN` was not supplied."]),
    "",
    "## Verdict",
    "",
    download && currentChecks.every((check) => check.pass)
      ? "Authenticated Sketchfab CC0 download, asset add, validation, typegen, build, and browser render pass."
      : "Authenticated Sketchfab CC0 corpus proof is not complete.",
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("tests/reports/sketchfab-asset-corpus-results.md", `${lines.join("\n")}\n`);
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
