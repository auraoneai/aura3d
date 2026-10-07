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
        const lit = await page.evaluate(() => {
          const canvas = document.querySelector("#stage canvas");
          if (!canvas) return -1;
          const probe = document.createElement("canvas");
          probe.width = 64;
          probe.height = 36;
          const ctx = probe.getContext("2d")!;
          ctx.drawImage(canvas as HTMLCanvasElement, 0, 0, 64, 36);
          const { data } = ctx.getImageData(0, 0, 64, 36);
          let count = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i]! + data[i + 1]! + data[i + 2]! > 24) count += 1;
          }
          return count;
        });
        expect(lit).toBeGreaterThan(24);
        expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
      });
    }
  }
}
