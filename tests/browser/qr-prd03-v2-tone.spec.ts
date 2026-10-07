import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 Phase-2 / CCR-03-5: the v2 present evaluates the tone operator
 * exactly once per pixel. An emissive HDR ladder (E ∈ {0.25…8}) rendered
 * flag-on with `output.toneMapping: "aces"` must land within 1 LSB of
 * `applyToneOperator("aces", E)` — a double eval compresses midtones far
 * past that bound — and the route must report `post.pipeline === "v2"`.
 * Remote gate: GitLab macOS browser lane.
 */

interface ToneResult {
  perStep: number[];
  expected: number[];
  pipeline: string | null;
  error?: string;
}

test.describe("PRD-03 Phase 2 — v2 single tone-operator eval", () => {
  let server: ExampleDevServer;
  let tone: ToneResult;

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-phase2-harness.html`);
    const result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Phase2?: () => Promise<{ tone: ToneResult }> }).runQrPrd03Phase2!;
      return (await run()).tone;
    });
    tone = result;
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("HDR ladder through the v2 route matches ToneOperators.aces within 1 LSB per step", () => {
    expect(tone.error ?? null).toBeNull();
    expect(tone.pipeline).toBe("v2");
    expect(tone.perStep.length).toBe(tone.expected.length);
    tone.perStep.forEach((measured, i) => {
      expect(Math.abs(measured - tone.expected[i]!), `step ${i}`).toBeLessThanOrEqual(1);
    });
  });
});
