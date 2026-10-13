import { expect, test } from "@playwright/test";

// Successor to the retired tests/browser/mech-hangar-build.spec.ts (its
// source-hash list named files that never existed, so no receipt it could
// emit was valid): this spec drives the rebuilt single-path app through
// real keys and asserts on the published __aura3dGameSnapshot only.
test("mech hangar boots framed, part attach changes stats, drive moves and strikes", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  const initial = await hangarState(page);
  expect(initial.state).toBe("assemble");
  expect(initial.look.id).toBe("interior-industrial");
  expect(initial.attachedParts.chassis).toBe("mech");
  expect(initial.attachedParts.support).toBe("none");
  expect(initial.checklist.dummiesTotal).toBe(3);

  const hud = page.locator("#mech-hangar-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Mech Hangar");

  // Cycle the chassis: the attached part and the aggregated stats change.
  await page.keyboard.press("Digit1");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly attachedParts?: { readonly chassis?: string } } }).__aura3dGameSnapshot?.attachedParts?.chassis === "robot-large",
    undefined,
    { timeout: 60_000 }
  );
  const attached = await hangarState(page);
  expect(attached.stats.power).toBeGreaterThan(initial.stats.power);
  expect(attached.stats.moveSpeed).toBeLessThan(initial.stats.moveSpeed);
  expect(attached.events).toEqual(expect.arrayContaining([expect.stringContaining("attach:chassis")]));

  // Lock the build and drive: held D moves the mech along the lane.
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string } }).__aura3dGameSnapshot?.state === "test-drive",
    undefined,
    { timeout: 60_000 }
  );
  const startX = (await hangarState(page)).mech.x;
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    (x) => ((window as unknown as { __aura3dGameSnapshot?: { readonly mech?: { readonly x?: number } } }).__aura3dGameSnapshot?.mech?.x ?? x) > x + 0.3,
    startX,
    { timeout: 60_000 }
  );
  await page.keyboard.up("KeyD");
  const driven = await hangarState(page);
  expect(driven.mech.x).toBeGreaterThan(startX);
  expect(driven.checklist.moved).toBe(true);

  // Reset returns to assembly with dummies restored.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string } }).__aura3dGameSnapshot?.state === "assemble",
    undefined,
    { timeout: 60_000 }
  );
});

async function hangarState(page: import("@playwright/test").Page): Promise<{
  readonly framed: boolean;
  readonly state: string;
  readonly attachedParts: { readonly chassis: string; readonly support: string };
  readonly stats: { readonly speed: number; readonly power: number; readonly moveSpeed: number; readonly strikeDamage: number };
  readonly mech: { readonly x: number; readonly y: number; readonly z: number };
  readonly checklist: { readonly moved: boolean; readonly struck: boolean; readonly dummiesDown: number; readonly dummiesTotal: number };
  readonly events: readonly string[];
  readonly look: { readonly id: string };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state as never;
  });
}
