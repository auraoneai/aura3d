import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  compareFrames,
  engineVersion,
  gitSha,
  logMetrics,
  openHarness,
  receiptRenderer,
  renderKit,
  rendererString,
  saveFrame,
  writeReceipt,
  type Receipt
} from "./receipts-lib";

/**
 * Per-kit pixel receipts (PRD beat-three.js WP-K.2): the nine `sceneKits.*` kits that were not
 * root-proven (`materialLab` is the tenth, proven elsewhere). Each kit is mounted through its own
 * public `toAppOptions()` with `createAuraApp`; a receipt is written only when the kit draws real,
 * varied pixels with no runtime error or kit problem, and the kits that animate by time change
 * between two frames 90 fixed steps apart.
 */

const SPEC = "tests/browser/scenekits-receipts.spec.ts";

const kits = [
  { id: "physicsPlayground", animated: true },
  { id: "particleFountain", animated: true },
  { id: "solarSystem", animated: true },
  { id: "neonTunnel", animated: true },
  { id: "dataViz", animated: false },
  { id: "miniGolf", animated: false },
  { id: "cityBlock", animated: false },
  { id: "humanoidWalk", animated: true },
  { id: "productViewer", animated: false }
] as const;

test.describe("scene kit pixel receipts", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;
  let page: Page;
  let renderer = "";
  const version = engineVersion();
  const sha = gitSha();
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`);
    });
    // The example dev server bundles the engine, so `new URL("./assets/humanoid-fixture.glb", import.meta.url)` points
    // at the bundle directory instead of the published dist/engine/agent-api/assets/ layout. Serve the packaged fixture there.
    await page.route(/humanoid-fixture\.glb$/, (route) => route.fulfill({
      path: resolve("packages/engine/src/agent-api/assets/humanoid-fixture.glb"),
      contentType: "model/gltf-binary"
    }));
    await openHarness(page, server.origin);
    renderer = receiptRenderer(await rendererString(page));
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  for (const kit of kits) {
    const capability = `scenekits-${kit.id}`;
    test(`${capability}: sceneKits.${kit.id}() draws real pixels`, async () => {
      const run = await renderKit(page, kit.id);
      const [first, second] = run.frames;
      if (!first || !second) throw new Error(`${kit.id}: expected two frames`);
      const motion = await compareFrames(page, first.key, second.key);
      const checks: Record<string, boolean> = {
        noRuntimeErrors: first.diagnostics.errors.length === 0 && second.diagnostics.errors.length === 0,
        drew: first.diagnostics.drawCalls > 0,
        noKitProblems: run.kit.problems.length === 0,
        nonBlackRatioAtLeast2pc: first.metrics.nonBlackRatio >= 0.02,
        lumaSpreadAtLeast3: first.metrics.lumaStd >= 3,
        atLeast6ColourBuckets: first.metrics.colorBuckets >= 6,
        ...(kit.animated ? { framesDifferOverTime: motion.changedPixelFraction >= 0.001 } : {})
      };
      logMetrics(capability, { first: first.metrics, second: second.metrics, motion, kit: run.kit, diagnostics: first.diagnostics, checks });
      const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
      expect(failed, `${capability} receipt checks failed (metrics logged above)`).toEqual([]);

      const receipt: Receipt = {
        capability,
        version,
        gitSha: sha,
        renderer,
        scene: `sceneKits.${kit.id}() via createAuraApp(canvas, kit.toAppOptions()), 480x270, pixelRatio 1`,
        frames: [
          saveFrame(first, `evidence/receipts/${capability}/${version}/t0.png`, "frame 0"),
          saveFrame(second, `evidence/receipts/${capability}/${version}/t90.png`, "frame after 90 fixed steps (1.5 s)")
        ],
        tests: [SPEC],
        date: new Date().toISOString(),
        checks: {
          ...checks,
          drawCalls: first.diagnostics.drawCalls,
          motionChangedPixelFraction: motion.changedPixelFraction,
          kitNodeCount: run.kit.nodeCount,
          kitStructuralScore: run.kit.structuralScore
        }
      };
      writeReceipt(receipt);
    });
  }

  test("no page errors or console errors during the receipt runs", () => {
    expect(consoleProblems).toEqual([]);
  });
});
