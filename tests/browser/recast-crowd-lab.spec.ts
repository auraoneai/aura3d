import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/recast-crowd-lab");
const EXPECTED_FINAL = [
  [1.1698002815246582, 0.20000000298023224, 1.420591115951538],
  [2.5100371837615967, 0.20000000298023224, -1.2343734502792358],
  [2.4246039390563965, 0.20000000298023224, 1.2791671752929688],
  [1.1837623119354248, 0.20000000298023224, -1.4220863580703735],
  [2.1769397258758545, 0.20000000298023224, 0.9040329456329346],
  [2.2634973526000977, 0.20000000298023224, -0.8941705822944641]
] as const;

test("public selected-Recast gallery visibly completes a native crowd trace", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/recast-crowd-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_RECAST_CROWD_LAB__?.status === "ready", undefined, { timeout: 240_000 });
    const initial = await evidence(page);
    expect(initial).toMatchObject({
      status: "ready",
      claim: "optional-selected-recast-navigation-crowd",
      packageOwner: "@aura3d/navigation-recast",
      nativeCrowd: true,
      nativePathQuery: true,
      runtimeBackend: "production-runtime",
      steps: 0,
      splitAroundObstacle: false,
      resets: 0,
      errors: []
    });
    expect(initial.assets).toEqual([
      { id: "showcaseSkylineCity", hash: "sha256-2f6624cdd44b88b4c9b612bf0b9062451c5ade91ed243e0c595672d79dd13338" },
      { id: "showcaseAnimatedRunnerHero", hash: "sha256-9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f" }
    ]);
    expect(initial.positions).toHaveLength(6);
    expect(initial.path).toHaveLength(5);
    expect(initial.serializedNavMeshBytes).toBeGreaterThan(100);
    assertAssetHashes();
    assertSourceBoundary();
    const initialCapture = await capture(page, "initial");

    await page.getByRole("button", { name: "Run crowd trace" }).click();
    await page.waitForFunction(() => window.__AURA3D_RECAST_CROWD_LAB__?.status === "complete", undefined, { timeout: 60_000 });
    const complete = await evidence(page);
    expect(complete.steps).toBe(210);
    expect(complete.positions).toHaveLength(6);
    expect(complete.splitAroundObstacle).toBe(true);
    expect(complete.errors).toEqual([]);
    complete.positions.forEach((position: readonly number[], agent: number) => position.forEach((value, axis) => expect(value).toBeCloseTo(EXPECTED_FINAL[agent]![axis]!, 5)));
    const completeCapture = await capture(page, "complete");
    expect(completeCapture.canvasSha256).not.toBe(initialCapture.canvasSha256);

    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__AURA3D_RECAST_CROWD_LAB__?.steps === 15);
    const keyboard = await evidence(page);
    expect(keyboard.positions[0][0]).toBeGreaterThan(initial.positions[0][0]);
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => window.__AURA3D_RECAST_CROWD_LAB__?.steps === 0 && window.__AURA3D_RECAST_CROWD_LAB__?.resets === 2);
    const reset = await evidence(page);
    expect(reset.positions[0][0]).toBeCloseTo(initial.positions[0][0], 5);
    expect(reset.splitAroundObstacle).toBe(false);

    const lifecycle = await page.evaluate(() => window.__AURA3D_RECAST_CROWD_DISPOSE__?.());
    expect(lifecycle).toEqual({ crowdDisposed: true, navMeshDisposed: true, visualDisposed: true });
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.recast-crowd-gallery-browser/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      initial,
      complete,
      keyboard,
      reset,
      lifecycle,
      artifacts: [initialCapture, completeCapture],
      comparisonBoundary: "The public route proves one generated navmesh, native path query, and deterministic six-agent Recast/Detour crowd trace. The separate current-Three.js r185 workload proves the same selected-adapter trace against direct Recast. Neither establishes arbitrary navmesh authoring, off-mesh-link, temporary-obstacle, visual, draw-call, or performance parity."
    };
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_RECAST_CROWD_LAB__));
}

async function capture(page: Page, state: string): Promise<{ state: string; pagePath: string; pageBytes: number; canvasPath: string; canvasBytes: number; canvasSha256: string }> {
  await page.waitForTimeout(250);
  const pagePath = resolve(REPORT_ROOT, `public-${state}-page.png`);
  const canvasPath = resolve(REPORT_ROOT, `public-${state}-canvas.png`);
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

function assertAssetHashes(): void {
  expect(createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseSkylineCity.2f6624cd.glb"))).digest("hex")).toBe("2f6624cdd44b88b4c9b612bf0b9062451c5ade91ed243e0c595672d79dd13338");
  expect(createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb"))).digest("hex")).toBe("9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f");
}

function assertSourceBoundary(): void {
  const source = readFileSync(resolve("examples/recast-crowd-lab/main.ts"), "utf8");
  expect(source).toContain('from "@aura3d/engine"');
  expect(source).toContain('from "@aura3d/navigation-recast"');
  expect(source).toContain("assets.showcaseSkylineCity");
  expect(source).toContain("assets.showcaseAnimatedRunnerHero");
  expect(source).not.toMatch(/from\s+["']three|from\s+["']recast-navigation|@aura3d\/(?:rendering|scene)|packages\//);
}

export {};
