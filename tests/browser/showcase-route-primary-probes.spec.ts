// allow: SIZE_OK - single browser evidence generator; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { analyzeForegroundPng, type PngCrop } from "./showcase-visual-quality";

const EVIDENCE_TIMEOUT_MS = 30_000;
const VIEWPORT = { width: 1440, height: 900 } as const;
const REPORT_DIR = resolve("tests/reports/showcase-route-primary-probes");
const ROUTE_GATE_CONFIG_PATH = resolve("tools/showcase-library/route-gates.json");
const UI_EVIDENCE_SELECTOR = [
  "header",
  "nav",
  "aside",
  "section[aria-label]",
  "#hud",
  "#panel",
  "#touch-controls",
  "[class*='hud']",
  "[class*='panel']",
  "[class*='controls']",
  "[class*='topbar']",
  "[class*='commandbar']",
  "[class*='telemetry']",
  "[class*='console']"
].join(",");
const ROUTE_GATE_CONFIG_TEXT = readFileSync(ROUTE_GATE_CONFIG_PATH, "utf8");
const ROUTE_GATE_CONFIG_HASH = createHash("sha256").update(ROUTE_GATE_CONFIG_TEXT).digest("hex");
const ROUTE_GATE_CONFIG = JSON.parse(ROUTE_GATE_CONFIG_TEXT) as ShowcaseRouteGateConfig;
const ROUTES = ROUTE_GATE_CONFIG.routes.filter((route) =>
  route.published && (route.primaryAssets.length > 0 || route.requiresRoutePrimaryProbe === true)
);

interface ShowcaseRouteGateConfig {
  readonly schema: string;
  readonly routes: readonly ShowcaseRouteGateDefinition[];
}

interface ShowcaseRouteGateDefinition {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly globalName: string;
  readonly published: boolean;
  readonly primaryAssets: readonly string[];
  readonly primaryAssetRoles?: Readonly<Record<string, string>>;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets?: readonly string[];
  readonly primitiveBudget: number;
  readonly requiresTypedPrimaryAssets: boolean;
  readonly requiresRoutePrimaryProbe?: boolean;
}

interface RoutePrimaryProbeContext {
  readonly routeId: string;
  readonly routePath: string;
  readonly appId: string;
  readonly sourceHash: string;
  readonly routeGateHash: string;
  readonly routeHealthHash?: string;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets: readonly string[];
  readonly primaryAssets: readonly {
    readonly id: string;
    readonly role: string;
    readonly expectedTypedRef: string;
    readonly manifestHash?: string;
    readonly routePrimaryEvidenceTarget: boolean;
    readonly evidenceMode: "route-primary-foreground" | "secondary-present";
  }[];
}

interface RoutePrimaryProbeModule {
  createRoutePrimaryProbeContext(route: ShowcaseRouteGateDefinition, root?: string): RoutePrimaryProbeContext;
  readonly routePrimaryProbeThresholds: {
    readonly minNonBlankPixels: number;
    readonly minColorBuckets: number;
    readonly minForegroundWidth: number;
    readonly minForegroundHeight: number;
    readonly minReadabilityScore: number;
  };
  routePrimaryProbeEvidencePath(routeId: string, root?: string): string;
  routePrimaryProbeScreenshotPath(routeId: string, root?: string): string;
  routePrimaryProbeRelativeEvidencePath(routeId: string): string;
  routePrimaryProbeRelativeScreenshotPath(routeId: string): string;
}

interface ProbeOutcome {
  readonly routeId: string;
  readonly pass: boolean;
  readonly failures: readonly string[];
  readonly evidencePath: string;
  readonly screenshotPath: string;
}

type EvidenceRecord = Record<string, unknown>;

interface RendererDiagnostics {
  readonly backend?: string;
  readonly fallback?: string;
  readonly drawCalls?: number;
  readonly renderSize?: readonly number[];
}

interface RendererDiagnosticInput {
  readonly routeEvidence?: EvidenceRecord;
  readonly rootRouteEvidence?: EvidenceRecord;
  readonly canvasRenderSize?: readonly [number, number];
}

interface MountedEvidenceSummary {
  readonly present: boolean;
  readonly status: string;
  readonly evidenceKeys: readonly string[];
  readonly primaryAssets: readonly string[];
  readonly missingPrimaryAssets: readonly string[];
  readonly hasRendererDiagnostics: boolean;
}

