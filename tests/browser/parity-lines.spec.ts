import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * parity-lines — threejs-parity lane L6 acceptance fixture
 * (docs/workflows/threejs-parity-gaps.md §5.6, L6-01..L6-04).
 *
 * Remote-only: this spec must run on the GPU browser runner, never locally.
 * It asserts real rendered pixels from the `parity-lines` harness:
 *   - `lines.fat` keeps CSS-pixel width across devicePixelRatio 1 and 2,
 *   - `dashed` strokes lose coverage (dash gaps render),
 *   - `points` attenuate with view distance (SG-07) and stay fixed without it,
 *   - `sprites.sprite` renders and honours `spriteRotation`,
 *   - every `helpers.*` glyph draws real pixels (SC-03),
 *   - flag-off mounts fail closed with `parity-not-implemented`.
 */

const REPORT_ROOT = resolve("tests/reports/parity-lines");
const HARNESS = "/tests/browser/parity-lines-harness.html";

interface PixelStats {
  readonly filledPixels: number;
  readonly widestRun: number;
  readonly bbox: readonly [number, number, number, number];
}

interface Evidence {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly dprStability?: {
    readonly dpr1: PixelStats;
    readonly dpr2: PixelStats;
    readonly cssWidthRequested: number;
    readonly dpr1MeasuredCss: number;
    readonly dpr2MeasuredCss: number;
    readonly maxCssDeviation: number;
    readonly pass: boolean;
  };
  readonly dashes?: { readonly solid: PixelStats; readonly dashed: PixelStats; readonly coverageDropped: boolean };
  readonly pointAttenuation?: {
    readonly attenuatedNear: number;
    readonly attenuatedFar: number;
    readonly fixedNear: number;
    readonly fixedFar: number;
    readonly attenuatedRatio: number;
    readonly fixedRatio: number;
    readonly farShrank: boolean;
    readonly fixedStayed: boolean;
  };
  readonly sprite?: {
    readonly rendered: PixelStats;
    readonly rotated: PixelStats;
    readonly rendersPixels: boolean;
    readonly rotationChangesShape: boolean;
  };
  readonly helpers?: Record<string, number>;
  readonly flagOff?: { readonly threwParityNotImplemented: boolean; readonly error?: string };
}

test.describe("parity-lines (L6)", () => {
  test.setTimeout(300_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("lines/points/sprites/helpers render three.js-parity behaviour", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const scope = window as unknown as Record<string, unknown>;
        return Boolean(scope.__A3D_PARITY_LINES__ || scope.__A3D_PARITY_LINES_ERROR__);
      },
      undefined,
      { timeout: 240_000 }
    );

    const harnessError = await page.evaluate(
      () => (window as unknown as Record<string, string | undefined>).__A3D_PARITY_LINES_ERROR__
    );
    if (harnessError) throw new Error(`parity-lines harness failed: ${harnessError}`);

    const evidence = await page.evaluate(() => (window as unknown as Record<string, Evidence>).__A3D_PARITY_LINES__);
    expect(evidence.status).toBe("ready");

    await page.screenshot({ path: `${REPORT_ROOT}/parity-lines.png`, fullPage: true });
    writeFileSync(
      resolve(`${REPORT_ROOT}/parity-lines.json`),
      `${JSON.stringify(
        {
          schema: "aura3d-parity-lines/1.0",
          generatedAt: new Date().toISOString(),
          claimBoundary:
            "Proves CSS-pixel fat-line width stability across DPR 1/2, dash coverage loss, point-size attenuation with distance, sprite billboard rendering + rotation, helper glyph rendering, and flag-off fail-closed. Does not claim a pixel-identical match against Three.js output.",
          ...evidence
        },
        null,
        2
      )}\n`
    );

    // AD-08: fat-line CSS width is stable across DPR 1 and 2.
    expect(evidence.dprStability?.pass, JSON.stringify(evidence.dprStability)).toBe(true);
    expect(evidence.dprStability!.dpr1MeasuredCss).toBeGreaterThan(0);
    expect(evidence.dprStability!.dpr2MeasuredCss).toBeGreaterThan(0);
    expect(evidence.dprStability!.maxCssDeviation).toBeLessThanOrEqual(0.35);

    // AD-08: dashes actually break the stroke.
    expect(evidence.dashes?.coverageDropped, JSON.stringify(evidence.dashes)).toBe(true);

    // SG-07: the far point shrinks under attenuation, not without it.
    expect(evidence.pointAttenuation?.farShrank, JSON.stringify(evidence.pointAttenuation)).toBe(true);
    expect(evidence.pointAttenuation?.fixedStayed).toBe(true);

    // SG-08: sprite renders and rotates.
    expect(evidence.sprite?.rendersPixels, JSON.stringify(evidence.sprite)).toBe(true);
    expect(evidence.sprite?.rotationChangesShape).toBe(true);

    // SC-03: every helper draws.
    const helperCaps = evidence.helpers ?? {};
    for (const id of ["axes", "grid", "polarGrid", "box", "arrow", "camera", "directionalLight", "spotLight", "pointLight", "skeleton"]) {
      expect(helperCaps[id] ?? 0, `helpers.${id} drew nothing`).toBeGreaterThan(0);
    }

    // B-01: flag-off fail-closed.
    expect(evidence.flagOff?.threwParityNotImplemented, evidence.flagOff?.error).toBe(true);

    // §8/§11.3: route-health names the parity IDs this port exercised.
    expect(evidence.routeHealth?.parityIds).toEqual(["AD-08", "SG-07", "SG-08", "SC-03", "B-01"]);

    // The flag-off negative control above deliberately fails its strict mount —
    // that rejection surfaces one pageerror by design. Everything else must be clean.
    expect(errors.filter((e) => !e.includes("not yet implemented (A3D_PARITY_LINES)"))).toEqual([]);
  });
});
