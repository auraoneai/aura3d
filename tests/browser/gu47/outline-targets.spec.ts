import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { engineVersion, gitSha, logMetrics, receiptRenderer, saveFrame, writeReceipt, type Receipt } from "../receipts-lib";
import type { OutlineComparison, OutlineFrame, OutlineVariant } from "./outline-targets-harness";

/**
 * GU47 E-E (PRD WP-5) receipt `outline-targets`: `effects.outline({ targets })` and the depth-aware `effects.toon`.
 *
 * Phase 2 only (remote runner, software WebGL2; never a local browser; not run in phase 1). Acceptance (PRD WP-5):
 * an outlined target shows ink on >= 60% of its silhouette perimeter and < 0.5% edge pixels in the sky. Also checked:
 * the non-target crate stays un-inked under `targets`, today's full-frame outline still runs without `targets`, and the
 * depth toon ink (fadeDistance 40) inks the near ground more than the sky. The receipt is written only when every
 * check passes.
 */

const SPEC = "tests/browser/gu47/outline-targets.spec.ts";
const HARNESS = "/tests/browser/gu47/outline-targets.html";
const SCENE = "tests/browser/gu47/outline-targets-harness.ts outlineScene(): sky #8fc3ea, ground plane 40 m, target sphere \"rider\" at (-0.9, 1, 0), non-target box \"crate\" at (1.4, 0.5, -0.5), camera (0, 2.2, 7) -> (0, 0.6, 0) fov 45, 480x270";

interface OutlineWindow {
  __AURA3D_OUTLINE_RECEIPT__?: {
    renderer(): string;
    render(id: OutlineVariant): Promise<OutlineFrame>;
    compare(base: OutlineVariant, inked: OutlineVariant): OutlineComparison;
  };
  __AURA3D_OUTLINE_RECEIPT_ERROR__?: string;
}

test.describe("GU47 outline-targets receipt", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);
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
      const w = window as unknown as OutlineWindow;
      return Boolean(w.__AURA3D_OUTLINE_RECEIPT__ || w.__AURA3D_OUTLINE_RECEIPT_ERROR__);
    }, undefined, { timeout: 60_000 });
    const error = await page.evaluate(() => (window as unknown as OutlineWindow).__AURA3D_OUTLINE_RECEIPT_ERROR__);
    if (error) throw new Error(error);
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  const render = (id: OutlineVariant) => page.evaluate((key) => (window as unknown as OutlineWindow).__AURA3D_OUTLINE_RECEIPT__!.render(key), id);
  const compare = (base: OutlineVariant, inked: OutlineVariant) =>
    page.evaluate(([a, b]) => (window as unknown as OutlineWindow).__AURA3D_OUTLINE_RECEIPT__!.compare(a, b), [base, inked] as const);

  test("outline({ targets }) inks >= 60% of the target's perimeter, < 0.5% sky edges, and not the non-target", async () => {
    const mask = await render("mask");
    const plain = await render("plain");
    const targets = await render("targets");
    const full = await render("full");
    const targeted = await compare("plain", "targets");
    const today = await compare("plain", "full");
    const renderer = receiptRenderer(await page.evaluate(() => (window as unknown as OutlineWindow).__AURA3D_OUTLINE_RECEIPT__!.renderer()));
    const omit = ({ pngBase64: _png, ...rest }: OutlineFrame) => rest;
    logMetrics("outline-targets", { renderer, plain: omit(plain), targets: omit(targets), full: omit(full), targeted, today });

    const checks = {
      cleanRuntime: [mask, plain, targets, full].every((frame) => frame.errors.length === 0),
      framesDrew: [mask, plain, targets, full].every((frame) => frame.drawCalls > 0),
      targetPerimeterInkedAtLeast60pc: targeted.riderPerimeterInked >= 0.6,
      skyEdgesBelowHalfPercent: targeted.skyEdgeFraction < 0.005,
      nonTargetUninked: targeted.cratePerimeterInked <= 0.05,
      noTargetSkip: !targets.postSkipped.some((reason) => reason.startsWith("OUTLINE_TARGETS_")),
      fullOutlineStillInksTheCrate: today.cratePerimeterInked > targeted.cratePerimeterInked
    };
    for (const [name, passed] of Object.entries(checks)) expect(passed, name).toBe(true);

    const version = engineVersion();
    const receipt: Receipt = {
      capability: "outline-targets",
      version,
      gitSha: gitSha(),
      renderer,
      scene: SCENE,
      frames: [
        saveFrame({ pngBase64: plain.pngBase64, metrics: {} } as never, `evidence/receipts/outline-targets/${version}/plain.png`, "no outline"),
        saveFrame({ pngBase64: targets.pngBase64, metrics: {} } as never, `evidence/receipts/outline-targets/${version}/targets.png`, "outline({ targets: [\"rider\"] })"),
        saveFrame({ pngBase64: full.pngBase64, metrics: {} } as never, `evidence/receipts/outline-targets/${version}/full.png`, "outline() full frame (today)")
      ],
      tests: [SPEC, "tests/unit/gu47/ee/outline-targets.test.ts", "tests/unit/gu47/ee/outline-targets-engine.test.ts"],
      date: new Date().toISOString(),
      checks: {
        ...checks,
        riderPerimeterInked: targeted.riderPerimeterInked,
        skyEdgeFraction: targeted.skyEdgeFraction,
        cratePerimeterInked: targeted.cratePerimeterInked,
        fullCratePerimeterInked: today.cratePerimeterInked
      }
    };
    writeReceipt(receipt);
  });

  test("toon({ inkSource: 'depth', fadeDistance }) inks the near ground and the rider, not the sky", async () => {
    await render("mask");
    const plain = await render("plain");
    const toonColor = await render("toon-color");
    const toonDepth = await render("toon-depth");
    const depth = await compare("plain", "toon-depth");
    const color = await compare("plain", "toon-color");
    logMetrics("outline-targets-toon", { plain: plain.drawCalls, depth, color });
    expect(toonColor.errors).toEqual([]);
    expect(toonDepth.errors).toEqual([]);
    expect(depth.riderPerimeterInked, "rider perimeter inked by depth").toBeGreaterThanOrEqual(0.6);
    expect(depth.skyEdgeFraction, "sky edges").toBeLessThan(0.005);
    expect(depth.bottomChanged, "near ground changes more than the sky").toBeGreaterThan(depth.topChanged);
  });

  test("no page errors or console errors during the receipt run", () => {
    expect(problems).toEqual([]);
  });
});
