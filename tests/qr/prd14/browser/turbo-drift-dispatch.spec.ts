import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Turbo Drift Circuit, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). This is the
 * successor of the retired turbo-drift-dispatch (flag form),
 * showcase-turbo-drift-circuit-v2 and showcase-turbo-drift-circuit-framing
 * specs: the Live Fix B2 rebuild deleted the legacy/v2 dispatcher those
 * specs exercised, so there are no flags to dispatch on — every URL boots
 * apps/showcase-turbo-drift-circuit/src/main.ts. The `-dispatch` filename
 * is retained only because the lane's S-category matching keys on it
 * (playwright.webkit/firefox testMatch and write-evidence's S1 row). S11
 * has no test here: as with Blockfall Reactor, the S11 claim as written
 * (synthCues 0, every audio[] event played) is not honestly assertable
 * from GameAudio evidence, so S11 stays "missing" in write-evidence.mjs
 * for single-path routes. Driving/steering/lap playthrough assertions
 * live in apps/showcase-turbo-drift-circuit/tests/playable.spec.ts, and
 * the mesh-grounding lap sweep in tests/qr/prd14/turbo-drift/
 * grounding.test.ts.
 */

const APP_DIR = "showcase-turbo-drift-circuit";

type TurboSnapshot = {
  framed: boolean;
  state: string;
  frame: number;
  lap: number;
  groundedWheels: number;
  groundClearance: { id: string; clearance: number; grounded: boolean; hit: boolean }[];
  wheelRadius: number;
  look: { id: string; category: string };
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<TurboSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as TurboSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("turbo-drift single-path boot (S1)", () => {
  test("boots framed with a sized canvas and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/`);
      await expect.poll(() =>
        page.evaluate(() => Boolean((window as Record<string, unknown>).__aura3dGameSnapshot)),
        { timeout: 30_000 }).toBe(true);
      await expect.poll(() =>
        page.evaluate(() =>
          ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed),
        { timeout: 30_000 }).toBe(true);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.groundedWheels).toBeGreaterThan(0);
      // The owner-visible grounding defect, at boot: grounded wheels sit
      // exactly one wheel radius over the mesh sampled under them.
      for (const wheel of snapshot.groundClearance) {
        if (wheel.hit) expect(wheel.clearance).toBeGreaterThanOrEqual(snapshot.wheelRadius - 0.02);
        if (wheel.grounded) expect(Math.abs(wheel.clearance - snapshot.wheelRadius)).toBeLessThanOrEqual(0.02);
      }
      const canvas = await page.evaluate(() => {
        const el = document.querySelector("canvas");
        return el === null ? null : { width: el.clientWidth, height: el.clientHeight };
      });
      expect(canvas, "no canvas element mounted").not.toBeNull();
      expect(canvas!.width).toBeGreaterThan(0);
      expect(canvas!.height).toBeGreaterThan(0);
      await soakIfNeeded(page);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S2 (single-path): main.ts drives createGame start() and the salvaged
  // start-lights machine releases countdown -> racing; the kit frame
  // counter then advances under held-throttle-free running.
  test("boots to playing: framed snapshot reaches racing with advancing frames", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      await expect.poll(() => snapshotOf(page).then((s) => s.state), { timeout: 30_000 }).toBe("racing");
      const first = await snapshotOf(page);
      expect(first.lap).toBeGreaterThanOrEqual(1);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): the one boot path applies `looks.preset(LOOK_ID)` in
  // buildScene and publishes that same resolved id as `look`.
  test("appliedLook resolves to golden-hour on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("golden-hour");
      expect(snapshot.groundedWheels).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): the chase rig reaches `framed` with seated wheels at
  // both viewports the retired framing spec sampled. Split into separate
  // tests so each viewport runs in its own fresh page context (avoiding
  // headless WebKit 2nd-goto WebGL2 teardown crashes).
  test("framing holds at desktop viewport (1920x1080)", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.groundedWheels).toBeGreaterThan(0);
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
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.groundedWheels).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
