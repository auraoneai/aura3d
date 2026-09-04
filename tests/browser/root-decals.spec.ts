import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/root-decals.json";
const ARTIFACTS = {
  headOn: "tests/reports/root-decals/head-on.png",
  grazing: "tests/reports/root-decals/grazing.png",
} as const;

interface DecalViewProbe {
  readonly view: string;
  readonly expected: readonly { readonly name: string; readonly expectedOpacity: number; readonly mounted: boolean }[];
  readonly measured: Record<string, number>;
  readonly nonDarkPixels: number;
  readonly checksum: number;
  readonly drawCalls: number;
}

interface RootDecalsResult {
  readonly status: "ready" | "error" | "waiting";
  readonly telemetry?: {
    readonly kind: string;
    readonly decalCount: number;
    readonly maxDecals: number;
    readonly overBudget: boolean;
    readonly estimatedDrawCalls: number;
    readonly note: string;
    readonly allPolygonOffset: boolean;
    readonly angleFadeDecals: number;
    readonly depthFadeDecals: number;
    readonly maxObservedDecals: number;
  };
  readonly probes?: readonly DecalViewProbe[];
  readonly grazingRepeatDelta?: number;
  readonly error?: string;
}

test.describe("root gameplay decals (PART C4)", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("root decal route renders, fades with angle and depth, holds max-decal telemetry, and shows no grazing z-fighting", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1320, height: 800 });
    await page.goto(`${server.origin}/tests/browser/root-decals-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ROOT_DECALS__?.status === "ready" || window.__AURA3D_ROOT_DECALS__?.status === "error",
      undefined,
      { timeout: 90_000 },
    );

    const result = (await page.evaluate(() => window.__AURA3D_ROOT_DECALS__)) as RootDecalsResult;
    mkdirSync(resolve("tests/reports/root-decals"), { recursive: true });
    writeFileSync(resolve(REPORT_PATH), `${JSON.stringify({ ...result, pageErrors }, null, 2)}\n`);
    await page.screenshot({ path: resolve(ARTIFACTS.grazing) });

    expect(result.status, result.error).toBe("ready");
    if (result.status !== "ready") return;
    expect(pageErrors).toEqual([]);

    // Max-decal telemetry is present on the root route.
    expect(result.telemetry?.kind).toBe("aura-decal-budget");
    expect(result.telemetry?.maxDecals).toBe(32);
    expect(result.telemetry?.overBudget).toBe(false);
    expect(result.telemetry?.allPolygonOffset).toBe(true);
    expect(result.telemetry?.maxObservedDecals).toBeGreaterThanOrEqual(result.telemetry?.decalCount ?? 0);
    expect(result.telemetry?.note).toMatch(/forward as transparent geometry/);
    expect(result.telemetry?.decalCount).toBe(3);
    expect(result.telemetry?.angleFadeDecals).toBe(3);
    expect(result.telemetry?.depthFadeDecals).toBe(1);

    const probe = (view: string): DecalViewProbe => {
      const found = result.probes?.find((candidate) => candidate.view === view);
      expect(found, `missing probe for view ${view}`).toBeDefined();
      return found!;
    };
    const headOn = probe("head-on");
    const far = probe("far");
    const grazing = probe("grazing");

    for (const view of [headOn, far, grazing]) {
      expect(view.drawCalls, `${view.view} drew nothing`).toBeGreaterThan(0);
    }

    // The root decal route renders: head-on decal pixels are abundant.
    const headOnCrimson = headOn.measured["root decal crimson impact"] ?? 0;
    const headOnViridian = headOn.measured["root decal viridian spray"] ?? 0;
    const headOnAmber = headOn.measured["root decal amber scorch"] ?? 0;
    expect(headOnCrimson, "head-on crimson decal pixels").toBeGreaterThan(100);
    expect(headOnViridian, "head-on viridian decal pixels").toBeGreaterThan(100);
    expect(headOnAmber, "head-on amber decal pixels").toBeGreaterThan(100);

    // Angle fade: the grazing view expects zero opacity and measures ~zero pixels.
    for (const entry of grazing.expected) {
      expect(entry.expectedOpacity, `grazing expected opacity for ${entry.name}`).toBeCloseTo(0, 5);
    }
    const grazingTotal = Object.values(grazing.measured).reduce((sum, count) => sum + count, 0);
    const headOnTotal = Object.values(headOn.measured).reduce((sum, count) => sum + count, 0);
    expect(grazingTotal, "grazing decal pixels (fade must kill the decal before edge-on)").toBeLessThan(50);
    expect(headOnTotal - grazingTotal, "head-on minus grazing probe delta").toBeGreaterThan(200);

    // Depth fade: the amber decal fades between the head-on and far views.
    const amberHeadOn = headOn.expected.find((entry) => entry.name === "root decal amber scorch")!;
    const amberFar = far.expected.find((entry) => entry.name === "root decal amber scorch")!;
    expect(amberFar.expectedOpacity).toBeLessThan(amberHeadOn.expectedOpacity);
    expect(amberFar.expectedOpacity, "far amber depth-faded opacity").toBeCloseTo(0, 1);
    const amberFarMeasured = far.measured["root decal amber scorch"] ?? 0;
    const amberHeadOnMeasured = headOn.measured["root decal amber scorch"] ?? 0;
    expect(amberHeadOnMeasured - amberFarMeasured, "amber depth-fade pixel delta").toBeGreaterThan(0);

    // No z-fighting at grazing angles: the repeat grazing capture is stable and
    // empty of decal pixels (offset geometry + fade, not coplanar flicker).
    expect(result.grazingRepeatDelta, "grazing repeat stability delta").toBeLessThan(500);
  });
});
