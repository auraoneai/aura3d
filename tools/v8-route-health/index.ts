import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

export const V8_ROUTE_HEALTH_ORIGIN = process.env.G3D_ROUTE_HEALTH_ORIGIN ?? "http://localhost:5180";
export const V8_ROUTE_HEALTH_REPORT = "tests/reports/v8-route-health.json";
export const V8_ROOT_BUDGET_MS = Number(process.env.G3D_ROUTE_HEALTH_ROOT_BUDGET_MS ?? 1_500);
export const V8_ROUTE_BUDGET_MS = Number(process.env.G3D_ROUTE_HEALTH_ROUTE_BUDGET_MS ?? 10_000);
export const V8_FIRST_VISIBLE_BUDGET_MS = Number(process.env.G3D_ROUTE_HEALTH_FIRST_VISIBLE_BUDGET_MS ?? 1_000);

export interface V8RootRouteLink {
  readonly label: string;
  readonly href: string;
  readonly path: string;
  readonly declaredStatus?: string;
}

export interface V8RouteHealthResult {
  readonly label: string;
  readonly href: string;
  readonly path: string;
  readonly status: "ready" | "error" | "loading" | "unknown";
  readonly working: boolean;
  readonly settled: boolean;
  readonly visible: boolean;
  readonly loadTimeMs: number;
  readonly firstVisibleTimeMs: number | null;
  readonly readyTimeMs: number | null;
  readonly drawCalls: number | null;
  readonly frameCount: number | null;
  readonly runtimeKey: string | null;
  readonly errorText: string | null;
  readonly consoleErrors: readonly string[];
  readonly consoleWarnings: readonly string[];
  readonly responseErrors: readonly string[];
  readonly failures: readonly string[];
}

export interface V8RouteHealthReport {
  readonly schema: "g3d-v8-route-health/v1";
  readonly generatedAt: string;
  readonly origin: string;
  readonly root: {
    readonly url: string;
    readonly status: number | null;
    readonly ok: boolean;
    readonly loadTimeMs: number;
    readonly routeCount: number;
    readonly links: readonly V8RootRouteLink[];
    readonly failures: readonly string[];
  };
  readonly routes: readonly V8RouteHealthResult[];
  readonly pass: boolean;
  readonly failures: readonly string[];
}

interface RuntimeProbe {
  readonly status: "ready" | "error" | "loading" | "unknown";
  readonly runtimeKey: string | null;
  readonly drawCalls: number | null;
  readonly frameCount: number | null;
  readonly errorText: string | null;
  readonly visible: boolean;
}

export async function discoverV8RootLinks(page: Page, origin = V8_ROUTE_HEALTH_ORIGIN): Promise<{
  readonly responseStatus: number | null;
  readonly ok: boolean;
  readonly loadTimeMs: number;
  readonly links: readonly V8RootRouteLink[];
  readonly failures: readonly string[];
}> {
  const rootUrl = `${origin}/`;
  const startedAt = Date.now();
  const response = await page.goto(rootUrl, { waitUntil: "domcontentloaded", timeout: V8_ROUTE_BUDGET_MS }).catch(() => null);
  const loadTimeMs = Date.now() - startedAt;
  const responseStatus = response?.status() ?? null;
  const failures: string[] = [];

  if (responseStatus !== 200) {
    failures.push(`${rootUrl} returned ${responseStatus ?? "no response"} instead of 200`);
  }
  if (loadTimeMs > V8_ROOT_BUDGET_MS) {
    failures.push(`${rootUrl} loaded in ${loadTimeMs}ms, over ${V8_ROOT_BUDGET_MS}ms`);
  }

  const links = await page.evaluate(() => {
    const registryCards = Array.from(document.querySelectorAll<HTMLElement>("[data-route-path]"))
      .map((card) => {
        const path = card.dataset.routePath ?? "";
        const url = new URL(path, window.location.origin);
        return {
          label: (card.querySelector("strong")?.textContent ?? card.textContent ?? "").trim().replace(/\s+/g, " "),
          href: url.href,
          path: `${url.pathname}${url.search}${url.hash}`,
          declaredStatus: card.dataset.status
        };
      })
      .filter((link) => (link.path.startsWith("/apps/") || link.path.startsWith("/examples/")) && link.declaredStatus !== "internal");
    if (registryCards.length > 0) return registryCards;
    return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((link) => {
        const url = new URL(link.href);
        return {
          label: (link.querySelector("strong")?.textContent ?? link.textContent ?? "").trim().replace(/\s+/g, " "),
          href: url.href,
          path: `${url.pathname}${url.search}${url.hash}`,
          declaredStatus: undefined
        };
      })
      .filter((link) => link.path.startsWith("/apps/") || link.path.startsWith("/examples/"));
  }).catch(() => [] as V8RootRouteLink[]);

  if (links.length === 0) {
    failures.push(`${rootUrl} did not expose any linked working /apps or /examples routes`);
  }

  return {
    responseStatus,
    ok: failures.length === 0,
    loadTimeMs,
    links,
    failures
  };
}

