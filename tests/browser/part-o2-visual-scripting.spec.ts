import { createHash } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/part-o2-visual-scripting");

test("PART O2 root visual-scripting graph attach visibly changes gameplay state", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/tests/browser/part-o2-visual-scripting-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_PART_O2__?.status === "ready", undefined, { timeout: 120_000 });

    const initial = await evidence(page);
    expect(initial.claim).toBe("root-visual-scripting-graph-gameplay");
    expect(initial.roundTripStable).toBe(true);
    expect(initial.catalogKinds).toBeGreaterThanOrEqual(25);
    expect(initial.score).toBe(0);
    expect(initial.jumps).toBe(0);
    const initialCanvas = await canvasSha(page, "initial");

    // Negative control: attaching the same graph with no input changes nothing.
    await page.getByRole("button", { name: "Observe (graph attach without input)" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O2__?.observes === 1);
    const observed = await evidence(page);
    expect(observed.lastPressed).toBe(false);
    expect(observed.lastApplied).toBe(0);
    expect(observed.score).toBe(0);
    expect(observed.jumps).toBe(0);
    expect(await canvasSha(page, "observed")).toBe(initialCanvas);

    // Positive: keyboard input drives the graph, the score, and the player marker.
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__AURA3D_PART_O2__?.jumps === 1);
    const jumped = await evidence(page);
    expect(jumped.lastPressed).toBe(true);
    expect(jumped.lastApplied).toBe(2);
    expect(jumped.lastSideEffects).toEqual(expect.arrayContaining(["game.addScore", "game.setObjective"]));
    expect(jumped.score).toBe(1);
    expect(jumped.playerX).toBe(-2);
    expect(jumped.objective).toBe("complete");
    const jumpedCanvas = await canvasSha(page, "jumped");
    expect(jumpedCanvas).not.toBe(initialCanvas);

    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__AURA3D_PART_O2__?.jumps === 2);
    expect((await evidence(page)).score).toBe(2);
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.part-o2-root-visual-scripting/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      observed,
      jumped,
      artifacts: [
        { state: "initial", canvasSha256: initialCanvas },
        { state: "jumped", canvasSha256: jumpedCanvas }
      ],
      comparisonBoundary: "Proves root visualScripting.graph/attach/catalog plus serialization round-trip change mounted gameplay state (score, objective, player marker) only while the pressed(jump) input reads true. Does not claim Unity/Unreal visual-scripting parity or a live installGraph bridge."
    };
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_PART_O2__));
}

async function canvasSha(page: Page, state: string): Promise<string> {
  await page.waitForTimeout(250);
  const pagePath = resolve(REPORT_ROOT, `${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const dataUrl = await page.locator("canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  writeFileSync(canvasPath, bytes);
  void statSync(pagePath).size;
  return createHash("sha256").update(bytes).digest("hex");
}

declare global {
  interface Window {
    __AURA3D_PART_O2__?: any;
  }
}

export {};
