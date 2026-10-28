// `aura3d check-deploy --browser`: load the built site in a headless browser and fail on what a visitor would hit.
// The static check (hashed assets, unreferenced files, licence gates) lives in index.ts `checkDeploy`; this adds a runtime pass:
// every route is opened from a local static server over `dist`, and any HTTP error, failed request, uncaught exception or
// console error fails the check. Playwright is an optional peer: it is resolved from the project being checked.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

export interface BrowserRouteReport {
  readonly route: string;
  readonly status: number | null;
  readonly consoleErrors: readonly string[];
  readonly consoleWarnings: readonly string[];
  readonly pageErrors: readonly string[];
  readonly failedRequests: readonly string[];
  readonly badResponses: readonly string[];
  /** `data-aura3d-error` on <body> when the app reported a boot failure. */
  readonly appError?: string;
}

export interface BrowserDriver {
  /** Open `url`, wait for the page to settle, and report what the browser saw. */
  visit(url: string, route: string, options: { readonly timeoutMs: number; readonly settleMs: number }): Promise<BrowserRouteReport>;
  close(): Promise<void>;
}

export interface BrowserDeployCheckOptions {
  readonly distDir: string;
  /** Routes to open, relative to the site root. Defaults to `/`. */
  readonly routes?: readonly string[];
  /** Where Playwright is resolved from. Defaults to the folder that contains `distDir`. */
  readonly projectDir?: string;
  readonly timeoutMs?: number;
  readonly settleMs?: number;
  /** Test seam: replaces the Playwright-backed driver. */
  readonly driver?: BrowserDriver;
}

export interface BrowserDeployCheckResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly routes: readonly BrowserRouteReport[];
}

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".hdr": "application/octet-stream",
  ".ktx2": "image/ktx2", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".webm": "video/webm", ".mp4": "video/mp4"
};

/** Static file server over `dist` that behaves like a plain static host: no SPA fallback, so a missing file is a real 404. */
export function startStaticServer(distDir: string): Promise<{ readonly server: Server; readonly origin: string }> {
  const root = resolve(distDir);
  return new Promise((resolvePromise, reject) => {
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const relative = normalize(pathname).replace(/^([/\\])+/, "");
      const candidates = [join(root, relative), join(root, relative, "index.html"), join(root, `${relative}.html`)];
      const file = candidates.find((candidate) => (candidate === root || candidate.startsWith(root + sep)) && existsSync(candidate) && statSync(candidate).isFile());
      if (!file) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
        return;
      }
      const body = readFileSync(file);
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "content-length": body.length, "cache-control": "no-store" });
      response.end(body);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolvePromise({ server, origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
    });
  });
}

const PLAYWRIGHT_MODULES = ["playwright", "@playwright/test", "playwright-core"] as const;

interface ChromiumLike {
  launch(options: { headless: boolean; args: string[] }): Promise<{
    newContext(options?: Record<string, unknown>): Promise<{ newPage(): Promise<PageLike>; close(): Promise<void> }>;
    close(): Promise<void>;
  }>;
}

