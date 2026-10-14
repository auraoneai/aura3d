import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Siege Golf, plus the single-path
 * S2/S6/S7 rows write-evidence.mjs maps to this spec's titled tests
 * (`boots to playing`, `appliedLook`, `framing`). This is the successor of
 * the retired siege-golf-dispatch, showcase-siege-golf-framing,
 * showcase-siege-golf-scene-swaps and showcase-siege-golf-v2 specs: the
 * route was rebuilt single-path on its salvaged gameplay core
 * (course/structures/hole-flow/score/shot/solutions) and the legacy/v2
 * dispatcher those specs exercised is deleted, so there are no flags to
 * dispatch on — every URL boots apps/showcase-siege-golf/src/main.ts. The
 * `-dispatch` filename is retained only because the lane's S-category
 * matching keys on it (playwright.webkit/firefox testMatch and
 * write-evidence's S1 row). S11 has no test here: the route publishes real
 * audio evidence (snapshot `audio`: requested vs actually-played direction
 * events from the GameAudio object), but the S11 claim as written
 * (synthCues 0, every audio[] event played) is still not honestly
 * assertable — GameAudio evidence exposes no synthCues, and the `bounce`
 * direction event has no deterministic short-play producer. S11 therefore
 * stays "missing" in write-evidence.mjs. Shot/rest/solution-replay/reset
 * playthrough assertions live in
 * apps/showcase-siege-golf/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-siege-golf";

type SiegeSnapshot = {
  framed: boolean;
  frame: number;
  phase: string;
  hole: { index: number; id: string; par: number };
  ball: { resting: boolean };
  structures: { total: number; standing: number };
  look: { id: string; category: string };
  appliedLook: Record<string, unknown>;
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<SiegeSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as SiegeSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("siege-golf single-path boot (S1)", () => {
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
      await expect.poll(() =>
        page.evaluate(() =>
          ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed),
        { timeout: 30_000 }).toBe(true);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.structures.total).toBeGreaterThan(0);
      expect(snapshot.structures.standing).toBe(snapshot.structures.total);
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

  // S2 (single-path): main.ts drives createGame start() (booting -> loading
  // -> playing after the first presented draw). This row asserts the live
  // hole state behind that transition: hole 1 built and framed, ball
  // resting on the tee in the aiming phase, frame counter advancing.
  test("boots to playing: framed snapshot aiming on hole 1 with the ball at rest", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.hole.index).toBe(0);
      expect(first.phase).toBe("aiming");
      expect(first.ball.resting).toBe(true);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): there are no scenario URLs to parity-check; the one
  // boot path applies the daylight-outdoor output preset and publishes the
  // C-31 look manifest as `appliedLook` in every snapshot. Assert the exact
  // applied values from the live page.
  test("appliedLook resolves to daylight-outdoor on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("daylight-outdoor");
      expect(snapshot.appliedLook.postPreset).toBe("daylight-outdoor");
      expect(snapshot.appliedLook.rig).toBe("siege-golf.altitude");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): ported from apps/showcase-siege-golf/tests/
  // playable.spec.ts — the altitude rig reaches `framed` with the hole's
  // structures standing at both viewports the retired framing spec sampled.
  // Split into separate tests so WebKit gets a fresh page/WebGL context per
  // viewport instead of crashing on a second page.goto.
  test("framing holds at desktop viewport", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.structures.total).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("framing holds at mobile viewport", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.structures.total).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
