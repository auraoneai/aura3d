import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRouteSourceHash, hashRouteHealthDependency } from "../../../tools/showcase-library/route-primary-probes.mjs";

interface VisualQaResult {
  readonly pass: boolean;
  readonly blockers: readonly string[];
  readonly humanVisualApproval: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly verdict: string;
    readonly tolerance?: unknown;
    readonly measured?: Record<string, unknown>;
  }[];
}

interface VisualQaModule {
  validateGameVisualQa(input: Record<string, unknown>): VisualQaResult;
  writeGameVisualQaReport(input: Record<string, unknown>, outputPath?: string): VisualQaResult;
}

const modulePromise = import(pathToFileURL(join(process.cwd(), "tools/showcase-library/game-visual-qa.mjs")).href) as Promise<VisualQaModule>;
const routeId = "showcase-visual-qa-fixture";
const route = { id: routeId, gameTemplateStatus: { category: "racing" } } as const;
const screenshotPath = `tests/reports/showcase-route-primary-probes/${routeId}.png`;
const suppressedPath = `tests/reports/showcase-route-primary-probes/${routeId}-subject-suppressed.png`;
const probePath = `tests/reports/showcase-route-primary-probes/${routeId}.json`;
const compositionPath = `tests/reports/showcase-spec-compiler/fixture/game-template/${routeId}-asset-pair-composition.json`;
const healthPath = `apps/${routeId}/route-health.json`;

interface Fixture {
  readonly root: string;
  readonly routeHealth: Record<string, unknown>;
}

function sha(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function write(root: string, path: string, data: string | Buffer): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}

/*
 * Entirely synthetic, isolated test data: neither the route, health nor PNGs
 * are Turbo/Skyline records. Their historical captures are never rebound to a
 * new source hash or installed as live evidence.
 */
