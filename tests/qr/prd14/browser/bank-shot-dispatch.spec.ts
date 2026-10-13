import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Bank Shot, plus the single-path
 * S2/S6/S7 rows write-evidence.mjs maps to this spec's titled tests
 * (`boots to playing`, `appliedLook`, `framing`). Successor of the retired
 * bank-shot-dispatch (T1.10 flag arms), showcase-bank-shot-framing and
 * showcase-bank-shot-v2 specs — those were the gate-surgery control group
 * proving the dual-path rows; the B4 PORT rebuilt the route single-path
 * (src/main.ts boots every URL, salvaged src/gameplay rules/table verbatim)
 * and deleted the legacy/v2 dispatcher they exercised, so there are no
 * flags to dispatch on. The `-dispatch` filename is retained only because
 * the lane's S-category matching keys on it. The 16-ball Rapier browser
 * assertions from the retired specs (rapier backend, 16 live balls, aim,
 * strike, resolve, hash-identical reset) live in
 * apps/showcase-bank-shot/tests/playable.spec.ts. S11 has no test here:
 * single-path S11 stays "missing" in write-evidence.mjs by design.
 */

const APP_DIR = "showcase-bank-shot";

type BankSnapshot = {
  framed: boolean;
  frame: number;
  state: string;
  look: { id: string };
  table: { backend: string; ballsRemaining: number };
  balls: { liveCount: number };
  drawCalls: number;
};

async function snapshotOf(page: import("@playwright/test").Page): Promise<BankSnapshot> {
  return page.evaluate(() =>
    (window as Record<string, unknown>).__aura3dGameSnapshot as BankSnapshot);
}

async function bootFramed(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() => snapshotOf(page).then((s) => s?.framed), { timeout: 30_000 }).toBe(true);
}

test.describe("bank-shot single-path boot (S1)", () => {
  test("boots framed with a sized canvas and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.framed).toBe(true);
      expect(snapshot.balls.liveCount).toBe(16);
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

  // S2 (single-path): createGame start() drives booting -> playing; the
  // published state behind it is a framed rapier table in `aiming` with
  // 16 live balls and an advancing frame counter.
  test("boots to playing: framed rapier table aiming with 16 live balls", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const first = await snapshotOf(page);
      expect(first.table.backend).toBe("rapier");
      expect(first.state).toBe("aiming");
      expect(first.balls.liveCount).toBe(16);
      expect(first.table.ballsRemaining).toBe(15);
      await expect.poll(() => snapshotOf(page).then((s) => s.frame), { timeout: 30_000 })
        .toBeGreaterThan(first.frame);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S6 (single-path): no scenario URLs to parity-check; the one boot path
  // publishes its authored look recipe id in every snapshot while frames
  // are being submitted. (No engine look preset is applied — the pendant
  // spot recipe is route-authored in src/main.ts.)
  test("appliedLook resolves to bank-shot-pendant on the live page", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootFramed(page, url);
      const snapshot = await snapshotOf(page);
      expect(snapshot.look.id).toBe("bank-shot-pendant");
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  // S7 (single-path): the fixed overhead rig reaches `framed` with all
  // 16 balls live at both viewports the retired framing spec sampled.
  // Split into separate desktop and mobile test() blocks so WebKit does
  // not run a second page.goto() in the same WebGL2 page context.
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
      expect(snapshot.balls.liveCount).toBe(16);
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
      expect(snapshot.balls.liveCount).toBe(16);
      expect(snapshot.drawCalls).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
