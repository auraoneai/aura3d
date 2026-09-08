import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Replay = {
  schema: string; disabled: boolean; steps: number; deltaTime: number; width: number; height: number;
  capacity: number; camera: unknown; adapterName: string; backend: string; executionPath: string;
  seedSource: string; collisionContacts: number; canvasId: string;
  frames: { step: number; contacts: number; collision: number; live: number; renderedLive: number; childSpawns: number; drawCalls: number; nativeSubmissions: number }[];
};
type Control = { run(disabled: boolean): Promise<Replay>; cleanup(): void };

test.describe("P01 resident particle collision rendered negative control", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("same-seed native collision replay produces contacts and a visible trajectory difference", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.bringToFront();
    await page.goto(`${server.origin}/apps/wow-webgpu-compute-particles/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as { __a3dWowRuntime?: { status: string; error?: string; frameCount?: number }; __a3dParticle301Collision?: Control };
      if (scope.__a3dWowRuntime?.status === "error" || scope.__a3dWowRuntime?.status === "unsupported") throw new Error(scope.__a3dWowRuntime.error ?? "Native particles unavailable");
      return (scope.__a3dWowRuntime?.frameCount ?? 0) >= 10 && !!scope.__a3dParticle301Collision;
    }, undefined, { timeout: 90_000 });
    const directory = "tests/reports/gpu-particle-301-collision";
    mkdirSync(directory, { recursive: true });
    const runs: Replay[] = [];
    const images: Buffer[] = [];
    try {
      for (const disabled of [false, true]) {
        const result = await page.evaluate(disabled => (window as unknown as { __a3dParticle301Collision: Control }).__a3dParticle301Collision.run(disabled), disabled);
        runs.push(result);
        const path = `${directory}/${disabled ? "collision-disabled" : "collision-enabled"}.png`;
        const screenshot = await page.locator(`#${result.canvasId}`).screenshot({ path });
        images.push(screenshot);
        await testInfo.attach(disabled ? "collision disabled native canvas" : "collision enabled native canvas", { path, contentType: "image/png" });
        await page.evaluate(() => (window as unknown as { __a3dParticle301Collision: Control }).__a3dParticle301Collision.cleanup());
      }
      // Canvas2D is solely an image decoder for already captured native GPU pixels.
      const pixels = await page.evaluate(async encoded => {
        const decoded: ImageData[] = [];
        for (const png of encoded) {
          const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
          const image = await createImageBitmap(blob);
          const analysis = document.createElement("canvas"); analysis.width = image.width; analysis.height = image.height;
          const ctx = analysis.getContext("2d")!; ctx.drawImage(image, 0, 0); image.close();
          decoded.push(ctx.getImageData(0, 0, analysis.width, analysis.height));
        }
        const a = decoded[0]!, b = decoded[1]!;
        if (a.width !== b.width || a.height !== b.height) throw new Error("Collision comparison resolution changed");
        let changedPixels = 0, absoluteDifference = 0, foregroundOn = 0, foregroundOff = 0;
        for (let offset = 0; offset < a.data.length; offset += 4) {
          let maximumDifference = 0, maximumOn = 0, maximumOff = 0;
          for (let channel = 0; channel < 3; channel++) {
            const difference = Math.abs(a.data[offset + channel]! - b.data[offset + channel]!);
            maximumDifference = Math.max(maximumDifference, difference); absoluteDifference += difference;
            maximumOn = Math.max(maximumOn, a.data[offset + channel]!); maximumOff = Math.max(maximumOff, b.data[offset + channel]!);
          }
          if (maximumDifference >= 20) changedPixels++;
          if (maximumOn >= 40) foregroundOn++;
          if (maximumOff >= 40) foregroundOff++;
        }
        const totalPixels = a.width * a.height;
        return { width: a.width, height: a.height, changedPixels, changedFraction: changedPixels / totalPixels,
          normalizedMeanDifference: absoluteDifference / (totalPixels * 3 * 255), foregroundOn, foregroundOff };
      }, images.map(image => image.toString("base64")));
      const report = { schema: "muse301-resident-collision-visual/v1", claimSurface: "rendering internals", runs, pixels, errors,
        images: images.map((image, index) => ({ path: `${directory}/${index === 0 ? "collision-enabled" : "collision-disabled"}.png`, sha256: createHash("sha256").update(image).digest("hex") })) };
      const path = `${directory}/comparison.json`; writeFileSync(path, JSON.stringify(report, null, 2));
      await testInfo.attach("native collision trajectories and pixel comparison", { path, contentType: "application/json" });
      expect(errors).toEqual([]);
      expect(runs[0]!.collisionContacts).toBeGreaterThan(0);
      expect(runs[1]!.collisionContacts).toBe(0);
      expect(runs[0]!.camera).toEqual(runs[1]!.camera);
      expect([runs[0]!.width, runs[0]!.height]).toEqual([runs[1]!.width, runs[1]!.height]);
      for (const [index, run] of runs.entries()) {
        expect(run.steps).toBe(180); expect(run.deltaTime).toBe(1 / 60); expect(run.backend).toBe("webgpu");
        expect(run.executionPath).toBe("gpu-resident-storage"); expect(run.frames).toHaveLength(180);
        for (const frame of run.frames) {
          expect(frame.nativeSubmissions).toBe(frame.step); expect(frame.drawCalls).toBe(2); expect(frame.live).toBe(12_000);
          expect(frame.collision).toBe(index === 0 ? 12_000 : 0);
        }
      }
      expect(pixels.foregroundOn).toBeGreaterThan(1000); expect(pixels.foregroundOff).toBeGreaterThan(1000);
      expect(pixels.changedFraction).toBeGreaterThan(0.001);
      expect(pixels.normalizedMeanDifference).toBeGreaterThan(0.0002);
    } finally {
      await page.evaluate(() => (window as unknown as { __a3dParticle301Collision?: Control }).__a3dParticle301Collision?.cleanup());
    }
  });
});
