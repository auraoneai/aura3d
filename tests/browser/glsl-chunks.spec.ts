import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Rgba = readonly [number, number, number, number];
interface CompileResult { readonly name: string; readonly stage: string; readonly ok: boolean; readonly log: string }
interface Probe { readonly id: string; readonly centre: Rgba; readonly errors: readonly string[] }
interface Harness { compileAll(): CompileResult[]; probeIds: readonly string[]; probe(id: string): Promise<Probe> }

const enc = (linear: number) => Math.round(255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055));
const near = (a: Rgba, b: readonly number[], tolerance = 4) => [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= tolerance);

test.describe("author GLSL chunks on a real WebGL2 context", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("every chunk compiles and links, and known-value probes render the expected colours", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto(`${server.origin}/tests/browser/glsl-chunks-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __GLSL_CHUNKS__?: unknown }).__GLSL_CHUNKS__ !== undefined, undefined, { timeout: 120_000 });

    const compiled = await page.evaluate(() => (window as unknown as { __GLSL_CHUNKS__: Harness }).__GLSL_CHUNKS__.compileAll());
    console.log(`GLSL_CHUNKS_COMPILE ${JSON.stringify(compiled)}`);
    for (const r of compiled) expect(r.ok, `${r.name} (${r.stage}) failed: ${r.log}`).toBe(true);

    const ids = await page.evaluate(() => (window as unknown as { __GLSL_CHUNKS__: Harness }).__GLSL_CHUNKS__.probeIds);
    const captures: Record<string, Probe> = {};
    for (const id of ids) captures[id] = await page.evaluate((v) => (window as unknown as { __GLSL_CHUNKS__: Harness }).__GLSL_CHUNKS__.probe(v), id);
    console.log(`GLSL_CHUNKS_PROBES ${JSON.stringify(captures)}`);
    for (const id of ids) expect(captures[id]!.errors, `${id} errors`).toEqual([]);

    const half = enc(0.5);
    expect(near(captures.saturate!.centre, [255, half, 0]), `saturate ${captures.saturate!.centre}`).toBe(true);
    expect(near(captures.safeNormalizeZero!.centre, [half, 255, half]), `safeNormalizeZero ${captures.safeNormalizeZero!.centre}`).toBe(true);
    expect(near(captures.safeDivZero!.centre, [0, half, half]), `safeDivZero ${captures.safeDivZero!.centre}`).toBe(true);
    expect(near(captures.finite!.centre, [0, half, 255]), `finite ${captures.finite!.centre}`).toBe(true);
    expect(near(captures.toonRamp!.centre, [half, half, half]), `toonRamp ${captures.toonRamp!.centre}`).toBe(true);
    expect(near(captures.fogLinear!.centre, [half, 0, half]), `fogLinear ${captures.fogLinear!.centre}`).toBe(true);
    expect(near(captures.skyZenith!.centre, [0, 0, 255]), `skyZenith ${captures.skyZenith!.centre}`).toBe(true);
    const n = captures.noiseRange!.centre;
    expect(n[0] + n[1] + n[2], `noiseRange ${n}`).toBeGreaterThan(30);
  });
});