async function visualFixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-fixture-"));
  try {
    const create = { width: 320, height: 200, channels: 3 as const, background: { r: 50, g: 90, b: 150 } };
    const background = await sharp({ create }).png().toBuffer();
    const image = await sharp({ create })
      .composite([{ input: { create: { width: 100, height: 80, channels: 3, background: { r: 230, g: 45, b: 20 } } }, left: 110, top: 60 }])
      .png().toBuffer();
    const viewportDesktop = `tests/reports/showcase-library-screenshots/${routeId}-desktop.png`;
    const viewportMobile = `tests/reports/showcase-library-screenshots/${routeId}-mobile.png`;
    const before = `tests/reports/showcase-gameplay/${routeId}-before-input.png`;
    const after = `tests/reports/showcase-gameplay/${routeId}-after-input.png`;
    for (const path of [screenshotPath, viewportDesktop, viewportMobile, after]) write(root, path, image);
    for (const path of [suppressedPath, before]) write(root, path, background);
    write(root, `apps/${routeId}/src/main.ts`, "// Synthetic source for visual QA unit tests only.\n");

    const routeHealth = {
      appId: routeId,
      gameAssetPairEvidence: { verdict: "pass", compositionReport: compositionPath, screenshotEvidence: screenshotPath },
      evidence: { desktopScreenshot: viewportDesktop, mobileScreenshot: viewportMobile, gameplayBeforeScreenshot: before, gameplayAfterInputScreenshot: after }
    };
    write(root, healthPath, `${JSON.stringify(routeHealth)}\n`);
    const checks = ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"]
      .map((id) => ({ id, verdict: "pass", blockers: [] }));
    write(root, compositionPath, JSON.stringify({
      schema: "aura3d-showcase-asset-pair-composition/1.0",
      routeId, category: "racing", verdict: "pass", pass: true,
      screenshot: { path: screenshotPath, sha256: sha(image) }, checks
    }));
    write(root, probePath, JSON.stringify({
      routeId, pass: true,
      sourceHash: createRouteSourceHash(routeId, root),
      routeHealthHash: hashRouteHealthDependency(join(root, healthPath)),
      renderedProbe: {
        sha256: sha(image), occludedByUi: false, clipped: false, readabilityScore: 80,
        analysisCrop: { x: 0, y: 0, width: 320, height: 200 },
        foregroundBounds: { x: 110, y: 60, width: 100, height: 80 },
        subjectSuppressedScreenshotPath: suppressedPath
      },
      compositionProbe: {
        subjectBounds: { x: 110, y: 60, width: 100, height: 80 },
        subjectClipped: false, subjectReadabilityScore: 80
      }
    }));
    return { root, routeHealth };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

describe("game visual QA", { timeout: 30_000 }, () => {
  let fixture: Fixture;
  beforeAll(async () => { fixture = await visualFixture(); });
  afterAll(() => { if (fixture) rmSync(fixture.root, { recursive: true, force: true }); });

  it("separates structural checks from measured image checks without claiming human approval", async () => {
    const result = (await modulePromise).validateGameVisualQa({ route, ...fixture });
    expect(result.blockers).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.humanVisualApproval).toBe(false);
    expect(result.checks.map(({ id, verdict }) => [id, verdict])).toEqual([
      ["subject-bound-to-surface", "pass"], ["contact", "pass"], ["camera-readability", "pass"],
      ["scale-contract", "pass"], ["debug-guide-absence", "pass"],
      ["subject-pixel-isolation", "pass"], ["viewport-composition", "pass"],
      ["foreground-background-balance", "pass"], ["flat-region-budget", "report-only"],
      ["hud-occlusion-budget", "pass"], ["material-visual-change", "pass"], ["gameplay-pixel-change", "pass"]
    ]);
  });

  it("writes an independently inspectable report only in the synthetic fixture", async () => {
    const result = (await modulePromise).writeGameVisualQaReport({ route, ...fixture });
    const path = join(fixture.root, `tests/reports/showcase-game-visual-qa/${routeId}.json`);
    expect(result.pass).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
      routeId, verdict: "pass", humanVisualApproval: false,
      checks: expect.arrayContaining([expect.objectContaining({ id: "hud-occlusion-budget", verdict: "pass" })])
    });
  });

  it("rejects clipped, unreadable subject metrics rather than accepting a claimed pass", async () => {
    const result = (await modulePromise).validateGameVisualQa({
      route, ...fixture,
      pngMetrics: {
        crop: { x: 0, y: 0, width: 320, height: 200 },
        foregroundBounds: { x: 0, y: 0, width: 320, height: 200 },
        clipped: true, readabilityScore: 1
      }
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "hud-occlusion-budget:hud-subject-clipped",
      "hud-occlusion-budget:hud-readability:1",
      "hud-occlusion-budget:hud-foreground-area:1"
    ]));
  });

  it.each([
    ["tiny", { foregroundBounds: { x: 50, y: 50, width: 4, height: 4 }, foregroundAreaRatio: 0.0001, clipped: false }],
    ["hidden", { foregroundAreaRatio: 0, clipped: false }],
    ["clipped", { foregroundBounds: { x: 0, y: 0, width: 200, height: 100 }, foregroundAreaRatio: 0.08, clipped: true }]
  ])("rejects a %s isolation result", async (_label, isolatedMetrics) => {
    const result = (await modulePromise).validateGameVisualQa({ route, ...fixture, isolatedMetrics });
    expect(result.pass).toBe(false);
    expect(result.blockers.some((blocker) => blocker.startsWith("subject-pixel-isolation:"))).toBe(true);
  });

  it.each([
    ["giant prop", { clipped: false, edgeOccupancyRatio: 0.1, foregroundCoverageRatio: 0.8, backgroundCoverageRatio: 0.2, largestComponentAreaRatio: 0.9 }],
    ["empty staging", { clipped: false, edgeOccupancyRatio: 0, foregroundCoverageRatio: 0.001, backgroundCoverageRatio: 0.999, largestComponentAreaRatio: 0.001 }],
    ["clipped foreground", { clipped: true, edgeOccupancyRatio: 0.7, foregroundCoverageRatio: 0.2, backgroundCoverageRatio: 0.8, largestComponentAreaRatio: 0.2 }]
  ])("rejects %s composition metrics", async (_label, compositionMetrics) => {
    const result = (await modulePromise).validateGameVisualQa({ route, ...fixture, compositionMetrics });
    expect(result.pass).toBe(false);
    expect(result.blockers.some((blocker) =>
      blocker.startsWith("viewport-composition:") || blocker.startsWith("foreground-background-balance:")
    )).toBe(true);
  });

  it("rejects source and route-health changes against their original synthetic probe", async () => {
    const stale = await visualFixture();
    try {
      write(stale.root, `apps/${routeId}/src/main.ts`, "// changed source\n");
      let result = (await modulePromise).validateGameVisualQa({ route, ...stale });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("route-primary-source-stale");
      write(stale.root, healthPath, JSON.stringify({ ...stale.routeHealth, changed: true }));
      result = (await modulePromise).validateGameVisualQa({ route, ...stale });
      expect(result.blockers).toContain("route-primary-health-stale");
    } finally { rmSync(stale.root, { recursive: true, force: true }); }
  });

  it("rejects a missing source even when a probe copies the missing hash sentinel", async () => {
    const missing = await visualFixture();
    try {
      rmSync(join(missing.root, `apps/${routeId}/src/main.ts`));
      const probe = JSON.parse(readFileSync(join(missing.root, probePath), "utf8")) as Record<string, unknown>;
      probe.sourceHash = "sha256-missing";
      write(missing.root, probePath, JSON.stringify(probe));
      const result = (await modulePromise).validateGameVisualQa({ route, ...missing });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("route-primary-source-missing");
    } finally { rmSync(missing.root, { recursive: true, force: true }); }
  });

  it("rejects missing route-health even if a caller supplies a health object", async () => {
    const missing = await visualFixture();
    try {
      rmSync(join(missing.root, healthPath));
      const probe = JSON.parse(readFileSync(join(missing.root, probePath), "utf8")) as Record<string, unknown>;
      delete probe.routeHealthHash;
      write(missing.root, probePath, JSON.stringify(probe));
      const result = (await modulePromise).validateGameVisualQa({ route, ...missing });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("route-primary-health-missing");
    } finally { rmSync(missing.root, { recursive: true, force: true }); }
  });

  it.each([
    [probePath, `route-primary-missing:${probePath}`],
    [compositionPath, `composition-missing:${compositionPath}`],
    [screenshotPath, `screenshot-missing:${screenshotPath}`],
    [suppressedPath, `subject-suppressed-missing:${suppressedPath}`],
    [`tests/reports/showcase-library-screenshots/${routeId}-desktop.png`, "viewport-composition:desktop-screenshot-missing"]
  ])("fails closed when %s is missing", async (path, blocker) => {
    const missing = await visualFixture();
    try {
      rmSync(join(missing.root, path));
      const result = (await modulePromise).validateGameVisualQa({ route, ...missing });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain(blocker);
      if (path === screenshotPath) expect(result.blockers).toContain("flat-region-budget:flat-region-metrics-missing");
    } finally { rmSync(missing.root, { recursive: true, force: true }); }
  });

  it("rejects a replaced screenshot with mismatching composition and probe hashes", async () => {
    const stale = await visualFixture();
    try {
      copyFileSync(join(stale.root, suppressedPath), join(stale.root, screenshotPath));
      const result = (await modulePromise).validateGameVisualQa({ route, ...stale });
      expect(result.pass).toBe(false);
      expect(result.blockers).toEqual(expect.arrayContaining(["composition-screenshot-stale", "route-primary-screenshot-stale"]));
    } finally { rmSync(stale.root, { recursive: true, force: true }); }
  });

  it("rejects unchanged gameplay pixels and unchanged approved-baseline pixels", async () => {
    const module = await modulePromise;
    const gameplay = module.validateGameVisualQa({
      route, ...fixture, gameplayChangeMetrics: { nonBackgroundRatio: 0, foregroundAreaRatio: 0, changedPixels: 0 }
    });
    expect(gameplay.pass).toBe(false);
    expect(gameplay.blockers).toContain("gameplay-pixel-change:gameplay-pixel-delta-too-small:0");
    const visual = module.validateGameVisualQa({
      route, ...fixture, baselinePath: screenshotPath,
      visualChangeMetrics: { nonBackgroundRatio: 0, foregroundAreaRatio: 0, changedPixels: 0 }
    });
    expect(visual.pass).toBe(false);
    expect(visual.blockers).toContain("material-visual-change:scene-material-change-too-small:0");
  });

  it("reports the measured flat fraction without inventing a calibrated threshold", async () => {
    const result = (await modulePromise).validateGameVisualQa({
      route, ...fixture, flatMetrics: { dominantBucketFraction: 0.97, flatFraction: 0.99, distinctBuckets: 2 }
    });
    const check = result.checks.find((entry) => entry.id === "flat-region-budget");
    expect(check).toMatchObject({
      verdict: "report-only", tolerance: null,
      measured: { composed: { dominantBucketFraction: 0.97, flatFraction: 0.99, distinctBuckets: 2 } }
    });
  });

  it("classifies graded and flat backdrops as background without clipping the subject", async () => {
    const png = await import(pathToFileURL(join(process.cwd(), "tools/showcase-library/png-foreground.mjs")).href) as {
      readPngVisualCompositionMetrics(path: string): {
        readonly foregroundCoverageRatio: number;
        readonly backgroundCoverageRatio: number;
        readonly largestComponentAreaRatio: number;
        readonly clipped: boolean;
      };
    };
    // Controlled pixels reproduce the per-row background regression without
    // presenting a retired route's screenshot as a current capture.
    for (const graded of [false, true]) {
      const width = 320;
      const height = 200;
      const pixels = Buffer.alloc(width * height * 3);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const subject = x >= 110 && x < 210 && y >= 60 && y < 140;
          const offset = (y * width + x) * 3;
          pixels[offset] = subject ? 230 : 40 + (graded ? Math.floor(y * 150 / (height - 1)) : 0);
          pixels[offset + 1] = subject ? 45 : 90 + (graded ? Math.floor(y * 80 / (height - 1)) : 0);
          pixels[offset + 2] = subject ? 20 : 150;
        }
      }
      const path = join(fixture.root, graded ? "graded.png" : "flat.png");
      writeFileSync(path, await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer());
      const measured = png.readPngVisualCompositionMetrics(path);
      expect(measured.foregroundCoverageRatio).toBe(0.125);
      expect(measured.backgroundCoverageRatio).toBe(0.875);
      expect(measured.largestComponentAreaRatio).toBe(0.125);
      expect(measured.clipped).toBe(false);
    }
  });

  it("re-measures different image bytes at the same path rather than returning a stale cache entry", async () => {
    const png = await import(pathToFileURL(join(process.cwd(), "tools/showcase-library/png-foreground.mjs")).href) as {
      readPngVisualCompositionMetrics(path: string): { readonly dominantBucketFraction: number };
    };
    const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-cache-"));
    try {
      const target = join(root, "frame.png");
      copyFileSync(join(fixture.root, screenshotPath), target);
      const first = png.readPngVisualCompositionMetrics(target).dominantBucketFraction;
      copyFileSync(join(fixture.root, suppressedPath), target);
      const second = png.readPngVisualCompositionMetrics(target).dominantBucketFraction;
      expect(second).not.toBe(first);
      expect(png.readPngVisualCompositionMetrics(target).dominantBucketFraction).toBe(second);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
