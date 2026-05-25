import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = resolve(process.cwd(), "tests/reports/foundation-animation-browser.json");

const report: {
  ok: boolean;
  generatedAt: string;
  command: string;
  validations: Array<{
    readonly name: string;
    readonly ok: boolean;
    readonly metrics: Record<string, number>;
    readonly evidence: readonly string[];
  }>;
} = {
  ok: false,
  generatedAt: new Date().toISOString(),
  command: "pnpm exec playwright test tests/browser/animation-browser.spec.ts",
  validations: []
};

test.describe("animation browser runtime", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.every((validation) => validation.ok);
    report.generatedAt = new Date().toISOString();
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("renders sampled transform animation, crossfade, renderer skinning, and skeleton palette debug pixels", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/animation-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.status === "ready" || window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.frameAValue?.[0]).toBeCloseTo(0, 5);
    expect(result?.frameBValue?.[0]).toBeCloseTo(0, 5);
    expect(result?.frameAValue?.[1]).toBeCloseTo(0, 5);
    expect(result?.frameBValue?.[1]).toBeCloseTo(0, 5);
    expect(result?.crossfadeValue).toBeCloseTo(0, 5);
    expect(result?.additiveValue?.[0]).toBeCloseTo(-0.15, 5);
    expect(result?.additiveValue?.[1]).toBeCloseTo(0.1, 5);
    expect(result?.additiveOrangePixels).toBeGreaterThanOrEqual(180);
    expect(result?.paletteJointCount).toBe(2);
    expect(result?.paletteChildTranslation).toEqual([0.75, 0.25, 0]);
    expect(result?.skinnedDrawCalls).toBe(1);
    expect(result?.externalCharacter).toMatchObject({
      assetId: "cesium-man",
      sourcePath: "/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb",
      meshName: "Cesium_Man",
      clipName: "animation-0",
      vertexCount: 3273,
      jointCount: 19,
      trackCount: 57,
      drawCalls: [1, 1]
    });
    expect(result?.externalCharacter?.indexCount).toBeGreaterThan(10_000);
    expect(result?.externalCharacter?.frameAGreenPixels).toBeGreaterThan(250);
    expect(result?.externalCharacter?.frameBGreenPixels).toBeGreaterThan(250);
    expect(result?.externalCharacter?.changedPixels).toBeGreaterThan(50);
    report.validations.push({
      name: "real-skinned-character-animation-pixel-change",
      ok: Number(result?.externalCharacter?.changedPixels ?? 0) > 50 &&
        Number(result?.externalCharacter?.frameAGreenPixels ?? 0) > 250 &&
        Number(result?.externalCharacter?.frameBGreenPixels ?? 0) > 250,
      metrics: {
        changedPixels: Number(result?.externalCharacter?.changedPixels ?? 0),
        frameAGreenPixels: Number(result?.externalCharacter?.frameAGreenPixels ?? 0),
        frameBGreenPixels: Number(result?.externalCharacter?.frameBGreenPixels ?? 0),
        vertexCount: Number(result?.externalCharacter?.vertexCount ?? 0),
        indexCount: Number(result?.externalCharacter?.indexCount ?? 0),
        jointCount: Number(result?.externalCharacter?.jointCount ?? 0),
        trackCount: Number(result?.externalCharacter?.trackCount ?? 0)
      },
      evidence: [
        "tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb",
        "tests/browser/animation-browser-harness.ts",
        "tests/browser/animation-browser.spec.ts",
        "tests/reports/foundation-animation-browser.json"
      ]
    });
    expect(result?.controls).toMatchObject({
      playing: true,
      paused: true,
      time: 0.25,
      timeScale: 1,
      loopMode: "repeat",
      crossfadeWeight: 0,
      drawCalls: 1,
      history: ["initial"]
    });
    expect(result?.diagnostics).toEqual({ frameA: 1, frameB: 1, crossfade: 1, additive: 1 });

    const [ar = 0, ag = 0, ab = 0, aa = 0] = result?.frameAPixel ?? [];
    expect(ar).toBeGreaterThan(180);
    expect(ag).toBeGreaterThan(120);
    expect(ab).toBeLessThan(90);
    expect(aa).toBe(255);

    const [br = 0, bg = 0, bb = 0, ba = 0] = result?.frameBPixel ?? [];
    expect(br).toBeLessThan(80);
    expect(bg).toBeGreaterThan(120);
    expect(bb).toBeGreaterThan(180);
    expect(ba).toBe(255);

    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.crossfadePixel ?? [];
    expect(cr).toBeGreaterThan(160);
    expect(cg).toBeLessThan(100);
    expect(cb).toBeGreaterThan(140);
    expect(ca).toBe(255);

    const [dr = 0, dg = 0, db = 0, da = 0] = result?.additivePixel ?? [];
    expect(dr).toBeGreaterThan(180);
    expect(dg).toBeGreaterThan(70);
    expect(db).toBeLessThan(80);
    expect(da).toBe(255);

    const [kr = 0, kg = 0, kb = 0, ka = 0] = result?.skinnedPixel ?? [];
    expect(kr).toBeLessThan(80);
    expect(kg).toBeGreaterThan(180);
    expect(kb).toBeGreaterThan(80);
    expect(ka).toBe(255);

    const [rr = 0, rg = 0, rb = 0, ra = 0] = result?.skeletonRootPixel ?? [];
    expect(rr).toBeGreaterThan(200);
    expect(rg).toBeGreaterThan(200);
    expect(rb).toBeGreaterThan(160);
    expect(ra).toBe(255);

    const [sr = 0, sg = 0, sb = 0, sa = 0] = result?.skeletonChildPixel ?? [];
    expect(sr).toBeGreaterThan(200);
    expect(sg).toBeLessThan(140);
    expect(sb).toBeLessThan(130);
    expect(sa).toBe(255);

    await page.locator("#anim-play").click();
    await page.waitForFunction(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls?.history.includes("play"));
    let controls = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls);
    expect(controls?.playing).toBe(true);
    expect(controls?.paused).toBe(false);
    expect(controls?.time).toBeCloseTo(0.5, 5);
    expect(controls?.position?.[0]).toBeCloseTo(0, 5);

    await page.locator("#anim-pause").click();
    await page.waitForFunction(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls?.history.includes("pause"));
    controls = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls);
    expect(controls?.paused).toBe(true);

    await page.locator("#anim-scrub").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "0.75";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls?.history.includes("scrub"));
    controls = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls);
    expect(controls?.time).toBeCloseTo(0.75, 5);
    expect(controls?.position?.[0]).toBeCloseTo(0.3, 5);

    await page.locator("#anim-speed").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls?.history.includes("speed"));
    controls = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls);
    expect(controls?.timeScale).toBe(2);
    expect(controls?.playing).toBe(true);
    expect(controls?.time).toBeCloseTo(1, 5);

    await page.locator("#anim-loop").selectOption("once");
    await page.waitForFunction(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls?.history.includes("loop"));
    controls = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls);
    expect(controls?.loopMode).toBe("once");

    await page.locator("#anim-crossfade").click();
    await page.waitForFunction(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls?.history.includes("crossfade"));
    controls = await page.evaluate(() => window.__GALILEO3D_ANIMATION_BROWSER_TEST__?.controls);
    expect(controls?.crossfadeWeight).toBeCloseTo(0.5, 5);
    expect(controls?.position?.[1]).toBeGreaterThan(0.15);
    const [tr = 0, tg = 0, tb = 0, ta = 0] = controls?.pixel ?? [];
    expect(tr).toBeGreaterThan(70);
    expect(tg).toBeGreaterThan(160);
    expect(tb).toBeGreaterThan(90);
    expect(ta).toBe(255);
  });
});