test.describe("showcase route-primary probe generation", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("writes retained route-primary probe JSON and screenshots for published typed routes", async ({ page }) => {
    mkdirSync(REPORT_DIR, { recursive: true });
    const routePrimaryProbe = await importRoutePrimaryProbeModule();
    const outcomes: ProbeOutcome[] = [];
    const browserContext = page.context();

    for (const route of ROUTES) {
      const context = routePrimaryProbe.createRoutePrimaryProbeContext(route);
      const routePage = await browserContext.newPage();
      try {
        const outcome = await writeRoutePrimaryProbe(routePage, server, route, context, routePrimaryProbe);
        outcomes.push(outcome);
      } finally {
        await routePage.close();
      }
    }

    writeFileSync(
      resolve(REPORT_DIR, "_summary.json"),
      `${JSON.stringify({
        schema: "aura3d-route-primary-probe-summary/1.0",
        generatedAt: new Date().toISOString(),
        routeGateConfig: {
          path: "tools/showcase-library/route-gates.json",
          schema: ROUTE_GATE_CONFIG.schema,
          hash: ROUTE_GATE_CONFIG_HASH
        },
        pass: outcomes.every((outcome) => outcome.pass),
        routes: outcomes
      }, null, 2)}\n`
    );

    expect(outcomes.length).toBe(ROUTES.length);
    for (const outcome of outcomes) {
      expect(existsSync(outcome.evidencePath), `${outcome.routeId} probe JSON`).toBe(true);
      expect(existsSync(outcome.screenshotPath), `${outcome.routeId} probe screenshot`).toBe(true);
      expect(statSync(outcome.screenshotPath).size, `${outcome.routeId} screenshot size`).toBeGreaterThan(0);
      if (outcome.pass) continue;
      expect(outcome.failures.length, `${outcome.routeId} failed route-primary evidence details`).toBeGreaterThan(0);
      expect(routeAllowsFailingProbe(outcome.routeId), `${outcome.routeId} failed while public-ready`).toBe(true);
    }
  });
});

