import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/spatial-text-lab");
const SOURCE = "examples/spatial-text-lab/main.ts";

test("public spatial text lab proves mesh text and world labels have different scopes", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/spatial-text-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_SPATIAL_TEXT_LAB__?.status === "ready", undefined, { timeout: 90_000 });

    const front = await readEvidence(page);
    expect(front).toMatchObject({
      status: "ready",
      claim: "root-mesh-text-and-accessible-world-label-scope-example",
      view: "front",
      runtimeBackend: "production-runtime",
      meshText: {
        nodeCount: 2,
        glyphCount: 10,
        method: "extruded-bitmap-glyph-mesh",
        unsupportedCharacters: [],
        canvasRendered: true
      },
      worldLabels: {
        authoredCount: 3,
        mountedCount: 3,
        visibleCount: 3,
        roleNoteCount: 3,
        layerOutsideCanvas: true
      },
      errors: []
    });
    expect(front.meshText.indexedTriangleCount).toBeGreaterThan(500);
    expect(front.meshText.depthRange).toBeGreaterThanOrEqual(0.38);
    expect(front.meshText.normalCount).toBeGreaterThan(1_000);
    expect(front.worldLabels.readings.map((entry) => entry.text).sort()).toEqual([
      "Accessible DOM label",
      "Always screen-facing",
      "Tracks its world anchor"
    ]);
    assertPublicSourceBoundary();
    await assertLabelsInsideCanvas(page);
    const frontTransforms = await readLabelStyles(page);
    const frontCapture = await captureState(page, "front");

    await page.getByRole("button", { name: "Reveal depth" }).click();
    await page.waitForFunction(() => window.__AURA3D_SPATIAL_TEXT_LAB__?.status === "ready" && window.__AURA3D_SPATIAL_TEXT_LAB__.view === "oblique" && window.__AURA3D_SPATIAL_TEXT_LAB__.revision === 1);
    await expect(page.getByRole("button", { name: "Reveal depth" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Reveal depth" })).toHaveClass(/active/);
    await expect(page.getByRole("button", { name: "Front proof" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Front proof" })).not.toHaveClass(/active/);
    const oblique = await readEvidence(page);
    expect(oblique.meshText).toEqual(front.meshText);
    expect(oblique.worldLabels.visibleCount).toBe(3);
    expect(oblique.worldLabels.roleNoteCount).toBe(3);
    expect(oblique.errors).toEqual([]);
    const movement = labelMovement(front.worldLabels.readings, oblique.worldLabels.readings);
    expect(movement).toBeGreaterThan(40);
    await assertLabelsInsideCanvas(page);
    const obliqueTransforms = await readLabelStyles(page);
    expect(frontTransforms.every((entry) => !entry.transform.includes("rotate"))).toBe(true);
    expect(obliqueTransforms.every((entry) => !entry.transform.includes("rotate"))).toBe(true);
    expect(obliqueTransforms.map((entry) => entry.fontSize)).toEqual(frontTransforms.map((entry) => entry.fontSize));
    await page.waitForTimeout(250);
    const obliqueCapture = await captureState(page, "oblique");
    expect(obliqueCapture.canvasSha256).not.toBe(frontCapture.canvasSha256);
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.spatial-text-lab-browser/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      front,
      oblique,
      labelMovementPixels: movement,
      screenFacingStyles: { front: frontTransforms, oblique: obliqueTransforms },
      artifacts: [frontCapture, obliqueCapture],
      comparisonBoundary: "The route proves bounded built-in extruded mesh glyphs and a separate accessible projected DOM label layer. It does not claim arbitrary font loading, shaping, SDF/MSDF, curved text, or troika-three-text parity."
    };
    mkdirSync(REPORT_ROOT, { recursive: true });
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function readEvidence(page: import("@playwright/test").Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_SPATIAL_TEXT_LAB__));
}

async function readLabelStyles(page: import("@playwright/test").Page): Promise<Array<{ id: string; transform: string; fontSize: string }>> {
  return page.locator(".aura-world-label-layer [role='note']").evaluateAll((elements) => elements.map((element) => {
    const html = element as HTMLElement;
    return { id: html.dataset.auraLabelId ?? "", transform: html.style.transform, fontSize: html.style.fontSize };
  }).sort((a, b) => a.id.localeCompare(b.id)));
}

async function assertLabelsInsideCanvas(page: import("@playwright/test").Page): Promise<void> {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas")?.getBoundingClientRect();
    const labels = [...document.querySelectorAll<HTMLElement>(".aura-world-label-layer [role='note']")].map((element) => {
      const box = element.getBoundingClientRect();
      return { id: element.dataset.auraLabelId, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    return { canvas: canvas ? { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom } : undefined, labels };
  });
  expect(result.canvas).toBeDefined();
  for (const label of result.labels) {
    expect(label.left, `${label.id} left`).toBeGreaterThanOrEqual(result.canvas!.left + 4);
    expect(label.right, `${label.id} right`).toBeLessThanOrEqual(result.canvas!.right - 4);
    expect(label.top, `${label.id} top`).toBeGreaterThanOrEqual(result.canvas!.top + 4);
    expect(label.bottom, `${label.id} bottom`).toBeLessThanOrEqual(result.canvas!.bottom - 4);
  }
}

function labelMovement(before: readonly any[], after: readonly any[]): number {
  return before.reduce((total, entry) => {
    const next = after.find((candidate) => candidate.id === entry.id);
    return total + (next ? Math.abs(next.x - entry.x) + Math.abs(next.y - entry.y) : 0);
  }, 0);
}

async function captureState(page: import("@playwright/test").Page, state: string): Promise<{ state: string; pagePath: string; canvasPath: string; pageBytes: number; canvasBytes: number; canvasSha256: string }> {
  mkdirSync(REPORT_ROOT, { recursive: true });
  const pagePath = resolve(REPORT_ROOT, `public-${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `public-${state}-canvas.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const dataUrl = await page.locator("canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
  const canvasBytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  writeFileSync(canvasPath, canvasBytes);
  expect(statSync(pagePath).size).toBeGreaterThan(20_000);
  expect(canvasBytes.byteLength).toBeGreaterThan(10_000);
  return {
    state,
    pagePath: pagePath.replace(`${process.cwd()}/`, ""),
    canvasPath: canvasPath.replace(`${process.cwd()}/`, ""),
    pageBytes: statSync(pagePath).size,
    canvasBytes: canvasBytes.byteLength,
    canvasSha256: createHash("sha256").update(canvasBytes).digest("hex")
  };
}

function assertPublicSourceBoundary(): void {
  const source = readFileSync(resolve(SOURCE), "utf8");
  expect(source).toContain('from "@aura3d/engine"');
  expect(source).toContain("text3D(");
  expect(source).toMatch(/labels\.(?:callout|anchor|axisTick)\(/);
  expect(source).not.toMatch(/from\s+["']three|@aura3d\/(?:rendering|scene)|packages\//);
}

export {};