interface PageLike {
  on(event: string, handler: (value: never) => void): void;
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<{ status(): number } | null>;
  waitForLoadState(state: string, options: { timeout: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
}

export function loadChromium(projectDir: string, moduleNames: readonly string[] = PLAYWRIGHT_MODULES): ChromiumLike {
  const projectRequire = createRequire(join(resolve(projectDir), "package.json"));
  for (const name of moduleNames) {
    try {
      const loaded = projectRequire(name) as { chromium?: ChromiumLike };
      if (loaded.chromium) return loaded.chromium;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    "check-deploy --browser needs Playwright in the project being checked. Install it with `npm i -D playwright` and `npx playwright install chromium`, or leave out --browser for the static check."
  );
}

/** Driver backed by Playwright's Chromium. Software WebGL flags let headless runs without a GPU boot Aura3D apps. */
export function createPlaywrightDriver(projectDir: string): BrowserDriver {
  const chromium = loadChromium(projectDir);
  let browserPromise: ReturnType<ChromiumLike["launch"]> | undefined;
  const browser = () => (browserPromise ??= chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }));
  return {
    async visit(url, route, { timeoutMs, settleMs }) {
      const context = await (await browser()).newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      const badResponses: string[] = [];
      page.on("console", ((message: { type(): string; text(): string }) => {
        const text = message.text().slice(0, 300);
        if (message.type() === "error") consoleErrors.push(text);
        else if (message.type() === "warning") consoleWarnings.push(text);
      }) as never);
      page.on("pageerror", ((error: { message?: string }) => pageErrors.push(String(error.message ?? error).slice(0, 300))) as never);
      page.on("requestfailed", ((request: { url(): string; failure(): { errorText: string } | null }) => failedRequests.push(`${new URL(request.url()).pathname} (${request.failure()?.errorText ?? "failed"})`)) as never);
      page.on("response", ((response: { url(): string; status(): number }) => {
        if (response.status() >= 400) badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }) as never);
      try {
        const response = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
        await page.waitForTimeout(settleMs);
        const appError = await page.evaluate(() => document.body?.dataset?.aura3dError ?? "");
        return {
          route,
          status: response ? response.status() : null,
          consoleErrors,
          consoleWarnings,
          pageErrors,
          failedRequests,
          badResponses,
          ...(appError ? { appError } : {})
        };
      } finally {
        await context.close();
      }
    },
    async close() {
      if (browserPromise) await (await browserPromise).close();
    }
  };
}

/** A missing favicon is reported, but is not worth failing a deploy on. */
const WARN_ONLY_PATHS = /^404 \/(favicon\.ico|apple-touch-icon[^/]*\.png)$/;

export function evaluateRouteReport(report: BrowserRouteReport): { readonly failures: string[]; readonly warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const at = `Route ${report.route}`;
  if (report.status === null || report.status >= 400) failures.push(`${at} answered ${report.status ?? "no response"}.`);
  for (const response of report.badResponses) (WARN_ONLY_PATHS.test(response) ? warnings : failures).push(`${at} request failed with HTTP ${response}.`);
  for (const request of report.failedRequests) failures.push(`${at} request did not complete: ${request}.`);
  for (const error of report.pageErrors) failures.push(`${at} threw an uncaught error: ${error}`);
  for (const message of report.consoleErrors) {
    // The browser echoes "Failed to load resource" for every bad response; those are already reported with their path above.
    if (/^Failed to load resource/i.test(message) && (report.badResponses.length > 0 || report.failedRequests.length > 0)) continue;
    failures.push(`${at} logged a console error: ${message}`);
  }
  if (report.appError) failures.push(`${at} reported an app boot error (data-aura3d-error): ${report.appError}`);
  for (const message of report.consoleWarnings) warnings.push(`${at} logged a console warning: ${message}`);
  return { failures, warnings };
}

export async function runBrowserDeployCheck(options: BrowserDeployCheckOptions): Promise<BrowserDeployCheckResult> {
  const distDir = resolve(options.distDir);
  if (!existsSync(join(distDir, "index.html")) && !(options.routes ?? []).length) {
    return { ok: false, failures: [`Browser check found no index.html in ${distDir}. Run your build first.`], warnings: [], routes: [] };
  }
  const projectDir = resolve(options.projectDir ?? join(distDir, ".."));
  const driver = options.driver ?? createPlaywrightDriver(projectDir);
  const { server, origin } = await startStaticServer(distDir);
  const routes = (options.routes?.length ? options.routes : ["/"]).map((route) => (route.startsWith("/") ? route : `/${route}`));
  const failures: string[] = [];
  const warnings: string[] = [];
  const reports: BrowserRouteReport[] = [];
  try {
    for (const route of routes) {
      try {
        const report = await driver.visit(`${origin}${route}`, route, { timeoutMs: options.timeoutMs ?? 30_000, settleMs: options.settleMs ?? 2_000 });
        reports.push(report);
        const verdict = evaluateRouteReport(report);
        failures.push(...verdict.failures);
        warnings.push(...verdict.warnings);
      } catch (error) {
        failures.push(`Route ${route} could not be opened: ${String((error as Error).message ?? error).split("\n")[0]}`);
      }
    }
  } finally {
    await driver.close().catch(() => undefined);
    await new Promise<void>((done) => server.close(() => done()));
  }
  return { ok: failures.length === 0, failures, warnings, routes: reports };
}
