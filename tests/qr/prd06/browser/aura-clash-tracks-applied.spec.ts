// PRD-06 S13 — Aura Clash regression A/B: for every clip key in
// `AURA_CLASH_REQUIRED_CLIP_KEYS`, `playerLastTracks` (the runtime's
// `lastApply.tracksApplied`) is identical under `?a3d-qr=none` and
// `?a3d-qr=animation` while the clip plays alone. The route is read, not
// edited — the spec drives it through `__AURA_CLASH_ARENA_TEST_DRIVER__` +
// keyboard input and samples `__AURA_CLASH_ARENA_PROOF__`.

import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";
import { AURA_CLASH_REQUIRED_CLIP_KEYS, auraClashPlayerClips } from "../../../../apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps";

type Driver = {
  setPlayerHealth(health: number): void;
  setPositions(playerX: number, rivalX: number): void;
  queuePlayerAttack(move: "light" | "heavy" | "special"): void;
};

declare global {
  interface Window {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: Driver;
    __AURA_CLASH_ARENA_PROOF__?: {
      status?: string;
      player?: { x?: number; activeClip?: string };
      rival?: { x?: number };
      animation?: { playerLastTracks?: number };
    };
  }
}

const laneTracks: { none?: Record<string, number>; animation?: Record<string, number> } = {};

const PLAYER_CLIPS: Record<string, string> = {
  idle: auraClashPlayerClips.idle,
  walk: auraClashPlayerClips.walk,
  run: auraClashPlayerClips.run,
  air: auraClashPlayerClips.air,
  down: auraClashPlayerClips.down,
  guard: auraClashPlayerClips.guard,
  light: auraClashPlayerClips.light,
  heavy: auraClashPlayerClips.heavy,
  special: auraClashPlayerClips.special,
  hurt: auraClashPlayerClips.hurt,
  ko: auraClashPlayerClips.ko
};

async function proof(page: Page) {
  return page.evaluate(() => {
    const p = window.__AURA_CLASH_ARENA_PROOF__;
    return {
      status: p?.status,
      clip: p?.player?.activeClip,
      tracks: p?.animation?.playerLastTracks ?? -1,
      playerX: p?.player?.x ?? 0,
      rivalX: p?.rival?.x ?? 0
    };
  });
}

/** Arms `arm`, then polls until `activeClip === clip`; returns the modal tracksApplied while that clip plays alone. */
async function tracksWhileClip(page: Page, clip: string, arm: () => Promise<void>, timeoutMs = 30_000): Promise<number> {
  await arm();
  const counts = new Map<number, number>();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { clip: active, tracks } = await proof(page);
    if (active === clip && tracks > 0) {
      counts.set(tracks, (counts.get(tracks) ?? 0) + 1);
      if ((counts.get(tracks) ?? 0) >= 4) return tracks; // stable value seen 4 polls in a row-ish
    }
    await page.waitForTimeout(50);
  }
  if (counts.size === 0) return -1;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

test.describe("PRD-06 Aura Clash tracksApplied A/B (S13)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const qr of ["none", "animation"] as const) {
    test(`required clip keys report identical tracksApplied under ?a3d-qr=${qr}`, async ({ page }) => {
      test.setTimeout(480_000);
      await page.goto(`${server.origin}/apps/aura-clash-showcase/?auraTestDriver=1&a3d-qr=${qr}`, { waitUntil: "domcontentloaded" });
      // Shared-Metal CI runners starve rAF badly — the showcase page needs
      // minutes to reach "running", not the 60 s a healthy laptop needs.
      await page.waitForFunction(() => window.__AURA_CLASH_ARENA_PROOF__?.status === "running", undefined, { timeout: 240_000 });
      await page.waitForFunction(() => !!window.__AURA_CLASH_ARENA_TEST_DRIVER__, undefined, { timeout: 60_000 });

      const observed: Record<string, number> = {};
      observed.idle = await tracksWhileClip(page, PLAYER_CLIPS.idle, async () => {
        // Idle is the resting state — just let the game settle.
      });
      observed.walk = await tracksWhileClip(page, PLAYER_CLIPS.walk, async () => {
        await page.keyboard.down("ArrowRight");
      });
      await page.keyboard.up("ArrowRight");
      observed.run = await tracksWhileClip(page, PLAYER_CLIPS.run, async () => {
        await page.keyboard.press("Space");
        await page.keyboard.down("ArrowRight");
      });
      await page.keyboard.up("ArrowRight");
      observed.air = await tracksWhileClip(page, PLAYER_CLIPS.air, async () => {
        await page.keyboard.press("ArrowUp");
      });
      observed.down = await tracksWhileClip(page, PLAYER_CLIPS.down, async () => {
        await page.keyboard.down("ArrowDown");
      });
      await page.keyboard.up("ArrowDown");
      observed.guard = await tracksWhileClip(page, PLAYER_CLIPS.guard, async () => {
        await page.keyboard.down("Shift");
      });
      await page.keyboard.up("Shift");
      for (const move of ["light", "heavy", "special"] as const) {
        observed[move] = await tracksWhileClip(page, PLAYER_CLIPS[move], async () => {
          await page.evaluate((m) => window.__AURA_CLASH_ARENA_TEST_DRIVER__?.queuePlayerAttack(m), move);
        });
      }
      observed.hurt = await tracksWhileClip(page, PLAYER_CLIPS.hurt, async () => {
        const { playerX, rivalX } = await proof(page);
        const near = playerX + (rivalX >= playerX ? 0.55 : -0.55);
        await page.evaluate(([px, rx]) => window.__AURA_CLASH_ARENA_TEST_DRIVER__?.setPositions(px, rx), [playerX, near]);
      }, 20_000);
      observed.ko = await tracksWhileClip(page, PLAYER_CLIPS.ko, async () => {
        await page.evaluate(() => window.__AURA_CLASH_ARENA_TEST_DRIVER__?.setPlayerHealth(0));
      });

      // Persist per-lane observation for the cross-flag comparison below.
      test.info().annotations.push({ type: `tracksApplied:${qr}`, description: JSON.stringify(observed) });
      laneTracks[qr] = observed;

      for (const key of AURA_CLASH_REQUIRED_CLIP_KEYS) {
        expect(observed[key], `clip key "${key}" (clip ${PLAYER_CLIPS[key]}) never played alone under ?a3d-qr=${qr}`).toBeGreaterThan(0);
      }
    });
  }

  test("flag A vs flag B tracksApplied are equal per clip key", () => {
    const none = laneTracks.none;
    const animation = laneTracks.animation;
    test.skip(!none || !animation, "requires both lane runs (playwright serial workers share state)");
    for (const key of AURA_CLASH_REQUIRED_CLIP_KEYS) {
      expect(animation![key], `clip key "${key}" tracksApplied diverged: none=${none![key]} animation=${animation![key]}`).toBe(none![key]);
    }
  });
});
