import { expect, test } from "@playwright/test";

const BASE_URL = process.env.DEEP_RECOVERY_URL ?? "http://127.0.0.1:5188";

interface DeepRecoveryEvidence {
  routeId: string;
  frame: number;
  elapsed: number;
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
}

test.describe("showcase-deep-recovery single-path createGame contract (S1/S2/S6/S7)", () => {
  test("S1: default / boots single-path createGame runtime with game flag", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(msg.text()));

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME__?: { routeId?: string };
        __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
      };
      return (
        w.__AURA3D_GAME__?.routeId === "showcase-deep-recovery" &&
        (w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"]?.frame ?? 0) > 2
      );
    });

    expect(logs.some((line) => line.includes("Flags: game"))).toBe(true);
    expect(logs.some((line) => line.includes("route_deep_recovery"))).toBe(false);
  });

  test("S2: __AURA3D_GAME__ and __AURA3D_GAME_EVIDENCE__ expose salvage, oxygen, sonar, and sub telemetry", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/?scenario=04-action`, { waitUntil: "domcontentloaded" });
    const ev = await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
      };
      const entry = w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"];
      return entry && entry.frame > 4 ? entry : null;
    });
    const data = await ev.jsonValue();
    expect(data?.routeId).toBe("showcase-deep-recovery");
    expect(data?.salvage?.cratesTotal).toBe(8);
    expect(data?.salvage?.grappled).toBeGreaterThanOrEqual(1);
    expect(data?.oxygen?.oxygen).toBeGreaterThan(0);
    expect(data?.render?.readbacksThisFrame).toBe(0);
  });

  test("S6 (desktop 1920x1080): chase rig keeps subjectScreenHeightFraction >= 0.12", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    const fraction = await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
      };
      const entry = w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"];
      return entry && entry.frame > 4 ? (entry.framing?.subjectScreenHeightFraction ?? 0) : null;
    });
    expect(await fraction.jsonValue()).toBeGreaterThanOrEqual(0.12);
  });

  test("S6 (mobile 390x844): chase rig keeps subjectScreenHeightFraction >= 0.12", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    const fraction = await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
      };
      const entry = w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"];
      return entry && entry.frame > 4 ? (entry.framing?.subjectScreenHeightFraction ?? 0) : null;
    });
    expect(await fraction.jsonValue()).toBeGreaterThanOrEqual(0.12);
  });

  test("S7: ?autorun=1 steers submersible and grapples salvage crate", async ({ page }) => {
    await page.goto(`${BASE_URL}/?autorun=1`, { waitUntil: "domcontentloaded" });
    const ev = await page.waitForFunction(() => {
      const w = window as unknown as {
        __AURA3D_GAME_EVIDENCE__?: Record<string, DeepRecoveryEvidence>;
      };
      const entry = w.__AURA3D_GAME_EVIDENCE__?.["showcase-deep-recovery"];
      if (!entry || entry.frame < 10) return null;
      if ((entry.salvage?.grappled ?? 0) >= 1 && (entry.sub?.distanceTraveled ?? 0) > 0.25) {
        return entry;
      }
      return null;
    });
    const data = await ev.jsonValue();
    expect(data?.salvage?.grappled).toBeGreaterThanOrEqual(1);
    expect(data?.sub?.distanceTraveled).toBeGreaterThan(0.25);
  });
});
