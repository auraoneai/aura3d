/**
 * threejs-parity §5.2 lane L2 (SG-03/SG-04/SG-05) — remote-only browser gate.
 * Every widened primitive kind must draw non-empty pixels; the SG-05 runtime
 * path (handle.setGeometry + handle.updateAttribute) must sustain per-frame
 * updates on a 10k-vertex ribbon without breaking the frame loop.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("threejs-parity L2 geometry breadth", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("all ten widened kinds render non-empty pixels and dynamic updates run per frame", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 480 });
    await page.goto(`${server.origin}/tests/browser/parity-geometry-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#run");
    await page.waitForFunction(
      () => window.__AURA3D_PARITY_GEOMETRY__?.status === "ready" || window.__AURA3D_PARITY_GEOMETRY__?.status === "error",
      undefined,
      { timeout: 150_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_PARITY_GEOMETRY__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/parity-geometry-l2.json"), `${JSON.stringify(result, null, 2)}\n`);

    expect(result?.status, result?.error).toBe("ready");

    const captures = result?.captures ?? [];
    expect(captures.map((capture) => capture.id)).toEqual([
      "cone", "circle", "ring", "torusKnot", "polyhedron", "roundedBox",
      "tube", "lathe", "extrude", "shape"
    ]);
    for (const capture of captures) {
      expect(capture.drawCalls, `${capture.id}: draw calls`).toBeGreaterThan(0);
      expect(capture.image.nonDarkPixels, `${capture.id}: non-dark pixels`).toBeGreaterThan(200);
      expect(capture.image.colorBuckets, `${capture.id}: color buckets`).toBeGreaterThan(2);
    }

    const dynamic = result?.dynamic;
    expect(dynamic?.frames).toBe(30);
    expect(dynamic?.positionMoved).toBe(true);
    // Timing gate: per-frame update calls must stay cheap on a 10k-vertex
    // ribbon (the in-place dirty-range path — no recompile, no realloc).
    expect(dynamic?.updateAttributeMsP50 ?? Infinity).toBeLessThan(2);
    expect(dynamic?.setGeometryMsP50 ?? Infinity).toBeLessThan(8);
  });
});
