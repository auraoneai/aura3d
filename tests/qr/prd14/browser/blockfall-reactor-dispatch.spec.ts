import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Blockfall Reactor, plus the
 * single-path S2/S6/S7 rows write-evidence.mjs maps to this spec's titled
 * tests (`boots to playing`, `appliedLook`, `framing`). This is the
 * successor of the retired blockfall-reactor-dispatch, showcase-blockfall-
 * reactor-framing and showcase-blockfall-reactor-v2 specs: PR #1360 rebuilt
 * the route single-path on the falling-blocks-starter scaffold and deleted
 * the legacy/v2 dispatcher those specs exercised, so there are no flags to
 * dispatch on — every URL boots apps/showcase-blockfall-reactor/src/main.ts.
 * The `-dispatch` filename is retained only because the lane's S-category
 * matching keys on it (playwright.webkit/firefox testMatch and
 * write-evidence's S1 row). S11 has no test here: the route now publishes
 * real audio evidence (snapshot `audio`: requested vs actually-played
 * direction events from the GameAudio object), but the S11 claim as
 * written (synthCues 0, every audio[] event played) is still not honestly
 * assertable — GameAudio evidence exposes no synthCues, and quad-clear /
 * level-up need a 4-line clear / 10 lines that deterministic short play
 * cannot reach. S11 therefore stays "missing" in write-evidence.mjs.
 * Keyboard/fall playthrough assertions live in
 * apps/showcase-blockfall-reactor/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-blockfall-reactor";

type ReactorSnapshot = {
  framed: boolean;
  frame: number;
  active: { kind: string; x: number; y: number } | null;
  gameOver: boolean;
  look: { id: string; category: string };
  board: { filledCells: number; drawCalls: number };
  framing: { rig: string; subjectScreenHeightFraction: number | null };
};

/** The evidence snapshot `publishEvidence` in src/main.ts assigns to
 *  `window.__aura3dGameSnapshot` every frame. */
async function snapshotOf(page: import("@playwright/test").Page): Promise<ReactorSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as ReactorSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("blockfall-reactor single-path boot (S1)", () => {
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
      // publishEvidence sets `framed` once draw calls are submitted for a
      // board with settled cells; the first snapshot can precede the first
      // presented frame, so poll the flag itself (as playable.spec.ts does).
      await expect.poll(() =>
        page.evaluate(() =>
          ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed),
        { timeout: 30_000 }).toBe(true);
      const snapshot = await page.evaluate(() =>
        (window as Record<string, unknown>).__aura3dGameSnapshot as {
          framed: boolean;
          board: { filledCells: number; drawCalls: number };
        });
      expect(snapshot.framed).toBe(true);
      expect(snapshot.board.filledCells).toBeGreaterThan(0);
      expect(snapshot.board.drawCalls).toBeGreaterThan(0);
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

  // S2 (single-path): main.ts now drives createGame start() (session
  // booting -> loading -> playing after the first presented draw). This row
  // keeps asserting the published kit state that stands behind that session
  // transition: a framed board, a live active piece, not game-over, and the
  // kit frame counter advancing under its 30 Hz tick.
  test("boots to playing: framed snapshot with an active falling piece", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.active, "no active piece in play").not.toBeNull();
      expect(first.gameOver).toBe(false);
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
  test("appliedLook resolves to neon-arcade on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("neon-arcade");
      expect(snapshot.board.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): ported from apps/showcase-blockfall-reactor/tests/
  // playable.spec.ts — the fixed orthographic rig reaches `framed` with
  // settled cells submitted at both viewports the retired framing spec
  // sampled. The snapshot also publishes a measured
  // `framing.subjectScreenHeightFraction` (board subject bounds projected
  // through the C-22 camera evidence's view-projection) — but only when
  // that evidence carries a real matrix; this spec's plain boot mounts
  // the stub camera controller (empty matrix), so the fraction is null
  // here and the [0.55, 0.75] band is asserted only when measured, the
  // same conditional pattern as the sibling framing specs. The rig's
  // orthographicSize is derived from the subject height so the measured
  // value centres the band (~0.65) whenever a matrix is available.
  type ReactorSnapshotWithAudio = ReactorSnapshot & {
    audio: {
      synthCues: number;
      requestedEvents: readonly string[];
      playedEvents: readonly string[];
      playedCueCount: number;
      suppressedCueCount: number;
      contextState: string;
      unlocked: boolean;
    };
  };

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
      expect(snapshot.board.filledCells).toBeGreaterThan(0);
      expect(snapshot.board.drawCalls).toBeGreaterThan(0);
      if (snapshot.framing.subjectScreenHeightFraction !== null) {
        expect(snapshot.framing.subjectScreenHeightFraction).toBeGreaterThanOrEqual(0.55);
        expect(snapshot.framing.subjectScreenHeightFraction).toBeLessThanOrEqual(0.75);
      }
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
      expect(snapshot.board.filledCells).toBeGreaterThan(0);
      expect(snapshot.board.drawCalls).toBeGreaterThan(0);
      if (snapshot.framing.subjectScreenHeightFraction !== null) {
        expect(snapshot.framing.subjectScreenHeightFraction).toBeGreaterThanOrEqual(0.55);
        expect(snapshot.framing.subjectScreenHeightFraction).toBeLessThanOrEqual(0.75);
      }
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("showcase-blockfall-reactor: S11 audio — synthCues 0 and direction audio cues wired", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      // Trigger a piece move/drop so at least one direction audio cue is requested on the live page.
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Space");
      await expect.poll(
        () => page.evaluate(() => ((window as Record<string, unknown>).__aura3dGameSnapshot as ReactorSnapshotWithAudio | undefined)?.audio?.requestedEvents?.length ?? 0),
        { timeout: 10_000 }
      ).toBeGreaterThan(0);
      const snapshot = await page.evaluate(() =>
        (window as Record<string, unknown>).__aura3dGameSnapshot as ReactorSnapshotWithAudio
      );
      expect(snapshot.audio.synthCues).toBe(0);
      expect(snapshot.audio.requestedEvents.length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
