import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = "tests/reports/shadow-family-b1";

test.describe("shadow family B1 pixel proofs", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("spot shadows render with PCF, point-cube shadows render, atlas packs all three", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/tests/browser/shadow-family-b1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__AURA3D_SHADOW_FAMILY_B1__ as { status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 },
    );

    const result = (await page.evaluate(() => window.__AURA3D_SHADOW_FAMILY_B1__)) as ShadowFamilyB1Result;
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    const { spot, point, atlas, shaders } = result as {
      spot?: unknown;
      point?: unknown;
      atlas?: unknown;
      shaders?: unknown;
    };
    writeFileSync(
      resolve(`${REPORT_DIR}/shadow-family-b1-result.json`),
      `${JSON.stringify({ status: result.status, schema: result.schema, spot, point, atlas, shaders }, null, 2)}\n`,
    );

    expect(result.status, `${result.error ?? ""}\n${pageErrors.join("\n")}`).toBe("ready");
    expect(result.schema).toBe("a3d-shadow-family-b1");

    // (0) Every touched forward lit shader compiles on the real GL driver and
    // exposes all 13 spot uniforms to the ForwardPass reflection guard.
    expect(result.shaders.programs.length).toBeGreaterThanOrEqual(5);
    const basePrograms = result.shaders.programs.filter((program) => program.variant === null);
    expect(basePrograms.length).toBe(5);
    for (const program of basePrograms) {
      expect(program.compiled, `${program.shader}:base ${program.error ?? ""}`).toBe(true);
      expect(program.spotUniformCount, program.shader).toBe(13);
    }
    const spotOptOutVariants = new Set([
      "clearcoat-transmission-volume-textures",
      "specular-sheen-anisotropy-iridescence-textures",
    ]);
    for (const program of result.shaders.programs) {
      if (program.compiled) {
        // Supported programs expose all 13 spot uniforms; the two
        // sampler-exhausted textured variants cleanly opt out (0). A partial
        // set would mean a broken insertion.
        const expected = spotOptOutVariants.has(program.variant ?? "") ? 0 : 13;
        expect(program.spotUniformCount, `${program.shader}:${program.variant ?? "base"}`).toBe(expected);
        continue;
      }
      // Any link failure must prove B1 independence: either the failing
      // preprocessed source contains no spot text at all (spotFree, true for
      // the two sampler-exhausted opt-outs) or the spot-stripped sources fail
      // identically (pre-existing over-limit variant). Anything else is a B1
      // regression.
      expect(
        program.error ?? "",
        `${program.shader}:${program.variant ?? "base"} must prove B1 independence`,
      ).toMatch(/spotFree:true|stripped:false/);
    }

    // (1) Spot shadows render with PCF through the new forward GLSL path.
    expect(result.spot.depthRendered).toBe(true);
    expect(result.spot.depthCasterCount).toBeGreaterThanOrEqual(2);
    expect(result.spot.collectedDirectionMatch).toBe(true);
    expect(result.spot.pcf.diagnostics.lastError).toBeNull();
    expect(result.spot.pcf.diagnostics.drawCalls).toBeGreaterThanOrEqual(2);
    expect(result.spot.pcf.pixelStats.nonBlackPixels).toBeGreaterThan(40_000);
    // The shadow exists: many pixels darken vs the unshadowed control.
    expect(result.spot.shadowDropCount).toBeGreaterThan(1_500);
    expect(result.spot.singleTapDropCount).toBeGreaterThan(1_500);
    // The lit corner is unaffected by shadowing (no global dimming).
    expect(result.spot.litCornerDeltaPcfVsUnshadowed).toBeLessThan(4);
    expect(result.spot.litPatchLumaUnshadowed - result.spot.litPatchLumaPcf).toBeLessThan(4);
    // The shadow core darkens decisively.
    expect(result.spot.shadowPatchLumaUnshadowed - result.spot.shadowPatchLumaPcf).toBeGreaterThan(6);
    // PCF vs single-tap on the SAME depth map: the filter changes edge pixels only.
    expect(result.spot.pcfVsSingleDiffCount).toBeGreaterThan(8);
    expect(result.spot.litCornerDeltaPcfVsSingle).toBeLessThan(3);
    // Same depth through the legacy directional factor: the new override agrees.
    expect(
      Math.abs(result.spot.shadowDropCount - result.spot.directionalOnlyDropCount),
    ).toBeLessThan(300);

    // (2) Point-cube shadows render through the existing forward cube path.
    expect(result.point.shadowed.diagnostics.lastError).toBeNull();
    expect(result.point.shadowed.diagnostics.drawCalls).toBeGreaterThanOrEqual(2);
    expect(result.point.shadowed.pixelStats.nonBlackPixels).toBeGreaterThan(40_000);
    expect(result.point.shadowDropCount).toBeGreaterThan(800);
    expect(result.point.shadowPatchDelta).toBeGreaterThan(4);
    expect(result.point.litPatchAgreement).toBeLessThan(4);

    // (3) The atlas packs directional + spot + point with utilization reported.
    expect(result.atlas.allocationCount).toBe(3);
    expect(result.atlas.allocationIds).toEqual(["directional-key", "spot-stage", "point-hall"]);
    expect(result.atlas.utilization).toBeCloseTo(0.5625, 4);
    expect(result.atlas.fallbackCount).toBe(0);

    // Screenshots + canvas PNG artifacts.
    await page.screenshot({ path: resolve(`${REPORT_DIR}/shadow-family-b1-page.png`) });
    const artifacts = ([
      ["spot", `${REPORT_DIR}/b1-spot-shadow-pcf.png`, result.spot.dataUrl],
      ["point", `${REPORT_DIR}/b1-point-shadow.png`, result.point.dataUrl],
    ] as const).map(([id, path, dataUrl]) => {
      if (!dataUrl) throw new Error(`Missing ${id} shadow data URL.`);
      if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error(`Invalid ${id} data URL.`);
      writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      return { id, path };
    });
    expect(artifacts).toHaveLength(2);
  });
});