async function writeRoutePrimaryProbe(
  page: Page,
  server: ExampleDevServer,
  route: ShowcaseRouteGateDefinition,
  context: RoutePrimaryProbeContext,
  routePrimaryProbe: RoutePrimaryProbeModule
): Promise<ProbeOutcome> {
  const evidencePath = routePrimaryProbe.routePrimaryProbeEvidencePath(route.id);
  const screenshotPath = routePrimaryProbe.routePrimaryProbeScreenshotPath(route.id);
  const relativeEvidencePath = routePrimaryProbe.routePrimaryProbeRelativeEvidencePath(route.id);
  const relativeScreenshotPath = routePrimaryProbe.routePrimaryProbeRelativeScreenshotPath(route.id);
  const failures: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  let routeEvidence: EvidenceRecord | undefined;
  let renderer: RendererDiagnostics = {};
  let viewport = { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1 };
  let foreground = emptyForeground();
  let canvasCrop: PngCrop | undefined;
  let analysisCrop: PngCrop | undefined;
  let uiOccluded = false;
  const thresholds = routePrimaryProbe.routePrimaryProbeThresholds;

  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize(VIEWPORT);
  try {
    const response = await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) failures.push(`route-response:${String(response?.status())}`);
    routeEvidence = await waitForMountedRouteEvidence(page, route.globalName);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    canvasCrop = await largestCanvasCrop(page);
    if (!canvasCrop) failures.push("missing-visible-canvas");
    analysisCrop = canvasCrop ? await routePrimaryAnalysisCrop(page, canvasCrop) : undefined;
    renderer = await waitForRendererDiagnostics(page, route.globalName);
    failures.push(...rendererDiagnosticFailures(renderer));
  } catch (error) {
    failures.push(`route-load:${error instanceof Error ? error.message : String(error)}`);
  }

  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false, scale: "css" });
  const screenshotHash = `sha256-${createHash("sha256").update(screenshot).digest("hex")}`;
  try {
    foreground = analyzeForegroundPng(screenshot, analysisCrop);
    if (!foreground.foregroundBounds) failures.push("primary-foreground-missing");
    if (foreground.nonBlankPixels < thresholds.minNonBlankPixels) failures.push(`primary-foreground-too-small:${foreground.nonBlankPixels}`);
    if (foreground.colorBuckets < thresholds.minColorBuckets) failures.push(`primary-color-buckets-too-low:${foreground.colorBuckets}`);
    if (foreground.foregroundBounds && foreground.foregroundBounds.width < thresholds.minForegroundWidth) failures.push(`primary-foreground-width:${foreground.foregroundBounds.width}`);
    if (foreground.foregroundBounds && foreground.foregroundBounds.height < thresholds.minForegroundHeight) failures.push(`primary-foreground-height:${foreground.foregroundBounds.height}`);
    if (foreground.clipped) failures.push("primary-foreground-clipped");
    if (foreground.readabilityScore < thresholds.minReadabilityScore) failures.push(`primary-readability-score:${foreground.readabilityScore}`);
    uiOccluded = foreground.foregroundBounds ? await foregroundOccludedByUi(page, foreground.foregroundBounds) : false;
    if (uiOccluded) failures.push("primary-foreground-occluded-by-ui");
  } catch (error) {
    failures.push(`screenshot-analysis:${error instanceof Error ? error.message : String(error)}`);
  }

  if (pageErrors.length > 0) failures.push(...pageErrors.map((error) => `page-error:${error}`));
  if (consoleErrors.length > 0) failures.push(...consoleErrors.map((error) => `console-error:${error}`));

  const mountedEvidence = summarizeMountedEvidence(route, routeEvidence);
  if (!mountedEvidence.present) failures.push("mounted-evidence-missing");
  failures.push(...mountedEvidence.missingPrimaryAssets.map((assetId) => `mounted-evidence-missing-primary-asset:${assetId}`));
  const primitivePrimaryCandidates = findPrimitivePrimaryCandidates(route);
  if (primitivePrimaryCandidates.length > 0) {
    failures.push(...primitivePrimaryCandidates.map((candidate) => `primitive-primary-candidate:${candidate}`));
  }

  viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio
  }));

  const pass = failures.length === 0;
  const renderedProbe = {
    screenshotPath: relativeScreenshotPath,
    sha256: screenshotHash,
    width: foreground.width,
    height: foreground.height,
    ...(analysisCrop ? { analysisCrop } : {}),
    nonBlankPixels: foreground.nonBlankPixels,
    colorBuckets: foreground.colorBuckets,
    ...(foreground.foregroundBounds ? { foregroundBounds: foreground.foregroundBounds } : {}),
    visible: Boolean(foreground.foregroundBounds) && foreground.nonBlankPixels >= 2500,
    clipped: foreground.clipped,
    occludedByUi: uiOccluded,
    readabilityScore: foreground.readabilityScore,
    failures
  };
  const evidence = {
    schema: "aura3d-route-primary-probe/1.0",
    routeId: route.id,
    routePath: route.path,
    appId: route.id,
    sourceHash: context.sourceHash,
    routeGateHash: context.routeGateHash,
    routePrimaryHeroAsset: context.routePrimaryHeroAsset,
    secondaryPrimaryAssets: context.secondaryPrimaryAssets,
    ...(context.routeHealthHash ? { routeHealthHash: context.routeHealthHash } : {}),
    generatedAt: new Date().toISOString(),
    viewport,
    mountedEvidence,
    renderer,
    renderedProbe,
    primaryAssets: context.primaryAssets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      expectedTypedRef: asset.expectedTypedRef,
      routePrimaryEvidenceTarget: asset.routePrimaryEvidenceTarget,
      evidenceMode: asset.evidenceMode,
      ...(asset.manifestHash ? { manifestHash: asset.manifestHash } : {}),
      ...(asset.routePrimaryEvidenceTarget ? { renderedProbe } : {})
    })),
    primitivePrimaryCandidates,
    pass,
    failures
  };

  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return {
    routeId: route.id,
    pass,
    failures,
    evidencePath: relativeEvidencePath,
    screenshotPath: relativeScreenshotPath
  };
}

async function importRoutePrimaryProbeModule(): Promise<RoutePrimaryProbeModule> {
  return await import(pathToFileURL(resolve("tools/showcase-library/route-primary-probes.mjs")).href) as RoutePrimaryProbeModule;
}

async function waitForMountedRouteEvidence(page: Page, globalName: string): Promise<EvidenceRecord> {
  await page.waitForFunction((name) => {
    const evidence = (window as unknown as Record<string, EvidenceRecord | undefined>)[name as string];
    if (!evidence) return false;
    const status = typeof evidence.status === "string" ? evidence.status : "";
    return /^(ready|running|unsupported)$/.test(status);
  }, globalName, { timeout: EVIDENCE_TIMEOUT_MS });
  return page.evaluate((name) => {
    return (window as unknown as Record<string, EvidenceRecord>)[name as string];
  }, globalName);
}

