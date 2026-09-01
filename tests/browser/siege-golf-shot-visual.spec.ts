import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Siege Golf shot visual evidence (PRD SG-13): a strike must move the ball
 * through the scene and visibly react on the structure - proven with real
 * composited pixels (before/after SHA differ) plus live state telemetry.
 */

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __SIEGE_GOLF_EVIDENCE__?: unknown }).__SIEGE_GOLF_EVIDENCE__),
    undefined,
    { timeout: 180_000 }
  );
}

function shaOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

test("a full-power drive leaves the tee and visibly reacts the stack", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const shotDir = testInfo.outputPath("shot-visual");
  mkdirSync(shotDir, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-siege-golf/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    // Let the stacking transient settle so the before-frame is the authored pose.
    await page.waitForTimeout(1200);
    const before = await page.screenshot({ timeout: 120_000 });
    mkdirSync(shotDir, { recursive: true });
    writeFileSync(join(shotDir, "before.png"), before);
    // Frame-rate-dependent charge means one hold may undercharge; drive until
    // the structure provably reacts (or the hole completes).
    let mid = await page.screenshot({ timeout: 120_000 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ev = await page.evaluate(() => (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { targetsDown?: number; strokes?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__ ?? {});
      if (Number(ev.targetsDown ?? 0) >= 1 || ev.state === "hole-complete") break;
      if (Number(ev.strokes ?? 0) > attempt && attempt > 0) {
        await page.waitForFunction((seen: number) => {
          const e = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
          return Number(e?.strokes ?? 99) === seen && e?.state !== "simulating";
        }, Number(ev.strokes ?? 0), { timeout: 90_000 });
        continue;
      }
      // Full-charge hold first; if registration is dropped by frame
      // starvation, chip taps keep the attempt moving (weaker but visible).
      await page.keyboard.down("Space");
      await page.waitForTimeout(1500);
      await page.keyboard.up("Space");
      try {
        await page.waitForFunction((expected: number) => {
          const e = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number } }).__SIEGE_GOLF_EVIDENCE__;
          return Number(e?.strokes ?? 0) >= expected;
        }, attempt + 1, { timeout: 20_000 });
      } catch {
        for (let tap = 0; tap < 6; tap += 1) {
          await page.keyboard.press("Space");
          try {
            await page.waitForFunction((expected: number) => {
              const e = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number } }).__SIEGE_GOLF_EVIDENCE__;
              return Number(e?.strokes ?? 0) >= expected;
            }, attempt + 1, { timeout: 15_000 });
            break;
          } catch { /* next tap */ }
        }
      }
      await page.waitForTimeout(900);
      mid = await page.screenshot({ timeout: 120_000 });
    }
    // Playwright may prune a prior test's output tree while a long-running
    // multi-spec suite is still producing this test's artifacts. Reassert the
    // owned leaf before every write so evidence generation is order-stable.
    mkdirSync(shotDir, { recursive: true });
    writeFileSync(join(shotDir, "mid.png"), mid);
    // Wait for the structure reaction to resolve.
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { targetsDown?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.targetsDown ?? 0) >= 1 || ev?.state === "hole-complete";
    }, undefined, { timeout: 60_000 });
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { dustBurstCount?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.dustBurstCount ?? 0) > 0;
    }, undefined, { timeout: 15_000 });
    const after = await page.screenshot({ timeout: 120_000 });
    mkdirSync(shotDir, { recursive: true });
    writeFileSync(join(shotDir, "after.png"), after);
    const beforeSha = shaOf(before);
    const midSha = shaOf(mid);
    const afterSha = shaOf(after);
    const evidence = {
      beforeSha,
      midSha,
      afterSha,
      midDiffersFromBefore: midSha !== beforeSha,
      afterDiffersFromBefore: afterSha !== beforeSha,
      bytesBefore: before.byteLength,
      bytesMid: mid.byteLength,
      bytesAfter: after.byteLength,
      dust: await page.evaluate(() => {
        const e = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { dustBurstCount?: number; activeDustPuffs?: number } }).__SIEGE_GOLF_EVIDENCE__;
        return { bursts: Number(e?.dustBurstCount ?? 0), active: Number(e?.activeDustPuffs ?? 0) };
      })
    };
    mkdirSync(shotDir, { recursive: true });
    writeFileSync(join(shotDir, "pixel-delta.json"), JSON.stringify(evidence, null, 2));
    expect(evidence.midDiffersFromBefore, "mid-flight frame must differ from the pre-shot frame").toBe(true);
    expect(evidence.afterDiffersFromBefore, "post-topple frame must differ from the pre-shot frame").toBe(true);
    expect(evidence.dust.bursts, "a real material impact must trigger restrained scene dust").toBeGreaterThan(0);
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});
