import { expect, test, type Page } from "@playwright/test";

/**
 * Aura Clash (createGame + createFightingGameKit) coverage.
 *
 * Single-path: `src/main.ts` boots directly at `/`. Assertions read the
 * route's own evidence surface — `__AURA3D_GAME__` plus
 * `__AURA3D_GAME_EVIDENCE__["aura-clash-showcase"]` (playback / framing /
 * combat / animation sections).
 * Run serially (`--workers=1`): the kit's opponent AI and clip clocks are
 * real-time.
 */
const V2_URL = "/";

interface V2FighterAnim {
  bound: boolean;
  state: string;
  activeClip: string | null;
  clipTime: number | null;
  appliedClipId: string | null;
  readinessOk: boolean;
  missingClips: string[];
}
interface V2Evidence {
  playback: { frame: number; paused: boolean };
  framing: { subjectScreenHeightFraction: number | null };
  combat: { health: { p1: number | null; p2: number | null }; states: { player: string; opponent: string } };
  animation: { p1: V2FighterAnim; p2: V2FighterAnim; readinessOk: boolean } | null;
}

async function readEvidence(page: Page): Promise<V2Evidence> {
  return page.evaluate(() => {
    const all = (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> })
      .__AURA3D_GAME_EVIDENCE__;
    const ev = all?.["aura-clash-showcase"] as V2Evidence | undefined;
    if (!ev) throw new Error("v2 evidence not published");
    // Evidence sections are live getters; materialize a plain snapshot.
    return JSON.parse(JSON.stringify({
      playback: ev.playback, framing: ev.framing, combat: ev.combat, animation: ev.animation
    })) as V2Evidence;
  });
}

async function loadV2(page: Page): Promise<V2Evidence> {
  await page.goto(V2_URL);
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __AURA3D_GAME__?: { route?: string };
      __AURA3D_GAME_EVIDENCE__?: Record<string, { playback?: { frame?: number } }>;
    };
    return w.__AURA3D_GAME__?.route === "aura-clash-showcase"
      && (w.__AURA3D_GAME_EVIDENCE__?.["aura-clash-showcase"]?.playback?.frame ?? 0) > 0;
  }, null, { timeout: 30_000 });
  return readEvidence(page);
}

test.describe("Aura Clash v2 fighting", () => {
  test("boots framed: route beacon, advancing frames, fighters in frame", async ({ page }) => {
    const first = await loadV2(page);
    expect(first.combat.health.p1).toBeGreaterThan(0);
    expect(first.combat.health.p2).toBeGreaterThan(0);
    await expect(page.locator("canvas")).toBeVisible();
    await expect.poll(async () => (await readEvidence(page)).playback.frame)
      .toBeGreaterThan(first.playback.frame);
    // Fighting rig solves ~0.25 frame-height per fighter (recipe band 0.2–0.3).
    await expect.poll(async () => (await readEvidence(page)).framing.subjectScreenHeightFraction ?? 0)
      .toBeGreaterThanOrEqual(0.2);
    const framed = await readEvidence(page);
    expect(framed.framing.subjectScreenHeightFraction ?? 1).toBeLessThanOrEqual(0.3);
    expect(framed.playback.paused).toBe(false);
  });

  test("idle clips play and advance on both rigs from exact GLB clip names", async ({ page }) => {
    const ev = await loadV2(page);
    expect(ev.animation, "v2 evidence must publish the animation section").not.toBeNull();
    expect(ev.animation!.readinessOk).toBe(true);
    expect(ev.animation!.p1.missingClips).toEqual([]);
    expect(ev.animation!.p2.missingClips).toEqual([]);
    await expect.poll(async () => (await readEvidence(page)).animation!.p1.bound).toBe(true);
    await expect.poll(async () => (await readEvidence(page)).animation!.p1.activeClip).toBe("Idle_Loop");
    await expect.poll(async () => (await readEvidence(page)).animation!.p2.activeClip)
      .toBe("Idle_FoldArms_Loop");
    // Motion probe: clip-local time for the looping idle must move.
    const t0 = (await readEvidence(page)).animation!.p1.clipTime ?? 0;
    await expect.poll(async () => {
      const a = (await readEvidence(page)).animation!.p1;
      return a.activeClip === "Idle_Loop" ? Math.abs((a.clipTime ?? 0) - t0) : 0;
    }).toBeGreaterThan(0.02);
  });

  test("walk input switches the player to the walk clip", async ({ page }) => {
    await loadV2(page);
    await page.keyboard.down("KeyD");
    await expect.poll(async () => (await readEvidence(page)).animation!.p1.activeClip)
      .toBe("Walk_Loop");
    await page.keyboard.up("KeyD");
  });

  test("attack intent plays an attack clip and reduces opponent health", async ({ page }) => {
    test.setTimeout(90_000);
    const start = await loadV2(page);
    const startHealth = start.combat.health.p2 ?? 100;
    let sawAttackClip = false;
    // Close distance, strike, repeat — the kit AI guards/retreats at random,
    // so poll the real health readout instead of assuming one swing lands.
    await expect.poll(async () => {
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(140);
      await page.keyboard.up("KeyD");
      await page.keyboard.press("KeyJ");
      await page.waitForTimeout(120);
      const ev = await readEvidence(page);
      if (ev.animation!.p1.activeClip === "Punch_Jab") sawAttackClip = true;
      return ev.combat.health.p2 ?? startHealth;
    }, { timeout: 60_000, intervals: [50] }).toBeLessThan(startHealth);
    expect(sawAttackClip, "light attack should surface the Punch_Jab clip").toBe(true);
    const after = await readEvidence(page);
    expect(after.combat.health.p2 ?? 100).toBeGreaterThanOrEqual(0);
  });
});
