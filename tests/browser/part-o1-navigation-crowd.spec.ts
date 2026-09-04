import { createHash } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/part-o1-navigation-crowd");

test("PART O1 root bake-path-crowd loop visibly moves agents on the navmesh", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/tests/browser/part-o1-navigation-crowd-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.status === "ready", undefined, { timeout: 240_000 });

    const initial = await evidence(page);
    expect(initial.claim).toBe("root-navigation-crowds-bake-path-move");
    expect(initial.available).toBe(true);
    expect(initial.pathLength).toBeGreaterThanOrEqual(2);
    expect(initial.positions).toHaveLength(4);
    expect(initial.agentZeroDisplacement).toBe(0);
    // Crowd is built at cap (4/4): the over-budget warning must be present and
    // the fifth addAgent must have thrown instead of silently dropping.
    expect(initial.diagnostics.atCap).toBe(true);
    expect(initial.diagnostics.count).toBe(4);
    expect(initial.diagnostics.maxAgents).toBe(4);
    expect(initial.diagnostics.capWarning).toMatch(/at capacity \(4\/4 agents\)/);
    expect(initial.overCapError).toMatch(/capacity/i);
    expect(initial.lodBounds).toEqual({ nearDistance: 9, farDistance: 13 });
    expect(initial.diagnostics.tiers.mid).toBe(4);
    const initialCapture = await capture(page, "initial");

    await page.getByRole("button", { name: "Run root crowd trace" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.status === "complete", undefined, { timeout: 120_000 });
    const complete = await evidence(page);
    expect(complete.steps).toBe(120);
    expect(complete.agentZeroDisplacement).toBeGreaterThan(1.5);
    // Every agent crosses from west to east on the baked mesh.
    complete.positions.forEach((position: readonly number[], index: number) => {
      expect(position[0]).toBeGreaterThan(initial.positions[index][0] + 1.5);
    });
    // LOD tiers migrate as agents leave the camera: mid-heavy start, impostor-heavy end.
    expect(complete.diagnostics.tiers.impostor).toBeGreaterThan(initial.diagnostics.tiers.impostor);
    expect(complete.diagnostics.count).toBe(4);
    expect(complete.errors).toEqual([]);
    const completeCapture = await capture(page, "complete");
    expect(completeCapture.canvasSha256).not.toBe(initialCapture.canvasSha256);

    // Keyboard pulse moves the crowd without the button (input visibly changes state).
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.steps === 0);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.steps === 10);
    const pulsed = await evidence(page);
    expect(pulsed.agentZeroDisplacement).toBeGreaterThan(0);
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.part-o1-root-navigation-crowd/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      complete,
      pulsed,
      artifacts: [initialCapture, completeCapture],
      comparisonBoundary: "Proves the root navigation/crowds builders (bake/path/create/addAgent/setTarget/update/agents/diagnostics) drive four visible agents across one baked navmesh through createAuraApp, with LOD tiers and fail-closed cap warnings in diagnostics. Does not claim off-mesh links, temporary obstacles, or performance parity."
    };
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_PART_O1__));
}

async function capture(page: Page, state: string): Promise<{ state: string; pagePath: string; pageBytes: number; canvasPath: string; canvasBytes: number; canvasSha256: string }> {
  await page.waitForTimeout(250);
  const pagePath = resolve(REPORT_ROOT, `${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const dataUrl = await page.locator("canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  writeFileSync(canvasPath, bytes);
  return {
    state,
    pagePath: pagePath.replace(`${process.cwd()}/`, ""),
    pageBytes: statSync(pagePath).size,
    canvasPath: canvasPath.replace(`${process.cwd()}/`, ""),
    canvasBytes: bytes.byteLength,
    canvasSha256: createHash("sha256").update(bytes).digest("hex")
  };
}

declare global {
  interface Window {
    __AURA3D_PART_O1__?: any;
  }
}

export {};
