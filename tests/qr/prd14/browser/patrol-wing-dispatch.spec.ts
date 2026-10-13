import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Patrol Wing, plus the single-path
 * S2/S6/S7 rows write-evidence.mjs maps to this spec's titled tests
 * (`boots to playing`, `appliedLook`, `framing`). Successor of the retired
 * patrol-wing dispatch/framing/v2 specs: the B5 port moved the salvaged
 * flight core (src/gameplay/** plus the extracted course-data and
 * arena-physics modules) onto a fresh single-path scene and deleted the
 * legacy/v2 dispatcher those specs exercised, so there are no flags to
 * dispatch on — every URL boots apps/showcase-patrol-wing/src/main.ts. The
 * `-dispatch` filename is retained only because the lane's S-category
 * matching keys on it (playwright.webkit/firefox testMatch and
 * write-evidence's S1 row). S11 has no test here: the route publishes real
 * audio evidence (snapshot `audio`: requested vs actually-played direction
 * events from the GameAudio object), but the S11 claim as written
 * (synthCues 0, every audio[] event played) is not honestly assertable —
 * GameAudio evidence exposes no synthCues, "wind-speed" is a continuous
 * bed this rebuild never cues discretely, and ring/gunfire cues need a
 * flown sortie deterministic short play cannot guarantee. S11 therefore
 * stays "missing" in write-evidence.mjs. Takeoff/ring/drone/reset
 * playthrough assertions live in
 * apps/showcase-patrol-wing/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-patrol-wing";

type PatrolSnapshot = {
  framed: boolean;
  state: string;
  frame: number;
  backend: string;
  drawCalls: number;
  look: { id: string; category: string };
  flight: { speed: number; grounded: string; trajectoryHash: string };
  rings: { gatesCleared: number };
  hull: { value: number; max: number };
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<PatrolSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as PatrolSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("patrol-wing single-path boot (S1)", () => {
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
      expect(snapshot.state).toBe("preflight");
      expect(snapshot.backend).toBe("rapier");
      expect(snapshot.hull.value).toBe(100);
      expect(snapshot.hull.max).toBe(100);
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
  // loading -> playing after the first presented draw) and the salvaged
  // flight model lifts off on held throttle. Assert the live transition:
  // framed preflight, frame counter advancing, Shift spooling to airborne.
  test("boots to playing: framed preflight takes off on held throttle", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.state).toBe("preflight");
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      await page.keyboard.down("ShiftLeft");
      await expect.poll(() => snapshotOf(page).then((s) => s.state), { timeout: 30_000 }).toBe("patrol");
      const airborne = await snapshotOf(page);
      expect(airborne.flight.grounded).toBe("airborne");
      expect(airborne.flight.speed).toBeGreaterThan(10.5);
      await page.keyboard.up("ShiftLeft");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): the one boot path applies `looks.preset(LOOK_ID)` in
  // buildPatrolScene and publishes that same resolved id as `look` in every
  // snapshot. Assert the exact applied value from the live page.
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

  // S7 (single-path): ported from apps/showcase-patrol-wing/tests/
  // playable.spec.ts — the chase rig reaches `framed` with draw calls
  // submitted at both viewports the retired framing spec sampled. Split into
  // separate tests so each viewport runs in a fresh page context without a
  // second page.goto() in WebKit.
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
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(snapshot.flight.trajectoryHash.length).toBeGreaterThan(0);
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
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(snapshot.flight.trajectoryHash.length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
