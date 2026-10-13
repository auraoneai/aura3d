import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Pulse Tunnel, plus the single-path
 * S2/S6/S7 rows write-evidence.mjs maps to this spec's titled tests
 * (`boots to playing`, `appliedLook`, `framing`). The route is rebuilt
 * single-path on its salvaged gameplay core (beat-clock, gates, patterns,
 * player, style, conveyor) and the legacy/v2 dispatcher is deleted, so
 * every URL boots apps/showcase-pulse-tunnel/src/main.ts.
 */

const APP_DIR = "showcase-pulse-tunnel";

type PulseSnapshot = {
  framed: boolean;
  frame: number;
  state: string;
  run: {
    state: string;
    sectionId: string;
    shields: number;
    passed: number;
    passedOnBeat: number;
  };
  player: { lane: number; x: number; y: number };
  look: { id: string; category: string };
  appliedLook: Record<string, unknown>;
};

async function snapshotOf(page: import("@playwright/test").Page): Promise<PulseSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as PulseSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("pulse-tunnel single-path boot (S1)", () => {
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
      expect(snapshot.run.shields).toBe(3);
      expect(snapshot.player.lane).toBe(1);
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
  // -> playing after the first presented draw) and advances the frame loop.
  test("boots to playing: framed snapshot with 3 shields and advancing frames", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.run.shields).toBe(3);
      expect(first.player.lane).toBe(1);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): asserts the C-31 look manifest and neon-night output
  // preset applied on the live page.
  test("appliedLook resolves to neon-night on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("neon-night");
      expect(snapshot.appliedLook.postPreset).toBe("neon-night");
      expect(snapshot.appliedLook.rig).toBe("pulse-tunnel.chase");
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
      expect(snapshot.run.shields).toBe(3);
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
      expect(snapshot.run.shields).toBe(3);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
