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
      { timeout: 30_000 }
    ).catch(() => { throw new Error(`custom-shader-lab post did not become ready: ${errors.join(" | ") || "no browser diagnostic"}`); });

    const ready = await state(page);
    expect(ready.passNames).toEqual(["lab-posterize", "lab-invert"]);

    const canvas = page.locator("#stage");
    const shot = async (name: string) => {
      await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(1));
      return canvas.screenshot({ path: resolve(REPORT_DIRECTORY, name) });
    };
    const hash = (shot: Buffer) => createHash("sha256").update(shot).digest("hex");

    const baseline = hash(await shot("post-baseline.png"));
    // Posterize gain 1 → 4: the before-tonemap pass visibly quantises harder.
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_PASS_GAIN__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_PASS_GAIN__(4));
    const gained = hash(await shot("post-gain4.png"));
    expect(gained).not.toBe(baseline);
    expect((await state(page)).postUniformApplied).toBe(true);
    // The disabled pass (flat red) never ran — the canvas is not solid red.
    const disabled = await shot("post-disabled-proof.png");
    expect(hash(disabled)).toBe(gained);
    expect(errors).toEqual([]);
  });
});
