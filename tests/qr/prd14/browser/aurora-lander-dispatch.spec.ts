import { expect, test, type Page } from "@playwright/test";
import { builtDist, serve, watchConsole } from "./lib/serve";

const APP_DIR = "showcase-aurora-lander";

async function bootPlaying(page: Page, url: string, query = ""): Promise<void> {
  await page.goto(`${url}/${query}`);
  await expect.poll(
    () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME__?: { state?: string; id?: string };
          __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
        };
        return (
          w.__AURA3D_GAME__?.id === "showcase-aurora-lander" &&
          w.__AURA3D_GAME__?.state === "playing" &&
          Boolean(w.__AURA3D_GAME_EVIDENCE__?.["showcase-aurora-lander"])
        );
      }),
    { timeout: 30_000 }
  ).toBe(true);
}

test.describe("showcase-aurora-lander single-path PRD-14 verification", () => {
  test("boots framed with a sized canvas, S11 audio, and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url);
      const canvas = await page.evaluate(() => {
        const el = document.querySelector("canvas");
        return el === null ? null : { width: el.clientWidth, height: el.clientHeight };
      });
      expect(canvas, "no canvas element mounted").not.toBeNull();
      expect(canvas!.width).toBeGreaterThan(0);
      expect(canvas!.height).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("boots to playing: mounts HUD widgets and publishes touchdown evidence", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url, "?scenario=04-action&seed=1&freezeAt=end");
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
    } finally {
      server.close();
    }
  });

  test("appliedLook resolves on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url);
      const hasLook = await page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME_EVIDENCE__?: Record<string, { appliedLook?: unknown }>;
        };
        return Boolean(w.__AURA3D_GAME_EVIDENCE__?.["showcase-aurora-lander"]?.appliedLook);
      });
      expect(hasLook).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("framing holds at desktop viewport (1920x1080)", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await bootPlaying(page, url, "?scenario=03-mid&seed=1&freezeAt=end");
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
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("framing holds at mobile viewport (390x844)", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await bootPlaying(page, url, "?scenario=03-mid&seed=1&freezeAt=end");
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
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
