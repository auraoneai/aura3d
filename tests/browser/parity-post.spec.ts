import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXAMPLE = "examples/custom-shader-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/parity-post");

interface LabState {
  readonly status: string;
  readonly frame: number;
  readonly passNames: readonly string[];
  readonly postUniformApplied: boolean;
  readonly errors: readonly string[];
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly error?: string;
}

const state = (page: import("@playwright/test").Page): Promise<LabState> =>
  page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB__?: LabState }).__AURA_CUSTOM_SHADER_LAB__!);

/**
 * threejs-parity SH-03 (lane L1): `effects.shaderPass` registers GLSL
 * post passes through `app.post.addPostPass` at named order slots on the
 * WebGL2 v2 graph; `app.post.setPassUniform` mutates uniforms without a
 * shader rebuild; an `enabled:false` pass stays registered but never runs.
 */
test.describe("parity shader post passes (SH-03)", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("ordered custom passes execute on WebGL2 and setPassUniform mutates live", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const source = readFileSync(resolve(EXAMPLE), "utf8");
    expect(source).toContain("effects.shaderPass");
    expect(source).toContain("addPostPass");
    expect(source).toContain("setPassUniform");
    expect(source.match(/order:\s*"/g)?.length).toBeGreaterThanOrEqual(3); // named order slots exercised
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);

    await page.goto(`${server.origin}/examples/custom-shader-lab/?backend=webgl2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const lab = (window as unknown as { __AURA_CUSTOM_SHADER_LAB__?: LabState }).__AURA_CUSTOM_SHADER_LAB__;
        return lab?.status === "ready" && lab.frame >= 1;
      },
      undefined,
      { timeout: 90_000 }
    ).catch(async () => {
      const lab = await state(page).catch(() => undefined);
      throw new Error(`custom-shader-lab post did not become ready: ${errors.join(" | ") || lab?.error || lab?.status || "no browser diagnostic"}`);
    });

    const ready = await state(page);
    expect(ready.passNames).toEqual(["lab-posterize", "lab-invert"]);
    // §8/§11.3: route-health names the parity IDs this port exercised.
    expect(ready.routeHealth?.parityIds).toEqual(["SH-02", "SH-03", "SH-09", "SH-10"]);

    const canvas = page.locator("#stage");
    const shot = async (name: string) => {
      const before = (await state(page)).frame;
      await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(1));
      // SET_TIME schedules an async renderFrame — wait for the frame counter
      // to advance so the screenshot always captures the new frame.
      await page.waitForFunction(
        (prev) => {
          const lab = (window as unknown as { __AURA_CUSTOM_SHADER_LAB__?: LabState }).__AURA_CUSTOM_SHADER_LAB__;
          return (lab?.frame ?? 0) > prev;
        },
        before,
        { timeout: 60_000 }
      );
      await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, name) });
      // Hash the engine's own readback — a composited canvas.screenshot can
      // capture a stale presented frame on slow software rasterisers.
      return page.evaluate(() =>
        (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SHOT__?: () => Promise<string> }).__AURA_CUSTOM_SHADER_LAB_SHOT__?.() ?? Promise.resolve("")
      );
    };
    const hash = (dataUrl: string) => createHash("sha256").update(dataUrl).digest("hex");

    const baseline = hash(await shot("post-baseline.png"));
    // Posterize gain 1 → 4: the before-tonemap pass visibly quantises harder.
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_PASS_GAIN__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_PASS_GAIN__(4));
    const gained = hash(await shot("post-gain4.png"));
    expect(gained).not.toBe(baseline);
    expect((await state(page)).postUniformApplied).toBe(true);
    // The disabled pass (flat red) never ran — count near-pure-red pixels in
    // the real readback; a solid-red frame would saturate the count. Successive
    // captures render fresh frames, so an exact-hash compare is not stable.
    const disabled = await shot("post-disabled-proof.png");
    const redStats = await page.evaluate(async (dataUrl: string) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const probe = document.createElement("canvas");
      probe.width = img.width;
      probe.height = img.height;
      const ctx = probe.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let red = 0;
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i]! > 240 && px[i + 1]! < 20 && px[i + 2]! < 20) red += 1;
        if (px[i]! + px[i + 1]! + px[i + 2]! > 60) lit += 1;
      }
      return { red, lit, total: px.length / 4 };
    }, disabled);
    expect(redStats.lit).toBeGreaterThan(0);
    expect(redStats.red).toBeLessThan(redStats.total * 0.9);
    expect(errors).toEqual([]);
  });
});

/**
 * R-03b: on WebGL2 bloom composites inside the fused present, so a pass at
 * `after-bloom` / `before-tonemap` must be applied AFTER it (§6.1 S9/S10 →
 * before-tonemap → OUT) while `before-bloom` is bloomed. A very bright HDR
 * band is written at each slot: bloom spills a halo past the band edge only
 * when the band exists before bloom.
 */
test.describe("parity post slot order on WebGL2 (R-03b)", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;
  const LAB = "examples/post-order-lab/main.ts";

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  interface OrderLabState {
    readonly status: string;
    readonly frame: number;
    readonly slot: string;
    readonly passNames: readonly string[];
    readonly bandEdge: number;
    readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
    readonly error?: string;
  }
  const orderState = (page: import("@playwright/test").Page): Promise<OrderLabState> =>
    page.evaluate(() => (window as unknown as { __AURA_POST_ORDER_LAB__?: OrderLabState }).__AURA_POST_ORDER_LAB__!);

  test("after-bloom and before-tonemap bands stay crisp; before-bloom bands bloom", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const source = readFileSync(resolve(LAB), "utf8");
    expect(source).toContain("effects.bloom");
    expect(source).toContain("effects.shaderPass");
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);

    await page.goto(`${server.origin}/examples/post-order-lab/?backend=webgl2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const lab = (window as unknown as { __AURA_POST_ORDER_LAB__?: OrderLabState }).__AURA_POST_ORDER_LAB__;
        return lab?.status === "ready" && lab.frame >= 1;
      },
      undefined,
      { timeout: 90_000 }
    ).catch(async () => {
      const lab = await orderState(page).catch(() => undefined);
      throw new Error(`post-order-lab did not become ready: ${errors.join(" | ") || lab?.error || lab?.status || "no browser diagnostic"}`);
    });
    expect((await orderState(page)).routeHealth?.parityIds).toEqual(["SH-03"]);

    // Mean luma ((r + g + b) / 3, 0..255) over the vertical middle half: the
    // band interior (x in [4, edge - 4]) and the halo strip just outside the
    // edge (x in [edge + 2, edge + 34]). Luma, not hue: the tone mapper
    // desaturates a very bright HDR value toward white.
    const measure = async (slot: "none" | "before-bloom" | "after-bloom" | "before-tonemap") => {
      await page.evaluate((s) => (window as unknown as { __AURA_POST_ORDER_LAB_SET_SLOT__: (v: string) => Promise<void> }).__AURA_POST_ORDER_LAB_SET_SLOT__(s), slot);
      const lab = await orderState(page);
      expect(lab.slot).toBe(slot);
      expect(lab.passNames).toEqual(slot === "none" ? [] : ["order-band"]);
      const shot = await page.evaluate(() =>
        (window as unknown as { __AURA_POST_ORDER_LAB_SHOT__: () => Promise<string> }).__AURA_POST_ORDER_LAB_SHOT__()
      );
      expect(shot.startsWith("data:image/png")).toBe(true);
      await page.locator("#stage").screenshot({ path: resolve(REPORT_DIRECTORY, `order-${slot}.png`) });
      return page.evaluate(async ({ dataUrl, edgeFraction }) => {
        const img = new Image();
        await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = dataUrl; });
        const probe = document.createElement("canvas");
        probe.width = img.width;
        probe.height = img.height;
        const ctx = probe.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const edge = Math.round(img.width * edgeFraction);
        const y0 = Math.round(img.height * 0.25);
        const y1 = Math.round(img.height * 0.75);
        const meanOf = (x0: number, x1: number, f: (r: number, g: number, b: number) => number): number => {
          const px = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
          let sum = 0;
          let n = 0;
          for (let i = 0; i < px.length; i += 4) {
            sum += f(px[i]!, px[i + 1]!, px[i + 2]!);
            n += 1;
          }
          return sum / n;
        };
        const luma = (r: number, g: number, b: number) => (r + g + b) / 3;
        const magenta = (r: number, g: number, b: number) => (r + b) / 2 - g;
        const column = (x: number) => meanOf(x, x + 1, luma);
        return {
          band: meanOf(4, edge - 4, luma),
          halo: meanOf(edge + 2, edge + 34, luma),
          bandMagenta: meanOf(4, edge - 4, magenta),
          haloMagenta: meanOf(edge + 2, edge + 34, magenta),
          nearEdge: column(edge + 3),
          edge,
          width: img.width
        };
      }, { dataUrl: shot, edgeFraction: lab.bandEdge });
    };

    const none = await measure("none");
    const beforeBloom = await measure("before-bloom");
    const afterBloom = await measure("after-bloom");
    const beforeTonemap = await measure("before-tonemap");
    const measurements = JSON.stringify({ none, beforeBloom, afterBloom, beforeTonemap });
    test.info().annotations.push({ type: "r03b-measurements", description: measurements });
    console.log(`R03B_MEASUREMENTS ${measurements}`);

    // The pass ran at every slot: the band interior is bright.
    for (const m of [beforeBloom, afterBloom, beforeTonemap]) expect(m.band).toBeGreaterThan(120);
    // Baseline: with no pass the neighbourhood is the dark scene.
    expect(none.band).toBeLessThan(25);
    expect(none.halo).toBeLessThan(25);
    // before-bloom is bloomed: energy spills past the band edge.
    expect(beforeBloom.halo - none.halo).toBeGreaterThan(12);
    // after-bloom and before-tonemap are written after the composite: crisp edge.
    expect(afterBloom.halo - none.halo).toBeLessThan(4);
    expect(beforeTonemap.halo - none.halo).toBeLessThan(4);
    expect(errors).toEqual([]);
  });
});
