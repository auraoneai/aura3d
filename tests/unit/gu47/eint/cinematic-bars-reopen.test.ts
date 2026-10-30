import { describe, expect, it } from "vitest";
import * as root from "../../../../packages/engine/src/public/index";
import { createCinematicBarsLayer } from "../../../../packages/engine/src/agent-api/camera/layers/cinematicBars";

// GU47 pass 4 (g05): the letterbox layer is a root export and eases back in after release().
const step = (layer: ReturnType<typeof createCinematicBarsLayer>, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) layer.apply({} as never, { dt: 0.1 } as never);
};

describe("cinematic bars layer (pass 4)", () => {
  it("is exported from the root", () => {
    expect(root.createCinematicBarsLayer).toBe(createCinematicBarsLayer);
  });

  it("re-opens after release", () => {
    const bars = createCinematicBarsLayer({ easeSeconds: 0.5 });
    step(bars, 1);
    const full = bars.barFraction;
    expect(full).toBeGreaterThan(0.1);
    bars.release();
    step(bars, 1);
    expect(bars.barFraction).toBeCloseTo(0, 9);
    bars.open();
    step(bars, 1);
    expect(bars.barFraction).toBeCloseTo(full, 6);
  });
});
