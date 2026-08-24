import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test.setTimeout(120_000);

test("neon-corridor-strike canvas diversity, stable-frame budget, and HUD accessibility pass", async ({ page }) => {
  const server = await startExampleDevServer();
  const reportDir = resolve("tests/reports/neon-corridor-strike-quality");
  mkdirSync(reportDir, { recursive: true });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");

    const pixels = await page.locator("#app canvas").evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Aura canvas missing");
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 context missing");
      const width = canvas.width;
      const height = canvas.height;
      const bytes = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      const buckets = new Set<string>();
      let visible = 0;
      let bright = 0;
      let colorful = 0;
      let cyan = 0;
      let warm = 0;
      let green = 0;
      const stride = Math.max(4, Math.floor(bytes.length / 320_000 / 4) * 4);
      for (let offset = 0; offset < bytes.length; offset += stride) {
        const r = bytes[offset] ?? 0;
        const g = bytes[offset + 1] ?? 0;
        const b = bytes[offset + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 8) visible += 1;
        if (max > 170) bright += 1;
        if (max - min > 28) colorful += 1;
        if (g > r * 1.15 && b > r * 1.18 && g + b > 150) cyan += 1;
        if (r > g * 1.15 && r > b * 1.12 && r > 80) warm += 1;
        if (g > r * 1.18 && g > b * 1.08 && g > 80) green += 1;
        buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      }
      return { width, height, samples: Math.ceil(bytes.length / stride), visible, bright, colorful, cyan, warm, green, uniqueBuckets: buckets.size };
    });
    expect(pixels.visible).toBeGreaterThan(20_000);
    expect(pixels.bright).toBeGreaterThan(300);
    expect(pixels.colorful).toBeGreaterThan(2_000);
    expect(pixels.cyan).toBeGreaterThan(150);
    expect(pixels.warm).toBeGreaterThan(150);
    expect(pixels.green).toBeGreaterThan(40);
    expect(pixels.uniqueBuckets).toBeGreaterThan(120);

    const pacing = await page.evaluate(async () => {
      const longTasks: number[] = [];
      const observer = typeof PerformanceObserver !== "undefined"
        ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)))
        : undefined;
      try { observer?.observe({ type: "longtask", buffered: false }); } catch { /* unsupported browser entry type */ }
      const samples: number[] = [];
      let previous = performance.now();
      for (let index = 0; index < 120; index += 1) {
        const next = await new Promise<number>((done) => requestAnimationFrame(done));
        samples.push(next - previous);
        previous = next;
      }
      observer?.disconnect();
      const sorted = [...samples].sort((a, b) => a - b);
      const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
      return {
        sampleCount: samples.length,
        medianMs: percentile(0.5),
        p95Ms: percentile(0.95),
        maxMs: sorted.at(-1) ?? 0,
        longTaskCount: longTasks.length,
        longestTaskMs: Math.max(0, ...longTasks)
      };
    });
    expect(pacing.sampleCount).toBe(120);
    expect(pacing.p95Ms).toBeLessThan(80);
    expect(pacing.longestTaskMs).toBeLessThan(180);

    const accessibility = await page.evaluate(() => ({
      language: document.documentElement.lang,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hudRole: document.querySelector("#fps-hud")?.tagName.toLowerCase(),
      fireName: document.querySelector("[data-hud=\"fire\"]")?.textContent?.trim() ?? "",
      focusableFire: document.querySelector("[data-hud=\"fire\"]") instanceof HTMLButtonElement
    }));
    expect(accessibility.language).toBe("en");
    expect(accessibility.scrollWidth).toBeLessThanOrEqual(accessibility.viewportWidth);
    expect(accessibility.hudRole).toBe("aside");
    expect(accessibility.fireName).toContain("FIRE");
    expect(accessibility.focusableFire).toBe(true);

    writeFileSync(resolve(reportDir, "quality.json"), `${JSON.stringify({
      schema: "aura3d-neon-corridor-quality/1.0",
      pass: true,
      pixels,
      pacing,
      accessibility
    }, null, 2)}\n`);
    writeFileSync(resolve(reportDir, "quality.png"), await page.screenshot({ fullPage: false }));
  } finally {
    await server.close();
  }
});
