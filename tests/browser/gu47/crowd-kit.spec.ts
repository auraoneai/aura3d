import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { engineVersion, gitSha, logMetrics, receiptRenderer, saveFrame, writeReceipt, type Receipt } from "../receipts-lib";
import type { CrowdComparison, CrowdFrame, CrowdVariant } from "./crowd-kit-harness";

/**
 * GU47 E-H (PRD WP-8) pixel receipt `crowd-kit`: 480 instanced spectators in <= 4 draws with
 * per-instance colour and clip phase (`packages/engine/src/instances-model/CrowdKit.ts`).
 *
 * Phase 2 only (remote runner, SwiftShader; never a local browser). The crowd draw count is the
 * frame's draw-call delta over the same scene without the crowd (castShadow off, so the delta is
 * the forward-pass instanced draws); the shadowed variant's delta is logged, not gated. The
 * receipt is written only when the runtime ran cleanly and every check passes.
 */

const SPEC = "tests/browser/gu47/crowd-kit.spec.ts";
const HARNESS = "/tests/browser/gu47/crowd-kit.html";
const SCENE = "tests/browser/gu47/crowd-kit-harness.ts standScene(): 12-row x 40-seat stepped stand, ground plane, hemisphere + shadowed sun, camera [0, 5.5, 17] -> [0, 2.6, -4] fov 45; crowd = CesiumMan (skinned, walk clip) baked into 4 poses at 1.7 m, 4 palette colours, per-seat clip phase";

interface CrowdWindow {
  __AURA3D_CROWD_RECEIPT__?: {
    renderer(): string;
    render(id: CrowdVariant): Promise<CrowdFrame>;
    compare(a: CrowdVariant, b: CrowdVariant): CrowdComparison;
  };
  __AURA3D_CROWD_RECEIPT_ERROR__?: string;
}

test.describe("GU47 crowd-kit receipt", () => {
  test.describe.configure({ mode: "serial" });
  let server: ExampleDevServer | undefined;
  let page: Page;
  const problems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 800, height: 480 } });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const w = window as unknown as CrowdWindow;
      return Boolean(w.__AURA3D_CROWD_RECEIPT__ || w.__AURA3D_CROWD_RECEIPT_ERROR__);
    }, undefined, { timeout: 60_000 });
    const error = await page.evaluate(() => (window as unknown as CrowdWindow).__AURA3D_CROWD_RECEIPT_ERROR__);
    if (error) throw new Error(error);
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  test("480 spectators draw in at most 4 instanced draws with per-instance colour and clip-phase motion", async () => {
    test.setTimeout(240_000);
    const render = (id: CrowdVariant) => page.evaluate((variant) => (window as unknown as CrowdWindow).__AURA3D_CROWD_RECEIPT__!.render(variant), id);
    const compare = (a: CrowdVariant, b: CrowdVariant) =>
      page.evaluate(([first, second]) => (window as unknown as CrowdWindow).__AURA3D_CROWD_RECEIPT__!.compare(first, second), [a, b] as const);
    const empty = await render("empty-stand");
    const crowd = await render("crowd");
    const later = await render("crowd-later");
    const shadowed = await render("crowd-shadows");
    const added = await compare("empty-stand", "crowd");
    const motion = await compare("crowd", "crowd-later");
    const shadowDelta = await compare("empty-stand", "crowd-shadows");
    const renderer = receiptRenderer(await page.evaluate(() => (window as unknown as CrowdWindow).__AURA3D_CROWD_RECEIPT__!.renderer()));
    const omit = ({ pngBase64: _png, ...rest }: CrowdFrame) => rest;
    logMetrics("crowd-kit", { renderer, empty: omit(empty), crowd: omit(crowd), later: omit(later), shadowed: omit(shadowed), added, motion, shadowDelta });

    const huesPresent = Object.values(crowd.paletteHueFractions).filter((fraction) => fraction >= 0.002).length;
    const checks = {
      cleanRuntime: [empty, crowd, later, shadowed].every((frame) => frame.errors.length === 0),
      everyFrameDrew: [empty, crowd, later, shadowed].every((frame) => frame.drawCalls > 0),
      kitPlans480SpectatorsIn4Draws: crowd.plan?.spectators === 480 && (crowd.plan?.draws ?? 99) <= 4,
      crowdAddsAtMost4Draws: added.drawCallDelta >= 1 && added.drawCallDelta <= 4,
      crowdVisible: added.standChangedPixelFraction >= 0.02,
      perInstanceColour: huesPresent >= 3,
      clipPhaseMotion: motion.standChangedPixelFraction >= 0.003,
      updateUnder1ms: (crowd.updateMs ?? 99) <= 1
    };
    for (const [name, passed] of Object.entries(checks)) expect(passed, name).toBe(true);

    const version = engineVersion();
    const receipt: Receipt = {
      capability: "crowd-kit",
      version,
      gitSha: gitSha(),
      renderer,
      scene: SCENE,
      frames: [
        saveFrame({ pngBase64: empty.pngBase64, metrics: { meanLuma: empty.meanLuma, drawCalls: empty.drawCalls } } as never, `evidence/receipts/crowd-kit/${version}/empty-stand.png`, "stand without the crowd"),
        saveFrame({ pngBase64: crowd.pngBase64, metrics: { meanLuma: crowd.meanLuma, drawCalls: crowd.drawCalls } } as never, `evidence/receipts/crowd-kit/${version}/crowd.png`, "480 spectators, 4 poses"),
        saveFrame({ pngBase64: later.pngBase64, metrics: { meanLuma: later.meanLuma, drawCalls: later.drawCalls } } as never, `evidence/receipts/crowd-kit/${version}/crowd-later.png`, "one loop frame later")
      ],
      tests: [SPEC, "tests/unit/gu47/eh/crowd-kit.test.ts"],
      date: new Date().toISOString(),
      checks: {
        ...checks,
        crowdDrawCallDelta: added.drawCallDelta,
        shadowedCrowdDrawCallDelta: shadowDelta.drawCallDelta,
        standChangedPixelFraction: added.standChangedPixelFraction,
        motionStandChangedPixelFraction: motion.standChangedPixelFraction,
        paletteHuesPresent: huesPresent,
        updateMs: crowd.updateMs ?? -1,
        trianglesPerSpectator: crowd.plan?.trianglesPerSpectator ?? 0
      }
    };
    writeReceipt(receipt);
  });

  test("no page errors or console errors during the receipt run", () => {
    expect(problems).toEqual([]);
  });
});
