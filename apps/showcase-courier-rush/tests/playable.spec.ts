import { expect, test, type Page } from "@playwright/test";

// Courier Rush playable proof, modeled on
// apps/showcase-blockfall-reactor/tests/playable.spec.ts: every assertion
// waits on the published snapshot itself rather than a wall-clock settle.
// The route's deterministic scenario openings (?scenario=carrying /
// final-delivery / low-time) make the scoring and terminal states
// reachable on short scripted drives through the same simulation path a
// player drives.

type CourierSnapshot = {
  framed: boolean;
  state: "playing" | "won" | "lost";
  phase: string;
  score: number;
  deliveries: number;
  timeLeft: number;
  currentZone: string | null;
  targetZone: string | null;
  vehicle: { x: number; y: number; z: number; speed: number; heading: number };
  events: readonly string[];
  look: { id: string };
};

async function courierState(page: Page): Promise<CourierSnapshot> {
  return page.evaluate(() => {
    const state = (window as unknown as { __aura3dGameSnapshot?: CourierSnapshot }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

async function bootFramed(page: Page, url = "/"): Promise<CourierSnapshot> {
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );
  // Focus the canvas so held drive keys reach the runtime input.
  await page.locator("#app canvas").first().click();
  return courierState(page);
}

/** Hold throttle until `predicate` holds on the snapshot (or time out). */
async function driveUntil(page: Page, predicate: string, timeoutMs = 60_000): Promise<void> {
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(
      (src) => {
        const state = (window as unknown as { __aura3dGameSnapshot?: CourierSnapshot }).__aura3dGameSnapshot;
        if (!state) return false;
        return new Function("state", `return (${src})(state);`)(state) as boolean;
      },
      predicate,
      { timeout: timeoutMs }
    );
  } finally {
    await page.keyboard.up("KeyW");
  }
}

test("courier rush boots framed, drives forward, and the pickup sensor registers", async ({ page }) => {
  test.setTimeout(420_000);
  const initial = await bootFramed(page);
  expect(initial.look.id).toBe("night-city");
  expect(initial.state).toBe("playing");
  expect(initial.phase).toBe("awaitingPickup");
  expect(initial.targetZone).toBe("north-tower-dock");
  expect(initial.deliveries).toBe(0);
  expect(initial.timeLeft).toBeGreaterThan(50);

  const hud = page.locator("#courier-rush-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Courier Rush");
  await expect(hud).toContainText("Deliveries 0/5");

  // Holding throttle from spawn moves the van south down the main street
  // and straight through the north-tower-dock pickup sensor.
  await driveUntil(page, "(s) => s.phase === 'carrying'");
  const pickedUp = await courierState(page);
  expect(pickedUp.vehicle.z).toBeLessThan(initial.vehicle.z - 2);
  expect(pickedUp.phase).toBe("carrying");
  expect(pickedUp.targetZone).toBe("south-depot-dock");
  expect(pickedUp.events).toEqual(expect.arrayContaining([expect.stringContaining("pickup")]));
});

test("courier rush delivery scores from the carrying opening", async ({ page }) => {
  test.setTimeout(420_000);
  const initial = await bootFramed(page, "/?scenario=carrying");
  expect(initial.phase).toBe("carrying");
  expect(initial.score).toBe(0);

  await driveUntil(page, "(s) => s.deliveries >= 1");
  const delivered = await courierState(page);
  expect(delivered.deliveries).toBe(1);
  expect(delivered.score).toBeGreaterThan(0);
  expect(delivered.phase).toBe("awaitingPickup");
  expect(delivered.events).toEqual(expect.arrayContaining([expect.stringContaining("drop")]));
});

test("courier rush wins on the final delivery and loses on timeout, then resets", async ({ page }) => {
  test.setTimeout(420_000);

  await bootFramed(page, "/?scenario=final-delivery");
  await driveUntil(page, "(s) => s.state === 'won'");
  const won = await courierState(page);
  expect(won.state).toBe("won");
  expect(won.deliveries).toBe(5);

  await bootFramed(page, "/?scenario=low-time");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { state?: string } }).__aura3dGameSnapshot?.state === "lost",
    undefined,
    { timeout: 60_000 }
  );
  const lost = await courierState(page);
  expect(lost.state).toBe("lost");
  expect(lost.timeLeft).toBe(0);

  // R resets to the standard shift opening from the terminal state.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: CourierSnapshot }).__aura3dGameSnapshot;
      return s?.state === "playing" && s.deliveries === 0 && s.timeLeft > 50;
    },
    undefined,
    { timeout: 60_000 }
  );
  const reset = await courierState(page);
  expect(reset.targetZone).toBe("north-tower-dock");
});
