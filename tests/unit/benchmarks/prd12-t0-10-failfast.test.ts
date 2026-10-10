/**
 * T0-10 (PRD-16 §2): the aura3d scene-adapter draw wait fails fast.
 *
 * The regression this guards: pipeline 2926601350 burned 240 s per scene on
 * mounts that could never render, and a "ready"-with-zero-draws payload let
 * the red truth look green. A forced mount failure must throw (→ the page
 * publishes __QR_ERROR__) in well under 2 s.
 */
import { describe, expect, it } from "vitest";
import {
  adapterBudgetMs,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  NoDrawError,
  waitForFirstDraw
} from "../../../benchmarks/quality-rebuild/aura3d/lib/failfast";

const noSleep = () => Promise.resolve();

function fakeApp(diagnostics: () => { drawCalls: number; errors: readonly unknown[] }) {
  return { step: () => undefined, diagnostics };
}

describe("T0-10 fail-fast draw wait", () => {
  it("a forced mount failure throws NoDrawError in < 2 s", async () => {
    const app = fakeApp(() => ({
      drawCalls: 0,
      errors: [new Error("AuraMigrationError: renderer.mode is not a public surface")]
    }));
    const started = performance.now();
    await expect(waitForFirstDraw(app, 90_000, noSleep)).rejects.toBeInstanceOf(NoDrawError);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("the thrown error names the recorded renderer errors", async () => {
    const app = fakeApp(() => ({ drawCalls: 0, errors: ["mount failed: backend unreachable"] }));
    await expect(waitForFirstDraw(app, 90_000, noSleep)).rejects.toThrow(/mount-failed:.*backend unreachable/);
  });

  it("a silent deadline with zero draws throws a no-draw-timeout NoDrawError", async () => {
    const app = fakeApp(() => ({ drawCalls: 0, errors: [] }));
    await expect(waitForFirstDraw(app, 60)).rejects.toThrow(/no-draw-timeout/);
    await expect(waitForFirstDraw(app, 60)).rejects.toBeInstanceOf(NoDrawError);
  });

  it("a scene that draws returns normally even if errors were recorded", async () => {
    const app = fakeApp(() => ({ drawCalls: 3, errors: ["non-fatal warning escalated"] }));
    await expect(waitForFirstDraw(app, 90_000, noSleep)).resolves.toBeUndefined();
  });

  it("adapterBudgetMs is 0.8 × the capture timeout, min 1 s", () => {
    expect(adapterBudgetMs(DEFAULT_CAPTURE_TIMEOUT_MS)).toBe(192_000);
    expect(adapterBudgetMs(1_000)).toBe(1_000);
    expect(adapterBudgetMs(500)).toBe(1_000);
  });
});
