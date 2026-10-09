/**
 * capture-parity.spec.ts (PRD-09 §15): `lookSignature(game)` at the default
 * URL equals the signature at every `?scenario=` URL and at `?capture=review`
 * — capture params must never change the authored look. When CCR-09-1 lands
 * the same check also runs on `app.lookSignature()` (capability-detected).
 */
import { expect, test, loadHarness, withServer, type Page } from "./support";

async function signatureAt(page: Page, server: { origin: string }, query: string): Promise<string> {
  await loadHarness(page, server as never, query);
  return page.evaluate(async () => {
    const g = window.__AURA3D_SHELL__!.game as { lookSignature: () => Promise<string> };
    return g.lookSignature();
  });
}

withServer((getServer) => {
  const queries = ["", "?scenario=pot", "?scenario=light-hit", "?scenario=frozen", "?capture=review", "?scenario=frozen&freezeAt=2&evidence=1"];

  for (const query of queries) {
    test(`look signature parity at "${query || "default"}"`, async ({ page }) => {
      const baseline = await signatureAt(page, getServer(), "");
      const actual = await signatureAt(page, getServer(), query);
      expect(actual, `signature drift at ${query || "default"}`).toBe(baseline);
    });
  }

  test("app.lookSignature parity when CCR-09-1 is present", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen");
    const supported = await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as { app: { lookSignature?: () => Promise<string> } };
      return typeof g.app.lookSignature === "function";
    });
    if (!supported) {
      // CCR-09-1 not merged yet — the @aura3d/game/capture path above is the gate.
      return;
    }
    const baseline = await page.evaluate(async () => {
      const g = window.__AURA3D_SHELL__!.game as { app: { lookSignature: () => Promise<string> } };
      return g.app.lookSignature();
    });
    await loadHarness(page, getServer(), "?capture=review");
    const review = await page.evaluate(async () => {
      const g = window.__AURA3D_SHELL__!.game as { app: { lookSignature: () => Promise<string> } };
      return g.app.lookSignature();
    });
    expect(review).toBe(baseline);
  });
});
