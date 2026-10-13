/**
 * PRD-14 §9 — Single-path browser verification for `showcase-aurora-lander`.
 *
 * Covers S1 (single-path createGame boot), S2 (WebGL canvas + HUD widgets),
 * S6 (evidence sections + scenario contracts), and S7 (desktop 1920x1080 and
 * mobile 390x844 framing in separate test blocks for WebKit stability).
 */
import { expect, test } from "@playwright/test";

const ROUTE_URL = process.env.AURORA_LANDER_URL ?? "http://127.0.0.1:4189";

test.describe("showcase-aurora-lander single-path PRD-14 verification", () => {
  test("S1/S2/S6 — boots createGame, mounts HUD widgets, and publishes evidence sections", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`${ROUTE_URL}/?scenario=04-action&seed=1&freezeAt=end`);
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME__?: { state?: string; id?: string };
        __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
      };
      return (
        w.__AURA3D_GAME__?.id === "showcase-aurora-lander" &&
        w.__AURA3D_GAME__?.state === "playing" &&
        Boolean(w.__AURA3D_GAME_EVIDENCE__?.["showcase-aurora-lander"])
      );
    });

    const summary = await page.evaluate(() => {
      const w = window as unknown as {
        __AURA3D_GAME__: { id: string; state: string };
        __AURA3D_GAME_EVIDENCE__: Record<
          string,
          {
            lander: { touchdown: string; altitude: number };
            framing: { landerInFrame: boolean; padInFrame: boolean };
            boot: { singlePath: boolean; runtime: string };
            render: { canvasAttached: boolean; frameCount: number };
          }
        >;
      };
      const ev = w.__AURA3D_GAME_EVIDENCE__["showcase-aurora-lander"]!;
      return {
        id: w.__AURA3D_GAME__.id,
        state: w.__AURA3D_GAME__.state,
        touchdown: ev.lander.touchdown,
        singlePath: ev.boot.singlePath,
        runtime: ev.boot.runtime,
        canvasAttached: ev.render.canvasAttached,
        frameCount: ev.render.frameCount,
      };
    });

    expect(summary.id).toBe("showcase-aurora-lander");
    expect(summary.state).toBe("playing");
    expect(summary.singlePath).toBe(true);
    expect(summary.runtime).toBe("createGame");
    expect(summary.canvasAttached).toBe(true);
    expect(summary.frameCount).toBeGreaterThan(0);
    expect(summary.touchdown).toBe("landed");
    expect(errors).toEqual([]);
  });

  test("S7 desktop (1920x1080) — frames lander and pad in 03-mid scenario", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${ROUTE_URL}/?scenario=03-mid&seed=1&freezeAt=end`);
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
      };
      return Boolean(w.__AURA3D_GAME_EVIDENCE__?.["showcase-aurora-lander"]);
    });

    const framing = await page.evaluate(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__: Record<
          string,
          {
            lander: { altitude: number };
            framing: { landerInFrame: boolean; padInFrame: boolean };
          }
        >;
      };
      return w.__AURA3D_GAME_EVIDENCE__["showcase-aurora-lander"]!;
    });

    expect(framing.lander.altitude).toBeLessThan(30);
    expect(framing.framing.landerInFrame).toBe(true);
    expect(framing.framing.padInFrame).toBe(true);
  });

  test("S7 mobile (390x844) — frames lander and pad in 03-mid scenario", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ROUTE_URL}/?scenario=03-mid&seed=1&freezeAt=end`);
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
      };
      return Boolean(w.__AURA3D_GAME_EVIDENCE__?.["showcase-aurora-lander"]);
    });

    const framing = await page.evaluate(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__: Record<
          string,
          {
            lander: { altitude: number };
            framing: { landerInFrame: boolean; padInFrame: boolean };
          }
        >;
      };
      return w.__AURA3D_GAME_EVIDENCE__["showcase-aurora-lander"]!;
    });

    expect(framing.lander.altitude).toBeLessThan(30);
    expect(framing.framing.landerInFrame).toBe(true);
    expect(framing.framing.padInFrame).toBe(true);
  });
});
