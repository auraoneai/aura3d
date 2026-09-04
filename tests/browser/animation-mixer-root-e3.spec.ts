import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/animation-mixer-e3-harness.ts");
const reportDir = "tests/reports/animation-mixer-root-e3";

test.describe("E3 mixer/action/track/event/timeScale/crossfade/layers root-reachable in browser", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness imports only the root public API", () => {
    const source = readFileSync(harnessSource, "utf8");
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/rendering|@aura3d\/engine\/rendering|@aura3d\/engine\/production-runtime|@aura3d\/assets|@aura3d\/assets\/browser|@aura3d\/animation)/);
    expect(source).not.toContain("GLTFLoader");
    expect(source).not.toContain("unsafeModelUrl");
    expect(source).not.toMatch(/model\(\s*["'`]/);
  });

  test("every mixer capability works from @aura3d/engine", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/animation-mixer-e3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_MIXER_E3__), undefined, {
      timeout: 30_000
    });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_MIXER_E3__);
    writeJson(`${reportDir}/animation-mixer-root-e3.json`, { ...evidence, pageErrors: errors });

    expect(evidence?.status, evidence?.error).toBe("ready");
    expect(errors).toEqual([]);
    expect(evidence?.imports).toEqual(["@aura3d/engine"]);
    expect(evidence?.reachability).toEqual({
      mixer: true,
      action: true,
      track: true,
      event: true,
      timeScale: true,
      crossfade: true,
      layers: true,
      overlay: true
    });
    // Crossfade moved weight from idle to run.
    expect(evidence?.idleWeightBefore).toBe(1);
    expect(evidence?.runWeightBefore).toBe(0);
    expect(evidence?.runWeightAfter).toBeGreaterThan(evidence?.idleWeightAfter);
    expect(evidence?.runWeightAfter).toBeCloseTo(1, 5);
    // The run clip drives the blended value; the masked arm layer still applies.
    expect(evidence?.heroPosition?.[0]).toBeGreaterThan(0.1);
    expect(evidence?.armRotation?.[2]).toBeGreaterThan(0);
    // Clip events fired through the root subscription.
    expect(evidence?.eventsFired).toEqual(expect.arrayContaining(["idle:footstep", "run:stride"]));
    expect(evidence?.mixerTimeScale).toBe(1);
    expect(evidence?.stateNames).toEqual(expect.arrayContaining(["idle", "run", "wave"]));
    expect(evidence?.layerNames).toEqual(["upper-body"]);
  });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
