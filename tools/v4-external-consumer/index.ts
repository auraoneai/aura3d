import { createServer, type Server } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const root = process.cwd();
const packageSmoke = readJson("tests/reports/v4-package-smoke.json");
const tarballPath = typeof packageSmoke?.tarballPath === "string" && existsSync(packageSmoke.tarballPath)
  ? packageSmoke.tarballPath
  : packFallback();
const reportDir = resolve("tests/reports/v4-external-consumer");
const staticDir = join(reportDir, "static");
const screenshotPath = join(reportDir, "external-consumer.png");
const reportPath = resolve("tests/reports/v4-external-consumer.json");
const tempRoot = mkdtempSync(join(tmpdir(), "g3d-external-consumer-"));

mkdirSync(reportDir, { recursive: true });

try {
  writeFileSync(join(tempRoot, "package.json"), `${JSON.stringify({
    name: "g3d-v4-external-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      build: "vite build"
    },
    dependencies: {
      "@galileo3d/engine": `file:${tarballPath}`
    },
    devDependencies: {
      vite: "^7.3.2",
      typescript: "^5.8.3"
    }
  }, null, 2)}\n`);
  writeFileSync(join(tempRoot, "index.html"), `<canvas id="app" width="960" height="540" data-testid="external-consumer-canvas"></canvas><script type="module" src="/src/main.ts"></script>\n`);
  mkdirSync(join(tempRoot, "src"), { recursive: true });
  const source = externalConsumerSource();
  writeFileSync(join(tempRoot, "src", "main.ts"), source);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], { cwd: tempRoot, stdio: "pipe" });
  execFileSync("npm", ["run", "build", "--silent"], { cwd: tempRoot, stdio: "pipe" });
  rmSync(staticDir, { recursive: true, force: true });
  cpSync(join(tempRoot, "dist"), staticDir, { recursive: true });

  const server = await serve(staticDir);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 980, height: 620 } });
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as typeof window & { __G3D_V4_EXTERNAL_CONSUMER__?: { readonly status?: string } }).__G3D_V4_EXTERNAL_CONSUMER__?.status === "ready", undefined, { timeout: 90_000 });
    await page.locator("[data-testid='external-consumer-canvas']").screenshot({ path: screenshotPath });
    const state = await page.evaluate(() => (window as typeof window & { __G3D_V4_EXTERNAL_CONSUMER__?: {
      readonly status?: string;
      readonly publicApiOnly?: boolean;
      readonly assetKind?: string;
      readonly textureCount?: number;
      readonly drawCalls?: number;
      readonly screenshotPrefix?: string;
    } }).__G3D_V4_EXTERNAL_CONSUMER__);
    const outputFiles = listFiles(staticDir).map((file) => file.slice(staticDir.length + 1).replaceAll("\\", "/"));
    const report = {
      schema: "g3d-v4-external-consumer/v1",
      generatedAt: new Date().toISOString(),
      ok: state?.status === "ready" &&
        state.publicApiOnly === true &&
        state.assetKind === "gltf" &&
        Number(state.textureCount ?? 0) > 0 &&
        Number(state.drawCalls ?? 0) > 0 &&
        typeof state.screenshotPrefix === "string" &&
        state.screenshotPrefix.startsWith("data:image/png") &&
        statSync(screenshotPath).size > 8_000 &&
        !source.includes("/packages/") &&
        !source.includes("@galileo3d/engine/"),
      tarballPath,
      staticDir,
      screenshotPath: screenshotPath.replace(`${root}/`, ""),
      outputFiles,
      sourceImportsOnlyPublicRoot: !source.includes("/packages/") && !source.includes("@galileo3d/engine/"),
      state,
      productBoundary: "External consumer proof runs from a production Vite build and imports only the public root @galileo3d/engine API."
    };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function externalConsumerSource(): string {
  return `
import { captureScreenshot, createAssetDiagnostics, createDiagnosticsPanel, createG3DApp, loadAsset, workflows } from "@galileo3d/engine";

declare global {
  interface Window {
    __G3D_V4_EXTERNAL_CONSUMER__?: unknown;
  }
}

const productUrl = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/BoomBox/glTF-Binary/BoomBox.glb";
const canvas = document.getElementById("app") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Missing external consumer canvas.");

const app = await createG3DApp({ canvas, quality: "production", width: 960, height: 540 });
const asset = await loadAsset(productUrl, { type: "gltf" });
const workflow = await workflows.assetViewer({ url: productUrl, type: "gltf" });
const render = app.renderer?.render(workflow.source, workflow.camera);
const assetDiagnostics = createAssetDiagnostics(asset);
const panel = createDiagnosticsPanel({ render, asset: assetDiagnostics });
const screenshot = captureScreenshot(canvas);

window.__G3D_V4_EXTERNAL_CONSUMER__ = {
  status: "ready",
  publicApiOnly: true,
  workflowKind: workflow.kind,
  assetKind: asset.kind,
  textureCount: assetDiagnostics.textureCount,
  drawCalls: render?.drawCalls ?? 0,
  diagnostics: panel.snapshot(),
  screenshotPrefix: screenshot.dataUrl.slice(0, 32),
  claimBoundary: "External packed-package consumer proof only. Release readiness remains gated separately."
};
`;
}

function readJson(path: string): Record<string, unknown> | undefined {
  return existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Record<string, unknown> : undefined;
}

function packFallback(): string {
  const reportDir = resolve("tests/reports/v4-external-consumer-pack");
  mkdirSync(reportDir, { recursive: true });
  const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", reportDir], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim().split(/\r?\n/).at(-1);
  if (!tarballName) throw new Error("npm pack did not produce a tarball.");
  return join(reportDir, tarballName);
}

function listFiles(dir: string, output: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    const stats = statSync(file);
    if (stats.isDirectory()) listFiles(file, output);
    else output.push(file);
  }
  return output;
}

function serve(rootDir: string): Promise<{ readonly origin: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const candidate = resolve(rootDir, url.pathname === "/" ? "index.html" : `.${url.pathname}`);
    if (!candidate.startsWith(rootDir) || !existsSync(candidate) || !statSync(candidate).isFile()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(candidate) });
    response.end(readFileSync(candidate));
  });
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Static server did not bind."));
        return;
      }
      resolveListen({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
      });
    });
  });
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
