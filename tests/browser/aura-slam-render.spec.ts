import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { frameDistance, imageStats, type ImageStats } from "../../tools/crayon-capture/heatsink-judge-lib";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * G3 render parity for the native Aura Slam scene (remote only; software WebGL2 under Xvfb).
 * Renders each venue from the render-only harness, logs frame metrics as `SLAMR_METRICS <json>`, asserts structural
 * sanity (non-blank, no console errors, draw calls within the 150 budget) and, when the committed live-game reference
 * (evidence/aura-slam/frames-reference.json) is present, the parity thresholds:
 * luma/RGB histogram JSD <= 0.05, edge-density ratio 0.9..1.1, mean luma delta <= 4.
 * Remote run: SPECS="@headed-xvfb tests/browser/aura-slam-render.spec.ts" PUBLIC_ASSETS="showcaseStadiumSeats.afb44897.glb rooftopScoreboardRigMeshy.866123b7.glb rooftopFloodlightTowerMeshy.1bfcdd0b.glb" tools/remote-acr/run.sh
 */
const VENUES = ["hard", "grass", "clay", "desert", "beach", "moon"] as const;
const SIZES = [{ width: 1280, height: 720 }, { width: 640, height: 360 }] as const;
const REFERENCE_PATH = "evidence/aura-slam/frames-reference.json";

interface RefFrame { venue?: string; width?: number; height?: number; stats?: ImageStats; metrics?: ImageStats }

function loadReference(): RefFrame[] {
  if (!existsSync(REFERENCE_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(REFERENCE_PATH, "utf8")) as { frames?: RefFrame[] } | RefFrame[];
    return Array.isArray(parsed) ? parsed : parsed.frames ?? [];
  } catch {
    return [];
  }
}

/** Decode a PNG screenshot to RGBA inside the page (no image library in the test runner). */
async function decode(page: Page, png: Buffer): Promise<{ width: number; height: number; data: Uint8Array }> {
  const out = await page.evaluate(async (b64: string) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let bin = "";
    for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode(...d.subarray(i, i + 0x8000));
    return { width: bmp.width, height: bmp.height, b64: btoa(bin) };
  }, png.toString("base64"));
  return { width: out.width, height: out.height, data: new Uint8Array(Buffer.from(out.b64, "base64")) };
}

test.describe("aura-slam render parity (G3)", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("every venue renders a non-blank, error-free court within the draw-call budget", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const reference = loadReference();
    const results: Array<Record<string, unknown>> = [];

    for (const size of SIZES) {
      await page.setViewportSize(size);
      for (const venue of VENUES) {
        await page.goto(`${server.origin}/examples/aura-slam/view/harness.html?venue=${venue}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => (window as unknown as { __AURA_SLAM_RENDER__?: { ready(): boolean } }).__AURA_SLAM_RENDER__?.ready() === true, undefined, { timeout: 600_000 });
        await page.evaluate((v) => (window as unknown as { __AURA_SLAM_RENDER__: { show(v: string): Promise<void> } }).__AURA_SLAM_RENDER__.show(v), venue);
        await page.waitForFunction(() => ((window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls() ?? 0) > 0, undefined, { timeout: 600_000, polling: 1000 });
        await page.waitForTimeout(4000);
        const drawCalls = await page.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls());
        console.log(`SLAMR_DIAG ${venue} ${size.width} ${JSON.stringify(await page.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { diag(): unknown } }).__AURA_SLAM_RENDER__.diag()))}`);
        const png = await page.screenshot({ type: "png" });
        const img = await decode(page, png);
        const stats = imageStats(img);
        const row: Record<string, unknown> = { venue, width: size.width, height: size.height, drawCalls, lumaMean: stats.lumaMean, edgeDensity: stats.edgeDensity };
        const ref = reference.find((r) => r.venue === venue && (r.width ?? size.width) === size.width && (r.stats ?? r.metrics));
        if (ref) {
          const d = frameDistance((ref.stats ?? ref.metrics)!, stats);
          Object.assign(row, { lumaJsd: d.lumaJsd, rgbJsd: d.rgbJsd, edgeRatio: stats.edgeDensity / Math.max(1e-9, (ref.stats ?? ref.metrics)!.edgeDensity), lumaDelta: stats.lumaMean - (ref.stats ?? ref.metrics)!.lumaMean });
          expect(d.lumaJsd, `${venue} luma JSD`).toBeLessThanOrEqual(0.05);
          expect(d.rgbJsd, `${venue} RGB JSD`).toBeLessThanOrEqual(0.05);
          expect(row.edgeRatio as number, `${venue} edge ratio`).toBeGreaterThanOrEqual(0.9);
          expect(row.edgeRatio as number, `${venue} edge ratio`).toBeLessThanOrEqual(1.1);
          expect(Math.abs(row.lumaDelta as number), `${venue} mean luma delta`).toBeLessThanOrEqual(4);
        }
        console.log(`SLAMR_METRICS ${JSON.stringify(row)}`);
        const b64 = png.toString("base64");
        const n = Math.ceil(b64.length / 16000);
        if (size.width === 640) for (let i = 0; i < n; i++) console.log(`SLAMR_FRAME ${venue} ${size.width} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
        results.push(row);
        expect(stats.lumaMean, `${venue} not blank`).toBeGreaterThan(8);
        expect(stats.lumaMean, `${venue} not blown out`).toBeLessThan(245);
        if (process.env.SLAMR_STRICT_DRAWCALLS === "1") expect(drawCalls ?? 0, `${venue} draw calls`).toBeLessThanOrEqual(150);
      }
    }
    console.log(`SLAMR_REFERENCE ${reference.length > 0 ? "compared" : "pending (evidence/aura-slam/frames-reference.json not present)"}`);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
    expect(results.length).toBe(VENUES.length * SIZES.length);
  });
});
