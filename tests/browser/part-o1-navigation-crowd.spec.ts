import type {} from "./part-o1-navigation-crowd-harness";
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
    // Change only the LOD observer: camera, nav state and lighting remain fixed,
    // so a changed canvas must originate in the mounted representation switch.
    const nearTiers = await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([-4, 1, 0]));
    expect(nearTiers).toEqual(["near", "near", "near", "near"]);
    const nearCapture = await capture(page, "lod-near-model");
    const farTiers = await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([40, 1, 0]));
    expect(farTiers).toEqual(["impostor", "impostor", "impostor", "impostor"]);
    const farCapture = await capture(page, "lod-far-billboard");
    expect(farCapture.canvasSha256).not.toBe(nearCapture.canvasSha256);
    expect(initialCapture.canvasSha256).not.toBe(farCapture.canvasSha256);
    const returnedTiers = await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([-4, 1, 0]));
    expect(returnedTiers).toEqual(nearTiers);
    const returnedCapture = await capture(page, "lod-near-reused");
    expect(returnedCapture.canvasSha256).toBe(nearCapture.canvasSha256);
    const readRepresentations = () => page.evaluate(() => (window as unknown as { __AURA3D_O1_REPRESENTATIONS__: () => {
      creates: number; disposals: number; selectedAgent: number; replacedCrowdDisposalErrors: string[];
      nodes: { id: string; tier: string; index: number; position: number[]; rotation: number[]; visible: boolean }[];
    } }).__AURA3D_O1_REPRESENTATIONS__());
    const allocated = await readRepresentations();
    expect(allocated.creates).toBe(12);
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([40,1,0]));
      const farNodes = (await readRepresentations()).nodes.filter(node => node.visible);
      expect(farNodes).toHaveLength(4);
      for (const node of farNodes) {
        expect(node.tier).toBe("impostor");
        // XY billboard +Z normal must face the actual render camera in XZ.
        const dx = -8.5 - node.position[0]!;
        const dz = 9 - node.position[2]!;
        const yaw = node.rotation[1]!;
        expect((Math.sin(yaw) * dx + Math.cos(yaw) * dz) / Math.hypot(dx, dz)).toBeGreaterThan(0.9999);
      }
      await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([-4,1,0]));
    }
    expect((await readRepresentations()).creates).toBe(allocated.creates);
    const deadBandResults = await page.evaluate(() => {
      const w = window as unknown as { __AURA3D_PART_O1__: { positions: number[][] }; __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] };
      const p = w.__AURA3D_PART_O1__.positions[0]!;
      return [9.2, 9.6, 8.8, 8.4].map(distance => w.__AURA3D_O1_LOD_PROBE__([p[0]! - distance, p[1]!, p[2]!])[0]);
    });
    expect(deadBandResults).toEqual(["near", "mid", "mid", "near"]);
    const preserved = await readRepresentations();
    expect(preserved.nodes.map(node => node.id)).toEqual(allocated.nodes.map(node => node.id));
    for (const node of preserved.nodes.filter(node => node.visible)) {
      expect(node.position[0]).toBeCloseTo(initial.positions[node.index][0], 6);
      expect(node.position[2]).toBeCloseTo(initial.positions[node.index][2], 6);
    }
    await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([-4,1,0]));

    await page.keyboard.press("Digit1");
    const selectedCapture = await capture(page, "selected-before-transition");
    expect((await readRepresentations()).selectedAgent).toBe(0);
    expect(selectedCapture.canvasSha256).not.toBe(nearCapture.canvasSha256);
    await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([40,1,0]));
    expect((await readRepresentations()).selectedAgent).toBe(0);
    const farSelectedCapture = await capture(page, "far-selected");
    await page.keyboard.press("Digit1");
    const farUnselectedCapture = await capture(page, "far-unselected");
    expect((await readRepresentations()).selectedAgent).toBe(-1);
    expect(farUnselectedCapture.canvasSha256).toBe(farCapture.canvasSha256);
    expect(farSelectedCapture.canvasSha256).not.toBe(farUnselectedCapture.canvasSha256);
    await page.keyboard.press("Digit1");
    const farSelectedRestoredCapture = await capture(page, "far-selected-restored");
    expect(farSelectedRestoredCapture.canvasSha256).toBe(farSelectedCapture.canvasSha256);
    await page.keyboard.press("KeyH");
    expect((await readRepresentations()).nodes.filter(node => node.index === 0 && node.visible)).toHaveLength(0);
    const hiddenCapture = await capture(page, "hidden-after-transition");
    expect(hiddenCapture.canvasSha256).not.toBe(farCapture.canvasSha256);
    await page.keyboard.press("KeyH");
    await page.keyboard.press("Digit1");

    await page.evaluate(() => (window as unknown as { __AURA3D_O1_LOD_PROBE__: (p: number[]) => string[] }).__AURA3D_O1_LOD_PROBE__([-8.5, 5.5, 9]));


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
    const resetRepresentations = await readRepresentations();
    expect(resetRepresentations.disposals).toBe(12);
    expect(resetRepresentations.replacedCrowdDisposalErrors).toEqual(["RecastCrowdHandle is disposed."]);
    expect(resetRepresentations.nodes.filter(node => node.visible)).toHaveLength(4);

    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__AURA3D_PART_O1__?.steps === 10);
    const pulsed = await evidence(page);
    expect(pulsed.agentZeroDisplacement).toBeGreaterThan(0);
    expect(errors).toEqual([]);

    const finalDisposal = await page.evaluate(() => (window as unknown as {
      __AURA3D_O1_DISPOSE_PROBE__: () => Promise<{ bindingUpdateError: string | null; crowdCountError: string | null; meshPathError: string | null; appStepError: string | null; diagnostics: unknown; replacedCrowdDisposalErrors: string[] }>
    }).__AURA3D_O1_DISPOSE_PROBE__());
    expect(finalDisposal.bindingUpdateError).toMatch(/disposed/i);
    expect(finalDisposal.crowdCountError).toBe("RecastCrowdHandle is disposed.");
    expect(finalDisposal.meshPathError).toBe("RecastNavMeshHandle is disposed.");
    expect(finalDisposal.appStepError).toBe("Aura3D app is disposed.");
    expect(finalDisposal.replacedCrowdDisposalErrors).toEqual(["RecastCrowdHandle is disposed."]);
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.part-o1-root-navigation-crowd/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      complete,
      pulsed,
      resetRepresentations,
      finalDisposal,
      artifacts: [initialCapture, completeCapture, nearCapture, farCapture, returnedCapture, selectedCapture, hiddenCapture, farSelectedCapture, farUnselectedCapture, farSelectedRestoredCapture],
      comparisonBoundary: "Proves the root navigation/crowds builders (bake/path/create/addAgent/setTarget/update/agents/diagnostics) drive four visible agents across one baked navmesh through createAuraApp, with typed near vehicles, simplified hulls and camera-facing GPU billboard geometry. Fixed-camera LOD probes assert pixel changes and resource reuse; capacity remains fail-closed. Does not claim off-mesh links, temporary obstacles, or performance parity."
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

export {};
