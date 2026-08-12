import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { expect, test } from "@playwright/test";

interface StaticPreviewServer {
  readonly origin: string;
  close(): Promise<void>;
}

interface PreviewManifest {
  readonly status: string;
  readonly previews: readonly {
    readonly id: string;
    readonly target: string;
    readonly sha256: string;
  }[];
}

const manifest = JSON.parse(readFileSync(
  resolve("marketing/public/previews/final-preview-manifest.json"),
  "utf8"
)) as PreviewManifest;

const showcaseRoutes = [
  "/apps/showcase-product-configurator/",
  "/apps/showcase-smart-city-control/",
  "/apps/showcase-cinematic-architecture/",
  "/apps/showcase-digital-twin-ops/",
  "/apps/showcase-blockfall-reactor/",
  "/showcase/aura-clash/playable/",
  "/apps/showcase-turbo-drift-circuit/",
  "/apps/showcase-skyline-runner/"
] as const;

test.describe("built marketing preview", () => {
  test.setTimeout(120_000);
  let server: StaticPreviewServer;

  test.beforeAll(async () => {
    server = await startStaticPreviewServer(resolve("marketing/dist"));
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("serves the real mobile hero without console or network failures", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    const badResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`${message.text()} @ ${message.location().url || "unknown"}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
    page.on("response", (response) => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
      } catch (_error) {
        // The WebGL2 replacement is the required path even if this property is immutable.
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/index.html`, { waitUntil: "networkidle" });
    const hero = page.locator(".hero-right iframe[data-route='/apps/wow-concept-car-cinema/']");
    const heroHandle = await hero.elementHandle();
    const frame = await heroHandle?.contentFrame();
    expect(frame).toBeTruthy();
    await expect.poll(() => frame?.evaluate(() => {
      const runtime = (window as unknown as {
        __a3dWowRuntime?: { status?: string; drawCalls?: number; frameCount?: number; textures?: number };
      }).__a3dWowRuntime;
      return Boolean(runtime && ["ready", "running"].includes(runtime.status ?? "")
        && (runtime.drawCalls ?? 0) > 0 && (runtime.frameCount ?? 0) >= 3 && (runtime.textures ?? 0) > 0);
    }), { timeout: 90_000 }).toBe(true);
    expect(badResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestFailures).toEqual([]);
  });

  test("serves every reviewed poster and public card route from production output", async ({ request }) => {
    expect(manifest.status).toBe("machine-reviewed-human-approval-pending");
    expect(manifest.previews).toHaveLength(8);
    for (const preview of manifest.previews) {
      const publicPath = preview.target.replace(/^marketing\/public/, "");
      const response = await request.get(`${server.origin}${publicPath}`);
      expect(response.status(), `${preview.id} preview response`).toBe(200);
      const bytes = await response.body();
      expect(createHash("sha256").update(bytes).digest("hex"), `${preview.id} preview hash`).toBe(preview.sha256);
    }
    for (const route of showcaseRoutes) {
      const response = await request.get(`${server.origin}${route}`);
      expect(response.status(), `${route} response`).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/html");
      expect((await response.text()).length, `${route} HTML`).toBeGreaterThan(500);
    }
  });

  test("opens a showcase card through its keyboard interaction", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    const badResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`${message.text()} @ ${message.location().url || "unknown"}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      // The homepage hero iframe is intentionally torn down by this same-page
      // navigation. Audit main-frame destination requests here; the separate
      // mobile-hero test above requires every iframe request to finish cleanly.
      if (request.frame() === page.mainFrame() && request.url().startsWith(server.origin)) {
        requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`);
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/index.html`, { waitUntil: "domcontentloaded" });
    const card = page.locator("[data-link='/apps/showcase-product-configurator/']");
    await card.scrollIntoViewIfNeeded();
    await card.focus();
    await expect(card).toBeFocused();
    await card.press("Enter");
    await page.waitForURL(/\/apps\/showcase-product-configurator\/$/);
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).not.toBeNull();
    const ready = await page.locator("body").getAttribute("data-aura3d-ready");
    if (ready !== "true") {
      const diagnostics = await page.evaluate(() => ({
        bodyText: document.body.innerText.slice(0, 2_000),
        evidence: (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__,
        runtime: (window as unknown as Record<string, unknown>).__AURA3D_RUNTIME__
      }));
      throw new Error(JSON.stringify({ ready, consoleErrors, pageErrors, requestFailures, badResponses, diagnostics }, null, 2));
    }
    expect(badResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestFailures).toEqual([]);
  });
});

async function startStaticPreviewServer(root: string): Promise<StaticPreviewServer> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const relativePath = normalize(pathname).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
    let file = resolve(root, relativePath || "index.html");
    if (!file.startsWith(resolve(root))) {
      response.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": staticContentType(file), "cache-control": "no-store" });
    response.end(readFileSync(file));
  });
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Static preview server did not bind a TCP port.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server)
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}

function staticContentType(file: string): string {
  return ({
    ".css": "text/css; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2"
  } as Record<string, string>)[extname(file)] ?? "application/octet-stream";
}
