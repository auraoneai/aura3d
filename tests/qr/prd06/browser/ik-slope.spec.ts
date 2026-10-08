// PRD-06 T3.9 — `prd06-ik-slope` on both adapters: Soldier Idle straddling a
// 20° ramp + 18 cm stairs, foot IK on. Aura binds `ik.add({kind:"foot-ik"})`
// against the shared analytic terrain; three drives `CCDIKSolver`. Acceptance
// is the §17.0 engine-reported metric in ReadyPayload.extra.footIk — every
// leg's ankle planted within spec.ikSlope.maxContactError — not image parity.

import { expect, test } from "@playwright/test";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../../prd04/dev-server";

declare global {
  interface Window {
    __PRD06_IK_SLOPE_HARNESS__?: { status: "importing" | "running" | "ok" | "error"; engine: string; error?: string };
    __PRD06_IK_SLOPE__?: unknown;
    __PRD06_IK_SLOPE_THREE__?: unknown;
  }
}

interface FootIkReport {
  configured: boolean;
  groundedFeet?: number;
  targetError?: number | null;
  maxContactError: number | null;
  feet?: readonly { side: "left" | "right"; worldPosition: readonly [number, number, number]; contactError: number; locked: boolean }[];
}

interface ReadyLike {
  engine: string;
  scene: string;
  errors: readonly string[];
  capabilityLog: readonly { feature: string; status: string; detail: string }[];
  extra?: { footIk?: FootIkReport };
}

const MAX_CONTACT_ERROR = 0.05;

function expectFootIk(payload: ReadyLike | undefined, engine: string): void {
  expect(payload, `${engine} payload missing`).toBeTruthy();
  expect(payload!.errors, `${engine} scene errors: ${payload!.errors.join(" | ")}`).toEqual([]);
  const footIk = payload!.extra?.footIk;
  expect(footIk, `${engine} extra.footIk missing`).toBeTruthy();
  expect(footIk!.configured, `${engine} foot IK not configured`).toBe(true);
  const feet = footIk!.feet ?? [];
  expect(feet.length, `${engine} expected 2 planted feet`).toBe(2);
  for (const foot of feet) {
    expect(
      foot.locked,
      `${engine} foot ${foot.side} not locked (contactError=${foot.contactError.toFixed(4)}, pos=[${foot.worldPosition.map((v) => v.toFixed(3)).join(",")}])`
    ).toBe(true);
    expect(foot.contactError, `${engine} foot ${foot.side} contactError ${foot.contactError}`).toBeLessThanOrEqual(MAX_CONTACT_ERROR);
  }
  const ikEntry = payload!.capabilityLog.find((entry) => entry.feature.startsWith("footIk:"));
  expect(ikEntry?.status, `${engine} footIk capability entry`).toBe("supported");
}

test.describe("PRD-06 ik-slope (T3.9)", () => {
  let server: ExampleDevServer;
  const url = (engine: string) =>
    `${server.origin}/tests/qr/prd06/browser/ik-slope-harness.html?engine=${engine}${engine === "aura3d" ? "&a3d-qr=animation" : ""}`;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("aura adapter plants both feet via ik.add foot-ik on the analytic terrain", async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto(url("aura3d"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PRD06_IK_SLOPE_HARNESS__?.status === "ok" || window.__PRD06_IK_SLOPE_HARNESS__?.status === "error", undefined, { timeout: 360_000 });
    const harness = await page.evaluate(() => window.__PRD06_IK_SLOPE_HARNESS__);
    expect(harness?.status, harness?.error ?? "harness failed").toBe("ok");
    const payload = await page.evaluate(() => window.__PRD06_IK_SLOPE__) as ReadyLike | undefined;
    expectFootIk(payload, "aura3d");
  });

  test("three adapter plants both feet via CCDIKSolver on the same terrain", async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto(url("three"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PRD06_IK_SLOPE_HARNESS__?.status === "ok" || window.__PRD06_IK_SLOPE_HARNESS__?.status === "error", undefined, { timeout: 360_000 });
    const harness = await page.evaluate(() => window.__PRD06_IK_SLOPE_HARNESS__);
    expect(harness?.status, harness?.error ?? "harness failed").toBe("ok");
    const payload = await page.evaluate(() => window.__PRD06_IK_SLOPE_THREE__) as ReadyLike | undefined;
    expectFootIk(payload, "three");
  });
});
