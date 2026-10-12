import { test, expect } from "@playwright/test";

// PRD-01 §15 Phase-0 lane smoke: every lane scene mounts on both engines under
// `?a3d-qr=none` and `?a3d-qr=core` (identical while nothing is wired), the
// ready payload is produced, and the stage is non-black.

const SCENES = [
  "prd01-scene-graph-hierarchy",
  "prd01-tonemap-exposure-ramp",
  "prd01-blend-modes",
  "prd01-specular-aa",
  "prd01-primitive-catalog",
  "prd01-draw-throughput"
];

for (const sceneId of SCENES) {
  for (const engine of ["aura3d", "three"]) {
    for (const flags of ["none", "core"]) {
      test(`${sceneId} renders on ${engine} (a3d-qr=${flags})`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(`/?engine=${engine}&scene=${sceneId}&a3d-qr=${flags}`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, {
          timeout: 90_000
        });
        const qrError = await page.evaluate(() => window.__QR_ERROR__);
        expect(qrError).toBeUndefined();
        const payload = await page.evaluate(() => window.__QR_READY__);
        expect(payload).toMatchObject({ engine, scene: sceneId });
        expect((payload as { errors: readonly string[] }).errors).toEqual([]);

        // Non-black stage: at least a handful of pixels differ from the backdrop.
        // Read the composited page (Playwright screenshot, PRD-01 §2.10a), not
        // the canvas via drawImage: with `preserveDrawingBuffer: false` (the
        // §6.9 default) a canvas read after compositing is blank, which made
        // every aura scene look black (GPU run 38190015020) while the capture
        // job's screenshots of the same scenes were lit.
        const shotB64 = (await page.locator("#stage").screenshot({ animations: "disabled" })).toString("base64");
        const lit = await page.evaluate(async (b64) => {
          const tools = (window as unknown as { __QR_TOOLS__: { decodePng(b: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> } }).__QR_TOOLS__;
          const img = await tools.decodePng(b64);
          // Same 64×36 sampling grid as before (one sample per cell center).
          let count = 0;
          for (let gy = 0; gy < 36; gy += 1) {
            for (let gx = 0; gx < 64; gx += 1) {
              const x = Math.min(img.width - 1, Math.floor(((gx + 0.5) * img.width) / 64));
              const y = Math.min(img.height - 1, Math.floor(((gy + 0.5) * img.height) / 36));
              const o = (y * img.width + x) * 4;
              if (img.data[o]! + img.data[o + 1]! + img.data[o + 2]! > 24) count += 1;
            }
          }
          return count;
        }, shotB64);
        expect(lit).toBeGreaterThan(24);
        expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
      });
    }
  }
}
