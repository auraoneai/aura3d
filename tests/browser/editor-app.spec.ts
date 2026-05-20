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
    expect(state.pluginPanels).toEqual(["hierarchy", "inspector", "assets", "material", "profiler", "visual-script", "console"]);

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
    await page.getByRole("button", { name: "Rotate Z" }).click();
    await page.getByRole("button", { name: "Scale", exact: true }).click();
    const transformed = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-hero")?.transform);
    expect(transformed?.position[0]).toBe(0.5);
    expect(Math.abs(transformed?.rotation[2] ?? 0)).toBeGreaterThan(0.2);
    expect(transformed?.scale).toEqual([1.25, 1.25, 1.25]);
    await page.getByRole("button", { name: "Orbit" }).click();
    await page.getByRole("button", { name: "Pan" }).click();
    await page.getByRole("button", { name: "Zoom +" }).click();
    await page.getByRole("button", { name: "Focus" }).click();
    const cameraAfterControls = await editorState(page);
    expect(cameraAfterControls.viewportCamera.orbitYaw).toBe(15);
    expect(cameraAfterControls.viewportCamera.orbitPitch).toBe(25);
    expect(cameraAfterControls.viewportCamera.pan).not.toEqual([0, 0]);
    expect(cameraAfterControls.viewportCamera.zoom).toBe(1.25);
    expect(cameraAfterControls.viewportCamera.focusedNodeId).toBe("node-hero");
    await expect(page.locator('[data-role="viewport-hud"]')).toContainText("orbit 15/25");
    await page.getByRole("button", { name: "Reset View" }).click();
    const cameraAfterReset = await editorState(page);
    expect(cameraAfterReset.viewportCamera).toMatchObject({ orbitYaw: 0, orbitPitch: 20, zoom: 1 });
    expect(cameraAfterReset.viewportCamera.pan).toEqual([0, 0]);
    await dispatchEditorViewportDrag(page, "touch", false);
    const cameraAfterTouchOrbit = await editorState(page);
    expect(cameraAfterTouchOrbit.viewportCamera.touchControls).toBe(true);
    expect(cameraAfterTouchOrbit.viewportCamera.pointerControls).toBe(true);
    expect(cameraAfterTouchOrbit.viewportCamera.lastInput).toBe("touch");
    expect(cameraAfterTouchOrbit.viewportCamera.orbitYaw).not.toBe(0);
    await dispatchEditorViewportDrag(page, "touch", true);
    const cameraAfterTouchPan = await editorState(page);
    expect(cameraAfterTouchPan.viewportCamera.pan).not.toEqual([0, 0]);
    await expect(page.locator('[data-metric="draw-calls"]')).toContainText("1");
    await expect(page.locator('[data-metric="shader-diagnostics"]')).toContainText("0 warnings");
    await expect(page.locator('[data-role="diagnostics-list"]')).toContainText("shader: Mint Material");
  });

  test("supports hierarchy create, rename, select, reparent, and delete", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByLabel("Rename New Node")).toBeVisible();
    await page.getByLabel("Rename New Node").evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error("Rename field is not an input.");
      input.value = "Browser Authored Node";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => {
      const selected = window.__GALILEO3D_EDITOR_APP__?.getState().selectedNodeId;
      return window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === selected)?.name;
    })).toBe("Browser Authored Node");
    await expect(page.getByRole("button", { name: "Browser Authored Node" })).toBeVisible();
    const authoredNodeId = await editorState(page).then((state) => state.selectedNodeId);
    expect(authoredNodeId).toBeTruthy();

    await dragHierarchyNode(page, "node-child", authoredNodeId!);
    const dragReparented = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-child")?.parentId);
    expect(dragReparented).toBe(authoredNodeId);

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
    await page.locator('input[data-path="physics.friction"]').fill("0.35");
    await page.locator('input[data-path="physics.friction"]').blur();
    await page.locator('input[data-path="physics.restitution"]').fill("0.6");
    await page.locator('input[data-path="physics.restitution"]').blur();
    await page.locator('input[data-path="audio.source"]').fill("sounds/pickup.wav");
    await page.locator('input[data-path="audio.source"]').blur();
    await page.locator('input[data-path="audio.listener"]').setChecked(true);
    await page.locator('input[data-path="audio.volume"]').fill("0.4");
    await page.locator('input[data-path="audio.volume"]').blur();
    await page.locator('input[data-path="script.behavior"]').fill("BounceBehavior");
    await page.locator('input[data-path="script.behavior"]').blur();

    const node = await page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((candidate) => candidate.id === "node-hero"));
    expect(node?.transform.position[0]).toBe(2);
    expect(node?.material.baseColor).toBe("#ff8844");
    expect(node?.light.kind).toBe("point");
    expect(node?.camera.enabled).toBe(false);
    expect(node?.physics.body).toBe("dynamic");
    expect(node?.physics.friction).toBe(0.35);
    expect(node?.physics.restitution).toBe(0.6);
    expect(node?.audio.source).toBe("sounds/pickup.wav");
    expect(node?.audio.listener).toBe(true);
    expect(node?.audio.volume).toBe(0.4);
    expect(node?.script.behavior).toBe("BounceBehavior");
  });

  test("undoes and redoes scene, transform, material, import, and hierarchy operations", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "Move X" }).click();
    await expect.poll(() => heroPositionX(page)).toBe(0.5);
    await clickTopbar(page, "Undo");
    await expect.poll(() => heroPositionX(page)).toBe(0);
    await clickTopbar(page, "Redo");
    await expect.poll(() => heroPositionX(page)).toBe(0.5);

    await page.locator('.material-panel input[data-material-path="baseColor"]').fill("#ff8844");
    await expect.poll(() => heroMaterialColor(page)).toBe("#ff8844");
    await clickTopbar(page, "Undo");
    await expect.poll(() => heroMaterialColor(page)).toBe("#38d99f");
    await clickTopbar(page, "Redo");
    await expect.poll(() => heroMaterialColor(page)).toBe("#ff8844");

    await page.locator('input[data-setting="scale"]').fill("1.75");
    await page.locator('input[data-setting="scale"]').blur();
    await expect.poll(() => importScale(page)).toBe(1.75);
    await clickTopbar(page, "Undo");
    await expect.poll(() => importScale(page)).toBe(1);
    await clickTopbar(page, "Redo");
    await expect.poll(() => importScale(page)).toBe(1.75);

    await page.getByRole("button", { name: "Import glTF" }).click();
    await expect.poll(() => editorState(page).then((state) => state.assetCount), { timeout: 10_000 }).toBe(1);
    await clickTopbar(page, "Undo");
    await expect.poll(() => editorState(page).then((state) => state.assetCount)).toBe(0);
    await clickTopbar(page, "Redo");
    await expect.poll(() => editorState(page).then((state) => state.assetCount)).toBe(1);

    await page.getByRole("button", { name: "Create" }).click();
    await page.getByLabel("Rename New Node").fill("Undo Parent");
    await page.getByLabel("Rename New Node").blur();
    const parentId = await editorState(page).then((state) => state.selectedNodeId);
    expect(parentId).toBeTruthy();
    await dragHierarchyNode(page, "node-child", parentId!);
    await expect.poll(() => childParentId(page)).toBe(parentId);
    await clickTopbar(page, "Undo");
    await expect.poll(() => childParentId(page)).toBe("node-hero");
    await clickTopbar(page, "Redo");
    await expect.poll(() => childParentId(page)).toBe(parentId);

    const historyState = await editorState(page);
    expect(historyState.canUndo).toBe(true);
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
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly pluginPanels: readonly string[];
    readonly viewportCamera: {
      readonly orbitYaw: number;
      readonly orbitPitch: number;
      readonly pan: readonly [number, number];
      readonly zoom: number;
      readonly focusedNodeId: string | null;
      readonly pointerControls: boolean;
      readonly touchControls: boolean;
      readonly lastInput: "button" | "pointer" | "touch" | "wheel";
    };
  readonly error?: string;
}