function summarizeMountedEvidence(route: ShowcaseRouteGateDefinition, evidence: EvidenceRecord | undefined): MountedEvidenceSummary {
  const evidenceText = JSON.stringify(evidence ?? {});
  const primaryAssets = route.primaryAssets.filter((assetId) =>
    evidenceText.includes(`assets.${assetId}`) || evidenceText.includes(`"id":"${assetId}"`)
  );
  return {
    present: Boolean(evidence),
    status: typeof evidence?.status === "string" ? evidence.status : "missing",
    evidenceKeys: evidence ? Object.keys(evidence).sort() : [],
    primaryAssets,
    missingPrimaryAssets: route.primaryAssets.filter((assetId) => !primaryAssets.includes(assetId)),
    hasRendererDiagnostics: /"drawCalls"\s*:\s*\d+/.test(evidenceText) || /"renderSize"\s*:/.test(evidenceText)
  };
}

async function waitForRendererDiagnostics(page: Page, globalName: string): Promise<RendererDiagnostics> {
  await page.waitForFunction((name) => {
    const evidence = (window as unknown as Record<string, unknown>)[name as string];
    const rootEvidence = (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__;
    const text = JSON.stringify([evidence, rootEvidence]);
    const hasDrawCalls = /"drawCalls"\s*:\s*[1-9]/.test(text);
    const canvas = Array.from(document.querySelectorAll("canvas"))
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return { width: candidate.width, height: candidate.height, area: Math.max(0, rect.width) * Math.max(0, rect.height) };
      })
      .filter((candidate) => candidate.width > 0 && candidate.height > 0)
      .sort((left, right) => right.area - left.area)[0];
    return hasDrawCalls && Boolean(canvas);
  }, globalName, { timeout: 3_000 })
    .catch(() => undefined);

  return extractRendererDiagnostics(await readRendererDiagnosticInput(page, globalName));
}

async function readRendererDiagnosticInput(page: Page, globalName: string): Promise<RendererDiagnosticInput> {
  return page.evaluate((name) => {
    const routeEvidence = (window as unknown as Record<string, EvidenceRecord | undefined>)[name as string];
    const rootRouteEvidence = (window as unknown as { __AURA3D_ROUTE_READY__?: EvidenceRecord }).__AURA3D_ROUTE_READY__;
    const canvas = Array.from(document.querySelectorAll("canvas"))
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return {
          renderSize: [candidate.width, candidate.height] as const,
          area: Math.max(0, rect.width) * Math.max(0, rect.height)
        };
      })
      .filter((candidate) => candidate.renderSize[0] > 0 && candidate.renderSize[1] > 0)
      .sort((left, right) => right.area - left.area)[0];
    return {
      ...(routeEvidence ? { routeEvidence } : {}),
      ...(rootRouteEvidence ? { rootRouteEvidence } : {}),
      ...(canvas ? { canvasRenderSize: canvas.renderSize } : {})
    };
  }, globalName);
}

async function largestCanvasCrop(page: Page): Promise<PngCrop | undefined> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("canvas"))
      .map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(rect.left)),
          y: Math.max(0, Math.floor(rect.top)),
          width: Math.max(0, Math.floor(Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)))),
          height: Math.max(0, Math.floor(Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)))),
          area: Math.max(0, rect.width) * Math.max(0, rect.height)
        };
      })
      .filter((rect) => rect.width >= 80 && rect.height >= 80)
      .sort((a, b) => b.area - a.area);
    return candidates[0];
  });
}

