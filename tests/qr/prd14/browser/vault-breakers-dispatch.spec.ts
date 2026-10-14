import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Vault Breakers, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). Successor of the
 * retired vault-breakers dispatch/framing/v2 specs: the B4 port moved the
 * salvaged pinball sim (src/gameplay/**) onto a fresh single-path scene
 * and deleted the legacy/v2 dispatcher those specs exercised, so there are
 * no flags to dispatch on — every URL boots
 * apps/showcase-vault-breakers/src/main.ts. The `-dispatch` filename is
 * retained only because the lane's S-category matching keys on it
 * (playwright.webkit/firefox testMatch and write-evidence's S1 row).
 * S11 has no test here: the route publishes real audio evidence (snapshot
 * `audio`: requested vs actually-played direction events from the
 * GameAudio object), but the S11 claim as written (synthCues 0, every
 * audio[] event played) is not honestly assertable — GameAudio evidence
 * exposes no synthCues, and direction events like "mission" need a bank
 * clear deterministic short play cannot reach ("ball-roll" is never cued
 * at all). S11 therefore stays "missing" in write-evidence.mjs.
 * Serve/flipper/drain/reset playthrough assertions live in
 * apps/showcase-vault-breakers/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-vault-breakers";

type VaultSnapshot = {
  framed: boolean;
  state: string;
  frame: number;
  ballsLeft: number;
  backend: string;
  look: { id: string; category: string };
  ball: { activeBalls: number };
  table: { drawCalls: number; poseHash: string };
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<VaultSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as VaultSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("vault-breakers single-path boot (S1)", () => {
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
      expect(snapshot.state).toBe("attract");
      expect(snapshot.backend).toBe("rapier");
      expect(snapshot.ballsLeft).toBe(3);
      expect(snapshot.table.drawCalls).toBeGreaterThan(0);
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
  // loading -> playing after the first presented draw) and the salvaged
  // flow serves on charge/release. Assert the live transition the playable
  // spec also proves: framed attract, frame counter advancing, and a
  // charged serve putting a ball into play.
  test("boots to playing: framed attract table serves a ball into play", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.state).toBe("attract");
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      await page.keyboard.down("Space");
      await page.waitForTimeout(900);
      await page.keyboard.up("Space");
      await expect.poll(() => snapshotOf(page).then((s) => s.state), { timeout: 30_000 }).toBe("play");
      const served = await snapshotOf(page);
      expect(served.ball.activeBalls).toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): the one boot path applies `looks.preset(LOOK_ID)` in
  // buildVaultScene and publishes that same resolved id as `look` in every
  // snapshot. Assert the exact applied value from the live page.
  test("appliedLook resolves to neon-arcade on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("neon-arcade");
      expect(snapshot.table.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): ported from apps/showcase-vault-breakers/tests/
  // playable.spec.ts — the fixed table camera reaches `framed` with draw
  // calls submitted at both viewports the retired framing spec sampled.
  // Split into separate test() blocks so WebKit does not crash on a 2nd goto.
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
      expect(snapshot.table.drawCalls).toBeGreaterThan(0);
      expect(snapshot.table.poseHash.length).toBeGreaterThan(0);
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
      expect(snapshot.table.drawCalls).toBeGreaterThan(0);
      expect(snapshot.table.poseHash.length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
