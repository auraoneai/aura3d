import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("native editor shader graph and inspectors", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("creates, edits, saves and reloads a graph that changes renderer pixels", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.getByRole("button", { name: "Imported Placeholder" }).click();
    const graph = page.getByRole("region", { name: "Shader graph" });
    await graph.getByRole("button", { name: "Create graph" }).focus();
    await page.keyboard.press("Enter");
    await graph.getByLabel("Graph operation").selectOption("constant");
    await graph.getByLabel("Graph value type").selectOption("vec3");
    await graph.getByRole("button", { name: "Add node" }).click();
    await graph.getByLabel("constant_1 value").fill("1, 0, 0");
    await graph.getByLabel("constant_1 value").press("Tab");
    await graph.getByLabel("color output").selectOption("constant_1");
    await graph.getByRole("button", { name: "Compile graph" }).click();
    await expect(graph.locator('[data-role="graph-status"]')).toHaveText("Graph compiled");
    await graph.getByText("Compiler inspection").click();
    await expect(graph.locator('[data-role="graph-compiler-inspection"]')).toContainText("vertex");
    await expect(graph.locator('[data-role="graph-compiler-inspection"]')).toContainText("Expressions (values and identifiers hidden)");
    const redPixels = await rendererPixels(page);

    await graph.getByLabel("constant_1 value").fill("0, 0, 1");
    await graph.getByLabel("constant_1 value").press("Tab");
    await graph.getByRole("button", { name: "Compile graph" }).click();
    await expect(graph.locator('[data-role="graph-status"]')).toHaveText("Graph compiled");
    const bluePixels = await rendererPixels(page);
    expect(changedPixels(redPixels, bluePixels)).toBeGreaterThan(100);

    await graph.getByRole("button", { name: "Undo", exact: true }).click();
    await graph.getByRole("button", { name: "Compile graph" }).click();
    expect(changedPixels(await rendererPixels(page), redPixels)).toBeLessThan(10);
    await graph.getByRole("button", { name: "Redo", exact: true }).click();
    await graph.getByRole("button", { name: "Compile graph" }).click();

    await page.getByRole("banner").getByRole("button", { name: "Save", exact: true }).click();
    const saved = await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().savedProjectJson);
    const project = JSON.parse(saved);
    expect(project.shaderGraphs[0].graph.outputs.color).toBe("constant_1");
    expect(project.shaderGraphs[0].materialId).toBe("node-child");
    expect(project.editor.selectedNodeId).toBe("node-child");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.locator('[data-role="project-buffer"]').evaluate((element: HTMLTextAreaElement, value) => { element.value = value; }, saved);
    await page.getByRole("banner").getByRole("button", { name: "Load", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().selectedNodeId)).toBe("node-child");
    await expect(graph.getByLabel("constant_1 value")).toHaveValue("0, 0, 1");
    await expect(graph.locator('[data-role="graph-status"]')).toHaveText("Graph compiled");
    expect(changedPixels(await rendererPixels(page), bluePixels)).toBeLessThan(10);
  });

  test("reports invalid graph connections and exposes real inspection states", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const graph = page.getByRole("region", { name: "Shader graph" });
    await graph.getByRole("button", { name: "Create graph" }).click();
    await graph.getByLabel("Graph operation").selectOption("add");
    await graph.getByLabel("Graph value type").selectOption("vec3");
    await graph.getByRole("button", { name: "Add node" }).click();
    await graph.getByRole("button", { name: "Compile graph" }).click();
    await expect(graph.locator('[data-role="graph-diagnostics"]')).toContainText(/requires 2 input|missing node/i);
    await expect(graph.locator('[data-role="graph-status"]')).toContainText("errors");
    await graph.getByRole("button", { name: "Undo", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(graph.locator('[data-graph-node="add_1"]')).toHaveCount(0);

    const frame = page.getByRole("region", { name: "Frame inspector" });
    await expect(frame).toContainText("Draw calls");
    await expect(frame).toContainText(/Pass|unavailable/i);
    const texture = page.getByRole("region", { name: "Texture inspector" });
    await expect(texture).toContainText(/texture/i);
    await expect(texture.locator('[role="status"]')).toBeVisible();
    await graph.getByLabel("Import texture").setInputFiles({
      name: "one-pixel.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlVj9sAAAAASUVORK5CYII=", "base64")
    });
    await expect(texture.getByLabel("Selected texture")).toBeVisible();
    await texture.getByLabel("Selected texture").selectOption({ label: "one-pixel.png" });
    await expect(texture.getByLabel("Texture mip levels")).toBeVisible();
    await expect(texture).toContainText("rgba8");
    await graph.getByLabel("Resource name").fill("albedo");
    await graph.getByLabel("Resource kind").selectOption("texture2d");
    await graph.getByRole("button", { name: "Add resource", exact: true }).click();
    await graph.getByLabel("albedo binding").selectOption({ label: "one-pixel.png" });
    await page.getByRole("banner").getByRole("button", { name: "Save", exact: true }).click();
    const saved = JSON.parse(await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().savedProjectJson));
    expect(saved.shaderGraphs[0].bindings.albedo.kind).toBe("texture");
    expect(saved.editor.selectedResourceIds).toEqual([saved.shaderGraphs[0].bindings.albedo.assetId]);
  });

  test("keeps graph materials on separate scene nodes when selection and transforms change", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const graph = page.getByRole("region", { name: "Shader graph" });
    const assignColor = async (nodeName: string, value: string): Promise<void> => {
      await page.getByRole("button", { name: nodeName, exact: true }).click();
      await graph.getByRole("button", { name: "Create graph" }).click();
      await graph.getByLabel("Graph operation").selectOption("constant");
      await graph.getByLabel("Graph value type").selectOption("vec3");
      await graph.getByRole("button", { name: "Add node" }).click();
      await graph.getByLabel("constant_1 value").fill(value);
      await graph.getByLabel("constant_1 value").press("Tab");
      await graph.getByLabel("color output").selectOption("constant_1");
      await expect(graph.locator('[data-role="graph-status"]')).toHaveText("Graph compiled");
    };
    await assignColor("Hero Cube", "1, 0, 0");
    await assignColor("Imported Placeholder", "0, 0, 1");
    const both = await rendererPixels(page);
    await page.getByRole("button", { name: "Hero Cube", exact: true }).click();
    expect(changedPixels(await rendererPixels(page), both)).toBeLessThan(10);
    await page.locator('input[data-path="position.X"]').fill("0.75");
    await page.locator('input[data-path="position.X"]').press("Tab");
    expect(changedPixels(await rendererPixels(page), both)).toBeGreaterThan(100);
    await page.getByRole("banner").getByRole("button", { name: "Save", exact: true }).click();
    const saved = JSON.parse(await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().savedProjectJson));
    expect(saved.shaderGraphs.map((entry: { materialId: string }) => entry.materialId).sort()).toEqual(["node-child", "node-hero"]);
  });

  test("exports the scene and graph materials in a standalone WebGL runtime", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.getByRole("button", { name: "Imported Placeholder", exact: true }).click();
    const graph = page.getByRole("region", { name: "Shader graph" });
    await graph.getByRole("button", { name: "Create graph" }).click();
    await graph.getByLabel("Graph operation").selectOption("constant");
    await graph.getByLabel("Graph value type").selectOption("vec3");
    await graph.getByRole("button", { name: "Add node" }).click();
    await graph.getByLabel("constant_1 value").fill("1, 0, 0");
    await graph.getByLabel("constant_1 value").press("Tab");
    await graph.getByLabel("color output").selectOption("constant_1");
    await page.getByRole("banner").getByRole("button", { name: "Save", exact: true }).click();
    const saved = JSON.parse(await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().savedProjectJson));
    // Use the same fallback camera as the editor so this comparison covers the graph.
    for (const node of saved.scene.nodes) node.camera.enabled = false;
    await page.locator('[data-role="project-buffer"]').evaluate((element: HTMLTextAreaElement, value) => { element.value = JSON.stringify(value); }, saved);
    await page.getByRole("banner").getByRole("button", { name: "Load", exact: true }).click();
    await page.getByRole("banner").getByRole("button", { name: "Export", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().exportedFileCount), { timeout: 60_000 }).toBe(3);
    await expect(page.locator('a[download="index.html"]')).toBeVisible();
    await expect(page.locator('a[download="project.json"]')).toBeVisible();
    await expect(page.locator('a[download="runtime.js"]')).toBeVisible();
    const files = await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.shell.exportedFiles());
    const byPath = new Map(files.map((file) => [file.path, file.content]));
    await page.route(`${server.origin}/__native_editor_export/**`, async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop() || "index.html";
      const content = byPath.get(name);
      await route.fulfill({ status: content === undefined ? 404 : 200, contentType: name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript" : "application/json", body: content ?? "missing export file" });
    });
    await page.goto(`${server.origin}/__native_editor_export/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA3D_EXPORTED_PROJECT__?: { status: string } }).__AURA3D_EXPORTED_PROJECT__?.status === "ready");
    const red = await exportedRendererPixels(page);
    const exportedProject = JSON.parse(byPath.get("project.json")!);
    exportedProject.shaderGraphs[0].graph.nodes.find((node: { id: string }) => node.id === "constant_1").value = [0, 0, 1];
    byPath.set("project.json", JSON.stringify(exportedProject));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA3D_EXPORTED_PROJECT__?: { status: string } }).__AURA3D_EXPORTED_PROJECT__?.status === "ready");
    expect(changedPixels(red, await exportedRendererPixels(page))).toBeGreaterThan(100);
  });
});

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__AURA3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 15_000 });
}

/** Read the actual WebGL drawing buffer immediately after the editor renders. */
async function rendererPixels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const app = window.__AURA3D_EDITOR_APP__;
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-viewport");
    if (!app || !canvas) throw new Error("Editor renderer is unavailable.");
    app.shell.viewport?.render();
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 context is unavailable.");
    const width = Math.min(640, canvas.width);
    const height = Math.min(384, canvas.height);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2), width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return Array.from(pixels);
  });
}

async function exportedRendererPixels(page: Page): Promise<number[]> {
  return page.evaluate(() => new Promise<number[]>((resolve, reject) => requestAnimationFrame(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#aura3d-export");
    const gl = canvas?.getContext("webgl2");
    if (!canvas || !gl) { reject(new Error("Exported WebGL2 renderer is unavailable.")); return; }
    const width = Math.min(640, canvas.width); const height = Math.min(384, canvas.height);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2), width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    resolve(Array.from(pixels));
  })));
}

function changedPixels(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("Canvas sizes changed during comparison.");
  let count = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (Math.abs(a[index]! - b[index]!) + Math.abs(a[index + 1]! - b[index + 1]!) + Math.abs(a[index + 2]! - b[index + 2]!) > 6) count += 1;
  }
  return count;
}
