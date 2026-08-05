import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WS-2.7 step 3 — the proof the PRD asks for: *"a visual test showing correct occlusion"*.
 *
 * `occlusionAware` defaulted to **true** on every label factory since before 1.6 and was never read, so
 * labels drew through walls while the API said otherwise. This is the behavioural half: a label whose
 * subject is behind a wall must be occluded, and the same label in front of the wall must not be.
 *
 * The two scenes differ **only** in the subject's z, so any difference is attributable to occlusion.
 */
test.describe("label occlusion", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("a label behind geometry is occluded; the same label in front is not", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/label-occlusion-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __labelOcclusionProbe?: unknown }).__labelOcclusionProbe)
        || (window as unknown as { __labelOcclusionProbeError?: unknown }).__labelOcclusionProbeError !== undefined,
      undefined,
      { timeout: 60_000 }
    );
    const harnessError = await page.evaluate(() => (window as unknown as { __labelOcclusionProbeError?: string }).__labelOcclusionProbeError);
    expect(harnessError, "harness must run to completion").toBeFalsy();

    const probe = await page.evaluate(() => (window as unknown as {
      __labelOcclusionProbe: {
        readonly behind: { readonly occluded: boolean; readonly opacity: number; readonly visible: boolean; readonly domOpacity: string; readonly domOccludedAttribute: string };
        readonly inFront: { readonly occluded: boolean; readonly opacity: number; readonly domOpacity: string; readonly domOccludedAttribute: string };
      };
    }).__labelOcclusionProbe);

    // Behind a wall: occluded and dimmed, but still present — an annotation that vanishes is usually worse.
    expect(probe.behind.occluded, "a label whose subject is behind a wall must be occluded").toBe(true);
    expect(probe.behind.opacity).toBeLessThan(1);
    expect(probe.behind.visible).toBe(true);
    // The DOM must actually reflect it, not just the projection report.
    expect(Number(probe.behind.domOpacity)).toBeLessThan(1);
    expect(probe.behind.domOccludedAttribute).toBe("true");

    /*
     * The control, and the assertion that stops this passing by occluding everything — which would be the
     * easy way to satisfy the first half and is exactly the shortcut worth guarding against.
     */
    expect(probe.inFront.occluded, "a label whose subject is in front of the wall must NOT be occluded").toBe(false);
    expect(probe.inFront.opacity).toBe(1);
    expect(probe.inFront.domOccludedAttribute).toBe("false");
  });
});
