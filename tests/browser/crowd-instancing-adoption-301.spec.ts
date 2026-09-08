import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { analyzePngDifferenceBounds } from "./showcase-visual-quality";

interface Capture {
  pixels: number[]; width: number; height: number;
  crowdInstances?: number; crowdDrawItems?: number;
  crowdInstancesPerDraw?: number[];
  crowdDrawLabels?: string[];
  diagnostics: { drawCalls: number; errors: string[]; renderer?: { runtime?: { nativeInstancedSubmissions?: number } } };
}
for (const route of [
  { name: "smart-city", path: "apps/showcase-smart-city-control/", probe: "__AURA3D_CITY_CROWD_PROBE__", copies: 6 },
  { name: "aura-clash", path: "apps/aura-clash-showcase/", probe: "__AURA3D_CLASH_CROWD_PROBE__", copies: 28 }
]) {
  test(`I03 ${route.name} actual route preserves typed copies while reducing native draws`, async ({ page }) => {
    test.setTimeout(route.name === "smart-city" ? 600_000 : 300_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const server = await startExampleDevServer();
    const output = resolve("tests/reports/crowd-instancing-adoption-301", route.name);
    mkdirSync(output, { recursive: true });
    const stages: unknown[] = [];
    const record = (stage: string, detail?: unknown) => {
      stages.push({ stage, detail, at: new Date().toISOString() });
      writeFileSync(resolve(output, "progress.json"), JSON.stringify({ route: route.path, stages, errors }, null, 2));
      console.log(`[I03 ${route.name}] ${stage}`);
    };
    page.on("console", message => { if (message.text().startsWith("[I03")) record(message.text()); });
    try {
      record("navigation");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${server.origin}/${route.path}?crowdProbe=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(key => {
        const host = window as unknown as Record<string, any>;
        if (host.__AURA_CLASH_ARENA_PROOF__?.status === "error") throw new Error(`Aura Clash boot failed: ${host.__AURA_CLASH_ARENA_PROOF__.error}`);
        return Boolean(host[key]);
      }, route.probe, { timeout: 120_000 });
      record("probe-available");
      const captures: Record<string, Omit<Capture, "pixels">> = {};
      const sequence = ["individual", "native", "hidden", "native", ...(route.name === "smart-city" ? Array(6).fill("native") : [])] as Array<"individual" | "native" | "hidden">;
      for (const [index, mode] of sequence.entries()) {
        const visibleIndex = index >= 4 ? index - 4 : undefined;
        const captureName = visibleIndex !== undefined ? `copy-${visibleIndex}` : index === 3 ? "repeated" : mode;
        record(`capture:${captureName}:start`);
        const value = await page.evaluate(async ({ key, mode, captureName, visibleIndex }) => {
          const probe = (window as unknown as Record<string, { capture(mode: string, visibleIndex?: number): Promise<Capture> }>)[key]!;
          const value = await probe.capture(mode, visibleIndex);
          const host = window as unknown as { __I03_CAPTURES__?: Record<string, Capture> };
          (host.__I03_CAPTURES__ ??= {})[captureName] = value;
          // Keep millions of raw components inside the browser. Transferring
          // every array over Playwright's protocol can dominate route runtime.
          const { pixels: _pixels, ...summary } = value;
          // Encode the actual readPixels result, rather than asking the
          // compositor to wait for two stable RAFs after the route is paused.
          // WebGL rows are bottom-up; PNG rows are top-down.
          const image = new ImageData(value.width, value.height);
          for (let y = 0; y < value.height; y++) {
            const row = (value.height - y - 1) * value.width * 4;
            image.data.set(value.pixels.slice(row, row + value.width * 4), y * value.width * 4);
          }
          const encoder = document.createElement("canvas");
          encoder.width = value.width; encoder.height = value.height;
          encoder.getContext("2d")!.putImageData(image, 0, 0);
          return { ...summary, pngDataUrl: encoder.toDataURL("image/png") };
        }, { key: route.probe, mode, captureName, visibleIndex });
        const { pngDataUrl, ...summary } = value;
        captures[captureName] = summary;
        record(`capture:${captureName}:complete`, summary);
        expect(value.diagnostics.errors).toEqual([]);
        record(`screenshot:${captureName}:start`);
        expect(pngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
        writeFileSync(resolve(output, `${captureName}.png`), Buffer.from(pngDataUrl.slice("data:image/png;base64,".length), "base64"));
        record(`screenshot:${captureName}:complete`);
      }
      const individual = captures.individual!, native = captures.native!, hidden = captures.hidden!;
      const { visiblePixels, baselinePixels, representationDifference, repeatDifference } = await page.evaluate(() => {
        const values = (window as unknown as { __I03_CAPTURES__: Record<string, Capture> }).__I03_CAPTURES__;
        const difference = (a: Capture, b: Capture) => {
          if (a.width !== b.width || a.height !== b.height || a.pixels.length !== b.pixels.length) throw new Error("Capture dimensions changed");
          let changed = 0;
          for (let i = 0; i < a.pixels.length; i += 4) {
            if (Math.max(Math.abs(a.pixels[i]! - b.pixels[i]!), Math.abs(a.pixels[i+1]! - b.pixels[i+1]!), Math.abs(a.pixels[i+2]! - b.pixels[i+2]!)) > 12) changed++;
          }
          return changed;
        };
        return { visiblePixels: difference(values.native!, values.hidden!), baselinePixels: difference(values.individual!, values.hidden!), representationDifference: difference(values.native!, values.individual!), repeatDifference: difference(values.native!, values.repeated!) };
      });
      record("pixel-comparison", { visiblePixels, baselinePixels, representationDifference, repeatDifference });
      expect(repeatDifference, "restoring native instancing must restore the same frozen scene").toBe(0);
      expect(visiblePixels).toBeGreaterThan(20);
      expect(baselinePixels).toBeGreaterThan(20);
      // Whole-scene captures share the frozen runtime camera/time. The copies
      // must survive batching; savings cannot be earned by dropping geometry.
      expect(visiblePixels / baselinePixels).toBeGreaterThan(0.8);
      expect(visiblePixels / baselinePixels).toBeLessThan(1.25);
      expect(representationDifference).toBeLessThan(Math.max(30, baselinePixels * 0.2));
      expect(individual.diagnostics.drawCalls).toBeGreaterThan(native.diagnostics.drawCalls);
      expect(native.diagnostics.drawCalls).toBeGreaterThan(hidden.diagnostics.drawCalls);
      expect(native.diagnostics.renderer?.runtime?.nativeInstancedSubmissions).toBeGreaterThan(0);
      const isolatedCopies = route.name === "smart-city" ? Array.from({ length: route.copies }, (_, index) => {
        const metrics = analyzePngDifferenceBounds(readFileSync(resolve(output, `copy-${index}.png`)), readFileSync(resolve(output, "hidden.png")));
        const copy = captures[`copy-${index}`]!;
        record(`isolated-copy:${index}`, metrics);
        expect(copy.crowdInstancesPerDraw?.length).toBeGreaterThan(0);
        expect(copy.crowdInstancesPerDraw).toEqual(Array(copy.crowdDrawItems).fill(1));
        expect(metrics.changedPixels, `fleet copy ${index} must be independently visible`).toBeGreaterThanOrEqual(250);
        expect(metrics.readabilityScore, `fleet copy ${index} readability`).toBeGreaterThanOrEqual(35);
        expect(metrics.colorBuckets).toBeGreaterThanOrEqual(8);
        expect(metrics.clipped).toBe(false);
        return { index, capture: copy, metrics };
      }) : [];
      if (route.name === "smart-city") {
        const fleet = analyzePngDifferenceBounds(readFileSync(resolve(output, "native.png")), readFileSync(resolve(output, "hidden.png")));
        expect(fleet.changedPixels).toBeGreaterThanOrEqual(2500);
        expect(fleet.bounds?.width).toBeGreaterThanOrEqual(96);
        expect(fleet.bounds?.height).toBeGreaterThanOrEqual(72);
        expect(fleet.readabilityScore).toBeGreaterThanOrEqual(35);
        expect(native.crowdDrawLabels?.every(label => /:city-service-fleet:/.test(label))).toBe(true);
        expect(individual.crowdDrawLabels?.every(label => /:city-service-fleet-copy-\d+:/.test(label))).toBe(true);
      }
      {

        expect(native.crowdInstancesPerDraw?.length).toBeGreaterThan(0);
        expect(native.crowdDrawLabels).toHaveLength(native.crowdDrawItems!);
        if (route.name === "aura-clash") expect(native.crowdDrawLabels?.every(label => label.includes(":aura-clash-public-spectator-pool:"))).toBe(true);
        expect(individual.crowdDrawLabels).toHaveLength(individual.crowdDrawItems!);
        if (route.name === "aura-clash") expect(individual.crowdDrawLabels?.every(label => /:aura-clash-public-spectator-\d+:/.test(label))).toBe(true);
        expect(hidden.crowdDrawLabels).toEqual([]);
        expect(native.crowdInstancesPerDraw).toEqual(Array(native.crowdDrawItems).fill(route.copies));
        expect(individual.crowdInstancesPerDraw).toEqual(Array(individual.crowdDrawItems).fill(1));
        expect(hidden.crowdInstancesPerDraw).toEqual([]);
        expect(native.crowdInstances).toBe(native.crowdDrawItems! * route.copies);
      }
      expect(errors).toEqual([]);
      const summarize = (capture: Omit<Capture, "pixels">) => capture;
      writeFileSync(resolve(output, "report.json"), JSON.stringify({
        schema: "aura3d.crowd-instancing-adoption-301/v1", route: route.path,
        generatedAt: new Date().toISOString(), expectedCopies: route.copies,
        individual: summarize(individual), native: summarize(native), hidden: summarize(hidden),
        visiblePixels, baselinePixels, representationDifference, repeatDifference, isolatedCopies,
        drawSavings: individual.diagnostics.drawCalls - native.diagnostics.drawCalls
      }, null, 2));
    } catch (error) {
      record("failed", error instanceof Error ? error.stack : String(error));
      throw error;
    } finally { await server.close(); }
  });
}
