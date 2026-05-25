import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const screenshotPath = "tests/reports/external-parity-example-screenshots/racing-showcase.png";

test.describe("racing showcase V4 example", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a procedural car, track, seeded textures, HUD telemetry, and blocked parity claims", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/racing-showcase/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const state = window.__GALILEO3D_RACING_SHOWCASE__;
      return state?.status === "ready"
        && state.metrics?.raceState === "finished"
        && Number(state.metrics?.carParts ?? 0) >= 30
        && state.featureEvidence?.raceTelemetry === true;
    }, undefined, { timeout: 20_000 });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.__GALILEO3D_RACING_SHOWCASE__);
    const pixels = await canvasPixelStats(page);
    const hudPixels = await hudCanvasPixelStats(page);
    mkdirSync(join(process.cwd(), "tests/reports/external-parity-example-screenshots"), { recursive: true });
    await page.screenshot({ path: join(process.cwd(), screenshotPath), fullPage: true });

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(state?.renderer).toBe("webgl2");
    expect(state?.screenshotPath).toBe(screenshotPath);
    expect(state?.featureEvidence?.proceduralCar).toBe(true);
    expect(state?.featureEvidence?.oldBranchProceduralCarPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchRaceManagerPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchVehicleDynamicsPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchVehicleDrivetrainPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchVehicleEffectsPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchVehicleDamagePort).toBe(true);
    expect(state?.featureEvidence?.oldBranchRacingHudPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchPacejkaTireModelPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchRacingAiDriverPort).toBe(true);
    expect(state?.featureEvidence?.sportsCarAeroDetails).toBe(true);
    expect(state?.featureEvidence?.generatedTrack).toBe(true);
    expect(state?.featureEvidence?.racingHud).toBe(true);
    expect(state?.featureEvidence?.raceTelemetry).toBe(true);
    expect(state?.featureEvidence?.raceCountdownSequence).toBe(true);
    expect(state?.featureEvidence?.checkpointProgression).toBe(true);
    expect(state?.featureEvidence?.lapTiming).toBe(true);
    expect(state?.featureEvidence?.leaderboardState).toBe(true);
    expect(state?.featureEvidence?.minimapRacerPositions).toBe(true);
    expect(state?.featureEvidence?.analogHudGauges).toBe(true);
    expect(state?.featureEvidence?.raceFinishState).toBe(true);
    expect(state?.featureEvidence?.proceduralTextureFixtures).toBeGreaterThanOrEqual(9);
    expect(state?.featureEvidence?.metallicPaintTexture).toBe(true);
    expect(state?.featureEvidence?.metallicRoughnessTexture).toBe(true);
    expect(state?.featureEvidence?.racingStripeDecalTexture).toBe(true);
    expect(state?.featureEvidence?.racingNumberDecalTexture).toBe(true);
    expect(state?.featureEvidence?.carbonFiberTexture).toBe(true);
    expect(state?.featureEvidence?.tireTreadTexture).toBe(true);
    expect(state?.featureEvidence?.concreteAsphaltTexture).toBe(true);
    expect(state?.featureEvidence?.starfieldNebulaTexture).toBe(true);
    expect(state?.featureEvidence?.fullVehiclePhysicsClaimed).toBe(false);
    expect(state?.v4RenderPreset?.presetId).toBe("galileo3d-external-parity-visual-quality-preset");
    expect(state?.v4RenderPreset?.blockedFeatures?.map((entry) => entry.feature)).toEqual(expect.arrayContaining(["directional-shadows", "depth-textures", "hdr"]));
    expect(state?.textureFixtures.map((entry) => entry.hash)).toHaveLength(new Set(state?.textureFixtures.map((entry) => entry.hash)).size);
    expect(Number(state?.metrics?.aeroParts ?? 0)).toBeGreaterThanOrEqual(10);
    expect(state?.metrics?.raceState).toBe("finished");
    expect(Number(state?.metrics?.totalLaps ?? 0)).toBe(3);
    expect(Number(state?.metrics?.completedLaps ?? 0)).toBe(3);
    expect(Number(state?.metrics?.checkpointEvents ?? 0)).toBeGreaterThanOrEqual(36);
    expect(String(state?.metrics?.lapTimesMs ?? "").split(",")).toHaveLength(3);
    expect(Number(state?.metrics?.bestLapMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.leaderboardPosition ?? 0)).toBe(1);
    expect(Number(state?.metrics?.hudGaugeCount ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics?.minimapRacerCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics?.minimapTrackPoints ?? 0)).toBeGreaterThanOrEqual(32);
    expect(state?.metrics?.raceFinished).toBe(true);
    expect(Number(state?.metrics?.vehicleSteerAngle ?? 0)).not.toBe(0);
    expect(Number(state?.metrics?.vehicleDriftSlip ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics?.vehicleGrip ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vehicleWheelSpin ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics?.vehicleSuspensionCompression ?? "").split(",")).toHaveLength(4);
    expect(Number(state?.metrics?.tireCombinedForce ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics?.tireLongitudinalForce ?? 0))).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics?.tireLateralForce ?? 0))).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics?.tireSlipRatio ?? 0))).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics?.tireSlipAngle ?? 0))).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics?.tireAligningTorque ?? 0))).toBeGreaterThan(0);
    expect(Number(state?.metrics?.drivetrainGear ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics?.drivetrainEngineRpm ?? 0)).toBeGreaterThan(900);
    expect(Number(state?.metrics?.drivetrainEngineTorque ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.drivetrainWheelTorque ?? 0)).toBeGreaterThan(Number(state?.metrics?.drivetrainEngineTorque ?? 0));
    expect(Number(state?.metrics?.drivetrainFrontTorque ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.drivetrainRearTorque ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.drivetrainDragForce ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.drivetrainDownforce ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics?.drivetrainShiftState ?? "")).toMatch(/^(hold|upshift|downshift)$/);
    expect(Number(state?.metrics?.tireSmokeRate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.tireSmokeEmitters ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics?.nitroFlameRate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vehicleEffectEmitters ?? 0)).toBeGreaterThanOrEqual(5);
    expect(String(state?.metrics?.vehicleSmokeReason ?? "")).toMatch(/^(handbrake|launch-wheelspin|high-speed-steer)$/);
    expect(Number(state?.metrics?.vehicleHealth ?? 100)).toBeLessThan(100);
    expect(Number(state?.metrics?.vehicleDamage ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vehicleImpactDamage ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics?.vehicleDamageLevel ?? "")).toMatch(/^(scratched|dented|critical)$/);
    expect(Number(state?.metrics?.racingAiThrottle ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics?.racingAiBrake ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics?.racingAiTargetSpeedKph ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.racingAiLookaheadDistance ?? 0)).toBeGreaterThan(0);
    expect(typeof state?.metrics?.racingAiOvertaking).toBe("boolean");
    expect(Number.isFinite(Number(state?.metrics?.racingAiRubberbandBoost))).toBe(true);
    expect(Number(state?.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(25);
    expect(Number(state?.postprocess?.outputNonDarkPixels ?? 0)).toBeGreaterThan(0);
    expect(pixels.nonBlankPixels).toBeGreaterThan(8_000);
    expect(pixels.colorBuckets).toBeGreaterThan(6);
    expect(hudPixels.nonBlankPixels).toBeGreaterThan(600);
    expect(hudPixels.colorBuckets).toBeGreaterThan(3);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function canvasPixelStats(page: Page): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='racing-showcase-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { nonBlankPixels: 0, colorBuckets: 0 };
    const width = Math.min(320, canvas.width);
    const height = Math.min(180, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      }
    }
    return { nonBlankPixels, colorBuckets: buckets.size };
  });
}

