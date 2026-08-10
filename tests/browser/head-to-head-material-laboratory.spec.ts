import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/material-laboratory");
const MODES = ["satin", "chrome", "gold", "rubber", "clearcoat", "emissive"] as const;

test.describe("current head-to-head same-asset material laboratory", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("renders six matched material states on the exact frozen product through Aura and Three r185", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${server.origin}/benchmark/current-head-to-head/material-laboratory/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__?.ready === true || Boolean(window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_ERROR__), undefined, { timeout: 180_000 });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const result = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__);
    expect(result).toMatchObject({
      ready: true,
      workload: "same-asset-material-laboratory",
      asset: { id: "showcaseHeadphones", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833", bytes: 1_589_596 },
      viewport: { width: 1440, height: 900, dpr: 1 },
      contract: {
        modes: MODES,
        background: [5, 7, 11, 255],
        environment: { id: "studio-small-08", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", intensity: 1, rotation: 0 },
        toneMapping: { operator: "aces", exposure: 1, outputSpace: "srgb" }
      }
    });
    const actualHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex");
    expect(actualHash).toBe(result.asset.sha256);

    const auraHashes = new Set<string>();
    const threeHashes = new Set<string>();
    const reportModes = [];
    for (const mode of MODES) {
      const entry = result.modes[mode];
      expect(entry.mode).toBe(mode);
      expect(entry.aura.publicPackageOnly).toBe(true);
      expect(entry.aura.drawCalls).toBeGreaterThan(0);
      expect(entry.aura.pixelStats.litPixels).toBeGreaterThan(80_000);
      expect(entry.aura.pixelStats.uniqueColorBuckets, `${mode} Aura color buckets`).toBeGreaterThan(9);
      expect(entry.aura.pixelStats.subjectMeanLuma).toBeGreaterThan(12);
      expect(entry.aura.pixelStats.p99Luma).toBeGreaterThan(entry.aura.pixelStats.p50Luma);
      expect(entry.three.revision).toBe("185");
      expect(entry.three.actualRenderer).toBe(true);
      expect(entry.three.actualGLTFLoader).toBe(true);
      expect(entry.three.actualPhysicalMaterial).toBe(true);
      expect(entry.three.drawCalls).toBeGreaterThan(0);
      expect(entry.three.triangles).toBeGreaterThan(0);
      expect(entry.three.pixelStats.litPixels).toBeGreaterThan(80_000);
      expect(entry.three.pixelStats.uniqueColorBuckets, `${mode} Three color buckets`).toBeGreaterThan(9);
      expect(entry.three.pixelStats.subjectMeanLuma).toBeGreaterThan(12);
      expect(entry.three.pixelStats.p99Luma).toBeGreaterThan(entry.three.pixelStats.p50Luma);
      auraHashes.add(entry.aura.hash);
      threeHashes.add(entry.three.hash);
      const artifacts = [];
      for (const engine of ["aura", "three"] as const) {
        const dataUrl = entry.dataUrls[engine] as string;
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
        const path = resolve(REPORT_DIRECTORY, `${mode}-${engine}.png`);
        writeFileSync(path, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
        expect(statSync(path).size).toBeGreaterThan(10_000);
        artifacts.push({ engine, path: `tests/reports/current-head-to-head/material-laboratory/${mode}-${engine}.png`, bytes: statSync(path).size });
      }
      const { dataUrls: _dataUrls, ...reportEntry } = entry;
      reportModes.push({ ...reportEntry, artifacts });
    }
    expect(auraHashes.size).toBe(MODES.length);
    expect(threeHashes.size).toBe(MODES.length);

    await page.getByRole("button", { name: "Chrome" }).click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__?.selectedMode === "chrome");
    await expect(page.getByRole("button", { name: "Chrome" })).toHaveAttribute("aria-pressed", "true");
    const interaction = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__);
    expect(interaction.modes.chrome.aura.hash).toBe(result.modes.chrome.aura.hash);
    expect(interaction.modes.chrome.three.hash).toBe(result.modes.chrome.three.hash);

    const lifecycle = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_DISPOSE__?.());
    expect(lifecycle).toEqual({ auraMaterialsDisposed: true, auraPipelineDisposed: true, auraEnvironmentDisposed: true, auraRendererDisposed: true, threeMaterialsDisposed: true, threeGeometryDisposed: true, threeEnvironmentDisposed: true, threeRendererDisposed: true });
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-material-laboratory/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: actualHash, viewport: result.viewport, contract: result.contract, claimBoundary: result.claimBoundary, modes: reportModes, interaction: { selectedMode: interaction.selectedMode, stableRerender: true }, lifecycle }, null, 2)}\n`);
  });
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__?: any;
    __AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_ERROR__?: string;
    __AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_DISPOSE__?: () => unknown;
  }
}

export {};
