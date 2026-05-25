import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-gltf-visual-corpus-browser.json";

test.describe("V4 glTF visual corpus browser evidence", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loads corpus manifest in browser and renders a human-inspectable coverage board", async ({ page }) => {
    await page.goto(`${server.origin}/fixtures/v4/gltf-corpus/manifest.json`, { waitUntil: "domcontentloaded" });
    const manifest = await page.evaluate(() => JSON.parse(document.body.textContent ?? "{}"));
    const summary = {
      assetCount: manifest.assets.length,
      visualEvidenceSlots: manifest.assets.filter((asset: { visualEvidenceSlot?: boolean }) => asset.visualEvidenceSlot).length,
      advancedMaterialAssets: manifest.assets.filter((asset: { advancedMaterial?: boolean }) => asset.advancedMaterial).length,
      animationSkinMorphAssets: manifest.assets.filter((asset: { animationSkinMorph?: boolean }) => asset.animationSkinMorph).length
    };
    const screenshotPath = "tests/reports/external-gallery/assets/gltf-corpus-coverage.png";
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/assets"), { recursive: true });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;margin:0;background:#111;color:#eee}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:16px}.card{border:1px solid #555;padding:10px;min-height:78px;background:#20242b}.tag{display:inline-block;margin:2px;padding:2px 4px;background:#38516e}</style><div class="grid">${manifest.assets.slice(0, 25).map((asset: { id: string; features: string[] }) => `<div class="card"><strong>${asset.id}</strong><br>${asset.features.slice(0, 4).map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>`).join("")}</div>`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const report = {
      ok: summary.assetCount >= 25 && summary.visualEvidenceSlots >= 12 && summary.advancedMaterialAssets >= 5 && summary.animationSkinMorphAssets >= 2,
      generatedAt: new Date().toISOString(),
      screenshotPath,
      productBoundary: "This is corpus coverage board evidence, not final rendered glTF visual proof. Release still requires actual rendered screenshots for the selected assets.",
      summary
    };
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(report.ok).toBe(true);
  });
});
