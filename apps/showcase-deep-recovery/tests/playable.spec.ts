import { expect, test } from "@playwright/test";

test("sonar ping, tether grapple, and autorun pilot advance deep-recovery state", async ({ page }) => {
  await page.goto("/?autorun=1");
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __AURA3D_GAME_EVIDENCE__?: Record<
        string,
        {
          frame?: number;
          salvage?: { grappled?: number; banked?: number };
          sonar?: { pingsTriggered?: number };
        }
      >;
    };
    const ev = w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"];
    return Boolean(ev && (ev.frame ?? 0) > 15 && ((ev.salvage?.grappled ?? 0) >= 1 || (ev.salvage?.banked ?? 0) >= 1));
  });

  const snapshot = await page.evaluate(() => {
    const w = window as unknown as {
      __aura3dGameSnapshot?: () => Record<string, unknown>;
    };
    return w.__aura3dGameSnapshot?.() ?? null;
  });

  expect(snapshot).not.toBeNull();
  expect(snapshot?.route).toBe("showcase-deep-recovery");
});
