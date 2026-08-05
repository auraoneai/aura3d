import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A paused app must hold its frame, including time-driven rendering.
 *
 * `pause()` gated the simulation callback (`beforeRender`) but not the render clock, so particle
 * emitters, animated materials and anything else keyed to elapsed time carried on advancing. The frame
 * was never actually held.
 *
 * Measured on the particle lab, app paused *and* settled to a fixed frame: two screenshots 500 ms
 * apart in the **same page load** differed across 20.6% of the vortex region. After pinning the paused
 * render clock to the last simulated frame, the same comparison is byte-identical, and cross-load
 * difference over the particle region fell to exactly 0.
 *
 * This is asserted structurally because the behaviour lives in a WebGL render loop that a unit test
 * cannot drive; the browser proof is `showcase-library.spec.ts`, which now produces 27 of 30
 * byte-identical screenshots across runs (was 15 of 30).
 */
const SOURCE = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");

describe("paused apps hold their render clock", () => {
  it("the production render loop renders at a paused clock, not wall-clock time", () => {
    // The defect was `renderer.render(time)` unconditionally, with `time` from requestAnimationFrame.
    expect(SOURCE).toContain("const renderTime = isPaused() ? pausedRenderTime() : time;");
    expect(SOURCE).toContain("const drawCalls = renderer.render(renderTime);");
  });

  it("label reprojection uses the same clock as the draw", () => {
    // Labels reproject against the renderer camera; using a different clock would desync them from
    // the frame they annotate.
    expect(SOURCE).toContain("labelLayer.update(renderer.viewProjection(renderTime));");
  });

  it("the app supplies its own simulated clock for paused frames", () => {
    // `runtimeTime` is advanced only by `step()`/live frames, so a paused frame is reproducible.
    expect(SOURCE).toContain("() => runtimeTime * 1000");
  });

  it("step() renders at simulated time in both render paths", () => {
    // Determinism requires the canvas2d and production paths to agree about what `step` means.
    expect(SOURCE).toContain("const simulatedMs = runtimeTime * 1000;");
    expect(SOURCE).toContain("productionController.render(simulatedMs);");
  });

  it("both render paths restore lastTime around an explicit render", () => {
    // Otherwise the first live frame after resume() computes its delta against a different clock.
    const occurrences = SOURCE.split("lastTime = previousLastTime;").length - 1;
    expect(occurrences).toBe(2);
  });
});
