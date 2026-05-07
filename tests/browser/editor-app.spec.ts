import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("editor app shell", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("shows hierarchy, inspector, asset browser, profiler, and viewport panels", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await expect(page.locator(".hierarchy-panel .panel-title")).toContainText("Hierarchy");
    await expect(page.locator(".inspector-panel .panel-title")).toContainText("Inspector");
    await expect(page.locator(".asset-browser-panel .panel-title")).toContainText("Assets");
    await expect(page.locator(".profiler-panel .panel-title")).toContainText("Profiler");
    await expect(page.getByLabel("Editor WebGL viewport")).toBeVisible();

    const state = await editorState(page);
    expect(state.nodeCount).toBe(2);
    expect(state.pluginPanels).toEqual(["hierarchy", "inspector", "assets", "profiler"]);

    const overlayPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-viewport-overlay");
      const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return 0;
      let pixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
      }
      return pixels;
    });
    expect(overlayPixels).toBeGreaterThan(1000);

    await page.getByRole("button", { name: "Move X" }).click();
    const movedX = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-hero")?.transform.position[0]);
    expect(movedX).toBe(0.5);
    await expect(page.locator('[data-metric="draw-calls"]')).toContainText("1");
    await expect(page.locator('[data-metric="shader-diagnostics"]')).toContainText("0 warnings");
    await expect(page.locator('[data-role="diagnostics-list"]')).toContainText("shader: Mint Material");
  });

  test("supports hierarchy create, rename, select, reparent, and delete", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByLabel("Rename New Node")).toBeVisible();
    await page.getByLabel("Rename New Node").fill("Browser Authored Node");
    await page.getByLabel("Rename New Node").blur();
    await expect(page.getByRole("button", { name: "Browser Authored Node" })).toBeVisible();

    await page.getByRole("button", { name: "Imported Placeholder" }).click();
    await page.locator('[data-action="reparent-node"][data-node-id="node-child"]').click();
    const reparented = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-child")?.parentId);
    expect(reparented).toBeNull();

    await page.getByRole("button", { name: "Browser Authored Node" }).click();
    const selectedBeforeDelete = await editorState(page);
    expect(selectedBeforeDelete.selectedNodeId).toBeTruthy();
    await page.locator(`[data-action="delete-node"][data-node-id="${selectedBeforeDelete.selectedNodeId}"]`).click();
    await expect(page.getByRole("button", { name: "Browser Authored Node" })).toHaveCount(0);
  });

  test("edits transform, material, light, camera, physics, and script fields from inspector", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.locator('input[data-path="position.X"]').fill("2");
    await page.locator('input[data-path="position.X"]').blur();
    await page.locator('input[data-path="material.baseColor"]').fill("#ff8844");
    await page.locator('input[data-path="material.baseColor"]').blur();
    await page.locator('select[data-path="light.kind"]').selectOption("point");
    await page.locator('input[data-path="camera.enabled"]').setChecked(false);
    await page.locator('select[data-path="physics.body"]').selectOption("dynamic");
    await page.locator('input[data-path="script.behavior"]').fill("BounceBehavior");
    await page.locator('input[data-path="script.behavior"]').blur();

    const node = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((candidate) => candidate.id === "node-hero"));
    expect(node?.transform.position[0]).toBe(2);
    expect(node?.material.baseColor).toBe("#ff8844");
    expect(node?.light.kind).toBe("point");
    expect(node?.camera.enabled).toBe(false);
    expect(node?.physics.body).toBe("dynamic");
    expect(node?.script.behavior).toBe("BounceBehavior");
  });
});

async function waitForEditor(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => window.__GALILEO3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 15_000 });
}

interface EditorState {
  readonly status: "booting" | "ready" | "error";
  readonly mode: string;
  readonly selectedNodeId: string | null;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly savedProjectJson: string;
  readonly exportedFileCount: number;
  readonly pluginPanels: readonly string[];
  readonly error?: string;
}

async function editorState(page: import("@playwright/test").Page): Promise<EditorState> {
  return page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState());
}

declare global {
  interface Window {
    __GALILEO3D_EDITOR_APP__?: {
      getState(): EditorState;
      readonly shell: {
        readonly project: {
          readonly scene: {
            readonly nodes: readonly {
              readonly id: string;
              readonly parentId: string | null;
              readonly transform: { readonly position: readonly number[] };
              readonly material: { readonly baseColor: string };
              readonly light: { readonly kind: string };
              readonly camera: { readonly enabled: boolean };
              readonly physics: { readonly body: string };
              readonly script: { readonly behavior: string };
            }[];
          };
        };
      };
    };
  }
}
