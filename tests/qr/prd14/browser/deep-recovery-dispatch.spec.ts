import { expect, test, type Page } from "@playwright/test";
import { builtDist, serve, watchConsole } from "./lib/serve";

const APP_DIR = "showcase-deep-recovery";

interface DeepRecoveryEvidence {
  routeId: string;
  frame: number;
  elapsed: number;
  appliedLook?: { postPreset?: string; rig?: string };
  salvage?: {
    grappled: number;
    tethered: number;
    banked: number;
    bankedValue: number;
    cratesTotal: number;
  };
  oxygen?: {
    oxygen: number;
    hull: number;
    breaches: number;
    depthMeters: number;
    zone: string;
  };
  sonar?: {
    pingActive: boolean;
    contactsCount: number;
    pingsTriggered: number;
  };
  sub?: {
    position: [number, number, number];
    speed: number;
    distanceTraveled: number;
  };
  framing?: {
    rig: string;
    subjectScreenHeightFraction: number;
  };
  render?: {
    readbacksThisFrame: number;
  };
  audio?: {
    synthCues?: number;
  };
}

async function bootPlaying(page: Page, url: string, query = ""): Promise<void> {
  await page.goto(`${url}/${query}`);
  await expect.poll(
    () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME__?: { state?: string };
          __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
        };
        return (
          w.__AURA3D_GAME__?.state === "playing" &&
          (w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.frame ?? 0) > 2
        );
      }),
    { timeout: 30_000 }
  ).toBe(true);
}

test.describe("showcase-deep-recovery single-path createGame contract (S1/S2/S6/S7/S11)", () => {
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
      const synthCues = await page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
        };
        return w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.audio?.synthCues ?? 0;
      });
      expect(synthCues).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("boots to playing: salvage, oxygen, sonar, and sub telemetry live", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url, "?scenario=04-action");
      const data = await page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
        };
        return w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"] ?? null;
      });
      expect(data?.routeId).toBe("showcase-deep-recovery");
      expect(data?.salvage?.cratesTotal).toBe(8);
      expect(data?.salvage?.grappled).toBeGreaterThanOrEqual(1);
      expect(data?.oxygen?.oxygen).toBeGreaterThan(0);
      expect(data?.render?.readbacksThisFrame).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("appliedLook resolves to pelagic-deep-salvage on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url);
      const look = await page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
        };
        return w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.appliedLook ?? null;
      });
      expect(look?.postPreset).toBe("pelagic-deep-salvage");
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
      await bootPlaying(page, url);
      const fraction = await page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
        };
        return w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.framing?.subjectScreenHeightFraction ?? 0;
      });
      expect(fraction).toBeGreaterThanOrEqual(0.12);
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
      await bootPlaying(page, url);
      const fraction = await page.evaluate(() => {
        const w = window as unknown as {
          __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
        };
        return w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.framing?.subjectScreenHeightFraction ?? 0;
      });
      expect(fraction).toBeGreaterThanOrEqual(0.12);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
