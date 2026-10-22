import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXAMPLE = "examples/custom-shader-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/parity-shader");

interface LabState {
  readonly status: string;
  readonly backend: string;
  readonly frame: number;
  readonly materialCount: number;
  readonly uTime: { readonly pulse: number; readonly rim: number };
  readonly setUniformApplied: boolean;
  readonly chunkRegistered: boolean;
  readonly publicApiOnly: boolean;
  readonly errors: readonly string[];
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly error?: string;
}

const state = (page: import("@playwright/test").Page): Promise<LabState> =>
  page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB__?: LabState }).__AURA_CUSTOM_SHADER_LAB__!);

/**
 * threejs-parity SH-02/SH-10 (lane L1): `material.custom(spec)` compiles
 * three-style GLSL to portable materials on the authoritative WebGL2 path;
 * `handle.setUniform` mutates parameters without recompiling; a globally
 * registered `#include` chunk resolves through the adapter.
 */
test.describe("parity shader material (SH-02, SH-10)", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("custom materials render on WebGL2 and setUniform mutates without recompile", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const source = readFileSync(resolve(EXAMPLE), "utf8");
    expect(source).toContain("material.custom");
    expect(source).toContain("registerShaderChunk");
    expect(source).toContain("#include <custom_lab_wave>");
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
      throw new Error(`custom-shader-lab did not become ready: ${errors.join(" | ") || lab?.error || lab?.status || "no browser diagnostic"}`);
    });

    const ready = await state(page);
    expect(ready).toMatchObject({
      status: "ready",
      backend: "webgl2",
      materialCount: 3,
      chunkRegistered: true,
      setUniformApplied: true,
      publicApiOnly: true
    });
    // §8/§11.3: route-health names the parity IDs this port exercised.
    expect(ready.routeHealth?.parityIds).toEqual(["SH-02", "SH-03", "SH-09", "SH-10"]);

    const canvas = page.locator("#stage");
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(0));
    const atZero = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-custom-time0.png") });
    expect((await state(page)).uTime.pulse).toBe(0);
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(1));
    const atOne = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-custom-time1.png") });
    expect((await state(page)).uTime.pulse).toBe(1);
    const zeroHash = createHash("sha256").update(atZero).digest("hex");
    const oneHash = createHash("sha256").update(atOne).digest("hex");
    expect(oneHash).not.toBe(zeroHash);

    // setUniform on an authored uniform changes pixels — with no shader-key
    // churn (the hook writes `strength` through `handle.setUniform`).
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_STRENGTH__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_STRENGTH__(0.05));
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(1));
    const dimmed = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-custom-strength-low.png") });
    expect(createHash("sha256").update(dimmed).digest("hex")).not.toBe(oneHash);
    expect(errors).toEqual([]);
  });
});
