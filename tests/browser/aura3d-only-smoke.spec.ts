import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Aura3D-only production-build smoke: builds each listed showcase app the way the marketing site does (root vite config
 * aliases, one Rollup input per app), serves the build (dist, then the app's public dir, then the root public dir) on a
 * local origin and records whether it boots, renders a non-blank canvas, reports draw calls, and whether the built JS
 * carries three.js marker strings. Apps come from tests/browser/aura3d-only-apps.txt (one per line, default: all below).
 * Results are printed as A3O_JSON lines. Remote only (tools/remote-acr/run.sh with EXTRA_DIRS for the apps).
 */
const APPS_FILE = "tests/browser/aura3d-only-apps.txt";
const DEFAULT_APPS = [
  "showcase-bank-shot", "showcase-aurora-lander", "showcase-blockfall-reactor", "showcase-bean-brawl-race",
  "showcase-kart-havoc", "showcase-turbo-ball", "showcase-vault-breakers", "showcase-product-configurator",
  "showcase-smart-city-control", "showcase-cinematic-architecture", "showcase-digital-twin-ops",
  "showcase-data-galaxy", "showcase-webgpu-particle-lab", "showcase-asset-audition",
  "showcase-material-asset-inspector", "aura-clash-showcase", "showcase-bunker-zero", "showcase-ninja-runner-port"
];
const APPS = (existsSync(APPS_FILE) ? readFileSync(APPS_FILE, "utf8").split(/\s+/).filter(Boolean) : DEFAULT_APPS);
const BUILD_TIMEOUT_MS = 1_200_000;
const BOOT_WAIT_MS = 12_000;
const THREE_STRONG = /__THREE__|\bisWebGLRenderer\b|\bisBufferGeometry\b|\bisMeshStandardMaterial\b|\bisObject3D\b|\bTHREE\.[A-Z]/g;
const THREE_WEAK = /WebGLRenderer|MeshStandardMaterial|GLTFLoader|three\/examples/g;

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".hdr": "application/octet-stream", ".ktx2": "application/octet-stream",
  ".woff": "font/woff", ".woff2": "font/woff2", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".webm": "video/webm",
  ".m4a": "audio/mp4", ".txt": "text/plain", ".bin": "application/octet-stream", ".ttf": "font/ttf"
};

function writeBuildConfig(app: string, outDir: string, _dir: string): string {
  const repoRoot = process.cwd();
  const configPath = join(repoRoot, `.a3o-${app}.vite.config.ts`);
  writeFileSync(configPath, `import rootConfig from "./vite.config";
export default {
  root: ${JSON.stringify(repoRoot)},
  publicDir: false,
  base: "/",
  resolve: { alias: (rootConfig as { resolve: { alias: unknown } }).resolve.alias, dedupe: ["@aura3d/engine"] },
  build: {
    target: "es2022",
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { app: ${JSON.stringify(join(repoRoot, "apps", app, "index.html"))} } }
  }
};
`);
  return configPath;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function startStaticServer(layers: string[], app: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      const relative = normalize(url).replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
      const candidates = [relative];
      if (relative === "" || relative.endsWith("/")) candidates.push(`${relative}index.html`);
      if (relative.startsWith(`apps/${app}/`)) candidates.push(relative.slice(`apps/${app}/`.length));
      for (const layer of layers) {
        for (const candidate of candidates) {
          const file = resolve(layer, candidate);
          if (!file.startsWith(resolve(layer))) continue;
          if (existsSync(file) && statSync(file).isFile()) {
            res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "access-control-allow-origin": "*" });
            createReadStream(file).pipe(res);
            return;
          }
        }
      }
      res.writeHead(404); res.end("not found");
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function pixelStats(page: Page, png: Buffer): Promise<{ nonBlackFraction: number; distinctColors: number; meanLuma: number }> {
  return page.evaluate(async (b64: string) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data; const n = d.length / 4;
    let nonBlack = 0; let sum = 0; const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (l > 8) nonBlack++; sum += l; seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
    }
    return { nonBlackFraction: nonBlack / n, distinctColors: seen.size, meanLuma: sum / n };
  }, png.toString("base64"));
}