async function routePrimaryAnalysisCrop(page: Page, canvasCrop: PngCrop): Promise<PngCrop> {
  return page.evaluate(({ crop, selector }) => {
    type Rect = { x: number; y: number; width: number; height: number };

    const minWidth = 180;
    const minHeight = 140;
    const cropInset = 10;
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const area = (rect: Rect): number => Math.max(0, rect.width) * Math.max(0, rect.height);
    const normalize = (rect: Rect): Rect => ({
      x: Math.max(viewport.x, Math.floor(rect.x)),
      y: Math.max(viewport.y, Math.floor(rect.y)),
      width: Math.max(0, Math.floor(Math.min(rect.x + rect.width, viewport.x + viewport.width) - Math.max(viewport.x, rect.x))),
      height: Math.max(0, Math.floor(Math.min(rect.y + rect.height, viewport.y + viewport.height) - Math.max(viewport.y, rect.y)))
    });
    const intersection = (left: Rect, right: Rect): Rect | undefined => {
      const x = Math.max(left.x, right.x);
      const y = Math.max(left.y, right.y);
      const width = Math.min(left.x + left.width, right.x + right.width) - x;
      const height = Math.min(left.y + left.height, right.y + right.height) - y;
      return width > 0 && height > 0 ? { x, y, width, height } : undefined;
    };
    const usable = (rect: Rect): boolean => rect.width >= minWidth && rect.height >= minHeight;
    const pushUsable = (list: Rect[], rect: Rect): void => {
      const normalized = normalize(rect);
      if (usable(normalized)) list.push(normalized);
    };
    const inset = (rect: Rect): Rect => {
      const maxInset = Math.max(0, Math.min(cropInset, Math.floor((rect.width - minWidth) / 2), Math.floor((rect.height - minHeight) / 2)));
      return {
        x: rect.x + maxInset,
        y: rect.y + maxInset,
        width: rect.width - maxInset * 2,
        height: rect.height - maxInset * 2
      };
    };
    const isVisible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
    };
    const canvas = normalize(crop);
    if (!usable(canvas)) return canvas;

    const blockers = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => !element.querySelector("canvas") && isVisible(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return normalize({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      })
      .filter((rect) => area(rect) > 0 && Boolean(intersection(canvas, rect)))
      .sort((left, right) => area(right) - area(left));

    let candidates: Rect[] = [canvas];
    for (const blocker of blockers) {
      const next: Rect[] = [];
      for (const candidate of candidates) {
        const overlap = intersection(candidate, blocker);
        if (!overlap) {
          next.push(candidate);
          continue;
        }
        pushUsable(next, { x: candidate.x, y: candidate.y, width: blocker.x - candidate.x, height: candidate.height });
        pushUsable(next, {
          x: blocker.x + blocker.width,
          y: candidate.y,
          width: candidate.x + candidate.width - (blocker.x + blocker.width),
          height: candidate.height
        });
        pushUsable(next, { x: candidate.x, y: candidate.y, width: candidate.width, height: blocker.y - candidate.y });
        pushUsable(next, {
          x: candidate.x,
          y: blocker.y + blocker.height,
          width: candidate.width,
          height: candidate.y + candidate.height - (blocker.y + blocker.height)
        });
      }
      if (next.length > 0) {
        candidates = next.sort((left, right) => area(right) - area(left)).slice(0, 32);
      }
    }

    return inset((candidates[0] ?? canvas));
  }, { crop: canvasCrop, selector: UI_EVIDENCE_SELECTOR });
}

async function foregroundOccludedByUi(page: Page, foregroundBounds: PngCrop): Promise<boolean> {
  return page.evaluate(({ bounds, selector }) => {
    const foregroundArea = Math.max(1, bounds.width * bounds.height);
    const isVisible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
    };
    const intersectionArea = (rect: DOMRect): number => {
      const width = Math.max(0, Math.min(bounds.x + bounds.width, rect.right) - Math.max(bounds.x, rect.left));
      const height = Math.max(0, Math.min(bounds.y + bounds.height, rect.bottom) - Math.max(bounds.y, rect.top));
      return width * height;
    };
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => !element.querySelector("canvas") && isVisible(element))
      .some((element) => intersectionArea(element.getBoundingClientRect()) / foregroundArea > 0.08);
  }, { bounds: foregroundBounds, selector: UI_EVIDENCE_SELECTOR });
}

function findPrimitivePrimaryCandidates(route: ShowcaseRouteGateDefinition): readonly string[] {
  const sourceText = readRouteSourceText(route.id);
  const candidates: string[] = [];
  const primaryWords = /(hero|primary|player|runner|character|car|vehicle|track|world|product|subject|main)/i;
  for (const match of sourceText.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)[\s\S]{0,160}?primitives\.([A-Za-z_]+)\s*\(/g)) {
    const name = match[1] ?? "";
    const primitive = match[2] ?? "primitive";
    if (primaryWords.test(name)) candidates.push(`${name}:${primitive}`);
  }
  if (route.requiresTypedPrimaryAssets) {
    for (const assetId of route.primaryAssets) {
      if (!sourceText.includes(`assets.${assetId}`)) candidates.push(`missing-typed-primary:${assetId}`);
    }
  }
  return Array.from(new Set(candidates)).sort();
}

