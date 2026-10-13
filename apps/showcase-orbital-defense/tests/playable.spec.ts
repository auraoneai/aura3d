import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/playable.spec.ts and
// templates/arena-shooter/tests/playable.spec.ts: every assertion waits on
// the published snapshot itself rather than a wall-clock settle. The first
// drone of a run arrives on the player's starting bearing, so holding
// Space kills it deterministically; the `low-integrity` and `final-wave`
// scenario openings make the lose/win terminal states reachable in short
// scripted play through the real update loop.

type OrbitalSnapshot = {
  framed: boolean;
  frame: number;
  state: "playing" | "won" | "lost";
  score: number;
  wave: number;
  integrity: number;
  integrityMax: number;
  enemiesAlive: number;
  kills: number;
  leaks: number;
  shotsFired: number;
  events: readonly string[];
  look: { id: string };
  drawCalls: number;
  ship: { assetId: string; url: string };
  core: { assetId: string };
};

async function orbitalState(page: import("@playwright/test").Page): Promise<OrbitalSnapshot> {
  return page.evaluate(() => {
    const state = (window as unknown as { __aura3dGameSnapshot?: OrbitalSnapshot }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<OrbitalSnapshot> {
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );
  return orbitalState(page);
}

test("orbital defense boots framed, fires, destroys a drone, and resets", async ({ page }) => {
  test.setTimeout(420_000);
  const initial = await bootFramed(page, "/");
  expect(initial.look.id).toBe("space");
  expect(initial.state).toBe("playing");
  expect(initial.wave).toBe(1);
  expect(initial.integrity).toBe(initial.integrityMax);
  expect(initial.ship.assetId).toBe("ship");
  expect(initial.ship.url).toContain("/aura-assets/");
  expect(initial.core.assetId).toBe("planet");
  expect(initial.drawCalls).toBeGreaterThan(0);

  const hud = page.locator("#orbital-defense-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Orbital Defense");
  await expect(hud).toContainText("Core");

  // Hold Space: bolts fire radially and the first (aligned) drone dies.
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => ((window as unknown as { __aura3dGameSnapshot?: { shotsFired?: number } }).__aura3dGameSnapshot?.shotsFired ?? 0) > 0,
    undefined,
    { timeout: 30_000 }
  );
  await page.waitForFunction(
    () => ((window as unknown as { __aura3dGameSnapshot?: { kills?: number } }).__aura3dGameSnapshot?.kills ?? 0) > 0,
    undefined,
    { timeout: 60_000 }
  );
  await page.keyboard.up("Space");
  const killed = await orbitalState(page);
  expect(killed.kills).toBeGreaterThan(0);
  expect(killed.score).toBeGreaterThan(0);
  expect(killed.events).toEqual(expect.arrayContaining([expect.stringContaining("kill")]));

  // Reset restores the standard wave-1 opening.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: OrbitalSnapshot }).__aura3dGameSnapshot;
      return s?.state === "playing" && s.score === 0 && s.kills === 0 && s.wave === 1;
    },
    undefined,
    { timeout: 30_000 }
  );
  const reset = await orbitalState(page);
  expect(reset.integrity).toBe(reset.integrityMax);
  expect(reset.shotsFired).toBe(0);
});

test("orbital defense leaks integrity when a drone reaches the core", async ({ page }) => {
  test.setTimeout(420_000);
  const initial = await bootFramed(page, "/");
  expect(initial.integrity).toBe(100);
  // No input: the first drone crosses the arena and leaks 10 integrity.
  await page.waitForFunction(
    () => ((window as unknown as { __aura3dGameSnapshot?: { integrity?: number } }).__aura3dGameSnapshot?.integrity ?? 100) < 100,
    undefined,
    { timeout: 90_000 }
  );
  const leaked = await orbitalState(page);
  expect(leaked.leaks).toBeGreaterThan(0);
  expect(leaked.integrity).toBeLessThan(100);
  expect(leaked.state).toBe("playing");
});

test("orbital defense loses at integrity 0 and wins by clearing the final wave", async ({ page }) => {
  test.setTimeout(420_000);
  // Lose: the low-integrity opening starts one leak from loss.
  const low = await bootFramed(page, "/?scenario=low-integrity");
  expect(low.integrity).toBe(10);
  expect(low.state).toBe("playing");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { state?: string } }).__aura3dGameSnapshot?.state === "lost",
    undefined,
    { timeout: 90_000 }
  );
  const lost = await orbitalState(page);
  expect(lost.integrity).toBe(0);
  expect(lost.events).toEqual(expect.arrayContaining([expect.stringContaining("game-over")]));

  // R restarts from the standard opening even after a loss.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: OrbitalSnapshot }).__aura3dGameSnapshot?.state === "playing",
    undefined,
    { timeout: 30_000 }
  );

  // Win: the final-wave opening has one aligned drone between the player
  // and victory; holding Space destroys it and clears the last wave.
  const finale = await bootFramed(page, "/?scenario=final-wave");
  expect(finale.wave).toBe(3);
  expect(finale.state).toBe("playing");
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { state?: string } }).__aura3dGameSnapshot?.state === "won",
    undefined,
    { timeout: 90_000 }
  );
  await page.keyboard.up("Space");
  const won = await orbitalState(page);
  expect(won.kills).toBeGreaterThan(0);
  expect(won.integrity).toBeGreaterThan(0);
  expect(won.events).toEqual(expect.arrayContaining([expect.stringContaining("victory")]));
});

test("orbital defense stays framed at desktop viewport (1920x1080)", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const state = await bootFramed(page, "/");
  expect(state.framed).toBe(true);
  expect(state.drawCalls).toBeGreaterThan(0);
  expect(state.state).toBe("playing");
});

test("orbital defense stays framed at mobile viewport (390x844)", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await bootFramed(page, "/");
  expect(state.framed).toBe(true);
  expect(state.drawCalls).toBeGreaterThan(0);
  expect(state.state).toBe("playing");
});
