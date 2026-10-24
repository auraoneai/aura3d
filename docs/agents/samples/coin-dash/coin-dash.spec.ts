import { expect, test } from "@playwright/test";

test("coin dash is deterministic and renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?manual=1&seed=7");
  await page.waitForFunction(() => (window as unknown as { __AURA_COIN_DASH__?: { ready(): boolean } }).__AURA_COIN_DASH__?.ready() === true);
  const run = () => page.evaluate(() => {
    const qa = (window as unknown as { __AURA_COIN_DASH__: { reset(seed?: number): void; stepFrames(n: number): void; state(): unknown } }).__AURA_COIN_DASH__;
    qa.reset(7);
    qa.stepFrames(600);
    return qa.state();
  });
  expect(await run()).toEqual(await run());
  expect(errors).toEqual([]);
});
