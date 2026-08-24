/**
 * Aurora Lander playable proof: keyboard input changes state, fuel drains,
 * quick-restart restores the site, pause freezes integration, and the ghost
 * overlay activates from an imported best-run replay.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/aurora-lander-playable");
const ROUTE = "/apps/showcase-aurora-lander/";

interface Evidence {
  mounted?: boolean;
  status?: string;
  site?: number;
  fuel?: number;
  altitude?: number;
  vspeed?: number;
  hspeed?: number;
  attitudeDeg?: number;
  state?: string;
  lastGrade?: string | null;
  ghostActive?: boolean;
  terrainQueryFps?: number;
  audioCues?: readonly string[];
}

const evidenceOf = async (page: Page): Promise<Evidence> =>
  page.evaluate(() => (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__ ?? {});

const waitForMounted = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__?.mounted === true,
    undefined,
    { timeout: 45_000 }
  );
};

test.describe("aurora lander playable", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("thrust burns fuel and lifts, restart restores, pause freezes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await waitForMounted(page);

    // Load screenshot: mounted route with HUD chrome and rendered world.
    await page.waitForTimeout(600);
    writeFileSync(resolve(REPORT_DIR, "01-load.png"), await page.screenshot());

    const idle = await evidenceOf(page);
    expect(idle.state).toBe("flying");

    // Hold main thrust: fuel must drain and vertical speed must turn upward.
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1500);
    const burning = await evidenceOf(page);
    await page.keyboard.up("KeyW");
    console.log("BURNING:", JSON.stringify({ fuel: burning.fuel, vspeed: burning.vspeed }));
    expect(burning.fuel ?? 1).toBeLessThan(idle.fuel ?? 0.999);
    expect(burning.vspeed ?? -99).toBeGreaterThan(idle.vspeed ?? 0);

    // Rotate: RCS tilt must register on the attitude readout.
    const beforeRotate = await evidenceOf(page);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(900);
    await page.keyboard.up("KeyD");
    const rotated = await evidenceOf(page);
    console.log("ROTATED:", JSON.stringify({ attitudeDeg: rotated.attitudeDeg }));
    expect(rotated.attitudeDeg ?? 0).toBeGreaterThan((beforeRotate.attitudeDeg ?? 0) + 4);

    // Quick-restart restores fuel and flight state.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(400);
    const restarted = await evidenceOf(page);
    expect(restarted.state).toBe("flying");
    expect(restarted.fuel ?? 0).toBeGreaterThan(0.9);

    // Pause freezes integration: altitude identical across half a second.
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(300);
    const frozenAltitude = (await evidenceOf(page)).altitude;
    await page.waitForTimeout(500);
    const stillFrozen = await evidenceOf(page);
    expect(stillFrozen.state).toBe("paused");
    expect(Math.abs((stillFrozen.altitude ?? 0) - (frozenAltitude ?? 0))).toBeLessThan(0.001);
    await page.keyboard.press("KeyP");

    // Ghost toggle key does not disturb the running attempt.
    await page.keyboard.press("KeyG");
    await page.waitForTimeout(200);
    expect((await evidenceOf(page)).state).toBe("flying");

    expect(errors.filter((entry) => !entry.includes("favicon"))).toHaveLength(0);
  });

  test("imports a stored best run and shows the replay ghost", async ({ page }) => {
    // Seed a best-run export for site 1 BEFORE the app boots: a short burn straight
    // down from the spawn. The route imports it through game.importReplay on boot.
    await page.addInitScript(() => {
      const dt = 1 / 60;
      const events: { frame: number; time: number; type: "press" | "release"; binding: string }[] = [];
      // A ~6 s attempt of repeated burn/rotate windows so playback stays active
      // through the mounted assertion window.
      for (let cycle = 0; cycle < 12; cycle += 1) {
        const base = 5 + cycle * 30;
        events.push({ frame: base, time: base * dt, type: "press", binding: "KeyW" });
        events.push({ frame: base + 14, time: (base + 14) * dt, type: "release", binding: "KeyW" });
        events.push({ frame: base + 20, time: (base + 20) * dt, type: "press", binding: cycle % 2 === 0 ? "KeyD" : "KeyA" });
        events.push({ frame: base + 24, time: (base + 24) * dt, type: "release", binding: cycle % 2 === 0 ? "KeyD" : "KeyA" });
      }
      window.localStorage.setItem("aurora-lander-best-run/1", JSON.stringify({
        kind: "aura-game-input-replay-export",
        schemaVersion: "aura-game-input-replay/v1",
        exportedAt: new Date().toISOString(),
        trajectoryHash: "seeded0000",
        siteId: 1,
        grade: "soft",
        score: 900,
        replay: {
          kind: "aura-game-input-replay",
          label: "seeded",
          fps: 60,
          seed: 24301,
          frameCount: 365,
          duration: 365 * dt,
          checksum: "computed-by-engine",
          events
        }
      }));
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await waitForMounted(page);
    await page.waitForTimeout(500);

    const seeded = await evidenceOf(page);
    expect(seeded.ghostActive).toBe(true);
    const ghostChipVisible = await page.getByTestId("hud-ghost").isVisible();
    expect(ghostChipVisible).toBe(true);

    // Toggle G hides the overlay flag.
    await page.keyboard.press("KeyG");
    await page.waitForTimeout(200);
    // G toggles mesh visibility; the chip tracks playback activity, which continues.
    expect((await evidenceOf(page)).ghostActive).toBe(true);

    expect(errors.filter((entry) => !entry.includes("favicon"))).toHaveLength(0);
  });

  test("crash grades through a real contact event and the banner reads retry", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await waitForMounted(page);

    await page.waitForFunction(() => {
      const evidence = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__;
      return evidence?.state === "crashed";
    }, undefined, { timeout: 90_000 });

    const crashed = await evidenceOf(page);
    console.log("CRASH:", JSON.stringify({ grade: crashed.lastGrade, cues: crashed.audioCues?.slice(0, 4) }));
    expect(crashed.lastGrade).toBe("crash");

    const bannerText = await page.getByTestId("hud-banner").textContent();
    expect(bannerText ?? "").toMatch(/CRASH/i);
    writeFileSync(resolve(REPORT_DIR, "02-crash.png"), await page.screenshot());

    // Restart clears the banner back to flight.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(400);
    expect((await evidenceOf(page)).state).toBe("flying");

    expect(errors.filter((entry) => !entry.includes("favicon"))).toHaveLength(0);
  });
});
