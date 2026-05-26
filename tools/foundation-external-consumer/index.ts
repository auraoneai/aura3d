import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = process.cwd();
const packageSmokePath = resolve("tests/reports/foundation-package-smoke.json");
const packageSmoke = existsSync(packageSmokePath)
  ? JSON.parse(readFileSync(packageSmokePath, "utf8")) as { readonly tarballPath?: string; readonly tarballSha256?: string }
  : {};
const tarballPath = resolve(packageSmoke.tarballPath ?? "tests/reports/package-install-smoke-fresh/aura3d-engine-0.1.0-alpha.0.tgz");
const tempProject = mkdtempSync(join(tmpdir(), "a3d-hr3-consumer-"));
const screenshotPath = resolve("tests/reports/foundation-external-consumer/external-consumer.png");
const reportPath = resolve("tests/reports/foundation-external-consumer.json");
const packageName = readRootPackageName();
const assetDataUri = dataUri("model/gltf+json", readFileSync(resolve("fixtures/workflow-assets/assets/product-camera/product-camera.gltf")));
const productGltfDataUri = dataUri("model/gltf+json", readFileSync(resolve("fixtures/product-studio/products/watch/watch.gltf")));
const productManifestDataUri = dataUri("application/json", readFileSync(resolve("fixtures/product-studio/products/watch/manifest.json")));
const violations: string[] = [];
let state: ExternalConsumerState | undefined;
let installStdout = "";

try {
  if (!existsSync(tarballPath)) {
    violations.push(`Missing tarball: ${tarballPath}`);
  }
  writeConsumerProject();
  if (violations.length === 0) {
    try {
      installStdout = execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], {
        cwd: tempProject,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (error) {
      violations.push(`npm install failed: ${formatExecError(error)}`);
    }
  }

  if (violations.length === 0) {
    const vite = await createServer({
      root: tempProject,
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false
      }
    });
    await vite.listen();
    try {
      const address = vite.httpServer?.address();
      if (!address || typeof address === "string") {
        violations.push("Vite did not expose a TCP address.");
      } else {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
          await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => (window as any).__A3D_EXTERNAL_CONSUMER__?.status === "ready", undefined, { timeout: 45_000 });
          state = await page.evaluate(() => (window as any).__A3D_EXTERNAL_CONSUMER__);
          mkdirSync(dirname(screenshotPath), { recursive: true });
          await page.locator("[data-testid='external-consumer-canvas']").screenshot({ path: screenshotPath });
        } finally {
          await browser.close();
        }
      }
    } finally {
      await vite.close();
    }
  }
} finally {
  rmSync(tempProject, { recursive: true, force: true });
}

