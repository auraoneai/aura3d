import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("editor import workflow", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("imports a glTF asset with visible import settings and places it into the scene", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EDITOR_APP__?.getState().status === "ready");

    await page.locator('input[data-setting="scale"]').fill("1.5");
    await page.locator('input[data-setting="scale"]').blur();
    await page.getByRole("button", { name: "Import glTF" }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().assetCount)).toBe(1);
    const assetCard = page.locator(".asset-browser-panel .asset-card").filter({ hasText: "sample-triangle" });
    await expect(assetCard.getByText("sample-triangle", { exact: true })).toBeVisible();
    await expect(assetCard.getByText("Loaded with scale 1.5")).toBeVisible();

    await assetCard.getByRole("button", { name: "Place", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState().nodeCount)).toBe(3);
    const placed = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.name === "sample-triangle"));
    expect(placed?.material.name).toBe("sample-triangle Material");
    expect(placed?.parentId).toBe("node-hero");
  });
});

declare global {
  interface Window {
    __GALILEO3D_EDITOR_APP__?: {
      getState(): { readonly status: string; readonly assetCount: number; readonly nodeCount: number };
      readonly shell: {
        readonly project: {
          readonly scene: {
            readonly nodes: readonly {
              readonly name: string;
              readonly parentId: string | null;
              readonly material: { readonly name: string };
            }[];
          };
        };
      };
    };
  }
}
