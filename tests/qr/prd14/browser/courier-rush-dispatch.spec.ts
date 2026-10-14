import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Courier Rush, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). This is the
 * successor of the retired courier-rush-dispatch (T1.10 flag pair),
 * showcase-courier-rush-v2, showcase-courier-rush-framing, and
 * showcase-courier-rush-hud specs: the rebuild deleted the legacy/v2
 * dispatcher those specs exercised, so there are no flags to dispatch
 * on — every URL boots apps/showcase-courier-rush/src/main.ts. The
 * `-dispatch` filename is retained only because the lane's S-category
 * matching keys on it (playwright.webkit/firefox testMatch and
 * write-evidence's S1 row). S11 has no test here: the route publishes
 * real audio evidence (snapshot `audio`: requested vs actually-played
 * direction events from the GameAudio object), but the S11 claim as
 * written (synthCues 0, every audio[] event played) is still not
 * honestly assertable — GameAudio evidence exposes no synthCues, and
 * drop/strike/horn need gameplay events deterministic short boot checks
 * cannot guarantee. S11 therefore stays "missing" in write-evidence.mjs.
 * Drive/pickup/delivery/win/lose/reset playthrough assertions live in
 * apps/showcase-courier-rush/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-courier-rush";

type CourierSnapshot = {
  framed: boolean;
  state: string;
  phase: string;
  deliveries: number;
  timeLeft: number;
  targetZone: string | null;
  look: { id: string; category: string };
  drawCalls: number;
  vehicle: { x: number; z: number; speed: number; grounded: boolean };
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<CourierSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as CourierSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("courier-rush single-path boot (S1)", () => {
  test("boots framed with a sized canvas, S11 audio, and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/`);
      await expect.poll(() =>
        page.evaluate(() => Boolean((window as Record<string, unknown>).__aura3dGameSnapshot)),
        { timeout: 30_000 }).toBe(true);
      // publishEvidence sets `framed` once draw calls are being submitted;
      // the first snapshot can precede the first presented frame, so poll
      // the flag itself (as playable.spec.ts does).
      await expect.poll(() =>
        page.evaluate(() =>
          ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed),
        { timeout: 30_000 }).toBe(true);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(snapshot.vehicle.grounded).toBe(true);
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

  // S2 (single-path): main.ts drives the createGame start() lifecycle
  // (session booting -> loading -> playing after the first presented
  // draw). This row asserts the published shift state behind that
  // transition: playing, awaiting the first pickup at north-tower-dock,
  // with the delivery clock running down.
  test("boots to playing: framed shift awaiting its first pickup", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.state).toBe("playing");
      expect(first.phase).toBe("awaitingPickup");
      expect(first.targetZone).toBe("north-tower-dock");
      expect(first.deliveries).toBe(0);
      await expect.poll(() => snapshotOf(page).then((s) => s.timeLeft), { timeout: 30_000 })
        .toBeLessThan(first.timeLeft);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): there are no scenario URLs to parity-check; the one
  // boot path applies `looks.preset(LOOK_ID)` in buildScene and publishes
  // that same resolved id as `look`/`appliedLook` in every snapshot.
  test("appliedLook resolves to night-city on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("night-city");
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): ported from the route's framing checks — the chase
  // rig reaches `framed` with draw calls submitted at both the desktop
  // and mobile viewports the retired framing spec sampled. Split into
  // separate test() blocks so WebKit never runs a second page.goto() in
  // the same WebGL context.
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
      expect(snapshot.drawCalls).toBeGreaterThan(0);
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
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
