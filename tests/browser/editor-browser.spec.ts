import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("editor browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("picks a browser scene target and renders a visible translate gizmo viewport", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/editor-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_EDITOR_BROWSER_TEST__?.status === "ready" || window.__AURA3D_EDITOR_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_EDITOR_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.pickedId).toBe("editor-cube");
    expect(result?.translatedX).toBe(3);
    expect(result?.selectedHierarchyId).toBeTruthy();
    expect(result?.flattenedHierarchy).toEqual(expect.arrayContaining([
      "0:root:idle",
      "1:inspected-cube:idle",
      "2:editor-child:selected"
    ]));
    expect(result?.inspectorPropertyCount).toBeGreaterThanOrEqual(4);
    expect(result?.inspectorEditedName).toBe("inspected-cube");
    expect(result?.undoName).toBe("editor-cube");
    expect(result?.redoName).toBe("inspected-cube");
    expect(result?.playModeEditBlocked).toBe(true);
    expect(result?.snapshotUndoDepth).toBe(2);
    expect(result?.nonBlankPixels).toBeGreaterThan(1000);
  });
});

declare global {
  interface Window {
    __AURA3D_EDITOR_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly pickedId?: string;
      readonly translatedX?: number;
      readonly selectedHierarchyId?: string | number;
      readonly flattenedHierarchy?: readonly string[];
      readonly inspectorPropertyCount?: number;
      readonly inspectorEditedName?: string;
      readonly undoName?: string;
      readonly redoName?: string;
      readonly playModeEditBlocked?: boolean;
      readonly snapshotUndoDepth?: number;
      readonly nonBlankPixels?: number;
      readonly error?: string;
    };
  }
}
