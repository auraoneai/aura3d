import { expect, test } from "@playwright/test";

test.describe("showcase-aurora-lander route-health", () => {
  test("attaches WebGL canvas and publishes __AURA3D_GAME_EVIDENCE__ sections", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/?scenario=03-mid&seed=1&freezeAt=end");
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME__?: { state?: string };
        __AURA3D_GAME_EVIDENCE__?: Record<string, Record<string, unknown>>;
      };
      return (
        w.__AURA3D_GAME__?.state === "playing" &&
        Boolean(w.__AURA3D_GAME_EVIDENCE__?.["showcase-aurora-lander"])
      );
    });

    const health = await page.evaluate(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__: Record<
          string,
          {
            lander: { altitude: number; touchdown: string };
            framing: { landerInFrame: boolean; padInFrame: boolean };
            render: { canvasAttached: boolean; width: number; height: number; frameCount: number };
            boot: { singlePath: boolean; runtime: string };
          }
        >;
      };
      return w.__AURA3D_GAME_EVIDENCE__["showcase-aurora-lander"]!;
    });

    expect(health.boot.singlePath).toBe(true);
    expect(health.boot.runtime).toBe("createGame");
    expect(health.render.canvasAttached).toBe(true);
    expect(health.render.width).toBeGreaterThan(0);
    expect(health.render.height).toBeGreaterThan(0);
    expect(health.render.frameCount).toBeGreaterThan(0);
    expect(health.lander.altitude).toBeLessThan(30);
    expect(health.framing.landerInFrame).toBe(true);
    expect(health.framing.padInFrame).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
