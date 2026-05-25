import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const editorScreenshotDir = "tests/reports/foundation-editor-screenshots";
const editorScreenshotPath = `${editorScreenshotDir}/editor-authoring-v3.png`;
const exportedScreenshotPath = `${editorScreenshotDir}/editor-authoring-v3-export.png`;

test.describe("V3 editor authoring workflow", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("authors, saves, reloads, exports, and smoke-tests a static app", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.locator('input[data-setting="scale"]').fill("1.25");
    await page.locator('input[data-setting="scale"]').blur();
    await page.locator('select[data-setting="orientation"]').selectOption("y-up");
    await page.getByRole("button", { name: "Import Fox GLB" }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().assetCount), { timeout: 15_000 }).toBe(1);

    const assetCard = page.locator(".asset-browser-panel .asset-card").filter({ hasText: "Fox.glb" });
    await expect(assetCard).toContainText("Loaded real glTF");
    await expect(assetCard).toContainText("Dependencies");
    await expect(page.locator(".timeline-panel")).toContainText("3 animation clips");
    await page.locator('.timeline-panel button[data-action="timeline-preview-clip"]').filter({ hasText: "Run" }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().timeline.selectedClipName)).toBe("Run");
    await page.locator('.timeline-panel input[data-action="timeline-scrub"]').fill("0.42");
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().timeline.scrubTime)).toBe(0.42);
    await page.locator('.timeline-panel button[data-action="timeline-play"]').click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().timeline.playback)).toBe("playing");
    const assetId = await assetCard.getAttribute("data-asset-id");
    expect(assetId).toBeTruthy();
    await dropAssetIntoViewport(page, assetId!);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().nodeCount)).toBe(3);

    await page.getByRole("button", { name: "Move X" }).click();
    await page.getByRole("button", { name: "Rotate Z" }).click();
    await page.getByRole("button", { name: "Scale", exact: true }).click();
    await page.locator('.material-panel input[data-material-path="baseColor"]').fill("#ff8844");
    await page.locator('select[data-path="physics.body"]').selectOption("dynamic");
    await page.locator('select[data-path="physics.collider"]').selectOption("box");

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Rename New Node").fill("Authoring Light");
    await page.getByLabel("Rename New Node").blur();
    await page.locator('select[data-path="light.kind"]').selectOption("point");
    await page.locator('input[data-path="light.intensity"]').fill("2");
    await page.locator('input[data-path="light.intensity"]').blur();

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Rename New Node").fill("Gameplay Camera");
    await page.getByLabel("Rename New Node").blur();
    await page.locator('input[data-path="camera.enabled"]').setChecked(true);
    await page.locator('input[data-path="animation.enabled"]').setChecked(true);
    await page.locator('input[data-path="animation.clip"]').fill("Run");
    await page.locator('input[data-path="animation.clip"]').blur();
    await page.locator('input[data-path="audio.listener"]').setChecked(true);
    await page.locator('input[data-path="particleEmitter.enabled"]').setChecked(true);
    await page.locator('select[data-path="particleEmitter.preset"]').selectOption("fountain");
    await page.locator('input[data-path="particleEmitter.emissionRate"]').fill("48");
    await page.locator('input[data-path="particleEmitter.emissionRate"]').blur();
    await page.locator('input[data-path="particleEmitter.maxParticles"]').fill("256");
    await page.locator('input[data-path="particleEmitter.maxParticles"]').blur();

    await page.locator('select[data-action="view-mode"]').selectOption("collider");
    await expect(page.locator('[data-role="viewport-hud"]')).toContainText("collider");
    await page.screenshot({ path: testInfo.outputPath("editor-authoring-v3.png"), fullPage: true });
    mkdirSync(editorScreenshotDir, { recursive: true });
    await page.screenshot({ path: editorScreenshotPath, fullPage: true });

    await page.getByRole("banner").getByRole("button", { name: "Play" }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().mode)).toBe("play");
    await page.getByRole("banner").getByRole("button", { name: "Play" }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().mode)).toBe("edit");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    const savedProjectJson = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().savedProjectJson);
    expect(savedProjectJson).toContain('"version": 1');
    expect(savedProjectJson).toContain("Fox.glb");
    expect(savedProjectJson).toContain("Authoring Light");
    expect(savedProjectJson).toContain("Gameplay Camera");
    expect(savedProjectJson).toContain('"particleEmitter"');
    expect(savedProjectJson).toContain('"preset": "fountain"');

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.locator('[data-role="project-buffer"]').evaluate((element: HTMLTextAreaElement, value) => {
      element.value = value;
    }, savedProjectJson);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fox.glb" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Authoring Light" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gameplay Camera" })).toBeVisible();

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().exportedFileCount)).toBe(3);
    const exportedFiles = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.shell.exportedFiles());
    const exportedByPath = new Map(exportedFiles.map((file) => [file.path, file.content]));
    await page.route(`${server.origin}/__v3_export/**`, async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop() ?? "index.html";
      const content = exportedByPath.get(name);
      await route.fulfill({
        status: content ? 200 : 404,
        contentType: name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript" : "application/json",
        body: content ?? "missing export fixture"
      });
    });

    await page.goto(`${server.origin}/__v3_export/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EXPORTED_PROJECT__?.status === "ready");
    await expect(page.locator("#galileo-export-status")).toContainText("Loaded");
    expect(await nonBlankCanvasPixels(page, "#galileo-export")).toBeGreaterThan(1000);
    await page.locator("#galileo-export").click({ position: { x: 460, y: 260 } });
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__?.interactions ?? 0)).toBeGreaterThan(0);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__?.interactive)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("editor-authoring-v3-export.png"), fullPage: true });
    await page.screenshot({ path: exportedScreenshotPath, fullPage: true });
  });

  test("places assets through viewport drag/drop and clears scene references on delete", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "Import glTF" }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().assetCount), { timeout: 10_000 }).toBe(1);
    const assetId = await page.locator(".asset-browser-panel .asset-card").first().getAttribute("data-asset-id");
    expect(assetId).toBeTruthy();

    await dropAssetIntoViewport(page, assetId!);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().nodeCount)).toBe(3);

    const placedBeforeDelete = await page.evaluate((draggedAssetId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.scene.nodes.find((node) => node.mesh.assetId === draggedAssetId);
    }, assetId!);
    expect(placedBeforeDelete?.mesh.assetId).toBe(assetId);

    await page.locator(`.asset-browser-panel input[data-action="rename-asset"][data-asset-id="${assetId}"]`).fill("Renamed Drag Fixture");
    await page.locator(`.asset-browser-panel input[data-action="rename-asset"][data-asset-id="${assetId}"]`).blur();
    const renamedAsset = await page.evaluate((draggedAssetId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.assets.find((asset) => asset.id === draggedAssetId);
    }, assetId!);
    expect(renamedAsset?.name).toBe("Renamed Drag Fixture");

    await page.locator(`.asset-browser-panel button[data-action="move-asset"][data-asset-id="${assetId}"]`).click();
    const movedAsset = await page.evaluate((draggedAssetId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.assets.find((asset) => asset.id === draggedAssetId);
    }, assetId!);
    expect(movedAsset?.folder).toBe("Imported/Moved");
    const placedAfterMove = await page.evaluate((nodeId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.scene.nodes.find((node) => node.id === nodeId);
    }, placedBeforeDelete!.id);
    expect(placedAfterMove?.mesh.assetId).toBe(assetId);

    const beforeReimport = await page.evaluate((draggedAssetId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.assets.find((asset) => asset.id === draggedAssetId);
    }, assetId!);
    await page.locator(`.asset-browser-panel button[data-action="reimport-asset"][data-asset-id="${assetId}"]`).click();
    const reimportedAsset = await page.evaluate((draggedAssetId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.assets.find((asset) => asset.id === draggedAssetId);
    }, assetId!);
    expect(reimportedAsset?.revision).toBe((beforeReimport?.revision ?? 1) + 1);
    expect(reimportedAsset?.cacheKey).toContain(`#rev-${reimportedAsset?.revision}`);
    expect(reimportedAsset?.diagnostics.join(" ")).toContain("Cache invalidated");
    const placedAfterReimport = await page.evaluate((nodeId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.scene.nodes.find((node) => node.id === nodeId);
    }, placedBeforeDelete!.id);
    expect(placedAfterReimport?.mesh.assetId).toBe(assetId);

    await page.locator(`.asset-browser-panel button[data-action="delete-asset"][data-asset-id="${assetId}"]`).click();
    const placedAfterDelete = await page.evaluate((nodeId) => {
      return window.__GALILEO3D_EDITOR_APP__!.shell.project.scene.nodes.find((node) => node.id === nodeId);
    }, placedBeforeDelete!.id);
    expect(placedAfterDelete?.mesh.assetId).toBeNull();
    expect(placedAfterDelete?.mesh.primitive).toBe("cube");
  });
});

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__GALILEO3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 15_000 });
}

