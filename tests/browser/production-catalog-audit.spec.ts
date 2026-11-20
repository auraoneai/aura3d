import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ORIGIN = process.env.A3D_PUBLIC_DEMO_URL ?? "https://aura3d.auraone.ai";
const REPORT_DIR = resolve("tests/reports/production-catalog-audit");
const SCRATCH_ROOT = process.env.A3D_PRODUCTION_CATALOG_AUDIT_DIR
  ?? join(tmpdir(), "aura3d-production-catalog-audit");
const SCRATCH_JSON = join(SCRATCH_ROOT, "production-audit.json");
const SCRATCH_DIR = join(SCRATCH_ROOT, "production-catalog");

const ROUTES = [
  { id: "ember-courier", path: "/apps/ember-courier/" },
  { id: "vesper-gt", path: "/apps/vesper-gt/" },
  { id: "34-relay-workcell", path: "/apps/relay-workcell/" }
] as const;

interface RouteAudit {
  readonly id: string;
  readonly path: string;
  readonly url: string;
  readonly httpStatus: number | null;
  readonly canvasReady: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly authoredAssetFailed: boolean;
  readonly claims201: boolean;
  readonly consoleErrors: readonly string[];
  readonly failedAssets: readonly string[];
  readonly screenshot: string;
  readonly pass: boolean;
}

async function waitReady(page: Page): Promise<{ width: number; height: number; ready: boolean }> {
  const studio = page.locator("body[data-scene-ready=true]");
  const ready = await studio.waitFor({ state: "attached", timeout: 90_000 })
    .then(() => true, () => false);
  const canvas = await page.locator("canvas").first().evaluate((element: HTMLCanvasElement) =>
    ({ width: element.width, height: element.height }));
  const state = await page.evaluate(() => (window as Window & {
    __auraShowcase?: { status: string; drawCalls: number; frameCount: number }
  }).__auraShowcase);
  return { ...canvas, ready: ready && state?.status === "running" && state.drawCalls > 0
    && state.frameCount > 0 && canvas.width > 8 && canvas.height > 8 };
}

test("audit the interactive production showcases", async ({ page }, testInfo) => {
  testInfo.setTimeout(900_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(SCRATCH_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const audits: RouteAudit[] = [];

  for (const route of ROUTES) {
    const consoleErrors: string[] = [];
    const failedAssets: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    };
    const onPageError = (error: Error) => consoleErrors.push(`pageerror: ${error.message}`);
    const onResponse = (response: { status(): number; url(): string }) => {
      if (response.status() >= 400 && !/favicon/i.test(response.url())) {
        failedAssets.push(`${response.status()} ${response.url()}`);
      }
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    const url = `${ORIGIN}${route.path}`;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const canvas = await waitReady(page);
    if (route.id === "vesper-gt" && canvas.ready) {
      await expect(page.locator(".poster")).toBeHidden();
      await expect(page.locator("#status")).toBeEmpty();
      for (const value of ["wheel", "body"]) {
        const button = page.locator(`button[data-view="${value}"]`);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
      }
      for (const value of ["tungsten", "daylight"]) {
        const button = page.locator(`button[data-light="${value}"]`);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
      }
    }
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const authoredAssetFailed = /authored asset failed to load/i.test(bodyText);
    const claims201 = /2\.0\.1/.test(bodyText) || /aura3d/i.test(bodyText);
    const screenshot = join(REPORT_DIR, `${route.id}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    await page.screenshot({ path: join(SCRATCH_DIR, `${route.id}.png`), fullPage: false });

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);

    const httpOk = response === null || response.ok();
    const materialConsoleErrors = consoleErrors.filter((text) => {
      if (failedAssets.length === 0 && /Failed to load resource: the server responded with a status of 404/.test(text)) {
        return false;
      }
      return true;
    });
    const pass = httpOk
      && canvas.ready
      && !authoredAssetFailed
      && materialConsoleErrors.length === 0
      && failedAssets.length === 0;
    audits.push({
      id: route.id,
      path: route.path,
      url,
      httpStatus: response?.status() ?? null,
      canvasReady: canvas.ready,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      authoredAssetFailed,
      claims201,
      consoleErrors,
      failedAssets,
      screenshot,
      pass
    });
  }

  const report = {
    schema: "aura3d-production-catalog-audit/1.0",
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    routeCount: audits.length,
    passed: audits.filter((entry) => entry.pass).length,
    failed: audits.filter((entry) => !entry.pass).map((entry) => entry.id),
    routes: audits
  };
  writeFileSync(join(REPORT_DIR, "production-catalog-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(SCRATCH_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(SCRATCH_ROOT, "catalog-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  writeFileSync(
    join(REPORT_DIR, "production-catalog-audit.md"),
    [
      `# Production catalog audit`,
      ``,
      `- Origin: ${ORIGIN}`,
      `- Routes: ${report.routeCount}`,
      `- Passed: ${report.passed}`,
      `- Failed: ${report.failed.length === 0 ? "none" : report.failed.join(", ")}`,
      ``
    ].join("\n")
  );

  expect(audits.map(audit => audit.id)).toEqual(ROUTES.map(route => route.id));
  expect(report.failed, report.failed.join("\n")).toEqual([]);
});
