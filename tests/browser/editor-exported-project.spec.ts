import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("editor exported project", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("runs the checked-in editor-authored static project without loading the editor app", async ({ page }) => {
    await page.goto(`${server.origin}/examples/editor-authored-project/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EXPORTED_PROJECT__?.status === "ready");

    const result = await page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__);
    expect(result?.nodeCount).toBe(2);
    expect(result?.projectName).toBe("Editor Authored Sample");
    await expect(page.locator("#galileo-export-status")).toContainText("Loaded Editor Authored Sample");

    const nonBlankPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#galileo-export");
      const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return 0;
      let pixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
      }
      return pixels;
    });
    expect(nonBlankPixels).toBeGreaterThan(1000);
  });

  test("runs the checked-in V3 editor-authored app with imported asset, material, behavior, and export provenance", async ({ page }) => {
    await page.goto(`${server.origin}/examples/foundation-editor-authored-app/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EXPORTED_PROJECT__?.status === "ready");

    const result = await page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__);
    expect(result?.nodeCount).toBe(2);
    expect(result?.assetCount).toBe(1);
    expect(result?.projectName).toBe("V3 Editor Authored Sample");
    expect(result?.importedAssetNames).toContain("Fox.glb");
    expect(result?.editedMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "Imported Fox GLB", name: "Edited Fox Material", baseColor: "#ff8844" })
    ]));
    expect(result?.configuredBehaviors).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "Imported Fox GLB", behavior: "BounceBehavior" })
    ]));
    expect(result?.usesPlayExportPath).toBe(true);
    expect(result?.interactive).toBe(true);
    expect(result?.provenanceHash).toBe("g3d-prov-9bf29cd5");
    await expect(page.locator("#galileo-export-status")).toContainText("Loaded V3 Editor Authored Sample");

    const nonBlankPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#galileo-export");
      const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return 0;
      let pixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
      }
      return pixels;
    });
    expect(nonBlankPixels).toBeGreaterThan(1000);
    await page.locator("#galileo-export").click({ position: { x: 500, y: 270 } });
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__?.interactions ?? 0)).toBeGreaterThan(0);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__?.selectedNodeName)).toBeTruthy();
  });

  test("runs the checked-in editor-authored game export with objective and follow camera evidence", async ({ page }) => {
    await page.goto(`${server.origin}/examples/editor-authored-game/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EDITOR_AUTHORED_GAME__?.status === "ready");

    const initial = await page.evaluate(() => window.__GALILEO3D_EDITOR_AUTHORED_GAME__);
    expect(initial?.projectName).toBe("V3 Editor Authored Game");
    expect(initial?.nodeCount).toBe(3);
    expect(initial?.assetCount).toBe(1);
    expect(initial?.importedAssetNames).toContain("Fox.glb");
    expect(initial?.configuredBehaviors).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "Imported Fox Player", behavior: "PlayerMoveBehavior" }),
      expect.objectContaining({ node: "Goal Trigger", behavior: "CollectGoalBehavior" }),
      expect.objectContaining({ node: "Gameplay Follow Camera", behavior: "FollowCameraBehavior" })
    ]));
    expect(initial?.usesEditorExportPath).toBe(true);
    expect(initial?.usesPlayModeEvidence).toBe(true);
    expect(initial?.cameraMode).toBe("follow");
    expect(initial?.interactive).toBe(true);
    expect(initial?.won).toBe(false);
    await expect.poll(() => nonBlankCanvasPixels(page, "#editor-authored-game"), { timeout: 10_000 }).toBeGreaterThan(1000);

    await dispatchCanvasPointer(page, "#editor-authored-game", 800, 260);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_AUTHORED_GAME__?.interactions ?? 0)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_AUTHORED_GAME__?.playerX ?? -99), { timeout: 10_000 }).toBeGreaterThan(-2.8);

    for (let index = 0; index < 34; index += 1) {
      await dispatchCanvasKey(page, "#editor-authored-game", "ArrowRight");
    }
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_AUTHORED_GAME__?.won), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_AUTHORED_GAME__?.objectiveStatus)).toBe("Objective complete");
    await expect(page.locator("#editor-authored-game-status")).toContainText("Objective complete");
  });
});

async function nonBlankCanvasPixels(page: import("@playwright/test").Page, selector: string): Promise<number> {
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

async function dispatchCanvasPointer(page: import("@playwright/test").Page, selector: string, x: number, y: number): Promise<void> {
  await page.evaluate(({ canvasSelector, clientX, clientY }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!canvas) throw new Error(`Missing canvas ${canvasSelector}`);
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: rect.left + clientX,
      clientY: rect.top + clientY
    }));
  }, { canvasSelector: selector, clientX: x, clientY: y });
}

async function dispatchCanvasKey(page: import("@playwright/test").Page, selector: string, key: string): Promise<void> {
  await page.evaluate(({ canvasSelector, inputKey }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!canvas) throw new Error(`Missing canvas ${canvasSelector}`);
    canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: inputKey }));
  }, { canvasSelector: selector, inputKey: key });
}

declare global {
  interface Window {
    __GALILEO3D_EXPORTED_PROJECT__?: {
      readonly status: "ready";
      readonly nodeCount: number;
      readonly assetCount?: number;
      readonly projectName: string;
      readonly provenanceHash?: string | null;
      readonly importedAssetNames?: readonly string[];
      readonly editedMaterials?: readonly { readonly node: string; readonly name: string; readonly baseColor: string }[];
      readonly configuredBehaviors?: readonly { readonly node: string; readonly behavior: string }[];
      readonly usesPlayExportPath?: boolean;
      readonly selectedNodeName?: string | null;
      readonly interactions?: number;
      readonly interactive?: boolean;
    };
    __GALILEO3D_EDITOR_AUTHORED_GAME__?: {
      readonly status: "ready";
      readonly projectName: string;
      readonly nodeCount: number;
      readonly assetCount: number;
      readonly importedAssetNames: readonly string[];
      readonly configuredBehaviors: readonly { readonly node: string; readonly behavior: string }[];
      readonly usesEditorExportPath: boolean;
      readonly usesPlayModeEvidence: boolean;
      readonly cameraMode: string;
      readonly interactive: boolean;
      readonly interactions: number;
      readonly playerX: number;
      readonly won: boolean;
      readonly objectiveStatus: string;
    };
  }
}
