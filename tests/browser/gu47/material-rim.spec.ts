import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { engineVersion, gitSha, logMetrics, receiptRenderer, saveFrame, writeReceipt, type Receipt } from "../receipts-lib";
import type { RimComparison, RimFrame, RimVariant } from "./material-rim-harness";

/**
 * GU47 E-D (PRD WP-4) pixel receipt `material-rim`: `material.pbr({ rim: { color, power, intensity } })`.
 *
 * Phase 2 only (remote runner, SwiftShader; never a local browser). The off and on frames differ only in the sphere's
 * `rim` field, so the pixel delta is the rim term: the silhouette band brightens and warms (orange rim), the sphere
 * centre (N·V ≈ 1) stays put. The receipt is written only when the runtime ran cleanly and every check passes.
 */

const SPEC = "tests/browser/gu47/material-rim.spec.ts";
const HARNESS = "/tests/browser/gu47/material-rim.html";
const SCENE = "tests/browser/gu47/material-rim-harness.ts rimScene(): unit sphere (#2a3140, roughness 0.6), dark backdrop, one directional key, camera z=4 fov 40; on frame adds rim { color #ffb347, power 2.5, intensity 1.5 }";

interface RimWindow {
  __AURA3D_RIM_RECEIPT__?: {
    renderer(): string;
    render(id: RimVariant): Promise<RimFrame>;
    compare(a: RimVariant, b: RimVariant): RimComparison;
  };
  __AURA3D_RIM_RECEIPT_ERROR__?: string;
}

test.describe("GU47 material-rim receipt", () => {
  test.describe.configure({ mode: "serial" });
  let server: ExampleDevServer | undefined;
  let page: Page;
  const problems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const w = window as unknown as RimWindow;
      return Boolean(w.__AURA3D_RIM_RECEIPT__ || w.__AURA3D_RIM_RECEIPT_ERROR__);
    }, undefined, { timeout: 60_000 });
    const error = await page.evaluate(() => (window as unknown as RimWindow).__AURA3D_RIM_RECEIPT_ERROR__);
    if (error) throw new Error(error);
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  test("rim brightens and warms the silhouette band and leaves the centre unchanged", async () => {
    const off = await page.evaluate(() => (window as unknown as RimWindow).__AURA3D_RIM_RECEIPT__!.render("rim-off"));
    const on = await page.evaluate(() => (window as unknown as RimWindow).__AURA3D_RIM_RECEIPT__!.render("rim-on"));
    const delta = await page.evaluate(() => (window as unknown as RimWindow).__AURA3D_RIM_RECEIPT__!.compare("rim-off", "rim-on"));
    const renderer = receiptRenderer(await page.evaluate(() => (window as unknown as RimWindow).__AURA3D_RIM_RECEIPT__!.renderer()));
    const omit = ({ pngBase64: _png, ...rest }: RimFrame) => rest;
    logMetrics("material-rim", { renderer, off: omit(off), on: omit(on), delta });

    const checks = {
      cleanRuntime: off.errors.length === 0 && on.errors.length === 0,
      bothFramesDrew: off.drawCalls > 0 && on.drawCalls > 0,
      changedPixelFractionAtLeast1pc: delta.changedPixelFraction >= 0.01,
      edgeBrightensBy6: delta.edgeLumaDelta >= 6,
      edgeWarms: delta.edgeWarmthDelta >= 4,
      centreStableWithin2: Math.abs(delta.centerLumaDelta) <= 2
    };
    for (const [name, passed] of Object.entries(checks)) expect(passed, name).toBe(true);

    const version = engineVersion();
    const receipt: Receipt = {
      capability: "material-rim",
      version,
      gitSha: gitSha(),
      renderer,
      scene: SCENE,
      frames: [
        saveFrame({ pngBase64: off.pngBase64, metrics: { meanLuma: off.meanLuma, nonBlackRatio: off.nonBlackRatio } } as never, `evidence/receipts/material-rim/${version}/rim-off.png`, "rim off"),
        saveFrame({ pngBase64: on.pngBase64, metrics: { meanLuma: on.meanLuma, nonBlackRatio: on.nonBlackRatio } } as never, `evidence/receipts/material-rim/${version}/rim-on.png`, "rim on")
      ],
      tests: [SPEC],
      date: new Date().toISOString(),
      checks: {
        ...checks,
        changedPixelFraction: delta.changedPixelFraction,
        edgeLumaDelta: delta.edgeLumaDelta,
        edgeWarmthDelta: delta.edgeWarmthDelta,
        centerLumaDelta: delta.centerLumaDelta
      }
    };
    writeReceipt(receipt);
  });

  test("no page errors or console errors during the receipt run", () => {
    expect(problems).toEqual([]);
  });
});
