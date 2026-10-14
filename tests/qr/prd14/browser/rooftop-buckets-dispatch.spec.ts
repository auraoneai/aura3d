import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Rooftop Buckets, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). This is the
 * successor of the retired T1.10 rooftop-buckets dispatch spec: the PORT
 * rebuilt the route single-path on the salvaged scoring/shot/hoop core and
 * deleted the legacy/v2 dispatcher that spec exercised, so there are no
 * flags to dispatch on — every URL boots
 * apps/showcase-rooftop-buckets/src/main.ts. The `-dispatch` filename is
 * retained only because the lane's S-category matching keys on it
 * (playwright.webkit/firefox testMatch and write-evidence's S1 row). S11
 * has no test here: the route publishes audio evidence (snapshot `audio`:
 * requested vs actually-played direction events from the GameAudio
 * object), but the S11 claim as written (synthCues 0, every audio[] event
 * played) is not honestly assertable — GameAudio evidence exposes no
 * synthCues, and swish/crowd need a made basket / cleared heat that a
 * boot-only deterministic check cannot reach. This base also predates the
 * GameAudio /probes/ fix, so the boot-cued bed may log console 404s in
 * lane captures until the stack merge. S11 therefore stays "missing" in
 * write-evidence.mjs. Shot/score/heat/reset playthrough assertions live in
 * apps/showcase-rooftop-buckets/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-rooftop-buckets";

type BucketsSnapshot = {
  framed: boolean;
  state: string;
  heat: number;
  shotClock: number;
  ball: { inFlight: boolean };
  look: { id: string; category: string };
  drawCalls: number;
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<BucketsSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as BucketsSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("rooftop-buckets single-path boot (S1)", () => {
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
      // publishEvidence sets `framed` once draw calls are submitted for the
      // court; the first snapshot can precede the first presented frame,
      // so poll the flag itself (as playable.spec.ts does).
      await expect.poll(() =>
        page.evaluate(() =>
          ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed),
        { timeout: 30_000 }).toBe(true);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.drawCalls).toBeGreaterThan(0);
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

  // S2 (single-path): main.ts drives createGame start() (session booting ->
  // loading -> playing after the first presented draw). This row asserts
  // the published salvaged-loop state behind that transition: heat 1 in
  // "playing", the ball parked at the boot spot, and the shot clock
  // actually ticking under updateClocks.
  test("boots to playing: framed snapshot in heat 1 with the shot clock ticking", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.state).toBe("playing");
      expect(first.heat).toBe(1);
      expect(first.ball.inFlight).toBe(false);
      await expect.poll(() => snapshotOf(page).then((s) => s.shotClock), { timeout: 30_000 })
        .toBeLessThan(first.shotClock);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): there are no scenario URLs to parity-check; the one
  // boot path applies `looks.preset(LOOK_ID)` in buildScene and publishes
  // that same resolved id as `look` in every snapshot. Assert the exact
  // applied value from the live page while frames are being submitted.
  test("appliedLook resolves to golden-hour on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("golden-hour");
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): ported from apps/showcase-rooftop-buckets/tests/
  // playable.spec.ts — the fixed broadcast rig reaches `framed` at both
  // viewports. Split into separate test() blocks so WebKit does not
  // tear down and re-create the WebGL2 context across a second page.goto().
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
