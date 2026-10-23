import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * parity-runtime - threejs-parity lane L7 acceptance fixture
 * (docs/workflows/threejs-parity-gaps.md §5.7 / §6 L7-05..L7-13, task R-08).
 *
 * Remote-only: run on the GPU browser runner (tools/remote-acr/run.sh), never
 * under local Playwright. Every assertion is on pixels measured from real
 * frames rendered by examples/parity-runtime-lab:
 *   SR-02  a `fog:false` mesh equals the no-fog baseline while its fogged twin does not,
 *   SG-10  texture and cube backgrounds paint, never enable IBL, and the cube is a real cube,
 *   SC-01  a cube-camera reflection moves when the coloured object moves,
 *   AD-15  `surfaces.mirror` reflects the object below the floor line,
 *   SR-04  `camera.layers` removes non-intersecting nodes from the frame,
 *   SH-06  `render({ target })` output, sampled as a material map, reaches the canvas.
 */

const REPORT_ROOT = resolve("tests/reports/parity-runtime");
const LAB = "/examples/parity-runtime-lab/";

type Rgb = readonly [number, number, number];

interface Evidence {
  readonly status: "boot" | "ready" | "error";
  readonly error?: string;
  readonly fog?: {
    readonly baselineOffBox: Rgb;
    readonly fogOnOffBox: Rgb;
    readonly fogOnFoggedBox: Rgb;
    readonly offBoxDiffVsBaseline: number;
    readonly foggedBoxDiffVsBaseline: number;
  };
  readonly background?: {
    readonly textureCornerChroma: number;
    readonly textureSphereDiffVsPlain: number;
    readonly cubeFacesDiffer: number;
    readonly cubeCornerChroma: readonly [number, number];
  };
  readonly cubeCamera?: {
    readonly redBefore: number;
    readonly redAfter: number;
    readonly centroidBefore: number | null;
    readonly centroidAfter: number | null;
    readonly windowDiff: number;
    readonly envMapVsControlDiff: number;
  };
  readonly mirror?: {
    readonly baselineRedPixels: number;
    readonly mirrorRedPixels: number;
    readonly baselineLowestRedRow: number;
    readonly mirrorLowestRedRow: number;
  };
  readonly layers?: {
    readonly unmasked: { readonly red: number; readonly blue: number };
    readonly layer0: { readonly red: number; readonly blue: number };
    readonly layer1: { readonly red: number; readonly blue: number };
  };
  readonly renderTarget?: {
    readonly withTarget: readonly number[];
    readonly baseline: readonly number[];
  };
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
}

