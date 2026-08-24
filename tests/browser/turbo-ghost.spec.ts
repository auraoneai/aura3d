/**
 * Runtime proof for the Turbo Drift Circuit time-trial ghost (PRD TDC-A1 / TDC-09).
 *
 * The spec drives the mounted route through a real stint - throttle held with the
 * same alternating-steer pattern the grounding spec uses - then asserts:
 * - a best-lap recording exists and carries a stable replay path hash;
 * - the ghost becomes active (visible translucent car) on the next lap;
 * - the HUD/G toggle hides it without discarding the recording.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/turbo-ghost");
const ROUTE = "/apps/showcase-turbo-drift-circuit/";
const GLOBAL_NAME = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";

interface GhostEvidence {
  readonly system: string;
  readonly active: boolean;
  readonly toggleKey: string;
  readonly toggleEnabled: boolean;
  readonly hasBestLap: boolean;
  readonly bestLapMs: number | null;
  readonly replayPathHash: string | null;
  readonly recordedSamples: number;
}

async function readEvidence(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  }, GLOBAL_NAME);
}

test("turbo ghost records a lap, replays visibly, and toggles off", async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000);
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];
  try {
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/favicon/i.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });

    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { status?: string } | undefined>)[name];
      return value?.status === "ready";
    }, GLOBAL_NAME, { timeout: 90_000 });

    mkdirSync(REPORT_DIR, { recursive: true });

    // Drive until a full lap is sealed into a best-lap recording. Throttle stays
    // down while steering alternates in short pulses so the car hugs the racing
    // line closely enough to credit every ordered gate on the way round.
    let recorded: GhostEvidence | undefined;
    await page.keyboard.down("KeyW");
    const driveDeadline = Date.now() + 180_000;
    let phase = 0;
    while (Date.now() < driveDeadline) {
      const steerKey = phase % 2 === 0 ? "KeyA" : "KeyD";
      await page.keyboard.down(steerKey);
      await page.waitForTimeout(320);
      await page.keyboard.up(steerKey);
      phase += 1;
      const evidence = await readEvidence(page);
      const ghost = evidence.ghost as GhostEvidence | undefined;
      if (ghost?.hasBestLap === true && (ghost.bestLapMs ?? 0) > 0) {
        recorded = ghost;
        break;
      }
      // Keep the throttle command fresh across focus changes.
      await page.keyboard.down("KeyW");
    }
    await page.keyboard.up("KeyW").catch(() => undefined);
    expect(recorded, "a best lap must seal within the driving window").toBeDefined();

    expect(recorded!.system).toBe("turbo-ghost-replay/1.0");
    expect(recorded!.replayPathHash).toMatch(/^[0-9a-f]{8}$/);
    expect(recorded!.recordedSamples).toBeGreaterThan(100);
    expect(recorded!.toggleKey).toBe("KeyG");

    // The ghost replays while the current lap continues.
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { ghost?: GhostEvidence } | undefined>)[name];
      return value?.ghost?.active === true;
    }, GLOBAL_NAME, { timeout: 30_000, polling: 250 });
    await page.screenshot({ path: join(REPORT_DIR, "turbo-ghost-visible.png") });

    // Toggle off with G: playback stops but the recording survives byte-for-byte.
    await page.keyboard.press("KeyG");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { ghost?: GhostEvidence } | undefined>)[name];
      return value?.ghost?.active === false && value?.ghost?.toggleEnabled === false;
    }, GLOBAL_NAME, { timeout: 10_000, polling: 250 });
    const toggledOff = ((await readEvidence(page)).ghost ?? null) as GhostEvidence | null;
    expect(toggledOff?.hasBestLap).toBe(true);
    expect(toggledOff?.bestLapMs).toBe(recorded!.bestLapMs);
    expect(toggledOff?.replayPathHash).toBe(recorded!.replayPathHash);
    await page.screenshot({ path: join(REPORT_DIR, "turbo-ghost-hidden.png") });

    // Toggle back on for completeness.
    await page.keyboard.press("KeyG");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { ghost?: GhostEvidence } | undefined>)[name];
      return value?.ghost?.toggleEnabled === true;
    }, GLOBAL_NAME, { timeout: 10_000, polling: 250 });

    writeFileSync(join(REPORT_DIR, "turbo-ghost.json"), `${JSON.stringify({
      schema: "aura3d-turbo-ghost-browser/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/turbo-ghost.spec.ts",
      recorded,
      toggledOff,
      consoleErrors
    }, null, 2)}\n`);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  } finally {
    await page.keyboard.up("KeyW").catch(() => undefined);
    await page.keyboard.up("KeyA").catch(() => undefined);
    await page.keyboard.up("KeyD").catch(() => undefined);
    await server?.close();
  }
});