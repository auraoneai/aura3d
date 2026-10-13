import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Gallery Shift, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). Successor of the
 * retired T1.10 dispatcher spec: the B5 PORT rebuilt the route
 * single-path on the salvaged vision core (gameplay/{vision,guard,thief,
 * floor}.ts travel whole) and deleted the legacy/v2 dispatcher, so there
 * are no flags to dispatch on — every URL boots
 * apps/showcase-gallery-shift/src/main.ts. The `-dispatch` filename is
 * retained only because the lane's S-category matching keys on it. S11
 * has no test here: the fresh scene ships no route audio (the heist cue
 * manifest lived in the trashed legacy tree), so no played-cue claim is
 * honestly assertable and S11 stays "missing" in write-evidence.mjs.
 * Cone/caught/exit playthrough assertions live in
 * apps/showcase-gallery-shift/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-gallery-shift";

type GallerySnapshot = {
  framed: boolean;
  state: string;
  frame: number;
  detection: number;
  guards: { id: string }[];
  look: { id: string };
  drawCalls: number;
};

async function snapshotOf(page: import("@playwright/test").Page): Promise<GallerySnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as GallerySnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("gallery-shift single-path boot (S1)", () => {
  test("boots framed with a sized canvas, S11 audio, and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.guards).toHaveLength(2);
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

  // S2 (single-path): main.ts drives createGame start() and the salvaged
  // fixed-step loop; the published state stands behind that transition —
  // playing, both guards patrolling, detection at rest, frame advancing.
  test("boots to playing: framed snapshot with patrolling guards", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.state).toBe("playing");
      expect(first.detection).toBe(0);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): the one boot path applies `looks.preset(LOOK_ID)`
  // in buildScene and publishes that resolved id in every snapshot.
  test("appliedLook resolves to interior-warm on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("interior-warm");
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): the orthographic rig reaches `framed` at desktop
  // and mobile viewports (split into separate tests to avoid WebKit 2nd-goto crashes).
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