async function hudCanvasPixelStats(page: Page): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate(() => {
    const canvases = [
      document.querySelector<HTMLCanvasElement>("[data-testid='racing-speed-gauge']"),
      document.querySelector<HTMLCanvasElement>("[data-testid='racing-rpm-gauge']"),
      document.querySelector<HTMLCanvasElement>("[data-testid='racing-minimap']")
    ].filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas));
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (const canvas of canvases) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] ?? 0;
        const g = pixels[index + 1] ?? 0;
        const b = pixels[index + 2] ?? 0;
        const a = pixels[index + 3] ?? 0;
        if (a > 0 && (r > 8 || g > 8 || b > 8)) {
          nonBlankPixels += 1;
          buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}:${a >> 6}`);
        }
      }
    }
    return { nonBlankPixels, colorBuckets: buckets.size };
  });
}

declare global {
  interface Window {
    __GALILEO3D_RACING_SHOWCASE__?: {
      readonly status?: "ready" | "error";
      readonly renderer?: "webgl2";
      readonly screenshotPath?: string;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly featureEvidence?: Record<string, unknown>;
      readonly metrics?: Record<string, unknown>;
      readonly textureFixtures: readonly { readonly id: string; readonly hash: string }[];
      readonly v4RenderPreset?: { readonly presetId?: string; readonly blockedFeatures?: readonly { readonly feature?: string }[] };
      readonly postprocess?: { readonly outputNonDarkPixels?: number };
    };
  }
}