export async function evaluateV8Route(
  page: Page,
  route: V8RootRouteLink,
  options: {
    readonly routeBudgetMs?: number;
    readonly firstVisibleBudgetMs?: number;
  } = {}
): Promise<V8RouteHealthResult> {
  const routeBudgetMs = options.routeBudgetMs ?? routeBudgetForPath(route.path);
  const firstVisibleBudgetMs = options.firstVisibleBudgetMs ?? firstVisibleBudgetForPath(route.path);
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const responseErrors: string[] = [];
  const failures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnorableConsoleError(message.text())) consoleErrors.push(message.text());
    if (message.type() === "warning" && isStartupReadPixelsWarning(message.text())) consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.stack ?? error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && !isIgnorableProbe(response.url())) {
      responseErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const startedAt = Date.now();
  const response = await page.goto(route.href, { waitUntil: "commit", timeout: routeBudgetMs }).catch((error: unknown) => {
    failures.push(`navigation failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  const loadTimeMs = Date.now() - startedAt;
  if (!response || response.status() >= 400) {
    failures.push(`${route.href} returned ${response?.status() ?? "no response"}`);
  }

  let firstVisibleTimeMs: number | null = null;
  try {
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const bodyText = document.body?.innerText ?? "";
      return Boolean(canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) || /ready|error|failed/i.test(bodyText);
    }, undefined, { timeout: firstVisibleBudgetMs });
    firstVisibleTimeMs = Date.now() - startedAt;
  } catch {
    failures.push(`${route.path} did not show a visible canvas or visible error within ${firstVisibleBudgetMs}ms`);
  }

  let probe = await readRouteProbe(page);
  const deadline = startedAt + routeBudgetMs;
  while (
    Date.now() < deadline &&
    probe.status !== "error" &&
    (probe.status !== "ready" || (probe.drawCalls ?? 0) <= 0)
  ) {
    await page.waitForTimeout(150);
    probe = await readRouteProbe(page);
  }
  const readyTimeMs = probe.status === "ready" ? Date.now() - startedAt : null;
  const settled = probe.status === "ready" || probe.status === "error";
  const working = probe.status === "ready" && (probe.drawCalls ?? 0) > 0;

  if (!settled) {
    failures.push(`${route.path} stayed ${probe.status} for ${Date.now() - startedAt}ms; expected ready or visible error under ${routeBudgetMs}ms`);
  }
  if (probe.status === "error") {
    failures.push(`${route.path} reached visible error: ${probe.errorText ?? "(no error text)"}`);
  }
  if (probe.status === "ready" && (probe.drawCalls ?? 0) <= 0) {
    failures.push(`${route.path} reported ready with ${probe.drawCalls ?? 0} draw calls`);
  }
  if (consoleErrors.length > 0) {
    failures.push(`${route.path} emitted ${consoleErrors.length} browser error(s)`);
  }
  if (consoleWarnings.length > 0) {
    failures.push(`${route.path} emitted ${consoleWarnings.length} startup readPixels/GPU-stall warning(s)`);
  }
  if (responseErrors.length > 0) {
    failures.push(`${route.path} emitted ${responseErrors.length} failed response(s)`);
  }

  return {
    label: route.label,
    href: route.href,
    path: route.path,
    status: probe.status,
    working,
    settled,
    visible: probe.visible,
    loadTimeMs,
    firstVisibleTimeMs,
    readyTimeMs,
    drawCalls: probe.drawCalls,
    frameCount: probe.frameCount,
    runtimeKey: probe.runtimeKey,
    errorText: probe.errorText,
    consoleErrors,
    consoleWarnings,
    responseErrors,
    failures
  };
}

export async function createV8RouteHealthReport(origin = V8_ROUTE_HEALTH_ORIGIN): Promise<V8RouteHealthReport> {
  const browser = await launchRouteHealthBrowser();
  try {
    const rootPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const root = await discoverV8RootLinks(rootPage, origin);
    await rootPage.close();

    const routes: V8RouteHealthResult[] = [];
    for (const route of root.links) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      routes.push(await evaluateV8Route(page, route));
      await page.close();
    }

    const failures = [
      ...root.failures,
      ...routes.flatMap((route) => route.failures.map((failure) => `${route.path}: ${failure}`))
    ];
    return {
      schema: "g3d-v8-route-health/v1",
      generatedAt: new Date().toISOString(),
      origin,
      root: {
        url: `${origin}/`,
        status: root.responseStatus,
        ok: root.ok,
        loadTimeMs: root.loadTimeMs,
        routeCount: root.links.length,
        links: root.links,
        failures: root.failures
      },
      routes,
      pass: failures.length === 0,
      failures
    };
  } finally {
    await browser.close();
  }
}

export function writeV8RouteHealthReport(report: V8RouteHealthReport): void {
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve(V8_ROUTE_HEALTH_REPORT), `${JSON.stringify(report, null, 2)}\n`);
}

async function launchRouteHealthBrowser(): Promise<Browser> {
  const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = process.env.G3D_WEBGPU_BROWSER_EXECUTABLE ||
    (process.env.G3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
  });
}

async function readRouteProbe(page: Page): Promise<RuntimeProbe> {
  return page.evaluate(() => {
    const runtimeEntries = Object.entries(window as unknown as Record<string, unknown>)
      .filter(([key, value]) => /^__(?:g3d|G3D|GALILEO3D)/.test(key) && isRuntimeRecord(value));
    const preferred = runtimeEntries.find(([, value]) => {
      const status = (value as { status?: unknown }).status;
      return status === "ready"
        || status === "running"
        || status === "first-frame"
        || status === "error"
        || status === "loading"
        || status === "booting"
        || (typeof status === "string" && status.startsWith("loading-"))
        || status === "creating-renderer"
        || status === "rendering-first-frame"
        || status === "animating";
    }) ?? runtimeEntries[0];
    const runtime = preferred?.[1] as RuntimeRecord | undefined;
    const status = normalizeStatus(runtime?.status);
    const drawCalls = firstFiniteNumber([
      runtime?.drawCalls,
      runtime?.runtime?.drawCalls,
      runtime?.proof?.diagnostics?.drawCalls,
      runtime?.diagnostics?.drawCalls,
      runtime?.snapshot?.metrics?.drawCalls
    ]);
    const frameCount = firstFiniteNumber([
      runtime?.frameCount,
      runtime?.runtime?.animationFrameCount,
      runtime?.animationFrameCount,
      runtime?.snapshot?.metrics?.frameCount
    ]);
    const errorText = typeof runtime?.error === "string"
      ? runtime.error
      : typeof runtime?.runtime?.error === "string"
        ? runtime.runtime.error
        : null;
    const canvas = document.querySelector("canvas");
    const bodyText = document.body?.innerText ?? "";
    const hasVisibleError = status === "error" && /error|failed|exception/i.test(bodyText);
    const visible = Boolean(canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) || hasVisibleError || status === "ready";
    return {
      status,
      runtimeKey: preferred?.[0] ?? null,
      drawCalls,
      frameCount,
      errorText,
      visible
    };

    function isRuntimeRecord(value: unknown): value is RuntimeRecord {
      return typeof value === "object" && value !== null && "status" in value;
    }

    function normalizeStatus(value: unknown): "ready" | "error" | "loading" | "unknown" {
      if (value === "ready" || value === "running" || value === "first-frame") return "ready";
      if (value === "error") return "error";
      if (
        value === "loading"
        || value === "booting"
        || (typeof value === "string" && value.startsWith("loading-"))
        || value === "creating-renderer"
        || value === "rendering-first-frame"
      ) {
        return "loading";
      }
      return value === "animating" ? "ready" : "unknown";
    }

    function firstFiniteNumber(values: readonly unknown[]): number | null {
      for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
      }
      return null;
    }
  });
}

function routeBudgetForPath(path: string): number {
  if (path === "/apps/v6-character-viewer/") return Number(process.env.G3D_ROUTE_HEALTH_V6_CHARACTER_BUDGET_MS ?? 5_000);
  if (path === "/apps/v7-animation-keyframes/") return Number(process.env.G3D_ROUTE_HEALTH_V7_KEYFRAMES_BUDGET_MS ?? 10_000);
  return V8_ROUTE_BUDGET_MS;
}

function firstVisibleBudgetForPath(path: string): number {
  if (path === "/apps/v6-character-viewer/") return Number(process.env.G3D_ROUTE_HEALTH_V6_CHARACTER_FIRST_VISIBLE_BUDGET_MS ?? 5_000);
  if (path === "/apps/v7-animation-keyframes/") return Number(process.env.G3D_ROUTE_HEALTH_V7_KEYFRAMES_FIRST_VISIBLE_BUDGET_MS ?? V8_FIRST_VISIBLE_BUDGET_MS);
  return V8_FIRST_VISIBLE_BUDGET_MS;
}

function isIgnorableProbe(url: string): boolean {
  return /\/(?:favicon\.ico|apple-touch-icon)/.test(url);
}

function isIgnorableConsoleError(message: string): boolean {
  return /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(message);
}

function isStartupReadPixelsWarning(message: string): boolean {
  return /readPixels|GPU stall/i.test(message);
}

type RuntimeRecord = {
  readonly status?: unknown;
  readonly error?: unknown;
  readonly drawCalls?: unknown;
  readonly frameCount?: unknown;
  readonly animationFrameCount?: unknown;
  readonly runtime?: {
    readonly drawCalls?: unknown;
    readonly animationFrameCount?: unknown;
    readonly error?: unknown;
  };
  readonly proof?: {
    readonly diagnostics?: {
      readonly drawCalls?: unknown;
    };
  };
  readonly diagnostics?: {
    readonly drawCalls?: unknown;
  };
  readonly snapshot?: {
    readonly metrics?: {
      readonly drawCalls?: unknown;
      readonly frameCount?: unknown;
    };
  };
};

async function main(): Promise<void> {
  const report = await createV8RouteHealthReport();
  writeV8RouteHealthReport(report);
  if (!report.pass) {
    console.error(`V8 route health failed. Report: ${V8_ROUTE_HEALTH_REPORT}`);
    for (const failure of report.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`V8 route health passed. Report: ${V8_ROUTE_HEALTH_REPORT}`);
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
