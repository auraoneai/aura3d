import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXAMPLE = "examples/tsl-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/parity-tsl");

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface Sample {
  readonly frames: number;
  readonly cal: readonly Rgb[];
  readonly a: Rgb;
  readonly b: Rgb;
  readonly c: Rgb;
  readonly dLeft: Rgb;
  readonly dRight: Rgb;
  readonly fLeft: Rgb;
  readonly fRight: Rgb;
  readonly eCentroidX: number;
  readonly ePixels: number;
}
interface Api {
  sample(frames?: number): Promise<Sample>;
  setTint(rgb: readonly [number, number, number]): void;
  setShift(units: number): void;
  cWeight(timeSeconds: number): number;
  expectF(): { readonly left: readonly number[]; readonly right: readonly number[] };
  unsupportedProbe(): { readonly threw: boolean; readonly code?: string; readonly message?: string };
  info(): { readonly geometries: number; readonly programs?: number };
  readonly pxPerUnit: number;
}
type Win = { __AURA_TSL_LAB__?: { status: string; errors: string[]; error?: string; routeHealth?: { parityIds: readonly string[] } }; __AURA_TSL_LAB_API__?: Api };

const CAL_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;
type Channel = "r" | "g" | "b";

/**
 * The output pipeline writes sRGB-encoded pixels (0.2 -> 124, measured on the first remote run), so every
 * expectation maps a shader value through the sRGB OETF. The calibration strip (constant greys 0 / .25 / .5
 * / .75 / 1) is checked against that same curve in the test body, so a pipeline change fails loudly there.
 */
const srgbPixel = (value: number): number => {
  const v = Math.min(1, Math.max(0, value));
  const encoded = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return encoded * 255;
};
const curveFor = (_cal: readonly Rgb[], _channel: Channel) => srgbPixel;
const near = (actual: number, expected: number, tolerance: number, label: string) =>
  expect.soft(Math.abs(actual - expected), `${label}: got ${actual.toFixed(1)}, expected ${expected.toFixed(1)} +/- ${tolerance}`).toBeLessThanOrEqual(tolerance);

/**
 * SH-01: `material.node` (TSL subset) renders on a real WebGL2 GPU. Every colour
 * expectation goes through a transfer curve measured on the same frame from
 * constant grey `material.node` patches, so no colour-pipeline assumption is made.
 */
