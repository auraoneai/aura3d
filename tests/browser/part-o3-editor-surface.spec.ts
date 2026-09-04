import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/part-o3-editor-surface");

test("PART O3 bounded editor surface proves every tool with the editor label", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/tests/browser/part-o3-editor-surface-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_PART_O3__?.status === "ready", undefined, { timeout: 120_000 });

    const initial = await evidence(page);
    expect(initial.claim).toBe("bounded-editor-surface-per-tool");
    expect(initial.capabilityLabel).toBe("editor");
    // Gizmo: all three kinds attach through the root surface.
    expect(initial.gizmo.surface).toMatch(/^root editor/);
    expect(initial.gizmo.kinds).toEqual(["translate", "rotate", "scale"]);
    // Outliner: hierarchy read model through the root surface, rendered as a list.
    expect(initial.outliner.surface).toMatch(/^root editor/);
    expect(initial.outliner.ids).toEqual(["o3-scene", "o3-box-node", "o3-light-node"]);
    expect(await page.locator("[data-testid='o3-outliner'] li").count()).toBe(3);
    const initialCanvas = await canvasSha(page, "initial");

    // Undo/redo: command moves the box visibly, undo reverts, redo re-applies.
    await page.getByRole("button", { name: "Execute move" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O3__?.undoRedo.xAfterExecute === 1);
    const movedCanvas = await canvasSha(page, "moved");
    expect(movedCanvas).not.toBe(initialCanvas);

    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O3__?.undoRedo.xAfterUndo === 0);
    const undone = await evidence(page);
    expect(undone.rootUndoRedoNoThrow).toBe(true);
    const undoneCanvas = await canvasSha(page, "undone");
    expect(undoneCanvas).not.toBe(movedCanvas);

    await page.getByRole("button", { name: "Redo" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O3__?.undoRedo.xAfterRedo === 1);
    expect(await canvasSha(page, "redone")).not.toBe(undoneCanvas);

    // Play mode: adapter capture/restore round-trips, double-enter fails closed.
    await page.getByRole("button", { name: "Toggle play mode" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O3__?.playMode.exited === true);
    const played = await evidence(page);
    expect(played.playMode.entered).toBe(true);
    expect(played.playMode.restored).toEqual({ selection: ["o3-box"] });
    expect(played.playMode.doubleEnterError).toMatch(/already active/);
    expect(played.errors).toEqual([]);
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.part-o3-bounded-editor-surface/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      undone,
      played,
      artifacts: [
        { state: "initial", canvasSha256: initialCanvas },
        { state: "moved", canvasSha256: movedCanvas },
        { state: "undone", canvasSha256: undoneCanvas }
      ],
      comparisonBoundary: "Proves the bounded editor surface per tool (command undo/redo with visible revert, translate/rotate/scale gizmo attach, play-mode capture/restore with fail-closed double-enter, outliner read model) under the editor capability label. Does not claim Desktop/Tauri, shader-graph, material-variant, multi-user-review, nonlinear-animation, or visual-review parity."
    };
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_PART_O3__));
}

async function canvasSha(page: Page, state: string): Promise<string> {
  await page.waitForTimeout(250);
  const pagePath = resolve(REPORT_ROOT, `${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const dataUrl = await page.locator("canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  writeFileSync(canvasPath, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

declare global {
  interface Window {
    __AURA3D_PART_O3__?: any;
  }
}

export {};
