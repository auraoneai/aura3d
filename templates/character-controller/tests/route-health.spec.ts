import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// The locomotion proof's threshold hold alone can need most of a slow
// software-GL minute; give the whole spec the same 300s headroom the
// screenshot spec gets.
test.setTimeout(300_000);

test("character controller route exposes a live locomotion proof", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: unknown }).__AURA3D_CHARACTER_CONTROLLER_PROOF__));

  // idle at rest
  const idle = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string; look?: { id: string }; camera?: { rig: string; presented: boolean } } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
  expect(idle!.state).toBe("idle");
  expect(idle!.look?.id).toBe("outdoor-day");
  expect(idle!.camera?.rig).toBe("shoulder:hero");
  expect(idle!.camera?.presented).toBe(true);

  // holding a movement key accelerates into walk/run and moves the hero
  const before = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { position: readonly number[] } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__?.position ?? [0, 0, 0]);
  await page.keyboard.down("KeyD");
  // Hold KeyD until the hero actually crosses the threshold rather than a
  // wall-clock 600ms: sim time advances at most 0.25s per presented frame
  // (dt clamp), so a fixed hold is meaningless on slow software-GL runners.
  await page.waitForFunction(
    (startX) => ((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { position?: readonly number[] } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__?.position?.[0] ?? 0) > startX + 0.05,
    before[0] ?? 0,
    { timeout: 180_000 }
  );
  const moving = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string; speed: number; position: readonly number[]; clipWeights: { weight: number }[] } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
  await page.keyboard.up("KeyD");

  expect(moving!.speed).toBeGreaterThan(0.1);
  expect(["walk", "run"]).toContain(moving!.state);
  expect(moving!.position[0]).toBeGreaterThan((before[0] ?? 0) + 0.05);
  const sum = moving!.clipWeights.reduce((acc, w) => acc + w.weight, 0);
  expect(sum).toBeGreaterThan(0.9);
  expect(sum).toBeLessThan(1.1);
  expect(errors).toEqual([]);
  // Playwright's visibility engine and bare evaluate() can starve behind the
  // continuously rendering main thread just like boundingBox() below.
  // waitForFunction polls inside the page's own animation frame, so it always
  // gets a slot — assert the same semantics there.
  await page.waitForFunction(() => {
    const element = document.querySelector("canvas");
    if (!(element instanceof HTMLCanvasElement)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }, undefined, { timeout: 60_000 });
  // Locator boundingBox() can block behind the continuously rendering main
  // thread even after Playwright has resolved the canvas as visible. Read the
  // same layout rectangle synchronously in the page, as the proof reads its
  // runtime state above.
  const canvasBounds = await page.evaluate(() => {
    const element = document.querySelector("canvas");
    if (!(element instanceof HTMLCanvasElement)) return null;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(0);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({
    template: "character-controller", url: page.url(), canvasBounds, idle, moving, clipWeightSum: sum, errors
  }, null, 2)}\n`);
});