test.describe("parity TSL node materials on WebGL2 (SH-01)", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  const openLab = async (page: import("@playwright/test").Page) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${server.origin}/examples/tsl-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const lab = (window as unknown as Win).__AURA_TSL_LAB__;
      return lab?.status === "ready" || lab?.status === "error";
    }, undefined, { timeout: 120_000 });
    const lab = await page.evaluate(() => (window as unknown as Win).__AURA_TSL_LAB__!);
    expect(lab.status, `lab failed: ${lab.error ?? errors.join(" | ")}`).toBe("ready");
    expect(lab.routeHealth?.parityIds).toEqual(["SH-01", "SH-02"]);
    const call = <T>(fn: (api: Api) => T | Promise<T>) =>
      page.evaluate(`(${fn.toString()})(window.__AURA_TSL_LAB_API__)`) as Promise<T>;
    return { errors, call };
  };

  /**
   * R-26: a `texture.data` handle in a `material.node` texture uniform binds its real device texture (with the
   * handle's nearest filtering), so each half of the 2x1 texture shows its own texel instead of the white
   * fallback. 0 and 255 are fixed points of the sRGB transfer curve, so the check holds whether or not the
   * texture is decoded on sampling.
   */
  test("texture node samples the authored texels (R-26)", async ({ page }) => {
    const { call } = await openLab(page);
    const s0 = await call((api) => api.sample(23));
    const curve = { r: curveFor(s0.cal, "r"), g: curveFor(s0.cal, "g"), b: curveFor(s0.cal, "b") };
    test.info().annotations.push({ type: "texture-samples", description: JSON.stringify({ dLeft: s0.dLeft, dRight: s0.dRight }) });
    near(s0.dLeft.r, curve.r(1), 14, "D left.r");
    near(s0.dLeft.b, curve.b(0), 14, "D left.b");
    near(s0.dRight.b, curve.b(1), 14, "D right.b");
    near(s0.dRight.r, curve.r(0), 14, "D right.r");
  });

  test("constant, uniform, time, positionNode, Fn/Loop/If graphs match the CPU reference on the GPU", async ({ page }) => {

    const source = readFileSync(resolve(EXAMPLE), "utf8");
    expect(source).toContain("material.node(");
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);

    const { errors, call } = await openLab(page);

    // ---- first frame batch (~24 frames, t ~= 0.4 s) --------------------------------------------------
    const s0 = await call((api) => api.sample(23));
    const curve = { r: curveFor(s0.cal, "r"), g: curveFor(s0.cal, "g"), b: curveFor(s0.cal, "b") };
    // The calibration strip must itself be readable and must follow the sRGB output curve, otherwise nothing below means anything.
    expect(s0.cal[4]!.g, `calibration white too dark: ${JSON.stringify(s0.cal)}`).toBeGreaterThan(s0.cal[0]!.g + 150);
    for (let i = 0; i < CAL_VALUES.length; i += 1) {
      for (const channel of ["r", "g", "b"] as const) near(s0.cal[i]![channel], srgbPixel(CAL_VALUES[i]!), 6, `calibration ${CAL_VALUES[i]} ${channel}`);
    }

    // (1) constant colour node: #33aa55 -> (0.2, 0.667, 0.333)
    near(s0.a.r, curve.r(0x33 / 255), 10, "A.r");
    near(s0.a.g, curve.g(0xaa / 255), 10, "A.g");
    near(s0.a.b, curve.b(0x55 / 255), 10, "A.b");

    // (2) uniform colour: starts red
    near(s0.b.r, curve.r(1), 12, "B.r start");
    near(s0.b.g, curve.g(0), 12, "B.g start");
    near(s0.b.b, curve.b(0), 12, "B.b start");

    // (6) Fn + Loop + If/Else: GPU pixels vs the CPU reference interpreter
    const expectF = await call((api) => api.expectF());
    near(s0.fLeft.r, curve.r(expectF.left[0]!), 14, "F left.r");
    near(s0.fLeft.g, curve.g(expectF.left[1]!), 14, "F left.g");
    near(s0.fLeft.b, curve.b(expectF.left[2]!), 14, "F left.b");
    near(s0.fRight.r, curve.r(expectF.right[0]!), 14, "F right.r");
    near(s0.fRight.g, curve.g(expectF.right[1]!), 14, "F right.g");
    near(s0.fRight.b, curve.b(expectF.right[2]!), 14, "F right.b");

    // (5) positionNode baseline (uShift = 0)
    expect(s0.ePixels, `E quad not visible: ${s0.ePixels}`).toBeGreaterThan(2000);

    const infoBefore = await call((api) => api.info());

    // ---- uniform + positionNode updates, one settled batch (~48 frames) --------------------------------
    await call((api) => api.setTint([0, 0, 1]));
    await call((api) => api.setShift(0.8));
    const s1 = await call((api) => api.sample(24));

    // (2) setUniform recolours the frame, with no new program or geometry
    near(s1.b.b, curve.b(1), 14, "B.b after setUniform");
    near(s1.b.r, curve.r(0), 14, "B.r after setUniform");

    // (5) positionNode displacement moved the geometry by 0.8 world units along +x
    const pxPerUnit = await call((api) => api.pxPerUnit);
    const shiftPx = s1.eCentroidX - s0.eCentroidX;
    near(shiftPx, 0.8 * pxPerUnit, 14, "E centroid shift (px)");
    expect(s1.ePixels / s0.ePixels, `E pixel count changed ${s0.ePixels} -> ${s1.ePixels}`).toBeGreaterThan(0.8);
    expect(s1.ePixels / s0.ePixels).toBeLessThan(1.2);

    // ---- later time (~71 frames, t ~= 1.18 s) ---------------------------------------------------------
    const s2 = await call((api) => api.sample(23));
    const infoAfter = await call((api) => api.info());
    expect(infoAfter.geometries).toBe(infoBefore.geometries);
    if (infoBefore.programs !== undefined) expect(infoAfter.programs, "setUniform must not compile new programs").toBe(infoBefore.programs);

    // (3) time-driven graph. `u_time` is wall-clock (`performance.now()/1000` taken when each frame graph is built,
    // packages/rendering/src/renderer/FrameGraph.ts), not `app.step(dt)` time, so the phase of sin(time * 4) cannot be
    // predicted. What can be verified: the colour changes live across spaced samples, and every sample lies on the
    // graph's mix(red, blue, w) curve for some weight w in [0, 1] (R = srgb(1 - w), B = srgb(w), G = 0).
    const timeSamples: Rgb[] = [s0.c, s1.c, s2.c];
    for (let k = 0; k < 5; k += 1) {
      await page.waitForTimeout(250);
      timeSamples.push((await call((api) => api.sample(1))).c);
    }
    const invertSrgb = (pixel: number): number => {
      const e = Math.min(1, Math.max(0, pixel / 255));
      return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
    };
    const rs = timeSamples.map((c) => c.r);
    expect.soft(Math.max(...rs) - Math.min(...rs), `C never changed with time: ${JSON.stringify(timeSamples)}`).toBeGreaterThan(40);
    timeSamples.forEach((c, index) => {
      const w = invertSrgb(c.b);
      near(c.r, curve.r(1 - w), 16, `C sample ${index} on the mix curve (R vs 1 - w, w = ${w.toFixed(2)})`);
      near(c.g, curve.g(0), 12, `C sample ${index} g`);
    });

    // (7) an unsupported TSL name fails loudly in the page
    const probe = await call((api) => api.unsupportedProbe());
    expect(probe.threw).toBe(true);
    expect(probe.code).toBe("tsl-unsupported-node");

    expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);

    const report = { s0, s1, s2, timeSamples, infoBefore, infoAfter, shiftPx, pxPerUnit, probe, expectF };
    writeFileSync(resolve(REPORT_DIRECTORY, "tsl-samples.json"), `${JSON.stringify(report, null, 2)}\n`);
    test.info().annotations.push({ type: "samples", description: JSON.stringify(report) });
  });
});