for (const app of APPS) {
  test(`aura3d-only build smoke: ${app}`, async ({ browser }) => {
    test.setTimeout(BUILD_TIMEOUT_MS + 300_000);
    const repoRoot = process.cwd();
    const appDir = join(repoRoot, "apps", app);
    const result: Record<string, unknown> = { app, built: false };
    try {
      if (!existsSync(join(appDir, "index.html"))) {
        result.error = "no index.html";
        console.log(`A3O_JSON ${JSON.stringify(result)}`);
        return;
      }
      const work = mkdtempSync(join(tmpdir(), `a3o-${app}-`));
      const outDir = join(work, "dist");
      const configPath = writeBuildConfig(app, outDir, work);
      const started = Date.now();
      try {
        execFileSync(join(repoRoot, "node_modules", ".bin", "vite"), ["build", "--config", configPath], {
          cwd: repoRoot, stdio: "pipe", timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=6144" }
        });
        result.built = true;
        result.buildSeconds = Math.round((Date.now() - started) / 1000);
        rmSync(configPath, { force: true });
      } catch (error) {
        rmSync(configPath, { force: true });
        const e = error as { stderr?: Buffer; stdout?: Buffer; message?: string };
        result.buildError = String(e.stderr ?? e.stdout ?? e.message ?? error).slice(-1500);
        console.log(`A3O_JSON ${JSON.stringify(result)}`);
        return;
      }
      const jsFiles = walk(outDir).filter((f) => /\.(m?js)$/.test(f));
      let strong = 0; let weak = 0; const weakContexts = new Set<string>();
      for (const f of jsFiles) {
        const text = readFileSync(f, "utf8");
        strong += [...text.matchAll(THREE_STRONG)].length;
        for (const m of text.matchAll(THREE_WEAK)) {
          weak++;
          if (weakContexts.size < 4) weakContexts.add(text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 40).replace(/\s+/g, " "));
        }
      }
      result.jsFiles = jsFiles.length;
      result.threeStrongMarkers = strong;
      result.threeWeakMarkers = weak;
      result.threeWeakContexts = [...weakContexts];
      const { server, origin } = await startStaticServer([outDir, join(appDir, "public"), join(repoRoot, "public")], app);
      const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const page = await context.newPage();
      const consoleErrors: string[] = []; const pageErrors: string[] = []; const failed: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 240)); });
      page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 240)));
      page.on("requestfailed", (r) => failed.push(`${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 160)}`); });
      try {
        await page.goto(`${origin}/apps/${app}/`, { waitUntil: "load", timeout: 120_000 });
        await page.waitForTimeout(BOOT_WAIT_MS);
        await page.addStyleTag({ content: "body *:not(canvas):not(html):not(body){visibility:hidden !important} canvas{visibility:visible !important}" }).catch(() => undefined);
        result.drawCalls = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          const seen = new WeakSet<object>();
          const find = (value: unknown, depth: number): number | null => {
            if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return null;
            seen.add(value);
            const o = value as Record<string, unknown>;
            if (typeof o.drawCalls === "number") return o.drawCalls;
            for (const key of Object.keys(o)) { const r = find(o[key], depth + 1); if (r !== null) return r; }
            return null;
          };
          for (const key of Object.keys(w)) {
            if (!/^__.*__$|evidence/i.test(key) || /ERROR|PORT_MODULES/.test(key)) continue;
            let value = w[key];
            try { if (typeof value === "function") value = (value as () => unknown)(); } catch { continue; }
            const r = find(value, 0); if (r !== null) return r;
          }
          return null;
        }).catch(() => null);
        let png: Buffer;
        try { png = await page.screenshot({ type: "png", timeout: 150_000 }); } catch {
          await page.setViewportSize({ width: 480, height: 270 });
          await page.waitForTimeout(3_000);
          png = await page.screenshot({ type: "png", timeout: 240_000 });
          result.smallViewportRetry = true;
        }
        result.pixels = await pixelStats(page, png);
        result.canvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
      } catch (error) {
        result.pageError = String((error as Error).message).slice(0, 300);
      }
      result.consoleErrors = consoleErrors.slice(0, 6);
      result.pageErrors = pageErrors.slice(0, 6);
      result.failedRequests = failed.slice(0, 8);
      await context.close();
      server.close();
    } finally {
      console.log(`A3O_JSON ${JSON.stringify(result)}`);
    }
    expect(true).toBe(true);
  });
}
