import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/d4-flipbook-beam-harness.ts");

test.describe("D4 flipbook explosion + thick beam routes — root browser proof", () => {
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

  test("explosion and beam routes pass route-health with pixel proof", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const responseErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      // 3xx dev-server alias redirects are normal; only 4xx/5xx are failures.
      if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      responseErrors.push(`failed ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });

    await page.goto(`${server.origin}/tests/browser/d4-flipbook-beam-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_D4_FLIPBOOK_BEAM__?.status === "ready" || window.__AURA3D_D4_FLIPBOOK_BEAM__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_D4_FLIPBOOK_BEAM__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/d4-flipbook-beam.json"), `${JSON.stringify({ ...result, pageErrors, consoleErrors, responseErrors }, null, 2)}\n`);
    const screenshot = await page.screenshot({ path: resolve("tests/reports/d4-flipbook-beam-contact-sheet.png"), fullPage: true });

    expect(result?.status, result?.error ?? pageErrors.join("\n")).toBe("ready");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(responseErrors).toEqual([]);
    expect(screenshot.byteLength).toBeGreaterThan(1000);

    // Route-health contract on every capture: ready, drawing, no errors.
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "blast-off",
      "blast-ignite",
      "blast-peak",
      "blast-dissipate",
      "beam-off",
      "beam-on"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.nodeCount, capture.id).toBeGreaterThan(0);
      expect(capture.backend, capture.id).toBe("production-runtime");
      expect(capture.errorCount, capture.id).toBe(0);
      expect(capture.image.nonDarkPixels, capture.id).toBeGreaterThan(500);
    }

    // On/off pixel deltas: the looks change real pixels.
    expect(Number(result?.checks?.blastDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.igniteDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.dissipateDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.beamDiff ?? 0)).toBeGreaterThan(50);

    // The explosion reads as an explosion: amber fireball + bright core.
    const peak = result?.captures?.find((capture) => capture.id === "blast-peak");
    expect(peak?.image.amberPixels).toBeGreaterThan(100);
    expect(peak?.image.brightPixels).toBeGreaterThan(100);

    // The beam reads as an additive glow: cyan spill + bright core.
    const beamOn = result?.captures?.find((capture) => capture.id === "beam-on");
    expect(beamOn?.image.cyanPixels).toBeGreaterThan(100);
    expect(beamOn?.image.brightPixels).toBeGreaterThan(50);

    // Flipbook sheet math matches the unit-proven UVs (4x4, GL v-flip).
    const metaById = (id: string): Record<string, number | string | boolean | readonly number[]> =>
      result?.captures?.find((capture) => capture.id === id)?.meta ?? {};
    expect(metaById("blast-ignite").flipbookFrame).toBe(2);
    expect(metaById("blast-ignite").flipbookUv).toEqual([0.5, 0.75, 0.75, 1]);
    expect(metaById("blast-peak").flipbookFrame).toBe(8);
    expect(metaById("blast-peak").flipbookUv).toEqual([0, 0.25, 0.25, 0.5]);
    expect(metaById("blast-dissipate").flipbookFrame).toBe(14);
    expect(metaById("blast-dissipate").flipbookUv).toEqual([0.5, 0, 0.75, 0.25]);

    // Root API proof: the D4 contract nodes ride every scene.
    const flipbookNode = result?.checks?.flipbookNode as Record<string, unknown> | undefined;
    expect(flipbookNode).toMatchObject({ kind: "effect", effect: "flipbook-sprite", spriteColumns: 4, spriteRows: 4, frameRate: 24 });
    const beamNode = result?.checks?.beamNode as Record<string, unknown> | undefined;
    expect(beamNode).toMatchObject({
      kind: "effect",
      effect: "light-beam",
      from: [0, 0.25, -0.5],
      to: [0, 2.75, -0.5],
      widthWorld: 0.3,
      segmentCount: 12
    });
    expect(Number(result?.checks?.beamLength ?? 0)).toBeCloseTo(2.5, 5);

    // Honest labels: both stay recorded-but-withheld at root (no native targets yet).
    for (const capture of (result?.captures ?? []).filter((entry) => entry.id.startsWith("blast-"))) {
      expect(capture.warnings.some((warning) => warning.includes("flipbook-sprite is recorded but withheld")), capture.id).toBe(true);
    }
    for (const capture of (result?.captures ?? []).filter((entry) => entry.id.startsWith("beam-"))) {
      expect(capture.warnings.some((warning) => warning.includes("light-beam is recorded but withheld")), capture.id).toBe(true);
    }
  });
});

declare global {
  interface Window {
    __AURA3D_D4_FLIPBOOK_BEAM__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly nodeCount: number;
        readonly backend: string;
        readonly errorCount: number;
        readonly warnings: readonly string[];
        readonly image: {
          readonly nonDarkPixels: number;
          readonly nonLightPixels: number;
          readonly amberPixels: number;
          readonly yellowPixels: number;
          readonly cyanPixels: number;
          readonly brightPixels: number;
          readonly colorBuckets: number;
          readonly spatialChecksum: number;
        };
        readonly meta: Record<string, number | string | boolean | readonly number[]>;
      }[];
      readonly checks?: Record<string, number | string | boolean | readonly number[] | Record<string, unknown>>;
      readonly error?: string;
    };
  }
}
