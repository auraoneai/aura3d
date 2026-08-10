import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  analyzePng,
  comparePngBuffers,
  comparePngBuffersInRelativeCrop,
  type PngCrop,
  type PngRelativeCrop,
  type PngVisualStats
} from "./showcase-visual-quality";

const EVIDENCE_TIMEOUT_MS = 30_000;
// Deliberately handled mounted-route statuses; see
// tools/showcase-library/route-evidence-status.mjs for the shared policy.
const ACCEPTED_ROUTE_EVIDENCE_STATUS_PATTERN = /^(?:ready|running|playing|completed|unsupported)$/;
const INTERACTION_SCREENSHOT_DIR = resolve("tests/reports/showcase-game-interactions");
const STATIC_REPORT_PATH = resolve("tests/reports/showcase-library-static-gates.json");

type ShowcaseAppId = string;

interface AnimationSubjectDeltaGate {
  readonly relativeCrop: PngRelativeCrop;
  readonly minChangedRatio: number;
  readonly minStrongChangedRatio: number;
  readonly minMeanChannelDelta: number;
}

interface ShowcaseRouteGate {
  readonly primaryAssets: readonly string[];
  readonly primitiveBudget: number;
  readonly requiresTypedPrimaryAssets: boolean;
  readonly requiresKeyboardDelta?: boolean;
  readonly requiresAnimationSubjectDelta?: boolean;
  readonly requiresAuraParticles?: boolean;
  readonly nativeWebGpuAllowed?: boolean;
  readonly animationSubjectDelta?: AnimationSubjectDeltaGate;
}

interface ShowcaseRouteGateDefinition extends ShowcaseRouteGate {
  readonly id: ShowcaseAppId;
  readonly label: string;
  readonly path: string;
  readonly globalName: string;
  readonly published: boolean;
}

interface ShowcaseRouteGateConfig {
  readonly schema: string;
  readonly routes: readonly ShowcaseRouteGateDefinition[];
}

interface ShowcaseRoute {
  readonly path: string;
  readonly appId: ShowcaseAppId;
  readonly globalName: string;
}

const SHOWCASE_ROUTE_GATE_CONFIG_PATH = resolve("tools/showcase-library/route-gates.json");
const SHOWCASE_ROUTE_GATE_CONFIG_TEXT = readFileSync(SHOWCASE_ROUTE_GATE_CONFIG_PATH, "utf8");
const SHOWCASE_ROUTE_GATE_CONFIG_HASH = createHash("sha256").update(SHOWCASE_ROUTE_GATE_CONFIG_TEXT).digest("hex");
const SHOWCASE_ROUTE_GATE_CONFIG = JSON.parse(SHOWCASE_ROUTE_GATE_CONFIG_TEXT) as ShowcaseRouteGateConfig;
const SHOWCASE_ROUTE_GATE_REPORT = {
  path: SHOWCASE_ROUTE_GATE_CONFIG_PATH,
  schema: SHOWCASE_ROUTE_GATE_CONFIG.schema,
  hash: SHOWCASE_ROUTE_GATE_CONFIG_HASH
};
const SHOWCASE_ROUTES: readonly ShowcaseRoute[] = SHOWCASE_ROUTE_GATE_CONFIG.routes
  .filter((route) => route.published)
  .map((route) => ({
    path: route.path,
    appId: route.id,
    globalName: route.globalName
  }));