interface ShadowFamilyB1Result {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly schema?: string;
  readonly spot: {
    readonly depthRendered: boolean;
    readonly depthCasterCount: number;
    readonly collectedDirectionMatch: boolean;
    readonly pcf: FrameSummary;
    readonly singleTap: FrameSummary;
    readonly unshadowed: FrameSummary;
    readonly shadowDropCount: number;
    readonly singleTapDropCount: number;
    readonly directionalOnlyDropCount: number;
    readonly pcfVsSingleDiffCount: number;
    readonly litCornerDeltaPcfVsUnshadowed: number;
    readonly litCornerDeltaPcfVsSingle: number;
    readonly shadowPatchLumaPcf: number;
    readonly shadowPatchLumaSingle: number;
    readonly shadowPatchLumaUnshadowed: number;
    readonly litPatchLumaPcf: number;
    readonly litPatchLumaUnshadowed: number;
    readonly dataUrl?: string;
  };
  readonly point: {
    readonly shadowed: FrameSummary;
    readonly unshadowed: FrameSummary;
    readonly shadowDropCount: number;
    readonly shadowPatchDelta: number;
    readonly litPatchAgreement: number;
    readonly dataUrl?: string;
  };
  readonly atlas: {
    readonly allocationCount: number;
    readonly allocationIds: readonly string[];
    readonly utilization: number;
    readonly fallbackCount: number;
  };
  readonly shaders: {
    readonly programs: readonly {
      readonly shader: string;
      readonly variant: string | null;
      readonly compiled: boolean;
      readonly spotUniformCount: number;
      readonly error: string | null;
    }[];
  };
}

interface FrameSummary {
  readonly diagnostics: { drawCalls: number; lastError: string | null };
  readonly pixelStats: { meanLuma: number; nonBlackPixels: number; uniqueColorBuckets: number };
}

declare global {
  interface Window {
    __AURA3D_SHADOW_FAMILY_B1__?: ShadowFamilyB1Result;
  }
}
