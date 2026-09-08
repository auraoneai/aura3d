import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface Sample {
  position: number[]; target: number[]; zoom: number; distance: number; azimuth: number;
  count: number; centroid: number[]; pixels: number[]; disposed: boolean;
}
interface Harness { sample(): Sample; reset(): void; dispose(): void; cleanup(): void }
const sample = (page: Page) => page.evaluate(() => (window as unknown as { __orbit301: Harness }).__orbit301.sample());
const frames = (page: Page) => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test.describe("3.0.1 attached Orbit/Map options", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  for (const control of ["orbit", "map"]) for (const camera of ["perspective", "orthographic"]) {
    test(`${control} ${camera}: real input, cursor pivot, damping, bounds and disposal`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
      page.on("response", response => { if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) errors.push(`${response.status()} ${response.url()}`); });
      await page.goto(`${server.origin}/tests/browser/orbit-map-options-301-harness.html?control=${control}&camera=${camera}`);
      await page.waitForFunction(() => Boolean((window as unknown as { __orbit301?: unknown }).__orbit301));
      const box = (await page.locator("canvas").boundingBox())!;
      const before = await sample(page);
      expect(before.count).toBeGreaterThan(20);
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
      // Hover alone must not create a touch gesture or move the camera.
      await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      expect((await sample(page)).position).toEqual(before.position);
      await page.mouse.wheel(0, -300);
      await expect.poll(async () => (await sample(page)).target[0]).toBeGreaterThan(0);
      const zoomed = await sample(page);
      expect(Math.abs(zoomed.centroid[0]! - before.centroid[0]!)).toBeLessThan(2);
      expect(zoomed.count).toBeGreaterThan(before.count);
      const changed = zoomed.pixels.reduce((n, v, i) => n + Number(Math.abs(v - before.pixels[i]!) > 20), 0);
      expect(changed).toBeGreaterThan(20);

      await page.evaluate(() => (window as unknown as { __orbit301: Harness }).__orbit301.reset());
      await page.mouse.move(box.x + 30, box.y + 100);
      await frames(page);
      await page.locator("canvas").focus();
      if (control === "orbit") await page.keyboard.down("Shift");
      await page.mouse.down();
      await page.mouse.move(box.x + 230, box.y + 100, { steps: 5 });
      await page.mouse.up();
      if (control === "orbit") await page.keyboard.up("Shift");
      await expect.poll(async () => (await sample(page)).target[0]).toBe(-1);
      const bounded = await sample(page);
      expect(bounded.target.every(v => v >= -1 && v <= 1)).toBe(true);

      await page.evaluate(() => (window as unknown as { __orbit301: Harness }).__orbit301.reset());
      await page.mouse.move(box.x + 128, box.y + 128);
      await frames(page);
      await page.mouse.down({ button: control === "map" ? "right" : "left" });
      await page.mouse.move(box.x + 160, box.y + 128, { steps: 3 });
      await page.mouse.up({ button: control === "map" ? "right" : "left" });
      await frames(page);
      const rotating = await sample(page);
      await expect.poll(async () => (await sample(page)).azimuth).toBeLessThan(rotating.azimuth);

      await page.evaluate(() => (window as unknown as { __orbit301: Harness }).__orbit301.reset());
      const touch = (type: string, id: number, x: number) => page.locator("canvas").dispatchEvent(type, {
        pointerId: id, pointerType: "touch", clientX: box.x + x, clientY: box.y + 128, button: 0, buttons: type === "pointerup" ? 0 : 1
      });
      await touch("pointerdown", 31, 96);
      await touch("pointerdown", 32, 160);
      await frames(page);
      const beforePinch = await sample(page);
      await touch("pointermove", 31, 80);
      await touch("pointermove", 32, 176);
      if (camera === "orthographic") await expect.poll(async () => (await sample(page)).zoom).toBeGreaterThan(beforePinch.zoom);
      else await expect.poll(async () => (await sample(page)).distance).toBeLessThan(beforePinch.distance);
      await touch("pointerup", 31, 80);
      await touch("pointerup", 32, 176);
      await frames(page);

      await page.evaluate(() => (window as unknown as { __orbit301: Harness }).__orbit301.dispose());
      const disposed = await sample(page);
      await page.mouse.wheel(0, 500);
      await page.mouse.move(box.x + 60, box.y + 60);
      await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      expect(await sample(page)).toEqual(disposed);
      expect(disposed.disposed).toBe(true);
      expect(errors).toEqual([]);
      const dir = "tests/reports/orbit-map-options-301";
      mkdirSync(dir, { recursive: true });
      const screenshot = `${dir}/${control}-${camera}.png`;
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`${control}-${camera}`, { path: screenshot, contentType: "image/png" });
      const strip = ({ pixels: _pixels, ...value }: Sample) => value;
      writeFileSync(`${dir}/${control}-${camera}.json`, JSON.stringify({ schema: "aura3d.orbit-map-options/3.0.1",
        generatedAt: new Date().toISOString(), control, camera, pass: true,
        before: strip(before), zoomed: strip(zoomed), bounded: strip(bounded), disposed: strip(disposed), changed }, null, 2));
      await page.evaluate(() => (window as unknown as { __orbit301: Harness }).__orbit301.cleanup());
      expect(errors).toEqual([]);
    });
  }
});
