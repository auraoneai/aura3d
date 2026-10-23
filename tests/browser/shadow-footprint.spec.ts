import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * A single figure-sized caster must darken only about its own shadow footprint, at narrow-fov far cameras (Aura Slam,
 * fov 15 at ~45 m) as well as wide near ones. Remote only (tools/remote-acr/run.sh); never local Playwright.
 */
const LAB = "/examples/shadow-lab/";
type Probe = { shadow: boolean; darker: number; lighter: number; changed: number; total: number; image: string; diag: unknown };
type Win = Window & { __SHADOW_LAB__?: { ready: boolean; measure(): Promise<Probe> }; __SHADOW_LAB_ERROR__?: string };
const reportDir = "tests/reports/shadow-footprint";

const CONFIGS: Array<{ id: string; query: string }> = [
  { id: "fov15-default", query: "fov=15" },
  { id: "fov15-c1", query: "fov=15&cascades=1" },
  { id: "fov15-max60", query: "fov=15&maxDistance=60" },
  { id: "fov32-near", query: "fov=32&dist=0.12" },
  { id: "fov60-near", query: "fov=60&dist=0.07" },
  { id: "fov60-far", query: "fov=60&dist=0.5" }
];

test.describe("directional shadow footprint", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("one small caster darkens a small multiple of its footprint", async ({ page }) => {
    mkdirSync(resolve(reportDir), { recursive: true });
    await page.setViewportSize({ width: 640, height: 360 });
    const out: Record<string, { on: Omit<Probe, "image">; off: Omit<Probe, "image"> }> = {};
    for (const cfg of CONFIGS) {
      const run: Record<"on" | "off", Probe> = {} as never;
      for (const mode of ["on", "off"] as const) {
        await page.goto(`${server.origin}${LAB}?${cfg.query}${mode === "off" ? "&shadow=0" : ""}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as unknown as Win).__SHADOW_LAB__?.ready) || Boolean((window as unknown as Win).__SHADOW_LAB_ERROR__), undefined, { timeout: 60_000 });
        run[mode] = await page.evaluate(() => (window as unknown as Win).__SHADOW_LAB__!.measure());
        writeFileSync(resolve(reportDir, `${cfg.id}-${mode}.jpg`), Buffer.from(run[mode].image.split(",")[1]!, "base64"));
        const { image, ...rest } = run[mode];
        process.stdout.write(`@@SHADOW_FOOTPRINT ${cfg.id} ${mode} ${JSON.stringify(rest)}\n`);
        process.stdout.write(`@@SHADOW_IMG ${cfg.id} ${mode} ${image.slice(0, 200000)}\n`);
      }
      out[cfg.id] = { on: (({ image, ...r }) => r)(run.on), off: (({ image, ...r }) => r)(run.off) };
    }
    for (const cfg of CONFIGS) {
      const { on, off } = out[cfg.id]!;
      const footprint = Math.max(off.changed, 500);
      expect(on.changed, `${cfg.id}: ${on.changed} changed pixels with sun shadow vs ${off.changed} footprint without`).toBeLessThanOrEqual(footprint * 4);
    }
  });
});
