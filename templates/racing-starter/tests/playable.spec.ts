import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

type RacingEvidence = {
  readonly status: string;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly speed: number;
  readonly progress: number;
  readonly heading: number;
  readonly events: readonly string[];
  readonly look: { readonly id: string };
  readonly geometry: {
    readonly tool: string;
    readonly report: string;
    readonly carMetres: readonly number[];
    readonly trackMetres: readonly number[];
    readonly carScale: number;
    readonly routeScale: number;
  };
};

function readRacingState(): RacingEvidence | undefined {
  return (window as unknown as { readonly __AURA3D_RACING_STARTER__?: RacingEvidence }).__AURA3D_RACING_STARTER__;
}

test("racing starter responds to keyboard input, reports real geometry certification, and resets", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");

  const initial = await page.evaluate(readRacingState);
  expect(initial?.status).toBe("running");
  expect(initial?.speed).toBeCloseTo(0, 5);
  expect(initial?.checkpointCount).toBeGreaterThanOrEqual(6);
  // T3.2 floor evidence: the scene carries the genre look and geometry truth
  // reports the real certify-game-geometry output, not authored constants.
  expect(initial?.look.id).toBe("golden-hour");
  expect(initial?.geometry.carScale).toBe(1);
  expect(initial?.geometry.carMetres[0]).toBeGreaterThan(3);
  expect(initial?.geometry.trackMetres[0]).toBeGreaterThan(20);

  const certification = JSON.parse(readFileSync("tests/geometry-certification.json", "utf8")) as {
    readonly result: {
      readonly rows: readonly { readonly assetId: string; readonly category: string; readonly pass: boolean; readonly blockers: readonly string[] }[];
    };
  };
  const rows = certification.result.rows;
  expect(rows.map((row) => row.assetId).sort()).toEqual(["carModel", "trackModel"]);
  expect(rows.every((row) => row.category === "racing")).toBe(true);
  expect(initial?.geometry.report).toBe("tests/geometry-certification.json");

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(650);
  await page.keyboard.up("KeyW");
  const accelerated = await page.evaluate(readRacingState);
  expect(accelerated?.speed ?? 0).toBeGreaterThan((initial?.speed ?? 0) + 0.5);
  expect(accelerated?.progress).not.toBe(initial?.progress);

  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");
  const steered = await page.evaluate(readRacingState);
  expect(steered?.heading).not.toBe(accelerated?.heading);
  expect(steered?.events.length ?? 0).toBeGreaterThanOrEqual(initial?.events.length ?? 0);

  await page.keyboard.press("KeyR");
  await page.waitForTimeout(120);
  const reset = await page.evaluate(readRacingState);
  expect(reset?.status).toBe("running");
  expect(reset?.checkpoint).toBe(0);
  expect(reset?.events.some((event) => event.includes("reset"))).toBe(true);
});