function readRouteSourceText(routeId: string): string {
  const appDir = resolve("apps", routeId);
  if (!existsSync(appDir)) return "";
  return walkFiles(appDir)
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|html|md)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function routeAllowsFailingProbe(routeId: string): boolean {
  const healthPath = resolve("apps", routeId, "route-health.json");
  if (!existsSync(healthPath)) return false;
  const health = JSON.parse(readFileSync(healthPath, "utf8")) as {
    readonly classification?: string;
    readonly publicShowcase?: boolean;
    readonly promotionStatus?: string;
  };
  const classification = String(health.classification ?? "").toLowerCase();
  const promotionStatus = String(health.promotionStatus ?? "").toLowerCase();
  if (health.publicShowcase === false) return true;
  return /blocked|prototype|diagnostic|internal|removed/.test(classification) ||
    /blocked|prototype|diagnostic|internal|removed/.test(promotionStatus);
}

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function extractRendererDiagnostics(input: RendererDiagnosticInput): RendererDiagnostics {
  const found = findRendererValues(input, 0);
  return {
    ...(found.backend ? { backend: found.backend } : {}),
    ...(found.fallback ? { fallback: found.fallback } : {}),
    ...(typeof found.drawCalls === "number" ? { drawCalls: found.drawCalls } : {}),
    ...(found.renderSize ? { renderSize: found.renderSize } : input.canvasRenderSize ? { renderSize: input.canvasRenderSize } : {})
  };
}

function rendererDiagnosticFailures(renderer: RendererDiagnostics): readonly string[] {
  const failures: string[] = [];
  if (!Number.isInteger(renderer.drawCalls) || (renderer.drawCalls ?? 0) <= 0) {
    failures.push(`renderer-draw-calls:${String(renderer.drawCalls)}`);
  }
  const renderSize = renderer.renderSize;
  if (!Array.isArray(renderSize) ||
      !Number.isInteger(renderSize[0]) ||
      !Number.isInteger(renderSize[1]) ||
      (renderSize[0] ?? 0) <= 0 ||
      (renderSize[1] ?? 0) <= 0) {
    failures.push("renderer-render-size");
  }
  return failures;
}

function findRendererValues(value: unknown, depth: number): {
  backend?: string;
  fallback?: string;
  drawCalls?: number;
  renderSize?: readonly number[];
} {
  if (!value || typeof value !== "object" || depth > 8) return {};
  const record = value as Record<string, unknown>;
  const current = {
    backend: typeof record.backend === "string" ? record.backend : undefined,
    fallback: typeof record.fallback === "string" ? record.fallback : undefined,
    drawCalls: typeof record.drawCalls === "number" ? record.drawCalls : undefined,
    renderSize: Array.isArray(record.renderSize) && record.renderSize.every((entry) => typeof entry === "number")
      ? record.renderSize as readonly number[]
      : undefined
  };
  for (const child of Object.values(record)) {
    const found = findRendererValues(child, depth + 1);
    current.backend ??= found.backend;
    current.fallback ??= found.fallback;
    current.drawCalls = chooseRendererDrawCalls(current.drawCalls, found.drawCalls);
    current.renderSize = chooseRenderSize(current.renderSize, found.renderSize);
  }
  return current;
}

function chooseRendererDrawCalls(current: number | undefined, candidate: number | undefined): number | undefined {
  if (candidate === undefined) return current;
  if (current === undefined) return candidate;
  if (current <= 0 && candidate > 0) return candidate;
  return current;
}

function chooseRenderSize(current: readonly number[] | undefined, candidate: readonly number[] | undefined): readonly number[] | undefined {
  if (!isPositiveRenderSize(candidate)) return current;
  return isPositiveRenderSize(current) ? current : candidate;
}

function isPositiveRenderSize(value: readonly number[] | undefined): boolean {
  return Array.isArray(value) &&
    Number.isInteger(value[0]) &&
    Number.isInteger(value[1]) &&
    (value[0] ?? 0) > 0 &&
    (value[1] ?? 0) > 0;
}

function emptyForeground() {
  return {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    crop: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    nonBlankPixels: 0,
    colorBuckets: 0,
    clipped: false,
    nonBackgroundRatio: 0,
    readabilityScore: 0
  };
}
