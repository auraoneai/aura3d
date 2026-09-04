import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART C2 probe evidence: one probe screenshot per game-ready preset, rendered
 * by the probe harness from each preset's own authoring parameters. The spec
 * retains the PNGs plus a manifest with per-preset mean colors, and requires
 * the six probes to be pairwise visually distinct so a screenshot cannot pass
 * while rendering the same swatch six times.
 */
const REPORT_DIR = "tests/reports/game-ready-materials";
const PRESET_IDS = ["carPaint", "skinSSS-approx", "glassThin", "brushedMetal", "foliage", "concreteAsphalt"] as const;

interface ProbeManifest {
  readonly schema: string;
  readonly generatedAt: string;
  readonly probes: readonly { readonly id: string; readonly screenshot: string; readonly bytes: number; readonly mean: readonly number[] }[];
}

test.describe("game-ready material probes", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("retains one distinct probe screenshot per preset", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/game-ready-material-probes-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_GAME_READY_PROBES__?: { ready?: boolean } }).__AURA3D_GAME_READY_PROBES__?.ready), undefined, { timeout: 30_000 });

    const probes = await page.evaluate(
      () => (window as unknown as { __AURA3D_GAME_READY_PROBES__?: { probes?: { id: string; mean: number[] }[] } }).__AURA3D_GAME_READY_PROBES__?.probes ?? []
    );
    expect(probes.map((probe) => probe.id).sort()).toEqual([...PRESET_IDS].sort());

    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    const manifestProbes = [];
    for (const id of PRESET_IDS) {
      const target = page.locator(`#probe-${id} canvas`);
      await expect(target).toBeVisible();
      const path = resolve(REPORT_DIR, `${id}.png`);
      await target.screenshot({ path });
      const bytes = statSync(path).size;
      expect(bytes, `bytes for ${id}`).toBeGreaterThan(1000);
      const mean = probes.find((probe) => probe.id === id)?.mean ?? [];
      manifestProbes.push({ id, screenshot: `${REPORT_DIR}/${id}.png`, bytes, mean });
    }

    for (let a = 0; a < manifestProbes.length; a++) {
      for (let b = a + 1; b < manifestProbes.length; b++) {
        const left = manifestProbes[a]?.mean ?? [];
        const right = manifestProbes[b]?.mean ?? [];
        const distance = Math.sqrt(
          [0, 1, 2].reduce((sum, channel) => sum + ((left[channel] ?? 0) - (right[channel] ?? 0)) ** 2, 0)
        );
        expect(distance, `probe distance ${manifestProbes[a]?.id} vs ${manifestProbes[b]?.id}`).toBeGreaterThan(12);
      }
    }

    const manifest: ProbeManifest = {
      schema: "aura3d.game-ready-material-probes/v1",
      generatedAt: new Date().toISOString(),
      probes: manifestProbes
    };
    writeFileSync(resolve(REPORT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    expect(errors, "probe harness page errors").toEqual([]);
    for (const id of PRESET_IDS) {
      expect(existsSync(resolve(REPORT_DIR, `${id}.png`)), `probe screenshot for ${id}`).toBe(true);
    }
  });
});
