import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { baseReport } from "../../tools/foundation-reporting/index.js";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const screenshotDir = "tests/reports/foundation-example-screenshots";
const manifestPath = `${screenshotDir}/manifest.json`;
const viewport = { width: 1280, height: 800 };
const auditTimeoutMs = 420_000;

test.describe("v3 example screenshot audit", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("opens every portfolio example and writes the v3 screenshot manifest", async ({ page, browserName }) => {
    test.setTimeout(auditTimeoutMs);
    await page.setViewportSize(viewport);
    const root = process.cwd();
    const absoluteDir = join(root, screenshotDir);
    mkdirSync(absoluteDir, { recursive: true });
    const entries: Array<Record<string, unknown>> = [];
    const violations: string[] = [];

    const portfolioErrors = installErrorCapture(page);
    await page.goto(`${server.origin}/examples/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_PORTFOLIO__?.status === "ready");
    const portfolioState = await page.evaluate(() => {
      const state = window.__GALILEO3D_PORTFOLIO__;
      const diagnostics = state?.diagnostics as { lastError?: string | null; contextLost?: boolean } | undefined;
      return {
        key: "__GALILEO3D_PORTFOLIO__",
        status: state?.status ?? "error",
        renderer: typeof state?.renderer === "string" ? state.renderer : undefined,
        diagnosticsPresent: typeof state?.diagnostics === "object" && state.diagnostics !== null,
        errorsPresent: Array.isArray(state?.errors),
        errorsCount: Array.isArray(state?.errors) ? state.errors.length : 0,
        visualClaim: typeof state?.visualClaim === "string" ? state.visualClaim : undefined,
        knownLimitsCount: Array.isArray(state?.knownLimits) ? state.knownLimits.length : 0,
        diagnosticsLastError: diagnostics?.lastError,
        diagnosticsContextLost: diagnostics?.contextLost,
      };
    });
    violations.push(...validateRuntimeState("portfolio", portfolioState));
    const cards = await page.locator("[data-example-id]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const link = node.querySelector<HTMLAnchorElement>("a.open");
        return {
          id: node.getAttribute("data-example-id") ?? "",
          href: link?.href ?? "",
        };
      }),
    );
    const portfolioScreenshot = `${screenshotDir}/portfolio.png`;
    await page.screenshot({ path: join(root, portfolioScreenshot), fullPage: false });
    entries.push({
      id: "portfolio",
      sceneName: "Portfolio",
      url: `${server.origin}/examples/index.html`,
      screenshotPath: portfolioScreenshot,
      browserName,
      browserVersion: page.context().browser()?.version() ?? "unknown",
      viewport,
      dpr: await page.evaluate(() => window.devicePixelRatio),
      runtimeStateKey: "__GALILEO3D_PORTFOLIO__",
      runtimeStatus: "ready",
      renderer: portfolioState.renderer,
      diagnosticsPresent: portfolioState.diagnosticsPresent,
      errorsPresent: portfolioState.errorsPresent,
      visualClaim: portfolioState.visualClaim,
      knownLimitsCount: portfolioState.knownLimitsCount,
      errors: portfolioErrors,
    });
    violations.push(...portfolioErrors.map((error) => `portfolio: ${error}`));

    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const errors = installErrorCapture(page);
      const url = new URL(card.href, `${server.origin}/examples/`).toString();
      let state: RuntimeStateAudit = {
        key: "missing-runtime-state",
        status: "error",
        renderer: undefined,
        diagnosticsPresent: false,
        errorsPresent: false,
        errorsCount: 0,
        visualClaim: undefined,
        knownLimitsCount: 0,
        diagnosticsLastError: undefined,
        diagnosticsContextLost: undefined,
      };
      try {
        const pageTimeout = timeoutForExample(card.id);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: pageTimeout });
        state = await waitForKnownRuntimeState(page, pageTimeout);
      } catch (error) {
        violations.push(`${card.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await page.waitForTimeout(150);
      const screenshotPath = `${screenshotDir}/${card.id}.png`;
      await page.screenshot({ path: join(root, screenshotPath), fullPage: false });
      if (state.status !== "ready") {
        violations.push(`${card.id}: runtime state ${state.key} reported ${state.status}`);
      }
      violations.push(...validateRuntimeState(card.id, state));
      violations.push(...errors.map((error) => `${card.id}: ${error}`));
      entries.push({
        id: card.id,
        sceneName: card.id,
        url,
        screenshotPath,
        browserName,
        browserVersion: page.context().browser()?.version() ?? "unknown",
        viewport,
        dpr: await page.evaluate(() => window.devicePixelRatio),
        runtimeStateKey: state.key,
        runtimeStatus: state.status,
        renderer: state.renderer,
        diagnosticsPresent: state.diagnosticsPresent,
        errorsPresent: state.errorsPresent,
        visualClaim: state.visualClaim,
        knownLimitsCount: state.knownLimitsCount,
        errors,
      });
    }

    const screenshotPaths = entries.map((entry) => String(entry.screenshotPath));
    const report = {
      ...baseReport(root, {
        ok: violations.length === 0,
        command: "pnpm verify:v3-examples",
        runIdPrefix: "v3-example-screenshot-audit",
        sourceFiles: [
          "tests/browser/example-screenshot-audit.spec.ts",
          "examples/portfolio/main.ts",
          ...cards.map((card) => `examples/${card.id}/index.html`),
        ],
        screenshotPaths,
        violations,
      }),
      browserName,
      browserVersion: page.context().browser()?.version() ?? "unknown",
      viewport,
      dpr: await page.evaluate(() => window.devicePixelRatio),
      timeoutMs: auditTimeoutMs,
      consoleAndPageErrorCapture: true,
      diffThresholds: {
        maxChangedPixelRatio: 0.01,
        reasonRequiredForBaselineChange: true,
      },
      entries,
    };
    writeJsonReport(root, manifestPath, report);
    expect(violations).toEqual([]);
  });
});

