import { expect, test } from "@playwright/test";

test("accessibility route exposes keyboard and reduced-motion proof", async ({ page }) => {
  await page.goto("/accessibility/");
  await expect(page.getByRole("button", { name: /Shift Block/i })).toBeVisible();
  await page.keyboard.down("ShiftLeft");
  await expect.poll(async () => page.evaluate(() => {
    const proof = (window as typeof window & {
      __AURA_CLASH_ARENA_PROOF__?: { player?: { action?: string; activeClip?: string } };
    }).__AURA_CLASH_ARENA_PROOF__;
    return `${proof?.player?.action ?? "missing"}:${proof?.player?.activeClip ?? "missing"}`;
  })).toMatch(/guard:.*(Sword_Idle|Guard|Block)/i);
  await page.keyboard.up("ShiftLeft");
});
