import { expect, test } from "@playwright/test";
import { loadAuraClashArena } from "./helpers/auraClashArenaHarness";

test("Aura Clash exports a stable KO/timer/full-round replay across three browser runs", async ({ browser }) => {
  test.setTimeout(90_000);
  const proofs = [];

  for (let index = 0; index < 3; index += 1) {
    const page = await browser.newPage();
    try {
      proofs.push(await loadAuraClashArena(page));
    } finally {
      await page.close();
    }
  }

  const [first, second, third] = proofs.map((proof) => proof.deterministicReplay);

  expect(first.stable).toBe(true);
  expect(first.finalHash).toBe(first.repeatedFinalHash);
  expect(second.finalHash).toBe(first.finalHash);
  expect(third.finalHash).toBe(first.finalHash);
  expect(second.exportedReplay.checksum).toBe(first.exportedReplay.checksum);
  expect(third.exportedReplay.checksum).toBe(first.exportedReplay.checksum);
  expect(first.finalSnapshot).toMatchObject({
    rivalHp: 0,
    ko: true
  });
  expect(first.finalSnapshot.hits).toBeGreaterThanOrEqual(20);
  expect(first.finalSnapshot.roundTime).toBeGreaterThan(0);
  expect(first.finalSnapshot.roundTime).toBeLessThan(99);
});
