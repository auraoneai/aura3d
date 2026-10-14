import { expect, test } from "@playwright/test";

interface AuroraSnapshot {
  readonly route: string;
  readonly state: string;
  readonly phase: string;
  readonly siteIndex: number;
  readonly siteId: string;
  readonly siteCount: number;
  readonly completedSites: readonly boolean[];
  readonly totalScore: number;
  readonly lander: {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly fuel: number;
    readonly altitude: number;
    readonly touchdown: string;
  };
  readonly camera: {
    readonly landerInFrame: boolean;
    readonly padInFrame: boolean;
  };
  readonly render: {
    readonly canvasAttached: boolean;
    readonly frameCount: number;
  };
}

test.describe("showcase-aurora-lander playable", () => {
  test("boots single-path createGame runtime, steps descent physics, and completes a soft landing", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/?site=0");
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME__?: { state?: string };
        __aura3dGameSnapshot?: AuroraSnapshot;
      };
      return (
        w.__AURA3D_GAME__?.state === "playing" &&
        Boolean(w.__aura3dGameSnapshot?.render.canvasAttached)
      );
    });

    const initial = await page.evaluate(() => {
      return (window as unknown as { __aura3dGameSnapshot: AuroraSnapshot })
        .__aura3dGameSnapshot;
    });
    expect(initial.route).toBe("showcase-aurora-lander");
    expect(initial.state).toBe("playing");
    expect(initial.phase).toBe("descending");
    expect(initial.siteIndex).toBe(0);
    expect(initial.siteCount).toBe(3);
    expect(initial.camera.landerInFrame).toBe(true);
    expect(initial.camera.padInFrame).toBe(true);

    // Advance simulation under autopilot on approach preset to verify soft landing
    const afterLanding = await page.evaluate(() => {
      const game = (
        window as unknown as {
          __AURA3D_GAME__: {
            applyApproachPreset: (site: number) => AuroraSnapshot;
            setAutorun: (enabled: boolean) => AuroraSnapshot;
            advanceTime: (ms: number) => AuroraSnapshot;
          };
        }
      ).__AURA3D_GAME__;
      game.applyApproachPreset(0);
      game.setAutorun(true);
      let snap = game.advanceTime(1000);
      for (let i = 0; i < 16 && snap.phase === "descending"; i += 1) {
        snap = game.advanceTime(1000);
      }
      return snap;
    });

    expect(["landed", "campaign-complete"]).toContain(afterLanding.phase);
    expect(afterLanding.lander.touchdown).toBe("landed");
    expect(afterLanding.totalScore).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