test.describe("parity-runtime (L7)", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("fog opt-out, backgrounds, cube camera, mirror, layers and render targets render real pixels", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const status = (window as unknown as { __AURA3D_PARITY_RUNTIME_LAB__?: { status: string } }).__AURA3D_PARITY_RUNTIME_LAB__?.status;
        return status === "ready" || status === "error";
      },
      undefined,
      { timeout: 540_000 }
    );
    const evidence = await page.evaluate(
      () => (window as unknown as { __AURA3D_PARITY_RUNTIME_LAB__: Evidence }).__AURA3D_PARITY_RUNTIME_LAB__
    );

    console.log("[parity-evidence:runtime]", JSON.stringify(evidence));
    await page.screenshot({ path: `${REPORT_ROOT}/parity-runtime.png`, fullPage: true });
    writeFileSync(
      resolve(`${REPORT_ROOT}/parity-runtime.json`),
      `${JSON.stringify(
        {
          schema: "aura3d-parity-runtime/1.0",
          generatedAt: new Date().toISOString(),
          claimBoundary:
            "Proves per-material fog opt-out, texture/cube scene backgrounds without IBL, cube-camera reflection follow, planar mirror reflection, camera layer masking and render-target-as-map on a real GPU. Does not claim a pixel-identical match against Three.js output.",
          consoleErrors: errors,
          ...evidence
        },
        null,
        2
      )}\n`
    );

    expect(evidence.status, evidence.error ?? "").toBe("ready");
    expect(errors.filter((e) => /parity-not-implemented|Failed to resolve/.test(e))).toEqual([]);

    // SR-02: the opt-out box is the baseline; its fogged twin visibly is not.
    const fog = evidence.fog!;
    expect(fog.offBoxDiffVsBaseline, JSON.stringify(fog)).toBeLessThanOrEqual(6);
    expect(fog.foggedBoxDiffVsBaseline, JSON.stringify(fog)).toBeGreaterThanOrEqual(25);

    // SG-10: backgrounds paint; no IBL leaks onto a metallic probe; the cube has six distinct faces.
    const background = evidence.background!;
    expect(background.textureCornerChroma, JSON.stringify(background)).toBeGreaterThan(80);
    expect(background.textureSphereDiffVsPlain, JSON.stringify(background)).toBeLessThanOrEqual(6);
    expect(background.cubeCornerChroma[0], JSON.stringify(background)).toBeGreaterThan(60);
    expect(background.cubeCornerChroma[1], JSON.stringify(background)).toBeGreaterThan(60);
    expect(background.cubeFacesDiffer, JSON.stringify(background)).toBeGreaterThan(100);

    // SC-01: the red reflection sits right of centre, then moves left after the object moves.
    const cube = evidence.cubeCamera!;
    expect(cube.redBefore, JSON.stringify(cube)).toBeGreaterThanOrEqual(8);
    expect(cube.redAfter, JSON.stringify(cube)).toBeGreaterThanOrEqual(8);
    expect(cube.centroidBefore, JSON.stringify(cube)).not.toBeNull();
    expect(cube.centroidAfter, JSON.stringify(cube)).not.toBeNull();
    expect(cube.centroidAfter! - cube.centroidBefore!, JSON.stringify(cube)).toBeLessThan(-6);
    // The env-mapped sphere differs from the same scene without `envMap`, and the frame changes when the cube moves.
    expect(cube.envMapVsControlDiff, JSON.stringify(cube)).toBeGreaterThan(5);
    expect(cube.windowDiff, JSON.stringify(cube)).toBeGreaterThan(1);

    // AD-15: the mirror adds red pixels that reach below anything the plain floor shows.
    const mirror = evidence.mirror!;
    expect(mirror.mirrorRedPixels, JSON.stringify(mirror)).toBeGreaterThan(mirror.baselineRedPixels * 1.3);
    expect(mirror.mirrorLowestRedRow, JSON.stringify(mirror)).toBeGreaterThanOrEqual(mirror.baselineLowestRedRow + 10);

    // SR-04: the camera mask removes the node it does not intersect, and only that node.
    const layers = evidence.layers!;
    expect(layers.unmasked.red, JSON.stringify(layers)).toBeGreaterThan(300);
    expect(layers.unmasked.blue, JSON.stringify(layers)).toBeGreaterThan(300);
    expect(layers.layer0.red, JSON.stringify(layers)).toBeGreaterThan(300);
    expect(layers.layer0.blue, JSON.stringify(layers)).toBeLessThan(layers.unmasked.blue * 0.05);
    expect(layers.layer1.blue, JSON.stringify(layers)).toBeGreaterThan(300);
    expect(layers.layer1.red, JSON.stringify(layers)).toBeLessThan(layers.unmasked.red * 0.05);

    // SH-06: the green triangle drawn into the target shows up through the sampled map.
    const target = evidence.renderTarget!;
    expect(target.withTarget[1]!, JSON.stringify(target)).toBeGreaterThan(150);
    expect(target.withTarget[0]!, JSON.stringify(target)).toBeLessThan(80);
    expect(target.withTarget[2]!, JSON.stringify(target)).toBeLessThan(80);
    expect(target.baseline[1]!, JSON.stringify(target)).toBeLessThan(40);

    // §8 route-health names the parity IDs this port exercised.
    expect(evidence.routeHealth?.status).toBe("ready");
    expect([...(evidence.routeHealth?.parityIds ?? [])].sort()).toEqual(["AD-15", "SC-01", "SG-10", "SH-06", "SR-02", "SR-04"]);
  });
});