async function editorState(page: import("@playwright/test").Page): Promise<EditorState> {
  return page.evaluate(() => window.__GALILEO3D_EDITOR_APP__!.getState());
}

async function clickTopbar(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.getByRole("banner").getByRole("button", { name, exact: true }).click();
}

async function dragHierarchyNode(page: import("@playwright/test").Page, nodeId: string, parentId: string): Promise<void> {
  await page.evaluate(({ draggedNodeId, targetParentId }) => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-galileo3d-node", draggedNodeId);
    const target = document.querySelector<HTMLElement>(`.hierarchy-row[data-node-id="${targetParentId}"]`);
    if (!target) {
      throw new Error(`Hierarchy drop target missing: ${targetParentId}`);
    }
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { draggedNodeId: nodeId, targetParentId: parentId });
}

async function dispatchEditorViewportDrag(page: import("@playwright/test").Page, pointerType: "mouse" | "touch", shiftKey: boolean): Promise<void> {
  await page.evaluate(({ inputPointerType, inputShiftKey }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-viewport");
    if (!canvas) throw new Error("editor viewport missing");
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180,
      pointerId: inputPointerType === "touch" ? 71 : 17,
      pointerType: inputPointerType,
      button: 0,
      shiftKey: inputShiftKey
    };
    canvas.dispatchEvent(new PointerEvent("pointerdown", options));
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...options, clientX: 236, clientY: 214 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { ...options, clientX: 236, clientY: 214 }));
  }, { inputPointerType: pointerType, inputShiftKey: shiftKey });
}

async function heroPositionX(page: import("@playwright/test").Page): Promise<number | undefined> {
  return page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-hero")?.transform.position[0]);
}

async function heroMaterialColor(page: import("@playwright/test").Page): Promise<string | undefined> {
  return page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-hero")?.material.baseColor);
}

async function importScale(page: import("@playwright/test").Page): Promise<number | undefined> {
  return page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.importSettings.scale);
}

async function childParentId(page: import("@playwright/test").Page): Promise<string | null | undefined> {
  return page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.shell.project.scene.nodes.find((node) => node.id === "node-child")?.parentId);
}

declare global {
  interface Window {
    __GALILEO3D_EDITOR_APP__?: {
      getState(): EditorState;
      readonly shell: {
        readonly project: {
          readonly importSettings: { readonly scale: number };
          readonly scene: {
            readonly nodes: readonly {
              readonly id: string;
              readonly parentId: string | null;
              readonly transform: { readonly position: readonly number[] };
              readonly material: { readonly baseColor: string };
              readonly light: { readonly kind: string };
              readonly camera: { readonly enabled: boolean };
              readonly physics: { readonly body: string; readonly friction: number; readonly restitution: number };
              readonly audio: { readonly source: string; readonly listener: boolean; readonly volume: number };
              readonly script: { readonly behavior: string };
            }[];
          };
        };
      };
    };
  }
}
