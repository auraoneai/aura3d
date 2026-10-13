import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Neon Swarm, plus the single-path
 * S2/S6/S7 rows mapped to this spec's titled tests (`boots to playing`,
 * `appliedLook`, `framing`). This is the successor of the retired
 * neon-swarm-dispatch, showcase-neon-swarm-framing, and
 * showcase-neon-swarm-v2 specs: the route was rebuilt single-path on its
 * salvaged gameplay core (arena/swarm/waves/player/pickups/run) and the
 * legacy/v2 dispatcher those specs exercised is deleted, so there are no
 * flags to dispatch on — every URL boots apps/showcase-neon-swarm/src/main.ts.
 * The `-dispatch` filename is retained because the lane's S-category matching
 * keys on it.
 */

const APP_DIR = "showcase-neon-swarm";

type SwarmSnapshot = {
  framed: boolean;
  frame: number;
  phase: string;
  wave: { index: number; total: number; label: string };
  player: { hp: number; maxHp: number; position: [number, number, number] };
  enemies: {
    activeTotal: number;
    activeGrunts: number;
    activeElites: number;
    gruntCapacity: number;
    eliteCapacity: number;
  };
  look: { id: string; category: string };
  appliedLook: Record<string, unknown>;
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<SwarmSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as SwarmSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("neon-swarm single-path boot (S1)", () => {
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
      expect(snapshot.enemies.activeTotal).toBeGreaterThan(0);
      expect(snapshot.enemies.gruntCapacity).toBe(360);
      expect(snapshot.enemies.eliteCapacity).toBe(96);
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
  // arena state behind that transition: wave 1 built and framed, opening
  // grunts active in the instanced pool, frame counter advancing.
  test("boots to playing: framed snapshot on wave 1 with active instanced swarm", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.wave.index).toBe(1);
      expect(first.phase).toBe("playing");
      expect(first.enemies.activeTotal).toBeGreaterThan(0);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): the single boot path applies the neon-arcade output
  // preset and publishes the look manifest as `appliedLook` in every snapshot.
  test("appliedLook resolves to neon-arcade on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("neon-arcade");
      expect(snapshot.appliedLook.postPreset).toBe("neon-arcade");
      expect(snapshot.appliedLook.rig).toBe("neon-swarm.overhead");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): split into separate desktop and mobile tests so WebKit
  // gets a fresh page/WebGL context per viewport instead of crashing on a
  // second page.goto.
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
      expect(snapshot.enemies.activeTotal).toBeGreaterThan(0);
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
      expect(snapshot.enemies.activeTotal).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
