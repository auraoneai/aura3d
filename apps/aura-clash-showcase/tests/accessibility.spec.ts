import { expect, test } from "@playwright/test";

test("accessibility route exposes keyboard and reduced-motion proof", async ({ page }) => {
  await page.goto("/accessibility/");
  // The guard control is labelled "Shift / Q Block" because guard binds ShiftLeft, ShiftRight, and
  // KeyQ. The previous `/Shift Block/i` pattern could never match that label, so this assertion had
  // been failing rather than proving anything. Matched on the stable `data-hold="guard"` binding
  // plus the visible text, so relabelling the key hint cannot silently break the check again.
  const guardButton = page.locator('button[data-hold="guard"]');
  await expect(guardButton).toBeVisible();
  await expect(guardButton).toHaveText(/Block/i);
  await page.keyboard.down("ShiftLeft");
  await expect.poll(async () => page.evaluate(() => {
    const proof = (window as typeof window & {
      __AURA_CLASH_ARENA_PROOF__?: { player?: { action?: string; activeClip?: string } };
    }).__AURA_CLASH_ARENA_PROOF__;
    return `${proof?.player?.action ?? "missing"}:${proof?.player?.activeClip ?? "missing"}`;
  })).toMatch(/guard:.*(Sword_Idle|Guard|Block)/i);
  await page.keyboard.up("ShiftLeft");
});