const requestedScreenshotRouteIds = new Set(
  (process.env.AURA3D_SHOWCASE_SCREENSHOT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const SCREENSHOT_ROUTES = requestedScreenshotRouteIds.size === 0
  ? SHOWCASE_ROUTES
  : SHOWCASE_ROUTES.filter((route) => requestedScreenshotRouteIds.has(route.appId));
const SHOWCASE_ROUTE_GATES: Record<ShowcaseAppId, ShowcaseRouteGateDefinition> = Object.fromEntries(
  SHOWCASE_ROUTE_GATE_CONFIG.routes.map((route) => [route.id, route])
);

interface ShowcaseEvidence {
  readonly status?: string;
  readonly appId?: string;
  readonly frameCount?: number;
  readonly systems?: readonly string[];
  readonly controls?: unknown;
  readonly claimBoundary?: string;
  readonly diagnostics?: unknown;
  readonly routeHealth?: unknown;
  readonly capabilityState?: unknown;
  readonly assets?: unknown;
  readonly asset?: unknown;
  readonly labSet?: unknown;
  readonly runtimeEvidence?: unknown;
}

type EvidenceRecord = Record<string, any>;

function requireAnimationSubjectDeltaGate(appId: ShowcaseAppId): AnimationSubjectDeltaGate {
  const gate = gateByAppId(appId).animationSubjectDelta;
  if (!gate) throw new Error(`Missing animation subject-region pixel delta gate for ${appId}`);
  return gate;
}

interface StaticSourceReport {
  readonly appId: ShowcaseAppId;
  readonly sourceFiles: readonly string[];
  readonly primitiveCalls: number;
  readonly primaryAssets: readonly string[];
  readonly typedAssetRefs: readonly string[];
  readonly unsafePatterns: readonly string[];
  readonly declarations: {
    readonly publishesEvidenceGlobal: boolean;
    readonly hasStatus: boolean;
    readonly hasSystems: boolean;
    readonly hasControls: boolean;
    readonly hasClaimBoundary: boolean;
    readonly hasRouteHealthLikeEvidence: boolean;
    readonly hasAuraParticles: boolean;
    readonly hasNativeWebGpuOverclaim: boolean;
  };
}

interface ManifestAssetProvenance {
  readonly sourcePath?: string;
  readonly sourcePage?: string;
  readonly sourceUrl?: string;
  readonly downloadUrl?: string;
  readonly license?: string;
  readonly licenseName?: string;
  readonly licenseUrl?: string;
  readonly author?: string;
  readonly attribution?: string;
  readonly sha256?: string;
  readonly retrievedAt?: string;
  readonly checkedAt?: string;
}

interface ManifestAssetRecord {
  readonly id?: string;
  readonly source?: string;
  readonly hash?: string;
  readonly provenance?: ManifestAssetProvenance;
}

interface UiLayoutIssue {
  readonly type: "overlap" | "viewport-clipping" | "text-clipping";
  readonly target: string;
  readonly details: string;
}

interface ScreenshotCapture {
  readonly appId: string;
  readonly label: string;
  readonly path: string;
  readonly size: number;
  readonly viewportStats: PngVisualStats;
  readonly canvasStats?: PngVisualStats;
  readonly canvasCrop?: PngCrop;
  readonly uiLayoutIssues: readonly UiLayoutIssue[];
  readonly buffer: Buffer;
}

function hasControls(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function textFromClaimBoundary(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return JSON.stringify(value);
}

function countDeclaredSystems(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function hasRouteHealthLikeEvidence(value: ShowcaseEvidence): boolean {
  return Boolean(value.routeHealth ?? value.diagnostics ?? value.capabilityState ?? value.runtimeEvidence);
}

function evidenceAssetsText(value: ShowcaseEvidence): string {
  return JSON.stringify({
    assets: value.assets,
    asset: value.asset,
    labSet: value.labSet,
    systems: value.systems,
    diagnostics: value.diagnostics,
    runtimeEvidence: value.runtimeEvidence,
    // Routes that consume a typed asset for certified geometry/topology rather
    // than as a rendered model declare it here with its typed ref and hash.
    primaryAssets: (value as Record<string, unknown>).primaryAssets,
    primaryAssetRecords: (value as Record<string, unknown>).primaryAssetRecords
  });
}

function routeByAppId(appId: ShowcaseRoute["appId"]): ShowcaseRoute {
  const route = SHOWCASE_ROUTES.find((entry) => entry.appId === appId);
  if (!route) throw new Error(`Missing showcase route for ${appId}`);
  return route;
}

function gateByAppId(appId: ShowcaseAppId): ShowcaseRouteGateDefinition {
  const gate = SHOWCASE_ROUTE_GATES[appId];
  if (!gate) throw new Error(`Missing showcase route gate for ${appId}`);
  return gate;
}

async function waitForAcceptedEvidence(page: import("@playwright/test").Page, globalName: string): Promise<ShowcaseEvidence> {
  await expect.poll(
    async () => page.evaluate((name) => {
      return (window as unknown as Record<string, ShowcaseEvidence | undefined>)[name];
    }, globalName),
    { timeout: EVIDENCE_TIMEOUT_MS, message: `${globalName} should be published` }
  ).not.toBeUndefined();

  await expect.poll(
    async () => page.evaluate((name) => {
      return (window as unknown as Record<string, ShowcaseEvidence>)[name];
    }, globalName),
    { timeout: EVIDENCE_TIMEOUT_MS, message: `${globalName} should reach an accepted status` }
  ).toMatchObject({ status: expect.stringMatching(ACCEPTED_ROUTE_EVIDENCE_STATUS_PATTERN) });

  return page.evaluate((name) => {
    return (window as unknown as Record<string, ShowcaseEvidence>)[name];
  }, globalName);
}

async function readEvidence(page: Page, globalName: string): Promise<EvidenceRecord> {
  return page.evaluate((name) => {
    return (window as unknown as Record<string, EvidenceRecord>)[name];
  }, globalName);
}

async function openGameRoute(page: Page, server: ExampleDevServer, route: ShowcaseRoute): Promise<EvidenceRecord> {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
  expect(response?.ok(), `${route.path} should respond successfully`).toBe(true);
  const evidence = await waitForAcceptedEvidence(page, route.globalName);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("body").click({ position: { x: 16, y: 16 } });
  await page.waitForTimeout(120);
  return evidence as EvidenceRecord;
}

async function captureInteractionScreenshot(page: Page, appId: string, label: string): Promise<ScreenshotCapture> {
  mkdirSync(INTERACTION_SCREENSHOT_DIR, { recursive: true });
  const path = resolve(INTERACTION_SCREENSHOT_DIR, `${appId}-${label}.png`);
  const uiLayoutIssues = await expectNoMajorUiOverlapOrClipping(page, `${appId} ${label}`);
  const canvasCrop = await largestCanvasCrop(page);
  const buffer = await page.screenshot({ path, fullPage: false, scale: "css" });
  const size = statSync(path).size;
  expect(size, `${appId} ${label} screenshot size`).toBeGreaterThan(8_000);
  const viewportStats = analyzePng(buffer);
  const canvasStats = canvasCrop ? analyzePng(buffer, canvasCrop) : undefined;
  expectReadablePixels(viewportStats, `${appId} ${label} viewport`);
  if (canvasStats) expectReadablePixels(canvasStats, `${appId} ${label} canvas`);
  return { appId, label, path, size, viewportStats, canvasStats, canvasCrop, uiLayoutIssues, buffer };
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
    const rect = candidates[0];
    if (!rect) return undefined;
    const insetX = Math.floor(rect.width * 0.08);
    const insetY = Math.floor(rect.height * 0.08);
    return {
      x: rect.x + insetX,
      y: rect.y + insetY,
      width: Math.max(1, rect.width - insetX * 2),
      height: Math.max(1, rect.height - insetY * 2)
    };
  });
}

function expectReadablePixels(stats: PngVisualStats, label: string): void {
  expect(stats.sampleCount, `${label} sampled pixels`).toBeGreaterThan(1_000);
  expect(stats.opaqueRatio, `${label} opaque pixel ratio`).toBeGreaterThan(0.96);
  expect(stats.uniqueColorBuckets, `${label} color variety`).toBeGreaterThan(18);
  expect(stats.nonBackgroundRatio, `${label} foreground/background separation`).toBeGreaterThan(0.025);
  expect(stats.lumaVariance, `${label} luma variance`).toBeGreaterThan(12);
}

function angularDistanceRadians(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function circularProgressDistance(a: number, b: number): number {
  const delta = Math.abs((((a % 1) + 1) % 1) - (((b % 1) + 1) % 1));
  return Math.min(delta, 1 - delta);
}

interface CanvasDeltaThreshold {
  readonly changedRatio: number;
  readonly meanChannelDelta: number;
  readonly strongChangedRatio?: number;
}

function expectCanvasInteractionDelta(
  diff: ReturnType<typeof comparePngBuffers>,
  label: string,
  threshold: CanvasDeltaThreshold
): void {
  expect(diff.changedRatio, `${label} should visibly change scene pixels`).toBeGreaterThan(threshold.changedRatio);
  expect(diff.meanChannelDelta, `${label} should produce visible channel delta`).toBeGreaterThan(threshold.meanChannelDelta);
  if (threshold.strongChangedRatio !== undefined) {
    expect(diff.strongChangedRatio, `${label} should produce strong scene-pixel changes`).toBeGreaterThan(threshold.strongChangedRatio);
  }
}

async function setRangeValue(page: Page, selector: string, value: string, dispatchChange = false): Promise<void> {
  await page.locator(selector).evaluate((element, { value: nextValue, dispatchChange: shouldDispatchChange }) => {
    const input = element as HTMLInputElement;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (shouldDispatchChange) input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { value, dispatchChange });
}

async function expectNoMajorUiOverlapOrClipping(page: Page, label: string): Promise<readonly UiLayoutIssue[]> {
  const issues = await page.evaluate(() => {
    type Rect = {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
      area: number;
    };
    type Entry = { element: HTMLElement; target: string; rect: Rect; position: string };
    const issues: UiLayoutIssue[] = [];
    const surfaceSelector = [
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
    const textSelector = "button,input,select,textarea,label,[role='button'],[aria-label],.value,.panel__value,.metric,kbd";
    const toRect = (rect: DOMRect): Rect => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      area: Math.max(0, rect.width) * Math.max(0, rect.height)
    });
    const labelFor = (el: HTMLElement): string => {
      const classes = typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}`;
    };
    const isVisible = (el: HTMLElement): boolean => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
    };
    const hasPaint = (el: HTMLElement): boolean => {
      const style = getComputedStyle(el);
      const background = style.backgroundColor;
      const alphaMatch = background.match(/rgba?\(([^)]+)\)/);
      const alpha = alphaMatch ? Number(alphaMatch[1]!.split(",").map((part) => part.trim())[3] ?? "1") : 0;
      const hasBackground = background !== "transparent" && background !== "rgba(0, 0, 0, 0)" && alpha > 0.02;
      const borderWidth =
        Number.parseFloat(style.borderTopWidth || "0") +
        Number.parseFloat(style.borderRightWidth || "0") +
        Number.parseFloat(style.borderBottomWidth || "0") +
        Number.parseFloat(style.borderLeftWidth || "0");
      return hasBackground || borderWidth > 0 || style.boxShadow !== "none" || style.backdropFilter !== "none";
    };
    const intersectionArea = (a: Rect, b: Rect): number => {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    };
    const viewport: Rect = {
      left: 0,
      top: 0,
      right: innerWidth,
      bottom: innerHeight,
      width: innerWidth,
      height: innerHeight,
      area: innerWidth * innerHeight
    };
    const surfaces: Entry[] = Array.from(document.querySelectorAll<HTMLElement>(surfaceSelector))
      .filter((el) => !el.querySelector("canvas") && isVisible(el))
      .filter((el) => hasPaint(el) || Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement).every((child) => !isVisible(child)))
      .map((element) => ({
        element,
        target: labelFor(element),
        rect: toRect(element.getBoundingClientRect()),
        position: getComputedStyle(element).position
      }))
      .filter((entry) => entry.rect.area >= 64 && intersectionArea(entry.rect, viewport) > 0);

    for (const entry of surfaces) {
      const visibleRatio = intersectionArea(entry.rect, viewport) / entry.rect.area;
      const horizontalClip = entry.rect.left < -6 || entry.rect.right > innerWidth + 6;
      const topClip = entry.rect.top < -6;
      const bottomClip = /^(absolute|fixed|sticky)$/.test(entry.position) && entry.rect.bottom > innerHeight + 6;
      if (visibleRatio > 0.2 && (horizontalClip || topClip || bottomClip)) {
        issues.push({ type: "viewport-clipping", target: entry.target, details: JSON.stringify(entry.rect) });
      }
    }

    for (let i = 0; i < surfaces.length; i += 1) {
      for (let j = i + 1; j < surfaces.length; j += 1) {
        const a = surfaces[i]!;
        const b = surfaces[j]!;
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const area = intersectionArea(a.rect, b.rect);
        if (area > 96 && area / Math.min(a.rect.area, b.rect.area) > 0.08) {
          issues.push({ type: "overlap", target: `${a.target} <> ${b.target}`, details: `intersection=${Math.round(area)}` });
        }
      }
    }

    for (const el of Array.from(document.querySelectorAll<HTMLElement>(textSelector)).filter(isVisible)) {
      const style = getComputedStyle(el);
      const ownsBox = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.getAttribute("role") === "button";
      const clipsX = el.scrollWidth > el.clientWidth + 2 && (ownsBox || /^(hidden|clip)$/.test(style.overflowX));
      const clipsY = el.scrollHeight > el.clientHeight + 2 && (ownsBox || /^(hidden|clip)$/.test(style.overflowY));
      if (clipsX || clipsY) {
        issues.push({
          type: "text-clipping",
          target: labelFor(el),
          details: `${el.clientWidth}x${el.clientHeight} scroll=${el.scrollWidth}x${el.scrollHeight}`
        });
      }
    }

    return issues;
  });
  expect(issues, `${label} should not have major UI overlap or clipping`).toEqual([]);
  return issues;
}

function readShowcaseSourceFiles(appId: ShowcaseAppId): readonly { readonly path: string; readonly text: string }[] {
  const appDir = resolve("apps", appId);
  if (!existsSync(appDir)) return [];
  const files = walkFiles(appDir)
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|html|md)$/.test(file))
    .filter((file) => !file.includes(`${join("dist")}${"/"}`));
  return files.map((file) => ({ path: file, text: readFileSync(file, "utf8") }));
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
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

function createStaticSourceReport(route: ShowcaseRoute): StaticSourceReport {
  const gate = gateByAppId(route.appId);
  const sourceFiles = readShowcaseSourceFiles(route.appId);
  const sourceText = sourceFiles.map((file) => file.text).join("\n");
  const unsafePatterns = [
    { id: "model-string-id", pattern: /\bmodel\s*\(\s*["'`][^"'`]+["'`]/ },
    { id: "unsafe-model-url", pattern: /\bunsafeModelUrl\s*\(/ },
    { id: "gltf-loader", pattern: /\bGLTFLoader\b/ },
    { id: "three-import", pattern: /\bfrom\s+["']three(?:\/[^"']*)?["']|\bimport\s+["']three(?:\/[^"']*)?["']/ },
    { id: "three-namespace", pattern: /\bnew\s+THREE\./ },
    { id: "raw-remote-gltf", pattern: /https?:\/\/[^\s"'`]+\.g(?:lb|ltf)\b/i },
    { id: "route-local-webgpu", pattern: /\b(?:navigator\.gpu|requestAdapter|requestDevice|dispatchWorkgroups|GPUComputePipeline|WebGPURenderer)\b/ },
    { id: "dom-particle-stand-in", pattern: /\b(?:createElement|innerHTML|className|classList)\b[\s\S]{0,100}\bparticle\b/i }
  ].filter((entry) => entry.pattern.test(sourceText)).map((entry) => entry.id);

  const typedAssetRefs = Array.from(sourceText.matchAll(/\bassets\.([A-Za-z0-9_]+)/g)).map((match) => match[1] ?? "").filter(Boolean);
  const primaryAssets = gate.primaryAssets.filter((asset) => typedAssetRefs.includes(asset));
  const primitiveCalls = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_]+\s*\(/g)).length;
  const hasNativeWebGpuOverclaim = sourceFiles.some((file) =>
    file.text.split(/\r?\n/).some((line) =>
      /\b(?:native WebGPU|WebGPU compute|GPU-compute particle simulation|compute shader)\b/i.test(line) &&
      // Explicit non-claims and absence statements are not overclaims.
      !/\b(?:no native|does not claim|not claim|not include|n\/a|not a native|fallback|absent|unproven|unsupported|missing|blocked|without)\b/i.test(line)
    )
  );

  return {
    appId: route.appId,
    sourceFiles: sourceFiles.map((file) => file.path),
    primitiveCalls,
    primaryAssets,
    typedAssetRefs: Array.from(new Set(typedAssetRefs)).sort(),
    unsafePatterns,
    declarations: {
      // Routes publish either as `window.<GLOBAL> = ...` or through
      // `Object.defineProperty(window, "<GLOBAL>", ...)`. Both are real
      // publication; only the second form is non-writable-by-default.
      publishesEvidenceGlobal: sourceText.includes(`window.${route.globalName}`)
        || sourceText.includes(`defineProperty(window, "${route.globalName}"`)
        || sourceText.includes(`defineProperty(window, '${route.globalName}'`),
      hasStatus: /\bstatus\s*:/.test(sourceText),
      hasSystems: /\bsystems\s*:/.test(sourceText) || /\bsystems\s*=/.test(sourceText),
      hasControls: /\bcontrols\s*:/.test(sourceText) || /\bcontrols\s*=/.test(sourceText),
      hasClaimBoundary: /\bclaimBoundary\s*:/.test(sourceText) || /\bclaimBoundary\s*=/.test(sourceText),
      hasRouteHealthLikeEvidence: /\b(?:routeHealth|diagnostics|capabilityState|runtimeEvidence|app\.evidence)\b/.test(sourceText),
      hasAuraParticles: /\beffects\.particles\s*\(/.test(sourceText),
      hasNativeWebGpuOverclaim
    }
  };
}

function readGeneratedAssetKeys(): ReadonlySet<string> {
  const generated = readFileSync(resolve("src/aura-assets.ts"), "utf8");
  return new Set(Array.from(generated.matchAll(/"([A-Za-z0-9_]+)"\s*:/g)).map((match) => match[1] ?? "").filter(Boolean));
}

function readManifestAssets(): ReadonlyMap<string, ManifestAssetRecord> {
  const manifest = JSON.parse(readFileSync(resolve("aura.assets.json"), "utf8")) as { assets?: readonly ManifestAssetRecord[] };
  return new Map(
    (manifest.assets ?? [])
      .filter((asset): asset is ManifestAssetRecord & { id: string } => Boolean(asset.id))
      .map((asset) => [asset.id, asset])
  );
}

function primaryAssetProvenanceIssues(asset: ManifestAssetRecord | undefined): readonly string[] {
  if (!asset) return ["missing manifest entry"];
  const provenance = asset.provenance;
  if (!provenance) return ["missing provenance"];
  const issues: string[] = [];
  const has = (value: string | undefined): boolean => Boolean(value?.trim());

  if (!has(provenance.sourcePage)) issues.push("missing sourcePage");
  if (!has(provenance.downloadUrl)) issues.push("missing downloadUrl");
  if (!has(provenance.license)) issues.push("missing license");
  if (!has(provenance.licenseName)) issues.push("missing licenseName");
  if (!has(provenance.licenseUrl)) issues.push("missing licenseUrl");
  if (!has(provenance.author) && !has(provenance.attribution)) issues.push("missing author/attribution");
  if (!has(provenance.retrievedAt)) issues.push("missing retrievedAt");
  if (!has(provenance.checkedAt)) issues.push("missing checkedAt");
  if (!has(provenance.sha256) && !has(asset.hash)) issues.push("missing sha256/hash");
  const provenancePathText = [asset.source, provenance.sourcePath].filter(Boolean).join(" ");
  if (/(?:^|[/\\])(?:var[/\\]folders|tmp|temp|private[/\\]var[/\\]folders)(?:[/\\]|$)|aura3d-resolve-/i.test(provenancePathText)) {
    issues.push("temp sourcePath");
  }

  return issues;
}

/**
 * Pause and settle every Aura3D app on the page to a deterministic frame.
 *
 * Returns the number of apps settled. Zero means the route mounted no app through `createAuraApp`
 * (or predates the registry), in which case the capture falls back to whatever the page shows and the
 * caller is told, rather than silently recording an unstable frame.
 */
async function settleMountedApps(page: Page, steps = 30, dt = 1 / 60): Promise<number> {
  const count = await page.evaluate(([settleSteps, settleDt]) => {
    const registry = (globalThis as {
      __AURA3D_LIVE_APPS__?: { settle(steps?: number, dt?: number): number };
    }).__AURA3D_LIVE_APPS__;
    if (!registry || typeof registry.settle !== "function") return 0;
    return registry.settle(settleSteps, settleDt);
  }, [steps, dt] as const);
  // Let the paused state paint before the screenshot is taken.
  await page.waitForTimeout(120);
  return count;
}

test.describe("showcase library", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("static showcase source gates reject unsafe assets, primitive creep, missing declarations, and overclaims", async () => {
    const generatedAssetKeys = readGeneratedAssetKeys();
    const manifestAssets = readManifestAssets();
    const reports = SHOWCASE_ROUTES.map(createStaticSourceReport);

    for (const report of reports) {
      const gate = gateByAppId(report.appId);
      expect(report.sourceFiles.length, `${report.appId} source files`).toBeGreaterThan(0);
      expect(report.unsafePatterns, `${report.appId} unsafe source patterns`).toEqual([]);
      expect(report.primitiveCalls, `${report.appId} primitive budget`).toBeLessThanOrEqual(gate.primitiveBudget);
      expect(report.declarations.publishesEvidenceGlobal, `${report.appId} evidence global declaration`).toBe(true);
      expect(report.declarations.hasStatus, `${report.appId} route-health status declaration`).toBe(true);
      expect(report.declarations.hasSystems || report.appId === "showcase-index", `${report.appId} systems declaration`).toBe(true);
      expect(report.declarations.hasControls || report.appId === "showcase-index", `${report.appId} controls declaration`).toBe(true);
      expect(report.declarations.hasClaimBoundary || report.appId === "showcase-index", `${report.appId} claim boundary declaration`).toBe(true);
      expect(report.declarations.hasRouteHealthLikeEvidence || report.appId === "showcase-index", `${report.appId} route-health evidence declaration`).toBe(true);
      expect(report.declarations.hasNativeWebGpuOverclaim, `${report.appId} native WebGPU/compute overclaim`).toBe(false);

      if (gate.requiresTypedPrimaryAssets) {
        expect(report.primaryAssets, `${report.appId} typed primary assets used in source`).toEqual([...gate.primaryAssets]);
        for (const asset of gate.primaryAssets) {
          expect(generatedAssetKeys.has(asset), `${report.appId} generated typed asset ${asset}`).toBe(true);
          expect(manifestAssets.has(asset), `${report.appId} manifest asset ${asset}`).toBe(true);
          expect(primaryAssetProvenanceIssues(manifestAssets.get(asset)), `${report.appId} durable provenance for ${asset}`).toEqual([]);
        }
      }
      if (gate.requiresAnimationSubjectDelta) {
        expect(gate.animationSubjectDelta, `${report.appId} animation subject-region gate`).toBeTruthy();
      }
      if (gate.requiresAuraParticles) {
        expect(report.declarations.hasAuraParticles, `${report.appId} Aura3D particles`).toBe(true);
      }
    }

    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      STATIC_REPORT_PATH,
      `${JSON.stringify({ schema: "aura3d-showcase-library-static-gates", pass: true, gateConfig: SHOWCASE_ROUTE_GATE_REPORT, reports }, null, 2)}\n`
    );
  });

  test("all showcase routes expose evidence and boot without page errors", async ({ page }) => {
    const results = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const badResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });

    for (const route of SHOWCASE_ROUTES) {
      const response = await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
      expect(response?.ok(), `${route.path} should respond successfully`).toBe(true);

      const snapshot = await waitForAcceptedEvidence(page, route.globalName);

      expect(snapshot.status, `${route.path} status`).toMatch(ACCEPTED_ROUTE_EVIDENCE_STATUS_PATTERN);
      expect(snapshot.appId ?? route.appId, `${route.path} app id`).toBeTruthy();
      if (route.appId !== "showcase-index") {
        const gate = gateByAppId(route.appId);
        const claimBoundary = textFromClaimBoundary(snapshot.claimBoundary);
        // Routes declare `systems` either as a string array or as a
        // subsystem->implementation record. Both are valid declarations.
        expect(countDeclaredSystems(snapshot.systems), `${route.path} systems`).toBeGreaterThan(0);
        expect(hasControls(snapshot.controls), `${route.path} controls`).toBe(true);
        expect(claimBoundary, `${route.path} claim boundary`).toBeTruthy();
        expect(hasRouteHealthLikeEvidence(snapshot), `${route.path} route-health-like evidence`).toBe(true);
        if (gate.requiresTypedPrimaryAssets) {
          const assetText = evidenceAssetsText(snapshot);
          for (const asset of gate.primaryAssets) {
            expect(assetText, `${route.path} typed primary asset ${asset}`).toMatch(new RegExp(`(?:assets\\.${asset}|["']id["']\\s*:\\s*["']${asset}["'])`));
          }
        }
        if (!gate.nativeWebGpuAllowed) {
          expect(claimBoundary, `${route.path} should not claim native WebGPU`).not.toMatch(/\bnative WebGPU\b/i);
          expect(claimBoundary, `${route.path} should not claim WebGPU compute`).not.toMatch(/\bWebGPU compute\b/i);
        }
        if (gate.requiresAuraParticles) {
          const evidenceText = JSON.stringify(snapshot);
          expect(evidenceText, `${route.path} particle evidence should name Aura3D particle APIs`).toMatch(/effects\.particles|particles\.diagnostics|activeAura3DParticles/);
          expect(evidenceText, `${route.path} should not expose native compute dispatch proof unless allowed`).not.toMatch(/"dispatches"\s*:\s*[1-9]/i);
        }
      }

      results.push({
        path: route.path,
        appId: route.appId,
        globalName: route.globalName,
        gate: gateByAppId(route.appId),
        evidence: snapshot
      });
    }

    expect(badResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/showcase-library-route-health.json"),
      `${JSON.stringify({ schema: "aura3d-showcase-library-route-health", pass: true, gateConfig: SHOWCASE_ROUTE_GATE_REPORT, routes: results }, null, 2)}\n`
    );
  });

  test("app routes produce desktop and mobile screenshot artifacts", async ({ page }) => {
    const screenshotDir = resolve("tests/reports/showcase-library-screenshots");
    mkdirSync(screenshotDir, { recursive: true });
    const captures = [];
    const viewports = [
      { label: "desktop", width: 1440, height: 900 },
      { label: "mobile", width: 390, height: 740 }
    ] as const;

    for (const route of SCREENSHOT_ROUTES.filter((entry) => entry.appId !== "showcase-index")) {
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
        expect(response?.ok(), `${route.path} should respond successfully`).toBe(true);
        await waitForAcceptedEvidence(page, route.globalName);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        /*
         * Settle every mounted app to a *named* frame before capturing.
         *
         * These screenshots are what the human visual-review gate binds approval to by sha256. But
         * most showcase routes run a continuous frame loop with live telemetry in the HUD, and the
         * capture used to be `waitForTimeout` plus `page.screenshot` — so it photographed whatever
         * frame the loop happened to reach. Measured: re-running this spec with **no code change**
         * produced different bytes for 14 of 29 screenshots, which made the approval gate
         * unsatisfiable rather than strict. Every regeneration invalidated a still-correct signature,
         * so the only way to keep it green was never to re-run, and it went red before 1.5.2.
         *
         * `auraAppRegistry.settle(steps, dt)` pauses each app and advances it by a fixed number of
         * fixed-size steps, so the same route always lands on the same state. Requires no per-route
         * opt-in: apps self-register on creation.
         */
        const settled = await settleMountedApps(page);
        const uiLayoutIssues = await expectNoMajorUiOverlapOrClipping(page, `${route.appId} ${viewport.label}`);
        const canvasCrop = await largestCanvasCrop(page);
        const screenshotPath = resolve(screenshotDir, `${route.appId}-${viewport.label}.png`);
        const buffer = await page.screenshot({ path: screenshotPath, fullPage: false, scale: "css" });
        const size = statSync(screenshotPath).size;
        expect(size, `${route.appId} ${viewport.label} screenshot size`).toBeGreaterThan(8_000);
        const viewportStats = analyzePng(buffer);
        const canvasStats = canvasCrop ? analyzePng(buffer, canvasCrop) : undefined;
        expectReadablePixels(viewportStats, `${route.appId} ${viewport.label} viewport screenshot`);
        expect(canvasStats, `${route.appId} ${viewport.label} should expose a visible Aura3D canvas`).toBeTruthy();
        if (canvasStats) expectReadablePixels(canvasStats, `${route.appId} ${viewport.label} canvas crop`);
        captures.push({
          appId: route.appId,
          viewport: viewport.label,
          path: screenshotPath,
          size,
          viewportStats,
          canvasStats,
          uiLayoutIssues
        });
      }
    }

    writeFileSync(
      resolve("tests/reports/showcase-library-screenshots.json"),
      `${JSON.stringify({ schema: "aura3d-showcase-library-screenshots", pass: true, gateConfig: SHOWCASE_ROUTE_GATE_REPORT, captures }, null, 2)}\n`
    );
  });

  test("non-game routes change scene state and telemetry through meaningful controls", async ({ page }) => {
    const captures = [];
    const interactions = [];

    const productRoute = routeByAppId("showcase-product-configurator");
    const productBefore = await openGameRoute(page, server, productRoute);
    const productBeforeCapture = await captureInteractionScreenshot(page, productRoute.appId, "before-controls");
    captures.push(withoutBuffer(productBeforeCapture));
    await page.locator("[data-variant='ceramic']").click();
    await page.locator("[data-finish='titanium']").click();
    await page.locator("[data-focus='cushions']").click();
    await page.locator("#toggle-turntable").click();
    await page.locator("#toggle-exploded").click();
    await page.waitForTimeout(500);
    const productAfter = await readEvidence(page, productRoute.globalName);
    const productAfterCapture = await captureInteractionScreenshot(page, productRoute.appId, "after-controls");
    captures.push(withoutBuffer(productAfterCapture));
    const productDiff = comparePngBuffers(productBeforeCapture.buffer, productAfterCapture.buffer, productBeforeCapture.canvasCrop);
    expect(productAfter.state).toMatchObject({ variant: "ceramic", finish: "titanium", focus: "cushions", exploded: true });
    expect(productAfter.interactionState?.lastChanged, "Product configurator should publish the last changed control").toBe("exploded:on");
    expect(Number(productAfter.interactionState?.revision), "Product configurator interaction revision should advance").toBeGreaterThan(Number(productBefore.interactionState?.revision ?? -1));
    expect(productAfter.telemetry, "Product configurator should publish interaction telemetry").toMatchObject({
      focus: "cushions",
      exploded: true,
      turntable: true
    });
    expect(productAfter.telemetry?.materialOverride, "Product configurator material override should follow selected finish").toBe("Ceramic Pearl brushed titanium override");
    expect(Number(productAfter.telemetry?.nodeCount), "Product configurator exploded mode should add scene nodes").toBeGreaterThan(Number(productBefore.telemetry?.nodeCount ?? 0));
    expectCanvasInteractionDelta(productDiff, productRoute.appId, { changedRatio: 0.015, meanChannelDelta: 0.8, strongChangedRatio: 0.003 });
    interactions.push({ appId: productRoute.appId, before: productBefore.state, after: productAfter.state, telemetry: productAfter.telemetry, screenshotDelta: productDiff });

    const materialRoute = routeByAppId("showcase-material-asset-inspector");
    const materialBefore = await openGameRoute(page, server, materialRoute);
    const materialBeforeCapture = await captureInteractionScreenshot(page, materialRoute.appId, "before-controls");
    captures.push(withoutBuffer(materialBeforeCapture));
    await page.locator("[data-view='exploded']").click();
    await page.locator("[data-lighting='glass']").click();
    await page.waitForTimeout(500);
    const materialAfter = await readEvidence(page, materialRoute.globalName);
    const materialAfterCapture = await captureInteractionScreenshot(page, materialRoute.appId, "after-controls");
    captures.push(withoutBuffer(materialAfterCapture));
    const materialDiff = comparePngBuffers(materialBeforeCapture.buffer, materialAfterCapture.buffer, materialBeforeCapture.canvasCrop);
    expect(materialAfter.state).toMatchObject({ view: "exploded", lighting: "glass" });
    expect(materialAfter.interactionState?.lastChanged, "Material inspector should publish the last changed control").toBe("lighting:glass");
    expect(Number(materialAfter.interactionState?.revision), "Material inspector interaction revision should advance").toBeGreaterThan(Number(materialBefore.interactionState?.revision ?? -1));
    expect(materialAfter.telemetry, "Material inspector should publish interaction telemetry").toMatchObject({ view: "exploded", lighting: "glass" });
    expect(Number(materialAfter.telemetry?.nodeCount), "Material inspector exploded view should change scene node telemetry").not.toBe(Number(materialBefore.telemetry?.nodeCount ?? -1));
    expect(Number(materialAfter.telemetry?.labelCount), "Material inspector exploded view should add label evidence").toBeGreaterThanOrEqual(Number(materialBefore.telemetry?.labelCount ?? 0));
    expect(materialAfter.materialVisualQA, "Material inspector should publish material visual QA").toBeTruthy();
    expectCanvasInteractionDelta(materialDiff, materialRoute.appId, { changedRatio: 0.012, meanChannelDelta: 0.7, strongChangedRatio: 0.0025 });
    interactions.push({ appId: materialRoute.appId, before: materialBefore.state, after: materialAfter.state, telemetry: materialAfter.telemetry, screenshotDelta: materialDiff });

    const dataRoute = routeByAppId("showcase-data-galaxy");
    const dataBefore = await openGameRoute(page, server, dataRoute);
    const dataBeforeCapture = await captureInteractionScreenshot(page, dataRoute.appId, "before-controls");
    captures.push(withoutBuffer(dataBeforeCapture));
    await page.locator("[data-formation='network']").click();
    await page.locator("[data-camera='flythrough']").click();
    await setRangeValue(page, "#dg-count", "360");
    await setRangeValue(page, "#dg-speed", "2.4");
    await page.locator("#dg-performance").selectOption("dense");
    await page.locator("#dg-connections").setChecked(true);
    await page.waitForTimeout(550);
    const dataAfter = await readEvidence(page, dataRoute.globalName);
    const dataAfterCapture = await captureInteractionScreenshot(page, dataRoute.appId, "after-controls");
    captures.push(withoutBuffer(dataAfterCapture));
    const dataDiff = comparePngBuffers(dataBeforeCapture.buffer, dataAfterCapture.buffer, dataBeforeCapture.canvasCrop);
    expect(dataAfter.controls).toMatchObject({
      formation: "network",
      cameraMode: "flythrough",
      particleCount: 360,
      speed: 2.4,
      performance: "dense",
      connections: true
    });
    expect(dataAfter.interactionState?.lastChanged, "Data Galaxy should publish the final control change").toBe("connections:on");
    expect(dataAfter.telemetry, "Data Galaxy should publish control telemetry").toMatchObject({
      formation: "network",
      cameraMode: "flythrough",
      requestedParticles: 360,
      speed: 2.4,
      connections: true
    });
    expect(Number(dataAfter.telemetry?.effectiveParticles), "Data Galaxy effective particle budget should increase").toBeGreaterThan(Number(dataBefore.telemetry?.effectiveParticles ?? 0));
    expect(Number(dataAfter.telemetry?.nodeCount), "Data Galaxy connection arcs should update scene nodes").toBeGreaterThan(Number(dataBefore.telemetry?.nodeCount ?? 0));
    expectCanvasInteractionDelta(dataDiff, dataRoute.appId, { changedRatio: 0.01, meanChannelDelta: 0.6, strongChangedRatio: 0.002 });
    interactions.push({ appId: dataRoute.appId, before: dataBefore.controls, after: dataAfter.controls, telemetry: dataAfter.telemetry, screenshotDelta: dataDiff });

    const cityRoute = routeByAppId("showcase-smart-city-control");
    const cityBefore = await openGameRoute(page, server, cityRoute);
    const cityBeforeCapture = await captureInteractionScreenshot(page, cityRoute.appId, "before-controls");
    captures.push(withoutBuffer(cityBeforeCapture));
    await page.locator("[data-district='harbor']").click();
    await page.locator("[data-camera='street']").click();
    await page.locator("#city-day-night").click();
    await page.locator("#city-traffic").click();
    await setRangeValue(page, "#city-alert", "85");
    await page.waitForTimeout(550);
    const cityAfter = await readEvidence(page, cityRoute.globalName);
    const cityAfterCapture = await captureInteractionScreenshot(page, cityRoute.appId, "after-controls");
    captures.push(withoutBuffer(cityAfterCapture));
    const cityDiff = comparePngBuffers(cityBeforeCapture.buffer, cityAfterCapture.buffer, cityBeforeCapture.canvasCrop);
    expect(cityAfter.controls).toMatchObject({ district: "harbor", cameraMode: "street", timeOfDay: "day", traffic: false, alertLevel: 85 });
    expect(cityAfter.interactionState).toMatchObject({ lastChanged: "alert-level", selectedDistrict: "harbor", cameraMode: "street" });
    expect(Number(cityAfter.telemetry?.alertLevel), "Smart City telemetry alert level should follow the slider").toBe(85);
    expect(Number(cityAfter.telemetry?.mobility), "Smart City mobility telemetry should react to traffic and alerts").toBeLessThan(Number(cityBefore.telemetry?.mobility));
    expect(Number(cityAfter.telemetry?.energyMw), "Smart City energy telemetry should react to alert/day state").toBeGreaterThan(Number(cityBefore.telemetry?.energyMw));
    expect(cityAfter.diagnostics?.district, "Smart City diagnostics should track selected district").toBe("harbor");
    expectCanvasInteractionDelta(cityDiff, cityRoute.appId, { changedRatio: 0.02, meanChannelDelta: 1.0, strongChangedRatio: 0.004 });
    interactions.push({ appId: cityRoute.appId, before: cityBefore.controls, after: cityAfter.controls, telemetry: cityAfter.telemetry, screenshotDelta: cityDiff });

    const architectureRoute = routeByAppId("showcase-cinematic-architecture");
    const architectureBefore = await openGameRoute(page, server, architectureRoute);
    const architectureBeforeCapture = await captureInteractionScreenshot(page, architectureRoute.appId, "before-controls");
    captures.push(withoutBuffer(architectureBeforeCapture));
    await page.locator("[data-mood='nocturne']").click();
    await page.locator("[data-path='balcony']").click();
    await setRangeValue(page, "#haze-control", "100", true);
    await page.waitForTimeout(600);
    const architectureAfter = await readEvidence(page, architectureRoute.globalName);
    const architectureAfterCapture = await captureInteractionScreenshot(page, architectureRoute.appId, "after-controls");
    captures.push(withoutBuffer(architectureAfterCapture));
    const architectureDiff = comparePngBuffers(architectureBeforeCapture.buffer, architectureAfterCapture.buffer, architectureBeforeCapture.canvasCrop);
    expect(architectureAfter.controls).toMatchObject({ mood: "nocturne", cameraPath: "balcony", haze: 100 });
    expect(architectureAfter.interactionState?.lastChanged, "Architecture route should publish the final control change").toBe("haze:100");
    expect(Number(architectureAfter.interactionState?.revision), "Architecture route interaction revision should advance").toBeGreaterThan(Number(architectureBefore.interactionState?.revision ?? -1));
    expect(architectureAfter.telemetry, "Architecture route should publish interaction telemetry").toMatchObject({
      mood: "nocturne",
      cameraPath: "balcony",
      haze: 100,
      hazeDensity: 0.018
    });
    expect(Number(architectureAfter.telemetry?.effectNodes), "Architecture route should keep scoped effect telemetry").toBeGreaterThanOrEqual(3);
    expect(Number(architectureAfter.routeHealth?.drawCalls), "Architecture route should keep renderer telemetry").toBeGreaterThan(0);
    expectCanvasInteractionDelta(architectureDiff, architectureRoute.appId, { changedRatio: 0.02, meanChannelDelta: 1.0, strongChangedRatio: 0.004 });
    interactions.push({ appId: architectureRoute.appId, before: architectureBefore.controls, after: architectureAfter.controls, telemetry: architectureAfter.telemetry, screenshotDelta: architectureDiff });

    const opsRoute = routeByAppId("showcase-digital-twin-ops");
    const opsBefore = await openGameRoute(page, server, opsRoute);
    const opsBeforeCapture = await captureInteractionScreenshot(page, opsRoute.appId, "before-controls");
    captures.push(withoutBuffer(opsBeforeCapture));
    await page.locator("[data-zone='dock']").click();
    await page.locator("#inject-alert").click();
    await page.waitForTimeout(650);
    const opsAfter = await readEvidence(page, opsRoute.globalName);
    const opsAfterCapture = await captureInteractionScreenshot(page, opsRoute.appId, "after-controls");
    captures.push(withoutBuffer(opsAfterCapture));
    const opsDiff = comparePngBuffers(opsBeforeCapture.buffer, opsAfterCapture.buffer, opsBeforeCapture.canvasCrop);
    const beforeDock = (opsBefore.zones ?? []).find((zone: any) => zone.id === "dock");
    const afterDock = (opsAfter.zones ?? []).find((zone: any) => zone.id === "dock");
    expect(opsAfter.selectedZone, "Digital Twin selected zone should change").toBe("dock");
    expect(opsAfter.mode, "Digital Twin alert should switch incident mode").toBe("incident");
    expect(Number(opsAfter.alerts), "Digital Twin alert count should increase").toBeGreaterThan(Number(opsBefore.alerts ?? -1));
    expect(Number(afterDock?.incidents), "Digital Twin selected zone should record incident").toBeGreaterThan(Number(beforeDock?.incidents ?? -1));
    expect(Number(afterDock?.temperature), "Digital Twin selected zone temperature should change").toBeGreaterThan(Number(beforeDock?.temperature ?? 0));
    expect(opsAfter.runtimeNodeIds ?? [], "Digital Twin should expose runtime motion nodes").toEqual(
      // The articulated arm is the typed welding-workcell asset, not a primitive rig.
      expect.arrayContaining(["ops-conveyor-motion", "ops-typed-welding-workcell", "ops-sensor-sweep", "ops-selected-zone-ring", "ops-alarm-beacon", "ops-moving-workpiece-1"])
    );
    expect(Number(opsAfter.motionProof?.sensorSweepRadians), "Digital Twin motion telemetry should keep updating").not.toBe(Number(opsBefore.motionProof?.sensorSweepRadians));
    expectCanvasInteractionDelta(opsDiff, opsRoute.appId, { changedRatio: 0.006, meanChannelDelta: 0.35, strongChangedRatio: 0.0015 });
    interactions.push({ appId: opsRoute.appId, before: { selectedZone: opsBefore.selectedZone, alerts: opsBefore.alerts }, after: { selectedZone: opsAfter.selectedZone, alerts: opsAfter.alerts, mode: opsAfter.mode }, telemetry: opsAfter.motionProof, screenshotDelta: opsDiff });

    const particleRoute = routeByAppId("showcase-webgpu-particle-lab");
    const particleBefore = await openGameRoute(page, server, particleRoute);
    const particleBeforeCapture = await captureInteractionScreenshot(page, particleRoute.appId, "before-controls");
    captures.push(withoutBuffer(particleBeforeCapture));
    await page.locator("[data-mode='fountain']").click();
    await setRangeValue(page, "#density-control", "900");
    await page.waitForTimeout(500);
    const particleAfter = await readEvidence(page, particleRoute.globalName);
    const particleAfterCapture = await captureInteractionScreenshot(page, particleRoute.appId, "after-controls");
    captures.push(withoutBuffer(particleAfterCapture));
    const particleDiff = comparePngBuffers(particleBeforeCapture.buffer, particleAfterCapture.buffer, particleBeforeCapture.canvasCrop);
    expect(particleBefore.capabilityState?.activeAura3DParticles, "Particle lab should start with Aura3D particles active").toBe(true);
    expect(particleAfter.capabilityState?.activeAura3DParticles, "Particle lab should keep Aura3D particles active").toBe(true);
    expect(particleAfter.controls).toMatchObject({ mode: "fountain", density: 900 });
    expect(Number(particleAfter.performance?.visualParticleCount), "Particle lab visual particle budget should increase").toBeGreaterThan(Number(particleBefore.performance?.visualParticleCount));
    expect(particleAfter.labSet?.typedRef, "Particle lab should use typed particle core asset").toBe("assets.showcaseParticleCore");
    expect(textFromClaimBoundary(particleAfter.claimBoundary), "Particle lab should not claim native WebGPU").not.toMatch(/\bnative WebGPU\b/i);
    expectCanvasInteractionDelta(particleDiff, particleRoute.appId, { changedRatio: 0.01, meanChannelDelta: 0.7, strongChangedRatio: 0.003 });
    interactions.push({ appId: particleRoute.appId, before: particleBefore.controls, after: particleAfter.controls, telemetry: particleAfter.performance, screenshotDelta: particleDiff });

    writeFileSync(
      resolve("tests/reports/showcase-non-game-interactions.json"),
      `${JSON.stringify({ schema: "aura3d-showcase-non-game-interactions", pass: true, gateConfig: SHOWCASE_ROUTE_GATE_REPORT, captures, interactions }, null, 2)}\n`
    );
  });

  test("game routes respond to keyboard input and publish animation/framing evidence", async ({ page }) => {
    const captures = [];
    const games = [];

    const blockfall = routeByAppId("showcase-blockfall-reactor");
    const blockfallBefore = await openGameRoute(page, server, blockfall);
    const blockfallBeforeCapture = await captureInteractionScreenshot(page, blockfall.appId, "before-keys");
    captures.push(withoutBuffer(blockfallBeforeCapture));
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(320);
    await page.keyboard.up("ArrowDown");
    await page.waitForTimeout(450);
    const blockfallAfter = await readEvidence(page, blockfall.globalName);
    const blockfallAfterCapture = await captureInteractionScreenshot(page, blockfall.appId, "after-keys");
    captures.push(withoutBuffer(blockfallAfterCapture));
    const blockfallDiff = comparePngBuffers(blockfallBeforeCapture.buffer, blockfallAfterCapture.buffer, blockfallBeforeCapture.canvasCrop);
    expect(blockfallAfter.current?.checksum, "Blockfall checksum should change after keys").not.toBe(blockfallBefore.current?.checksum);
    expect(Number(blockfallAfter.frameCount), "Blockfall frame count should advance").toBeGreaterThan(Number(blockfallBefore.frameCount ?? 0));
    expect(Number(blockfallAfter.live?.visibleLockedCells ?? 0), "Blockfall should expose locked-cell evidence").toBeGreaterThanOrEqual(0);
    expect(blockfallAfter.current?.hold, "Blockfall hold should be exercised by keyboard input").toBeTruthy();
    expect(blockfallAfter.lineClearProof?.passed, "Blockfall should publish deterministic line-clear proof").toBe(true);
    expect(Number(blockfallAfter.lineClearProof?.clearedLines ?? 0), "Blockfall line-clear proof should clear a line").toBe(1);
    expect(blockfallAfter.replay?.replayChecksum, "Blockfall should publish deterministic replay checksum").toMatch(/^[a-f0-9]{8}$/i);
    expect(blockfallAfter.kitContractProof, "Blockfall should publish public game.fallingBlocks contract proof").toMatchObject({
      kind: "aura-game-falling-blocks-kit-browser-contract",
      source: "game.fallingBlocks",
      moveChangesX: true,
      rotateChangesRotation: true,
      holdStoresPiece: true,
      softDropMovesDown: true,
      hardDropLocksPiece: true,
      lineClear: true,
      replayRecordsActions: true,
      replayChecksumStable: true,
      linesAfterClear: 1
    });
    expect(blockfallAfter.kitContractProof?.eventTypes ?? [], "Blockfall falling-block kit proof should include core event types").toEqual(
      expect.arrayContaining(["move", "rotate", "hold", "soft-drop", "hard-drop", "lock", "line-clear"])
    );
    expect(Number(blockfallAfter.current?.piecesPlaced ?? 0), "Blockfall hard drop should place at least one piece").toBeGreaterThan(0);
    expect(blockfallDiff.changedRatio, "Blockfall screenshot should visibly change after keyboard input").toBeGreaterThan(0.008);
    expect(blockfallDiff.meanChannelDelta, "Blockfall keyboard input should produce visible pixel delta").toBeGreaterThan(0.8);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(220);
    const blockfallReset = await readEvidence(page, blockfall.globalName);
    expect(Number(blockfallReset.current?.score), "Blockfall reset should clear score").toBe(0);
    expect(Number(blockfallReset.current?.lines), "Blockfall reset should clear line count").toBe(0);
    expect(blockfallReset.current?.hold, "Blockfall reset should clear hold").toBeNull();
    expect(Number(blockfallReset.current?.piecesPlaced), "Blockfall reset should clear placed pieces").toBe(0);
    games.push({
      appId: blockfall.appId,
      screenshotDelta: blockfallDiff,
      before: {
        frameCount: blockfallBefore.frameCount,
        checksum: blockfallBefore.current?.checksum,
        score: blockfallBefore.current?.score,
        visibleLockedCells: blockfallBefore.live?.visibleLockedCells
      },
      after: {
        frameCount: blockfallAfter.frameCount,
        checksum: blockfallAfter.current?.checksum,
        score: blockfallAfter.current?.score,
        visibleLockedCells: blockfallAfter.live?.visibleLockedCells,
        hold: blockfallAfter.current?.hold,
        piecesPlaced: blockfallAfter.current?.piecesPlaced,
        lineClearProof: blockfallAfter.lineClearProof,
        kitContractProof: blockfallAfter.kitContractProof,
        replayChecksum: blockfallAfter.replay?.replayChecksum
      },
      reset: {
        frameCount: blockfallReset.frameCount,
        checksum: blockfallReset.current?.checksum,
        score: blockfallReset.current?.score,
        lines: blockfallReset.current?.lines,
        hold: blockfallReset.current?.hold,
        piecesPlaced: blockfallReset.current?.piecesPlaced
      }
    });

    const skyline = routeByAppId("showcase-skyline-runner");
    const skylineBefore = await openGameRoute(page, server, skyline);
    const skylineBeforeCapture = await captureInteractionScreenshot(page, skyline.appId, "before-keys");
    captures.push(withoutBuffer(skylineBeforeCapture));
    await page.waitForTimeout(900);
    const skylineIdle = await readEvidence(page, skyline.globalName);
    const skylineIdleCapture = await captureInteractionScreenshot(page, skyline.appId, "idle-animation");
    captures.push(withoutBuffer(skylineIdleCapture));
    const skylineIdleDiff = comparePngBuffers(skylineBeforeCapture.buffer, skylineIdleCapture.buffer, skylineBeforeCapture.canvasCrop);
    const skylineSubjectGate = requireAnimationSubjectDeltaGate(skyline.appId);
    expect(skylineBeforeCapture.canvasCrop, "Skyline should expose a canvas crop for animation subject proof").toBeTruthy();
    const skylineIdleSubjectDiff = comparePngBuffersInRelativeCrop(
      skylineBeforeCapture.buffer,
      skylineIdleCapture.buffer,
      skylineBeforeCapture.canvasCrop!,
      skylineSubjectGate.relativeCrop
    );
    expect(skylineIdle.animation?.state, "Skyline should publish locomotion animation state").toBe("idle");
    expect(skylineIdle.animation?.activeClip, "Skyline should publish the idle embedded GLB motion state").toBe("idle");
    expect(skylineIdle.animation?.runtimeClip, "Skyline should claim runtime playback of the embedded idle clip").toBe("idle");
    expect(skylineIdle.animation?.missingClips ?? [], "Skyline embedded motion state map should resolve").toEqual([]);
    expect(skylineIdle.animation?.availableClips ?? [], "Skyline should prove embedded sprint motion exists").toContain("sprint");
    expect(Number(skylineIdle.animation?.importedClipCount), "Skyline runner should publish imported skinned clips").toBeGreaterThan(0);
    expect(Number(skylineIdle.animation?.sampleTick), "Skyline idle procedural motion sample should advance").toBeGreaterThan(Number(skylineBefore.animation?.sampleTick));
    // Whole-canvas idle delta is small by design: the corrected side-scroller
    // framing makes the hero roughly one-seventh of frame height, so the
    // subject-region gate below is the meaningful idle-motion check.
    expect(skylineIdleDiff.changedRatio, "Skyline idle animation should visibly change pixels").toBeGreaterThan(0.0005);
    expect(skylineIdleSubjectDiff.changedRatio, "Skyline idle runtime should keep the framed runner region visibly live").toBeGreaterThan(skylineSubjectGate.minChangedRatio);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(520);
    await page.keyboard.press("Space");
    await page.waitForTimeout(180);
    await page.keyboard.down("ShiftLeft");
    await page.waitForTimeout(180);
    await page.keyboard.up("ShiftLeft");
    await page.waitForTimeout(260);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(520);
    const skylineAfter = await readEvidence(page, skyline.globalName);
    const skylineAfterCapture = await captureInteractionScreenshot(page, skyline.appId, "after-keys");
    captures.push(withoutBuffer(skylineAfterCapture));
    const skylineInputDiff = comparePngBuffers(skylineIdleCapture.buffer, skylineAfterCapture.buffer, skylineAfterCapture.canvasCrop);
    const skylineAnimationStates = (skylineAfter.animation?.stateHistory ?? []).map((entry: any) => entry.state);
    const skylineAnimationClips = (skylineAfter.animation?.stateHistory ?? []).map((entry: any) => entry.clip);
    expect(skylineAnimationStates, "Skyline keyboard input should drive public game.locomotion states").toEqual(
      expect.arrayContaining(["idle", "run", "jump"])
    );
    expect(
      skylineAnimationStates.some((state: string) => state === "fall" || state === "land"),
      "Skyline keyboard input should enter airborne recovery states after jump"
    ).toBe(true);
    expect(skylineAnimationClips, "Skyline state history should map states to embedded visible motion labels").toEqual(
      expect.arrayContaining(["idle", "sprint"])
    );
    expect(skylineAfter.animation?.missingClips ?? [], "Skyline locomotion clip map should remain valid after keyboard input").toEqual([]);
    expect(["idle", "sprint", "walk", "die"], "Skyline should keep runtime skinned clip playback on known embedded clips").toContain(skylineAfter.animation?.runtimeClip);
    expect(Number(skylineAfter.diagnostics?.snapshot?.x), "Skyline runner should move right after keys").toBeGreaterThan(Number(skylineBefore.diagnostics?.snapshot?.x) + 0.5);
    expect(Number(skylineAfter.animation?.sampleFrame), "Skyline animation evidence should advance route frames after input").toBeGreaterThan(
      Number(skylineIdle.animation?.sampleFrame)
    );
    expect(Number(skylineAfter.animation?.sampleTick), "Skyline animation sample tick should be valid for the current locomotion clip").toBeGreaterThanOrEqual(0);
    expect(Number(skylineAfter.score), "Skyline score should not regress after movement").toBeGreaterThanOrEqual(Number(skylineBefore.score));
    // This suite drives a short movement/jump burst only. It therefore asserts
    // exactly the contract fields that burst can prove. Full progression
    // (collect, checkpoint, hazard, respawn, finish, reset, completion) is
    // driven and asserted by tests/browser/showcase-gameplay-proof.spec.ts;
    // asserting it here would require the route to pre-declare success.
    expect(skylineAfter.kitContractProof, "Skyline should publish public game.platformer contract proof").toMatchObject({
      kind: "aura-game-platformer-kit-browser-contract",
      source: "game.platformer",
      moveChangesX: true,
      jumpEvent: true,
      landEvent: true
    });
    expect(skylineAfter.kitContractProof?.eventTypes ?? [], "Skyline platformer kit proof should include the observed event types").toEqual(
      expect.arrayContaining(["jump", "land"])
    );
    // A short burst must NOT be able to report finished progression.
    expect(skylineAfter.kitContractProof?.completedStatus, "Skyline must not report completion from a short input burst").toBe(false);
    expect(skylineAfter.diagnostics?.completionProof?.completed, "Skyline completion proof must stay false until the finish is reached").toBe(false);
    expect(skylineInputDiff.changedRatio, "Skyline keyboard input should visibly change pixels").toBeGreaterThan(0.015);
    expect(skylineInputDiff.meanChannelDelta, "Skyline keyboard input should produce visible pixel delta").toBeGreaterThan(1.1);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(220);
    const skylineReset = await readEvidence(page, skyline.globalName);
    expect(Number(skylineReset.diagnostics?.snapshot?.x), "Skyline reset should return to start x").toBeLessThan(1.2);
    expect(Number(skylineReset.coins), "Skyline reset should clear collected coins").toBe(0);
    expect(skylineReset.checkpointId, "Skyline reset should return to start checkpoint").toBe("start");
    games.push({
      appId: skyline.appId,
      idleScreenshotDelta: skylineIdleDiff,
      idleSubjectScreenshotDelta: skylineIdleSubjectDiff,
      inputScreenshotDelta: skylineInputDiff,
      before: {
        frameCount: skylineBefore.frameCount,
        x: skylineBefore.diagnostics?.snapshot?.x,
        score: skylineBefore.score,
        coins: skylineBefore.coins,
        animationTick: skylineBefore.animation?.sampleTick
      },
      idle: {
        frameCount: skylineIdle.frameCount,
        x: skylineIdle.diagnostics?.snapshot?.x,
        animationTick: skylineIdle.animation?.sampleTick,
        activeClip: skylineIdle.animation?.activeClip,
        animationState: skylineIdle.animation?.state
      },
      after: {
        frameCount: skylineAfter.frameCount,
        x: skylineAfter.diagnostics?.snapshot?.x,
        score: skylineAfter.score,
        coins: skylineAfter.coins,
        animationTick: skylineAfter.animation?.sampleTick,
        animationState: skylineAfter.animation?.state,
        animationStateHistory: skylineAfter.animation?.stateHistory,
        kitContractProof: skylineAfter.kitContractProof,
        completionProof: skylineAfter.diagnostics?.completionProof
      },
      reset: {
        frameCount: skylineReset.frameCount,
        x: skylineReset.diagnostics?.snapshot?.x,
        coins: skylineReset.coins,
        checkpointId: skylineReset.checkpointId
      }
    });

    const turbo = routeByAppId("showcase-turbo-drift-circuit");
    const turboBefore = await openGameRoute(page, server, turbo);
    const turboBeforeCapture = await captureInteractionScreenshot(page, turbo.appId, "before-keys");
    captures.push(withoutBuffer(turboBeforeCapture));
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(700);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(420);
    await page.keyboard.down("Space");
    await page.waitForTimeout(520);
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyW");
    // Sample the completed throttle/steer/drift burst before drag erases the
    // speed delta being proved. The previous 380 ms coast measured deceleration
    // after input, making this short interaction gate timing-dependent even
    // though the longer gameplay proof consistently reaches race pace.
    await page.waitForTimeout(40);
    const turboAfter = await readEvidence(page, turbo.globalName);
    const turboAfterCapture = await captureInteractionScreenshot(page, turbo.appId, "after-keys");
    captures.push(withoutBuffer(turboAfterCapture));
    const turboDiff = comparePngBuffers(turboBeforeCapture.buffer, turboAfterCapture.buffer, turboBeforeCapture.canvasCrop);
    expect(Number(turboAfter.speed), "Turbo speed should increase after throttle keys").toBeGreaterThan(Number(turboBefore.speed) + 0.5);
    expect(
      angularDistanceRadians(Number(turboAfter.raceState?.heading), Number(turboBefore.raceState?.heading)),
      "Turbo steering should change heading"
    ).toBeGreaterThan(0.01);
    expect(
      Number(turboAfter.raceState?.progress),
      "Turbo throttle should advance along the race route"
    ).toBeGreaterThan(Number(turboBefore.raceState?.progress) + 0.02);
    expect(
      Number(turboAfter.checkpoint) > Number(turboBefore.checkpoint) || Number(turboAfter.lap) > Number(turboBefore.lap),
      "Turbo should clear at least one ordered checkpoint after throttle"
    ).toBe(true);
    expect(turboAfter.camera, "Turbo should publish playable chase-camera evidence").toMatchObject({
      mode: "chase",
      // The Turbo route's player vehicle runtime node is `racing-player-car`.
      targetNode: "racing-player-car"
    });
    expect(turboAfter.subjectFraming?.expectedVisible, "Turbo should publish subject-framing evidence").toBe(true);
    expect(Number(turboAfter.subjectFraming?.speedKmh), "Turbo framing evidence should include live speed").toBeGreaterThan(0);
    expect(Number(turboAfter.subjectFraming?.trackDistance), "Turbo car should remain near the circuit after keys").toBeLessThan(0.25);
    // This suite drives a short throttle/steer burst. It asserts exactly what
    // that burst can prove. Full multi-lap validation and finish are driven and
    // asserted by tests/browser/showcase-gameplay-proof.spec.ts.
    expect(turboAfter.kitContractProof, "Turbo should publish public game.racing contract proof").toMatchObject({
      kind: "aura-game-racing-kit-browser-contract",
      source: "game.racing",
      throttleIncreasesSpeed: true,
      steeringChangesHeading: true,
      checkpointAdvances: true,
      checkpointOrderRequired: true,
      cameraFollow: true,
      wrongOrderCheckpoint: 0
    });
    expect(turboAfter.kitContractProof?.eventTypes ?? [], "Turbo racing kit proof should include observed checkpoint events").toEqual(
      expect.arrayContaining(["checkpoint"])
    );
    // A short burst must NOT be able to report a finished race.
    expect(turboAfter.kitContractProof?.finishedStatus, "Turbo must not report a finished race from a short burst").toBe("running");
    expect(turboDiff.changedRatio, "Turbo keyboard input should visibly change pixels").toBeGreaterThan(0.004);
    expect(turboDiff.meanChannelDelta, "Turbo keyboard input should produce visible pixel delta").toBeGreaterThan(0.35);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(220);
    const turboReset = await readEvidence(page, turbo.globalName);
    expect(Number(turboReset.speed), "Turbo reset should clear speed").toBe(0);
    expect(Number(turboReset.lap), "Turbo reset should return to lap 1").toBe(1);
    expect(Number(turboReset.checkpoint), "Turbo reset should return to first checkpoint").toBe(0);
    expect(circularProgressDistance(Number(turboReset.raceState?.progress), 0), "Turbo reset should return to start progress").toBeLessThan(0.005);
    games.push({
      appId: turbo.appId,
      screenshotDelta: turboDiff,
      before: {
        frameCount: turboBefore.frameCount,
        speed: turboBefore.speed,
        raceState: turboBefore.raceState,
        camera: turboBefore.camera,
        subjectFraming: turboBefore.subjectFraming
      },
      after: {
        frameCount: turboAfter.frameCount,
        speed: turboAfter.speed,
        checkpoint: turboAfter.checkpoint,
        lap: turboAfter.lap,
        raceState: turboAfter.raceState,
        camera: turboAfter.camera,
        subjectFraming: turboAfter.subjectFraming,
        kitContractProof: turboAfter.kitContractProof
      },
      reset: {
        frameCount: turboReset.frameCount,
        speed: turboReset.speed,
        checkpoint: turboReset.checkpoint,
        lap: turboReset.lap,
        raceState: turboReset.raceState
      }
    });

    writeFileSync(
      resolve("tests/reports/showcase-game-interactions.json"),
      `${JSON.stringify({ schema: "aura3d-showcase-game-interactions", pass: true, gateConfig: SHOWCASE_ROUTE_GATE_REPORT, captures, games }, null, 2)}\n`
    );
  });

  test("particle route controls change Aura3D particle evidence without native WebGPU overclaim", async ({ page }) => {
    const route = routeByAppId("showcase-webgpu-particle-lab");
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), `${route.path} should respond successfully`).toBe(true);
    const before = await waitForAcceptedEvidence(page, route.globalName) as EvidenceRecord;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const beforeCrop = await largestCanvasCrop(page);
    const beforeBuffer = await page.screenshot({ fullPage: false, scale: "css" });

    await page.locator("[data-mode='fountain']").click();
    const density = page.locator("#density-control");
    await density.evaluate((input) => {
      const range = input as HTMLInputElement;
      range.value = "900";
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(450);
    const after = await readEvidence(page, route.globalName);
    const afterBuffer = await page.screenshot({ fullPage: false, scale: "css" });
    const diff = comparePngBuffers(beforeBuffer, afterBuffer, beforeCrop);
    const claimBoundary = textFromClaimBoundary(after.claimBoundary);

    expect(before.capabilityState?.activeAura3DParticles, "Particle lab should start with Aura3D particles active").toBe(true);
    expect(after.capabilityState?.activeAura3DParticles, "Particle lab should keep Aura3D particles active").toBe(true);
    expect(after.systems?.join(" "), "Particle lab should name effects.particles").toContain("effects.particles");
    expect(after.controls?.mode, "Particle lab mode control should update evidence").toBe("fountain");
    expect(Number(after.performance?.visualParticleCount), "Particle lab density should update visual particle budget").toBeGreaterThan(Number(before.performance?.visualParticleCount));
    expect(claimBoundary, "Particle lab should not claim native WebGPU").not.toMatch(/\bnative WebGPU\b/i);
    expect(claimBoundary, "Particle lab should not claim WebGPU compute").not.toMatch(/\bWebGPU compute\b/i);
    expect(diff.changedRatio, "Particle controls should visibly change pixels").toBeGreaterThan(0.01);
    expect(diff.meanChannelDelta, "Particle controls should produce visible pixel delta").toBeGreaterThan(0.7);

    writeFileSync(
      resolve("tests/reports/showcase-particle-claim-guards.json"),
      `${JSON.stringify({ schema: "aura3d-showcase-particle-claim-guards", pass: true, gateConfig: SHOWCASE_ROUTE_GATE_REPORT, before, after, screenshotDelta: diff }, null, 2)}\n`
    );
  });
});

function withoutBuffer(capture: ScreenshotCapture) {
  return {
    appId: capture.appId,
    label: capture.label,
    path: capture.path,
    size: capture.size,
    viewportStats: capture.viewportStats,
    canvasStats: capture.canvasStats,
    canvasCrop: capture.canvasCrop,
    uiLayoutIssues: capture.uiLayoutIssues
  };
}
