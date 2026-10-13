import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Orbital Defense, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). This is the
 * successor of the retired orbital-defense-dispatch,
 * showcase-orbital-defense-framing and showcase-orbital-defense-v2 specs:
 * the route was rebuilt single-path on the arena-shooter template scaffold
 * and the legacy/v2 dispatcher those specs exercised is deleted, so there
 * are no flags to dispatch on — every URL boots
 * apps/showcase-orbital-defense/src/main.ts. The `-dispatch` filename is
 * retained only because the lane's S-category matching keys on it
 * (playwright.webkit/firefox testMatch and write-evidence's S1 row). S11
 * has no test here: the rebuilt route publishes no audio playback
 * evidence (the arena-shooter template it copies declares no sound, and
 * no `audio[]` event is cued), so the S11 claim as written (synthCues 0,
 * every audio[] event played) is not honestly assertable. S11 therefore
 * stays "missing" in write-evidence.mjs. Fire/kill/leak/win/lose/reset
 * playthrough assertions live in
 * apps/showcase-orbital-defense/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-orbital-defense";

type OrbitalSnapshot = {
  framed: boolean;
  frame: number;
  state: "playing" | "won" | "lost";
  wave: number;
  integrity: number;
  integrityMax: number;
  enemiesAlive: number;
  enemiesQueued: number;
  look: { id: string; category: string };
  fx: { explosionsLive: number; boltsLive: number; kills: number; leaks: number };
  framing: {
    rig: string;
    dronesUnderHud: number;
    subjectHeightFraction: number;
    horizontalHalfSpan: number;
    orbitRadius: number;
    orbitFitsHorizontally: boolean;
  };
  drawCalls: number;
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<OrbitalSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as OrbitalSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("orbital-defense single-path boot (S1)", () => {
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
      // publishEvidence sets `framed` once draw calls are submitted for the
      // arena; the first snapshot can precede the first presented frame,
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

  // S2 (single-path): main.ts drives createGame start() (session booting
  // -> loading -> playing after the first presented draw). The honest
  // published signal behind that transition is the snapshot's own game
  // state: framed, `state: "playing"` at wave 1 with full core integrity,
  // and the frame counter advancing under the update loop.
  test("boots to playing: framed snapshot in playing state at wave 1", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.state, "snapshot state is not playing").toBe("playing");
      expect(first.wave).toBe(1);
      expect(first.integrity).toBe(first.integrityMax);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): there are no scenario URLs to parity-check; the one
  // boot path applies `looks.preset(LOOK_ID)` in buildScene and publishes
  // that same resolved id as `look` in every snapshot. Assert the exact
  // applied value from the live page while frames are being submitted.
  test("appliedLook resolves to space on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("space");
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): split into separate desktop and mobile tests so WebKit
  // never executes a second page.goto() in the same test context.
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
      expect(snapshot.state).toBe("playing");
      expect(snapshot.framing.dronesUnderHud).toBe(0);
      expect(snapshot.framing.orbitFitsHorizontally).toBe(true);
      expect(snapshot.framing.horizontalHalfSpan).toBeGreaterThan(snapshot.framing.orbitRadius);
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
      expect(snapshot.state).toBe("playing");
      expect(snapshot.framing.dronesUnderHud).toBe(0);
      expect(snapshot.framing.orbitFitsHorizontally).toBe(true);
      expect(snapshot.framing.horizontalHalfSpan).toBeGreaterThan(snapshot.framing.orbitRadius);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
