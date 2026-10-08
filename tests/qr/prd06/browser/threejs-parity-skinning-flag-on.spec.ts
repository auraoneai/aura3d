/**
 * PRD-06 §16 flag-on copies of
 * `tests/browser/threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`.
 * §10 (P1, item 2): each flag-on expectation cites the three r185 value it
 * matches — pose parity within the lane's 1e-4 bound against an actual
 * `THREE.AnimationMixer` (blending), `AdditiveAnimationBlendMode` (additive),
 * and the solved pose replayed in the r185 scene graph (ik, original bound
 * endDistanceToTarget < 0.55).
 */
import { expect, test } from "@playwright/test";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../../prd04/dev-server";

interface TrsDiff {
  readonly boneCount: number;
  readonly maxPosition: number;
  readonly maxQuaternion: number;
  readonly maxScale: number;
}
interface FlagOnReport {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly blending?: { readonly status: string; readonly error?: string; readonly tracksApplied?: number; readonly diff?: TrsDiff };
  readonly additive?: { readonly status: string; readonly error?: string; readonly tracksApplied?: number; readonly diff?: TrsDiff };
  readonly ik?: { readonly status: string; readonly error?: string; readonly applied?: boolean; readonly endDistanceToTarget?: number; readonly skinningPalettesUpdated?: number; readonly worldDrift?: number };
}
declare global {
  interface Window { __AURA3D_QR_SKINNING_PARITY_FLAG_ON__?: FlagOnReport }
}

test.describe("prd06 threejs-parity-skinning flag-on (§16)", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;
  let result: FlagOnReport;

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    await page.goto(`${server.origin}/tests/qr/prd06/browser/skinning-parity-flag-on-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const r = window.__AURA3D_QR_SKINNING_PARITY_FLAG_ON__ as FlagOnReport | undefined;
        return r?.status === "error" || (r?.blending?.status && r?.additive?.status && r?.ik?.status);
      },
      undefined,
      { timeout: 90_000 }
    );
    result = await page.evaluate(() => window.__AURA3D_QR_SKINNING_PARITY_FLAG_ON__!) as FlagOnReport;
    expect(pageErrors).toEqual([]);
    await page.close();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("blending: applyClips pose matches THREE.AnimationMixer within 1e-4", () => {
    expect(result.status, result.error).toBe("ready");
    const c = result.blending;
    expect(c?.status, c?.error).toBe("ready");
    expect(c!.tracksApplied).toBeGreaterThan(0);
    expect(c!.diff!.boneCount).toBeGreaterThan(0);
    expect(c!.diff!.maxPosition).toBeLessThanOrEqual(1e-4);
    expect(c!.diff!.maxQuaternion).toBeLessThanOrEqual(1e-4);
    expect(c!.diff!.maxScale).toBeLessThanOrEqual(1e-4);
  });

  test("additive: makeClipAdditive+additive:true matches THREE additive blend within 1e-4", () => {
    const c = result.additive;
    expect(c?.status, c?.error).toBe("ready");
    expect(c!.tracksApplied).toBeGreaterThan(0);
    expect(c!.diff!.boneCount).toBeGreaterThan(0);
    expect(c!.diff!.maxPosition).toBeLessThanOrEqual(1e-4);
    expect(c!.diff!.maxQuaternion).toBeLessThanOrEqual(1e-4);
    expect(c!.diff!.maxScale).toBeLessThanOrEqual(1e-4);
  });

  test("ik: flag-on solver end-to-target < 0.55 and solved pose agrees with r185 scene graph within 1e-3", () => {
    const c = result.ik;
    expect(c?.status, c?.error).toBe("ready");
    expect(c!.applied).toBe(true);
    expect(c!.skinningPalettesUpdated).toBeGreaterThan(0);
    expect(c!.endDistanceToTarget).toBeLessThan(0.55);
    expect(c!.worldDrift).toBeLessThan(1e-3);
  });
});
