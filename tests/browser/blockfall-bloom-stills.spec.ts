/**
 * BF-A5/BF-07 — retained bloom before/after stills.
 *
 * Captures two screenshots of the SAME mounted scene differing only by the bloom
 * pass intensity (0 = before, shipped tuned value = after), into
 * tests/reports/blockfall-reactor-bloom/. The route's evidence hook mutates the
 * owned effect spec, which the runtime re-reads per frame — no scene rebuild, no
 * second route instance. The tuned values themselves are documented at the
 * bloomEffect declaration in apps/showcase-blockfall-reactor/src/main.ts.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const OUT_DIR = join("tests", "reports", "blockfall-reactor-bloom");

test("blockfall retains bloom before/after stills from one mounted scene", async ({ page }, testInfo) => {
  testInfo.setTimeout(360_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const value = (window as unknown as {
        __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { frameCount?: number; diagnostics?: { drawCalls?: number } };
      }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
      return Boolean(value && Number(value.frameCount) > 0 && Number(value.diagnostics?.drawCalls) > 0);
    }, undefined, { timeout: 300_000 });

    const probe = await page.evaluate(() => {
      const source = (window as unknown as {
        __AURA3D_BLOCKFALL_BLOOM_PROBE__?: {
          shippedIntensity: number;
          intensity(): number;
          setIntensity(next: number): void;
        };
      }).__AURA3D_BLOCKFALL_BLOOM_PROBE__;
      if (!source) throw new Error("bloom probe missing");
      return { shipped: source.shippedIntensity, current: source.intensity() };
    });
    // The route ships the formalized tuned value, not a default.
    expect(probe.shipped).toBe(0.26);
    expect(probe.current).toBe(0.26);

    mkdirSync(OUT_DIR, { recursive: true });

    await page.evaluate(() => {
      (window as unknown as {
        __AURA3D_BLOCKFALL_BLOOM_PROBE__?: { setIntensity(next: number): void };
      }).__AURA3D_BLOCKFALL_BLOOM_PROBE__?.setIntensity(0);
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT_DIR, "before-bloom-off.png") });

    await page.evaluate(() => {
      (window as unknown as {
        __AURA3D_BLOCKFALL_BLOOM_PROBE__?: {
          setIntensity(next: number): void;
          shippedIntensity: number;
        };
      }).__AURA3D_BLOCKFALL_BLOOM_PROBE__?.setIntensity(
        (window as unknown as {
          __AURA3D_BLOCKFALL_BLOOM_PROBE__?: { shippedIntensity: number };
        }).__AURA3D_BLOCKFALL_BLOOM_PROBE__?.shippedIntensity ?? 0.26
      );
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT_DIR, "after-shipped-bloom.png") });

    // Restore exactly the shipped value so the retained route state stays honest.
    const restored = await page.evaluate(() => {
      const source = (window as unknown as {
        __AURA3D_BLOCKFALL_BLOOM_PROBE__?: {
          setIntensity(next: number): void;
          intensity(): number;
          shippedIntensity: number;
        };
      }).__AURA3D_BLOCKFALL_BLOOM_PROBE__;
      source?.setIntensity(source.shippedIntensity);
      return source?.intensity();
    });
    expect(restored).toBe(0.26);
  } finally {
    await server.close();
  }
});
