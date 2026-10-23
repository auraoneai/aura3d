import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXAMPLE = "examples/custom-attributes-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/parity-custom-attributes");

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface Sample { readonly left: Rgb; readonly right: Rgb; readonly pointPixels: number }
interface Api {
  sample(frames?: number): Promise<Sample>;
  recolorLeft(r: number, g: number, b: number): void;
  setPointSize(px: number): void;
  info(): { readonly geometries: number; readonly programs?: number };
}
type Win = { __AURA_CUSTOM_ATTR_LAB__?: { status: string; errors: string[]; error?: string; routeHealth?: { parityIds: readonly string[] } }; __AURA_CUSTOM_ATTR_LAB_API__?: Api };

/**
 * R-23: custom per-vertex attributes reach the GPU on the live WebGL2 path.
 * Quad colour comes only from `pigmentBase`/`paintOriginal`; point footprint
 * only from `size`; `updateAttribute` changes both in place.
 */
test.describe("parity custom vertex attributes (R-23)", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  test("custom attributes drive colour and point size, and update in place", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

    const source = readFileSync(resolve(EXAMPLE), "utf8");
    expect(source).toContain("attribute vec3 pigmentBase;");
    expect(source).toContain('topology: "points"');
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);

    await page.goto(`${server.origin}/examples/custom-attributes-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const lab = (window as unknown as Win).__AURA_CUSTOM_ATTR_LAB__;
      return lab?.status === "ready" || lab?.status === "error";
    }, undefined, { timeout: 90_000 });
    const lab = await page.evaluate(() => (window as unknown as Win).__AURA_CUSTOM_ATTR_LAB__!);
    expect(lab.status, `lab failed: ${lab.error ?? errors.join(" | ")}`).toBe("ready");
    expect(lab.routeHealth?.parityIds).toEqual(["SG-05", "SH-02", "R-23"]);

    const call = <T>(fn: (api: Api) => T | Promise<T>) =>
      page.evaluate(`(${fn.toString()})(window.__AURA_CUSTOM_ATTR_LAB_API__)`) as Promise<T>;

    // 1. Colour comes only from the custom pigmentBase attribute.
    const first = await call((api) => api.sample(24));
    test.info().annotations.push({ type: "sample-first", description: JSON.stringify(first) });
    expect(first.left.r).toBeGreaterThan(150);
    expect(first.left.g).toBeLessThan(60);
    expect(first.left.b).toBeLessThan(60);
    expect(first.right.b).toBeGreaterThan(150);
    expect(first.right.r).toBeLessThan(60);
    expect(first.right.g).toBeLessThan(60);

    // 2. The points' footprint comes only from the custom size attribute.
    expect(first.pointPixels).toBeGreaterThan(200);

    // 3. updateAttribute rewrites in place: colour flips, footprint shrinks, no new geometry or program.
    const infoBefore = await call((api) => api.info());
    await call((api) => api.recolorLeft(0, 1, 0));
    await call((api) => api.setPointSize(4));
    // One frame after the write the upload has landed but temporal history still blends the old colour in
    // (evidence only); after the history settles the new attribute values own the pixels.
    const oneFrame = await call((api) => api.sample(1));
    const second = await call((api) => api.sample(24));
    test.info().annotations.push({ type: "sample-update", description: JSON.stringify({ oneFrame, second }) });
    expect(oneFrame.left.g, `oneFrame ${JSON.stringify(oneFrame)}`).toBeGreaterThan(oneFrame.left.b);
    expect(second.left.g).toBeGreaterThan(150);
    expect(second.left.r).toBeLessThan(60);
    expect(second.right.b).toBeGreaterThan(150);
    expect(second.pointPixels).toBeLessThan(first.pointPixels / 4);
    expect(second.pointPixels).toBeGreaterThan(0);
    const infoAfter = await call((api) => api.info());
    expect(infoAfter.geometries).toBe(infoBefore.geometries);
    if (infoBefore.programs !== undefined) expect(infoAfter.programs).toBe(infoBefore.programs);

    test.info().annotations.push({ type: "samples", description: JSON.stringify({ first, oneFrame, second, infoBefore, infoAfter }) });
    expect(errors).toEqual([]);
  });
});
