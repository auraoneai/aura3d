import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/2.0-visual-audit/examples");
const SOURCE_ROOT = resolve("examples");

test.describe("Aura3D 2.0 exhaustive example visual audit", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures every checked-in examples index entry", async ({ browser }) => {
    const filter = process.env.A3D_VISUAL_AUDIT_FILTER;
    const allEntries = discoverIndexFiles(SOURCE_ROOT);
    const entries = filter ? allEntries.filter((entry) => relative(SOURCE_ROOT, entry).includes(filter)) : allEntries;
    const results = [];
    for (const indexFile of entries) {
      results.push(await inspectExample(browser, server.origin, indexFile));
    }
    const failures = results.flatMap((result) => result.failures.map((failure) => `${result.route}: ${failure}`));
    const report = {
      schema: "aura3d.2.0-example-visual-audit/1.0",
      generatedAt: new Date().toISOString(),
      scope: filter ? `Filtered examples/ visual audit: ${filter}` : "Every index.html checked into examples/, including legacy-labeled entries until they are removed or explicitly excluded from the public surface.",
      routeCount: results.length,
      pass: failures.length === 0,
      results,
      failures,
      humanReview: {
        status: "pending",
        rule: "Automated capture is not visual acceptance. Every retained page/canvas image must be personally inspected and assigned a review verdict."
      }
    };
    const reportName = filter ? `report-${filter.replaceAll(/[^a-z0-9-]/gi, "-")}.json` : "report.json";
    writeFileSync(resolve(REPORT_ROOT, reportName), `${JSON.stringify(report, null, 2)}\n`);
    expect(results.length).toBe(filter ? entries.length : 37);
    expect(results.length).toBeGreaterThan(0);
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

async function inspectExample(browser: Browser, origin: string, indexFile: string) {
  const source = relative(process.cwd(), indexFile).replaceAll("\\", "/");
  const directory = relative(process.cwd(), dirname(indexFile)).replaceAll("\\", "/");
  const route = `/${directory}/`;
  const slug = directory.replaceAll("/", "--");
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responseErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });
  let responseStatus = 0;
  let navigationError = "";
  try {
    const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    responseStatus = response?.status() ?? 0;
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }
  await page.waitForFunction(() => {
    const readyBody = document.body.dataset.aura3dReady === "true";
    const publishedRuntime = Object.entries(window).some(([key, value]) => {
      if (!key.startsWith("__") || typeof value !== "object" || value === null) return false;
      const status = (value as { status?: unknown }).status;
      return status === "ready" || status === "running" || status === "error" || status === "unsupported";
    });
    return readyBody || publishedRuntime;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(750);
  const pagePath = resolve(REPORT_ROOT, `${slug}--page.png`);
  const pageBytes = await page.screenshot({ path: pagePath, fullPage: true }).catch(() => Buffer.alloc(0));
  const canvases = page.locator("canvas");
  const canvasCount = await canvases.count();
  let canvas: null | {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly backingWidth: number;
    readonly backingHeight: number;
  } = null;
  if (canvasCount > 0) {
    const candidate = canvases.first();
    const dimensions = await candidate.evaluate((element) => {
      const value = element as HTMLCanvasElement;
      return { clientWidth: value.clientWidth, clientHeight: value.clientHeight, backingWidth: value.width, backingHeight: value.height };
    }).catch(() => ({ clientWidth: 0, clientHeight: 0, backingWidth: 0, backingHeight: 0 }));
    const canvasPath = resolve(REPORT_ROOT, `${slug}--canvas.png`);
    const bytes = await candidate.screenshot({ path: canvasPath }).catch(() => Buffer.alloc(0));
    canvas = {
      path: relative(process.cwd(), canvasPath).replaceAll("\\", "/"),
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...dimensions
    };
  }
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 1_000);
  const runtimeEvidence = await page.evaluate(() => Object.entries(window)
    .filter(([key, value]) => key.startsWith("__") && typeof value === "object" && value !== null && "status" in value)
    .map(([key, value]) => {
      const record = value as Record<string, unknown>;
      return {
        key,
        status: record.status,
        drawCalls: record.drawCalls,
        frameCount: record.frameCount ?? record.frames,
        errors: record.errors,
        error: record.error
      };
    }));
  const failures = [
    ...(navigationError ? [`navigation: ${navigationError}`] : []),
    ...(responseStatus !== 200 ? [`response status ${responseStatus}`] : []),
    ...(canvasCount === 0 ? ["no canvas"] : []),
    ...(canvas && (canvas.clientWidth < 64 || canvas.clientHeight < 64 || canvas.backingWidth < 64 || canvas.backingHeight < 64) ? ["canvas dimensions below 64px"] : []),
    ...(canvas && canvas.bytes < 1_000 ? ["canvas capture below 1000 bytes"] : []),
    ...pageErrors.map((error) => `page error: ${error}`),
    ...consoleErrors.map((error) => `console error: ${error}`),
    ...responseErrors.map((error) => `response error: ${error}`)
  ];
  await page.close();
  return {
    source,
    route,
    slug,
    responseStatus,
    pageScreenshot: {
      path: relative(process.cwd(), pagePath).replaceAll("\\", "/"),
      bytes: pageBytes.byteLength,
      sha256: createHash("sha256").update(pageBytes).digest("hex")
    },
    canvasCount,
    canvas,
    bodyText,
    runtimeEvidence,
    pageErrors,
    consoleErrors,
    responseErrors,
    automatedStatus: failures.length === 0 ? "captured" : "failed",
    humanReview: "pending",
    failures
  };
}

function discoverIndexFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && basename(path) === "index.html") files.push(path);
    }
  };
  visit(root);
  return files.sort();
}