const screenshotExists = existsSync(screenshotPath);
const screenshotBytes = screenshotExists ? statSync(screenshotPath).size : 0;
const requiredImports = [
  packageName,
  `${packageName}/rendering`,
  `${packageName}/assets`,
  `${packageName}/product-studio`,
  `${packageName}/workflows`
];
const report = {
  schema: "a3d-foundation-external-consumer",
  generatedAt: new Date().toISOString(),
  pass: violations.length === 0
    && state?.status === "ready"
    && requiredImports.every((entrypoint) => state?.imports.includes(entrypoint))
    && (state?.drawCalls ?? 0) > 0
    && (state?.assetMeshCount ?? 0) > 0
    && (state?.productPartCount ?? 0) > 0
    && state?.lastError === null
    && screenshotBytes > 10_000,
  tempProjectKind: "external-vite-browser-app",
  packageName,
  tarballPath: relativeRoot(tarballPath),
  tarballSha256: packageSmoke.tarballSha256 ?? (existsSync(tarballPath) ? createHash("sha256").update(readFileSync(tarballPath)).digest("hex") : null),
  installStdoutTail: installStdout.split("\n").slice(-12).join("\n"),
  requiredImports,
  state,
  screenshot: {
    path: relativeRoot(screenshotPath),
    exists: screenshotExists,
    bytes: screenshotBytes
  },
  violations
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function writeConsumerProject(): void {
  mkdirSync(join(tempProject, "src"), { recursive: true });
  writeFileSync(join(tempProject, "package.json"), `${JSON.stringify({
    name: "a3d-foundation-external-consumer",
    version: "0.0.0",
    private: true,
    type: "module"
  }, null, 2)}\n`);
  writeFileSync(join(tempProject, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>A3D External Consumer</title></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>\n`);
  writeFileSync(join(tempProject, "src", "main.js"), consumerSource());
}

function consumerSource(): string {
  return `
import { Engine } from ${JSON.stringify(packageName)};
import { Renderer } from ${JSON.stringify(`${packageName}/rendering`)};
import { loadRenderableAsset } from ${JSON.stringify(`${packageName}/assets`)};
import { loadProductAsset } from ${JSON.stringify(`${packageName}/product-studio`)};
import { createAssetViewerWorkflow, createProductConfiguratorWorkflow } from ${JSON.stringify(`${packageName}/workflows`)};

const imports = [
  ${JSON.stringify(packageName)},
  ${JSON.stringify(`${packageName}/rendering`)},
  ${JSON.stringify(`${packageName}/assets`)},
  ${JSON.stringify(`${packageName}/product-studio`)},
  ${JSON.stringify(`${packageName}/workflows`)}
];
const root = document.getElementById("app");
const canvas = document.createElement("canvas");
canvas.dataset.testid = "external-consumer-canvas";
canvas.style.width = "100vw";
canvas.style.height = "100vh";
document.body.style.margin = "0";
document.body.style.background = "#111413";
root.replaceChildren(canvas);

const expose = (state) => {
  globalThis.__A3D_EXTERNAL_CONSUMER__ = state;
};
expose({ status: "loading", imports, lastError: null });

try {
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: 1180,
    height: 820,
    clearColor: [0.025, 0.028, 0.032, 1],
    preserveDrawingBuffer: true
  });
  const asset = await loadRenderableAsset(${JSON.stringify(assetDataUri)});
  const assetWorkflow = await createAssetViewerWorkflow({
    url: ${JSON.stringify(assetDataUri)},
    camera: "auto-frame",
    lighting: "studioProduct",
    shadows: true,
    postprocess: "product-default"
  });
  const product = await loadProductAsset({
    id: "watch",
    url: ${JSON.stringify(productGltfDataUri)},
    manifestUrl: ${JSON.stringify(productManifestDataUri)}
  });
  const productWorkflow = await createProductConfiguratorWorkflow({
    asset: {
      id: "watch",
      url: ${JSON.stringify(productGltfDataUri)},
      manifestUrl: ${JSON.stringify(productManifestDataUri)}
    },
    materialMode: "contrast",
    lighting: "hero-contrast",
    camera: "front-three-quarter"
  });
  renderer.resizeToDisplay({ devicePixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2) });
  const diagnostics = renderer.render(assetWorkflow.source, assetWorkflow.camera);
  expose({
    status: "ready",
    engineType: typeof Engine,
    imports,
    workflowKind: assetWorkflow.kind,
    productWorkflowKind: productWorkflow.kind,
    drawCalls: diagnostics.drawCalls,
    lastError: diagnostics.lastError,
    assetMeshCount: asset.gltf?.loaderDiagnostics?.meshCount ?? 0,
    productPartCount: product.parts.length,
    productMaterialCount: product.materials.length
  });
  product.resources.dispose();
  productWorkflow.dispose();
  assetWorkflow.dispose();
} catch (error) {
  expose({ status: "error", imports, lastError: error instanceof Error ? error.message : String(error) });
}
`;
}

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}

function readRootPackageName(): string {
  const parsed = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { readonly name?: string };
  return parsed.name ?? "@aura3d/engine";
}

function relativeRoot(path: string): string {
  return path.replace(`${root}/`, "");
}

function formatExecError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const record = error as { readonly message?: unknown; readonly stdout?: unknown; readonly stderr?: unknown };
  return [
    typeof record.message === "string" ? record.message : undefined,
    typeof record.stdout === "string" && record.stdout.trim().length > 0 ? `stdout: ${record.stdout.trim()}` : undefined,
    typeof record.stderr === "string" && record.stderr.trim().length > 0 ? `stderr: ${record.stderr.trim()}` : undefined
  ].filter(Boolean).join(" ");
}

interface ExternalConsumerState {
  readonly status: string;
  readonly imports: readonly string[];
  readonly workflowKind?: string;
  readonly productWorkflowKind?: string;
  readonly drawCalls?: number;
  readonly lastError: string | null;
  readonly assetMeshCount?: number;
  readonly productPartCount?: number;
  readonly productMaterialCount?: number;
}