async function dropAssetIntoViewport(page: Page, assetId: string): Promise<void> {
  await page.evaluate((draggedAssetId) => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-galileo3d-asset", draggedAssetId);
    const viewport = document.querySelector<HTMLElement>(".editor-viewport-panel");
    if (!viewport) throw new Error("editor viewport missing");
    viewport.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, assetId);
}

async function nonBlankCanvasPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data) return 0;
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
    }
    return pixels;
  }, selector);
}

declare global {
  interface Window {
    __GALILEO3D_EDITOR_APP__?: {
      getState(): {
        readonly status: "booting" | "ready" | "error";
        readonly mode: string;
        readonly nodeCount: number;
        readonly assetCount: number;
        readonly savedProjectJson: string;
        readonly exportedFileCount: number;
        readonly timeline: {
          readonly playback: "playing" | "paused";
          readonly scrubTime: number;
          readonly selectedClipName: string | null;
        };
      };
      readonly shell: {
        readonly project: {
          readonly assets: readonly {
            readonly id: string;
            readonly name: string;
            readonly folder?: string;
            readonly revision?: number;
            readonly cacheKey?: string;
            readonly diagnostics: readonly string[];
          }[];
          readonly scene: {
            readonly nodes: readonly {
              readonly id: string;
              readonly mesh: {
                readonly assetId: string | null;
              readonly primitive: string;
              };
              readonly particleEmitter?: {
                readonly enabled: boolean;
                readonly preset: string;
                readonly emissionRate: number;
                readonly maxParticles: number;
              };
            }[];
          };
        };
        exportedFiles(): readonly { readonly path: string; readonly content: string; readonly type: string }[];
      };
    };
    __GALILEO3D_EXPORTED_PROJECT__?: {
      readonly status: "ready";
      readonly nodeCount: number;
      readonly projectName: string;
      readonly selectedNodeName?: string | null;
      readonly interactions?: number;
      readonly interactive?: boolean;
    };
  }
}