function installErrorCapture(page: Page): string[] {
  const errors: string[] = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

type RuntimeStateAudit = {
  readonly key: string;
  readonly status: string;
  readonly renderer?: string;
  readonly diagnosticsPresent: boolean;
  readonly errorsPresent: boolean;
  readonly errorsCount: number;
  readonly visualClaim?: string;
  readonly knownLimitsCount: number;
  readonly diagnosticsLastError?: string | null;
  readonly diagnosticsContextLost?: boolean;
};

async function waitForKnownRuntimeState(page: Page, timeoutMs = 45_000): Promise<RuntimeStateAudit> {
  const keys = [
    "__GALILEO3D_EXAMPLE__",
    "__GALILEO3D_PRODUCT_DEMO__",
    "__GALILEO3D_ARCHITECTURE_DEMO__",
    "__GALILEO3D_GAME_DEMO__",
    "__GALILEO3D_ASSET_VIEWER__",
    "__GALILEO3D_PBR_CAMERA_COMPARISON__",
    "__GALILEO3D_PBR_MATERIAL_LAB__",
    "__GALILEO3D_LARGE_SCENE_TEST__",
    "__GALILEO3D_PHYSICS_SANDBOX__",
    "__GALILEO3D_POSTPROCESS_LAB__",
    "__GALILEO3D_SHADOW_LAB__",
    "__GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__",
    "__GALILEO3D_EXPORTED_PROJECT__",
    "__GALILEO3D_MATERIAL_SHOWROOM__",
    "__GALILEO3D_RENDERER_STRESS_LAB__",
  ];
  try {
    await page.waitForFunction((candidateKeys) => {
      const record = window as unknown as Record<string, { status?: string } | undefined>;
      return candidateKeys.some((key) => {
        const state = record[key];
        return state?.status === "ready" || state?.status === "error";
      });
    }, keys, { timeout: timeoutMs });
  } catch {
    return {
      key: "missing-runtime-state",
      status: "error",
      renderer: undefined,
      diagnosticsPresent: false,
      errorsPresent: false,
      errorsCount: 0,
      visualClaim: undefined,
      knownLimitsCount: 0,
      diagnosticsLastError: undefined,
      diagnosticsContextLost: undefined,
    };
  }
  return page.evaluate((candidateKeys) => {
    const record = window as unknown as Record<string, RuntimeStateShape | undefined>;
    const readDiagnosticsLastError = (value: unknown): string | null | undefined => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
      const candidate = value as { readonly lastError?: unknown };
      return typeof candidate.lastError === "string" || candidate.lastError === null ? candidate.lastError : undefined;
    };
    const readDiagnosticsContextLost = (value: unknown): boolean | undefined => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
      const candidate = value as { readonly contextLost?: unknown };
      return typeof candidate.contextLost === "boolean" ? candidate.contextLost : undefined;
    };
    for (const key of candidateKeys) {
      const state = record[key];
      if (state?.status === "ready" || state?.status === "error") {
        return {
          key,
          status: state.status,
          renderer: typeof state.renderer === "string" ? state.renderer : undefined,
          diagnosticsPresent: typeof state.diagnostics === "object" && state.diagnostics !== null,
          errorsPresent: Array.isArray(state.errors),
          errorsCount: Array.isArray(state.errors) ? state.errors.length : 0,
          visualClaim: typeof state.visualClaim === "string" ? state.visualClaim : undefined,
          knownLimitsCount: Array.isArray(state.knownLimits) ? state.knownLimits.length : 0,
          diagnosticsLastError: readDiagnosticsLastError(state.diagnostics),
          diagnosticsContextLost: readDiagnosticsContextLost(state.diagnostics),
        };
      }
    }
    return {
      key: "unknown",
      status: "error",
      renderer: undefined,
      diagnosticsPresent: false,
      errorsPresent: false,
      errorsCount: 0,
      visualClaim: undefined,
      knownLimitsCount: 0,
      diagnosticsLastError: undefined,
      diagnosticsContextLost: undefined,
    };
  }, keys);
}

function timeoutForExample(id: string): number {
  return id === "rendering-large-scene" ? 90_000 : 45_000;
}

type RuntimeStateShape = {
  readonly status?: string;
  readonly renderer?: unknown;
  readonly diagnostics?: unknown;
  readonly errors?: unknown;
  readonly visualClaim?: unknown;
  readonly knownLimits?: unknown;
};

function validateRuntimeState(id: string, state: RuntimeStateAudit): string[] {
  const violations: string[] = [];
  if (!state.renderer) violations.push(`${id}: runtime state ${state.key} is missing renderer`);
  if (!state.diagnosticsPresent) violations.push(`${id}: runtime state ${state.key} is missing diagnostics`);
  if (!state.errorsPresent) violations.push(`${id}: runtime state ${state.key} is missing errors array`);
  if (state.errorsCount > 0) violations.push(`${id}: runtime state ${state.key} reported ${state.errorsCount} runtime errors`);
  if (state.diagnosticsLastError) violations.push(`${id}: runtime state ${state.key} diagnostics lastError=${state.diagnosticsLastError}`);
  if (state.diagnosticsContextLost === true) violations.push(`${id}: runtime state ${state.key} diagnostics reported context loss`);
  if (!state.visualClaim) violations.push(`${id}: runtime state ${state.key} is missing visualClaim`);
  if (state.knownLimitsCount < 1) violations.push(`${id}: runtime state ${state.key} is missing knownLimits`);
  return violations;
}

function writeJsonReport(root: string, path: string, value: unknown): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}
