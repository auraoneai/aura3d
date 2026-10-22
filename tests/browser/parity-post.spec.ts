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
