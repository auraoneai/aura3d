import { expect, test } from "@playwright/test";

test("route boots createGame single-path runtime cleanly with zero console/page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __AURA3D_GAME__?: { routeId?: string };
      __AURA3D_GAME_EVIDENCE__?: Record<string, { frame?: number }>;
    };
    return (
      w.__AURA3D_GAME__?.routeId === "showcase-deep-recovery" &&
      (w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.frame ?? 0) > 2
    );
  });

  const canvasBox = await page.locator("canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(300);
  expect(canvasBox!.height).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});
