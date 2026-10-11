/**
 * capture-parity.spec.ts (PRD-09 §15): `lookSignature(game)` at the default
 * URL equals the signature at every `?scenario=` URL and at `?capture=review`
 * — capture params must never change the authored look. The engine-level
 * `app.lookSignature()` (CCR-09-1) is not installed on the app yet; its parity
 * test lands with it (a capability-detected early return here passed vacuously).
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
});