declare global {
  interface Window {
    __GALILEO3D_ANIMATION_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly frameAPixel?: readonly number[];
      readonly frameBPixel?: readonly number[];
      readonly crossfadePixel?: readonly number[];
      readonly additivePixel?: readonly number[];
      readonly additiveOrangePixels?: number;
      readonly skinnedPixel?: readonly number[];
      readonly externalCharacter?: {
        readonly assetId: "cesium-man";
        readonly sourcePath: string;
        readonly meshName: string;
        readonly clipName: string;
        readonly vertexCount: number;
        readonly indexCount: number;
        readonly jointCount: number;
        readonly trackCount: number;
        readonly frameAGreenPixels: number;
        readonly frameBGreenPixels: number;
        readonly changedPixels: number;
        readonly drawCalls: readonly [number, number];
      };
      readonly skeletonRootPixel?: readonly number[];
      readonly skeletonChildPixel?: readonly number[];
      readonly frameAValue?: readonly [number, number, number];
      readonly frameBValue?: readonly [number, number, number];
      readonly crossfadeValue?: number;
      readonly additiveValue?: readonly [number, number, number];
      readonly paletteJointCount?: number;
      readonly paletteChildTranslation?: readonly [number, number, number];
      readonly skinnedDrawCalls?: number;
      readonly controls?: {
        readonly playing: boolean;
        readonly paused: boolean;
        readonly time: number;
        readonly timeScale: number;
        readonly loopMode: "once" | "repeat" | "pingpong";
        readonly crossfadeWeight: number;
        readonly position: readonly [number, number, number];
        readonly pixel: readonly number[];
        readonly drawCalls: number;
        readonly history: readonly string[];
      };
      readonly diagnostics?: {
        readonly frameA: number;
        readonly frameB: number;
        readonly crossfade: number;
        readonly additive: number;
      };
      readonly error?: string;
    };
  }
}
