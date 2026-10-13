import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Gravity Post, plus the single-path
 * S2/S6/S7 rows write-evidence.mjs maps to this spec's titled tests
 * (`boots to playing`, `appliedLook`, `framing`). This is the successor of
 * the retired gravity-post-dispatch, showcase-gravity-post-framing, and
 * showcase-gravity-post-v2 specs: the route was rebuilt single-path on its
 * salvaged gameplay core (wells/pod/contracts/scoring/prediction/stations)
 * and the legacy/v2 dispatcher those specs exercised is deleted, so every
 * URL boots apps/showcase-gravity-post/src/main.ts.
 */

const APP_DIR = "showcase-gravity-post";

type GravitySnapshot = {
  framed: boolean;
  frame: number;
  podState: string;
  contractIndex: number;
  contractId: string;
  hullsRemaining: number;
  look: { id: string; category: string };
  appliedLook: Record<string, unknown>;
};

async function snapshotOf(page: import("@playwright/test").Page): Promise<GravitySnapshot> {
  return page.evaluate(() => (window as Record<string, unknown>).__aura3dGameSnapshot as GravitySnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("gravity-post single-path boot (S1)", () => {
  test("boots framed with a sized canvas and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/`);
      await expect
        .poll(() => page.evaluate(() => Boolean((window as Record<string, unknown>).__aura3dGameSnapshot)), {
          timeout: 30_000
        })
        .toBe(true);
      await expect
        .poll(
          () =>
            page.evaluate(
              () => ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed
            ),
          { timeout: 30_000 }
        )
        .toBe(true);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.contractIndex).toBe(0);
      expect(snapshot.hullsRemaining).toBe(3);
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
  // -> playing after the first presented draw). Asserts the live dispatch
  // board state on Contract 1 with the courier skiff ready at Sol Relay and
  // frame counter advancing.
  test("boots to playing: framed snapshot ready on contract 1 with 3 hulls", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.contractIndex).toBe(0);
      expect(first.contractId).toBe("GP-CON-1");
      expect(first.podState).toBe("ready");
      expect(first.hullsRemaining).toBe(3);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 }).toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): asserts the space-orbit look preset and orbit rig on
  // the live page.
  test("appliedLook resolves to space-orbit on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("space-orbit");
      expect(snapshot.appliedLook.postPreset).toBe("space-orbit");
      expect(snapshot.appliedLook.rig).toBe("gravity-post.orbit");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): split into separate desktop and mobile tests so WebKit
  // gets a fresh page/WebGL context per viewport.
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
      expect(snapshot.hullsRemaining).toBe(3);
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
      expect(snapshot.hullsRemaining).toBe(3);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
