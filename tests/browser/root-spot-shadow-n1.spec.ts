import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("N1 spot shadow probes", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("requested spot wins the caster slot with pixel proof on both rigs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(`${server.origin}/tests/browser/root-spot-shadow-n1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_N1_SPOT_SHADOW__?.status === "ready" || window.__AURA3D_N1_SPOT_SHADOW__?.status === "error",
      undefined,
      { timeout: 270_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_N1_SPOT_SHADOW__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-spot-shadow-n1.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/root-spot-shadow-n1.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "street-unrequested",
      "street-requested",
      "arena-unrequested",
      "arena-requested"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
    }

    const checks = result?.checks ?? {};
    // Night-street rig: request wins the caster slot with cone telemetry.
    expect(checks.streetRequested).toBe(true);
    expect(checks.streetCasterIsSpot).toBe(true);
    expect(checks.streetCasterName).toBe("streetlamp");
    expect(Number(checks.streetAtlas)).toBeGreaterThan(0);
    // Without the request the directional keeps the slot (legacy order).
    expect(checks.streetUnrequestedCaster).toBe(false);
    // Arena rig: same contract on the second adoption scene.
    expect(checks.arenaRequested).toBe(true);
    expect(checks.arenaCasterIsSpot).toBe(true);
    expect(checks.arenaUnrequestedCaster).toBe(false);
    // The ONLY scene difference is the request flag, so any pixel delta is
    // the shadow-caster path (direct lighting is identical).
    expect(Number(checks.streetDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(checks.arenaDiff ?? 0)).toBeGreaterThan(50);
    // Device-observed pixel backing on both rigs.
    expect(checks.streetBacked).toBe(true);
    expect(checks.arenaBacked).toBe(true);
  });
});

declare global {
  interface Window {
    __AURA3D_N1_SPOT_SHADOW__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly spot: {
          readonly requested: boolean;
          readonly casterIsSpot: boolean;
          readonly casterName?: string;
          readonly atlasResolution?: number;
          readonly spotPixelBacked: boolean;
          readonly reason: string;
        };
        readonly shadowRequested: boolean;
        readonly shadowMapRendered: boolean;
        readonly shadowMapSampled: boolean;
        readonly checksum: number;
        readonly nonDarkPixels: number;
      }[];
      readonly checks?: Record<string, boolean | number | string>;
      readonly error?: string;
    };
  }
}
