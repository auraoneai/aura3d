import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 WP-6 (E-F) receipt `vfx-atlas-sprites` (PRD acceptance: smoke-a, dust-mote and splash render as their
 * sprites, not dots). Remote only, phase 2:
 *   RUN_ID=gu47-vfx-atlas-sprites SPECS='tests/browser/gu47/vfx-atlas-sprites.spec.ts' tools/remote-acr/run.sh
 * The harness draws four emitters left to right: analytic soft-dot (reference), smoke-a, dust-mote, splash.
 * Software WebGL2. Output: `RECEIPT vfx-atlas-sprites <json>` per crop in the log and the frame under
 * tests/reports/gu47/ (commit it to evidence/receipts/vfx-atlas-sprites/ with `git add -f`).
 */

const CROPS = ["reference soft-dot", "smoke-a", "dust-mote", "splash"] as const;

/** Per-column crop stats from the canvas: coverage, mean luma and a radial-symmetry score (1 = perfect disc). */
async function cropStats(page: Page): Promise<Record<string, { coverage: number; meanLuma: number; radialSymmetry: number; edgeEnergy: number }>> {
  return page.evaluate((names) => {
    const canvas = document.getElementById("stage") as HTMLCanvasElement;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    const out: Record<string, { coverage: number; meanLuma: number; radialSymmetry: number; edgeEnergy: number }> = {};
    const columnWidth = copy.width / names.length;
    names.forEach((name, column) => {
      const x0 = Math.round(column * columnWidth);
      const w = Math.round(columnWidth);
      const y0 = Math.round(copy.height * 0.15);
      const h = Math.round(copy.height * 0.6);
      const { data } = ctx.getImageData(x0, y0, w, h);
      const luma = new Float32Array(w * h);
      let lit = 0;
      let sum = 0;
      for (let i = 0; i < w * h; i++) {
        const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
        luma[i] = l;
        sum += l;
        if (l > 40) lit++;
      }
      // Radial symmetry: luma variance across angle at fixed radius around the crop centre, averaged over radii.
      const cx = w / 2;
      const cy = h / 2;
      let symmetry = 0;
      let rings = 0;
      for (let r = 6; r < Math.min(w, h) / 2; r += 6) {
        const samples: number[] = [];
        for (let a = 0; a < 32; a++) {
          const x = Math.round(cx + Math.cos((a / 32) * Math.PI * 2) * r);
          const y = Math.round(cy + Math.sin((a / 32) * Math.PI * 2) * r);
          samples.push(luma[y * w + x] ?? 0);
        }
        const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
        const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
        symmetry += mean > 1 ? 1 / (1 + variance / (mean * mean)) : 1;
        rings++;
      }
      let edges = 0;
      for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) edges += Math.abs(luma[y * w + x] - luma[y * w + x - 1]) + Math.abs(luma[y * w + x] - luma[(y - 1) * w + x]);
      out[name] = { coverage: lit / (w * h), meanLuma: sum / (w * h), radialSymmetry: rings > 0 ? symmetry / rings : 1, edgeEnergy: edges / (w * h) };
    });
    return out;
  }, [...CROPS]);
}

test.describe("GU47 E-F receipt vfx-atlas-sprites", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("smoke-a, dust-mote and splash sample their atlas sprites", async ({ page }) => {
    test.setTimeout(900_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/tests/browser/gu47/vfx-receipts-harness.html?mode=sprites&vfxdebug=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_GU47_VFX__?.status === "ready" || window.__AURA3D_GU47_VFX__?.status === "error", undefined, { timeout: 300_000 });
    // Every sprite texture loaded (the batch keeps the soft-dot until then), then a few more presented frames.
    await page.waitForFunction(() => {
      const debug = (window as unknown as { __AURA_VFX_DEBUG__?: () => { sprites: Record<string, string> } }).__AURA_VFX_DEBUG__?.();
      const sprites = debug?.sprites ?? {};
      return ["vfx:smoke-a", "vfx:dust-mote", "vfx:splash"].every((key) => sprites[key] === "ready" || sprites[key] === "failed");
    }, undefined, { timeout: 300_000, polling: 1000 });
    const startFrames = await page.evaluate(() => window.__AURA3D_GU47_VFX__?.frames ?? 0);
    await page.waitForFunction((start) => (window.__AURA3D_GU47_VFX__?.frames ?? 0) >= start + 3, startFrames, { timeout: 300_000, polling: 1000 });

    const debug = await page.evaluate(() => (window as unknown as { __AURA_VFX_DEBUG__?: () => unknown }).__AURA_VFX_DEBUG__?.());
    const stats = await cropStats(page);
    mkdirSync(resolve("tests/reports/gu47"), { recursive: true });
    await page.screenshot({ path: resolve("tests/reports/gu47/vfx-atlas-sprites.png") });
    writeFileSync(resolve("tests/reports/gu47/vfx-atlas-sprites.json"), `${JSON.stringify({ stats, debug, pageErrors }, null, 2)}\n`);
    for (const name of CROPS) console.log(`RECEIPT vfx-atlas-sprites ${JSON.stringify({ name, ...stats[name] })}`);

    expect(pageErrors).toEqual([]);
    const sprites = (debug as { sprites: Record<string, string> }).sprites;
    expect(sprites["vfx:smoke-a"]).toBe("ready");
    expect(sprites["vfx:dust-mote"]).toBe("ready");
    expect(sprites["vfx:splash"]).toBe("ready");
    const reference = stats["reference soft-dot"];
    for (const name of ["smoke-a", "dust-mote", "splash"] as const) {
      // Drawn (some coverage) and not the reference dot: a different radial profile or texture detail.
      expect(stats[name].coverage, name).toBeGreaterThan(0.002);
      const differs = Math.abs(stats[name].radialSymmetry - reference.radialSymmetry) > 0.05 || Math.abs(stats[name].edgeEnergy - reference.edgeEnergy) / Math.max(reference.edgeEnergy, 1e-3) > 0.2;
      expect(differs, `${name} reads as the soft-dot`).toBe(true);
    }
  });
});
