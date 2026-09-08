import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame, temporalHash, temporalSourceIdentity, temporalCommandIdentity } from "./root-temporal-evidence";

let server: ExampleDevServer;
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server.close(); });

test("R04 root textured instancing submits native instances and preserves each extension map", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${server.origin}/tests/browser/root-extension-instancing-301-harness.html`);
  await page.waitForFunction(() => Boolean((window as any).extensionInstancing301));
  const slots = ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy"];
  const captures: any[] = [];
  const metrics: { slot: string; changedPixels: number; meanAbsoluteRgbDifference: number }[] = [];
  let baseline: number[] = [];
  let baseOnly: number[] = [];
  const directory = "tests/reports/root-extension-instancing-301";
  mkdirSync(directory, { recursive: true });
  for (const slot of [undefined, ...slots, "base-only", "base-only-swapped"]) {
    const frame = await page.evaluate(async changed => (window as any).extensionInstancing301.capture(changed), slot);
    const { pixels, ...metadata } = frame;
    const artifact = retainTemporalFrame(`${directory}/${frame.id}.png`, frame.width, frame.height, pixels);
    const rgba = Buffer.from(pixels);
    const rgbaPath = `${directory}/${frame.id}.rgba`;
    writeFileSync(rgbaPath, rgba);
    captures.push({ ...metadata, artifact, rgba: { path: rgbaPath, sha256: temporalHash(rgba), origin: "bottom-left" } });
    if (!slot) baseline = pixels;
    else if (slot === "base-only") baseOnly = pixels;
    else {
      const reference = slot === "base-only-swapped" ? baseOnly : baseline;
      let sum = 0, changedPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const difference = Math.abs(pixels[i] - reference[i]!) + Math.abs(pixels[i + 1] - reference[i + 1]!) + Math.abs(pixels[i + 2] - reference[i + 2]!);
        sum += difference; if (difference > 3) changedPixels++;
      }
      metrics.push({ slot, changedPixels, meanAbsoluteRgbDifference: sum / (frame.width * frame.height * 3) });
    }
  }
  const report = { scope: "createAuraApp root safe API; bounded WebGL2 extension-map instancing", source: temporalSourceIdentity(), command: temporalCommandIdentity(), captures, metrics, errors };
  writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
  await testInfo.attach("root-extension-instancing-evidence", { body: JSON.stringify(report), contentType: "application/json" });
  expect(errors).toEqual([]);
  for (const capture of captures) {
    expect(capture.backend).toBe("webgl2");
    expect(capture.runtimeSurface).toBe("production-runtime");
    expect(capture.graphicsVersion).toMatch(/^WebGL 2\.0/);
    expect(capture.errors).toEqual([]); expect(capture.glError).toBe(0);
    expect(capture.nativeInstancedSubmissions).toBeGreaterThan(0);
    expect(capture.nativeDraws).toHaveLength(1);
    expect(capture.nativeInstancedFrameDelta).toBe(1);
    // Actual native API arguments, never a configured-instance-count claim.
    expect(capture.nativeDraws.every((draw: any) => draw.instanceCount === 6 && draw.vertexCount > 0)).toBe(true);
    // Device drawCalls covers the whole frame; exactly one native call owns the
    // six-sphere material group. Account separately for observed other passes.
    expect(capture.drawCalls).toBe(capture.nativeFrameDraws.filter((draw:any)=>draw.deviceDraw).length);
    expect(capture.nativeFrameDraws.filter((draw:any)=>draw.instanceCount===6)).toHaveLength(1);
    expect(capture.warnings.filter((warning: string) => /fallback|rejects-instancing|texture fetch failed/i.test(warning))).toEqual([]);
    const subject = capture.texturedMaterials.find((entry: any) => entry.nodeName === "extension-instanced-swatches");
    expect(subject?.pixelBacked).toBe(true);
    expect(subject.slots).toEqual(expect.arrayContaining(capture.id.startsWith("base-only") ? ["baseColor"] : slots));
  }
  expect(metrics).toHaveLength(9);
  for (const metric of metrics) {
    expect(metric.changedPixels, metric.slot).toBeGreaterThan(10);
    expect(metric.meanAbsoluteRgbDifference, metric.slot).toBeGreaterThan(.01);
  }
});
