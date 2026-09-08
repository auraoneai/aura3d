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
  for (const width of [390, 1200]) test(`mixed roles have measured nonoverlapping placement at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/label-occlusion-harness.html`);
    await page.waitForFunction(() => Boolean((window as unknown as { __labelOcclusionProbe?: unknown }).__labelOcclusionProbe));
    const receipts = [];
    for (const options of [
      { tick: true, fontSize: 14, cameraX: 0 },
      { tick: false, fontSize: 14, cameraX: 0 },
      { tick: false, fontSize: 23, cameraX: 0 },
      { tick: false, fontSize: 23, cameraX: 1 }
    ]) {
      const result = await page.evaluate(async options => {
        const runner = window as unknown as { __mixedLabels: (options: { tick: boolean; fontSize: number; cameraX: number }) => Promise<{
          projected: Array<{ id: string; visible: boolean; x: number; y: number; width: number; height: number }>;
          telemetry: { placed: number; declared: number; offscreen: number; suppressed: number };
          rectangles: Array<{ id: string; role: string; visible: boolean; x: number; y: number; width: number; height: number }>;
          viewport: { width: number; height: number }; typedHero: string;
          protectedHeroRect: { x: number; y: number; width: number; height: number }; heroRegionColoredPixels: number;
        }> };
        return runner.__mixedLabels(options);
      }, options);
      const visible = result.rectangles.filter(rect => rect.visible);
      expect(result.typedHero).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(result.heroRegionColoredPixels).toBeGreaterThan(100);
      const hero = result.protectedHeroRect;
      for (const rect of visible) {
        const overlapWidth = Math.max(0, Math.min(rect.x + rect.width, hero.x + hero.width) - Math.max(rect.x, hero.x));
        const overlapHeight = Math.max(0, Math.min(rect.y + rect.height, hero.y + hero.height) - Math.max(rect.y, hero.y));
        expect(overlapWidth * overlapHeight, `${rect.id} obscures the protected typed-hero region`).toBe(0);
      }
      expect(result.telemetry.placed).toBe(visible.length);
      expect(result.telemetry.placed + result.telemetry.offscreen).toBe(result.telemetry.declared);
      expect(visible.length).toBeGreaterThan(2);
      for (const rect of visible) {
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(-0.1);
        expect(rect.y).toBeGreaterThanOrEqual(-0.1);
        expect(rect.x + rect.width).toBeLessThanOrEqual(result.viewport.width + 0.1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(result.viewport.height + 0.1);
        const projected = result.projected.find(label => label.id === rect.id)!;
        expect(projected.visible).toBe(true);
        expect(projected.width).toBeCloseTo(rect.width, 1);
        expect(projected.y).toBeCloseTo(rect.y + rect.height / 2, 1);
      }
      const gaps: Record<string, number> = { hud: 0, tick: 2, annotation: 4 };
      for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i]!; const b = visible[j]!;
        const separatedX = a.x + a.width <= b.x + 0.1 || b.x + b.width <= a.x + 0.1;
        const gap = Math.max(gaps[a.role]!, gaps[b.role]!);
        expect(separatedX || a.y + a.height + gap <= b.y + 0.1 || b.y + b.height + gap <= a.y + 0.1).toBe(true);
      }
      receipts.push(result);
      await testInfo.attach(`labels-${width}-${receipts.length}`, { body: await page.screenshot(), contentType: "image/png" });
    }
    expect(receipts[0]!.projected).not.toEqual(receipts[1]!.projected);
    expect(receipts[1]!.rectangles).not.toEqual(receipts[2]!.rectangles);
    expect(receipts[2]!.projected).not.toEqual(receipts[3]!.projected);
    await testInfo.attach("placement-rectangles", { body: JSON.stringify(receipts, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
  });
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
