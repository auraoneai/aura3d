import { describe, expect, it } from "vitest";
import { SIDEWALK_Y, WALKERS, WALKER_CLIPS, WALKER_WINDOW, walkerPose } from "../../../apps/showcase-teleoperator/src/walkers";
import { idolClipRig, maxTravel } from "./idolClipDispatch";

describe("Grid Dispatch Idol sidewalk walkers (render only)", () => {
  it("stay on the sidewalks, inside the window around the car, and advance along the street over time", () => {
    expect(WALKERS.length).toBe(12);
    expect(WALKERS.some((w) => w.idle)).toBe(true);
    expect(SIDEWALK_Y).toBeCloseTo(0.18, 6);
    for (const carZ of [0, -137.5, -1200]) {
      for (const w of WALKERS) {
        const a = walkerPose(w, 4, carZ), b = walkerPose(w, 4.4, carZ);
        expect(Math.abs(a.x)).toBeGreaterThanOrEqual(13.5); // behind the trees (12.2 m) and the kerb (10.8 m)
        expect(Math.abs(a.x)).toBeLessThanOrEqual(16); // in front of the building fronts (19.5 m)
        expect(a.z).toBeGreaterThan(carZ + WALKER_WINDOW[0] - 1e-6);
        expect(a.z).toBeLessThanOrEqual(carZ + WALKER_WINDOW[1] + 1e-6);
        expect(walkerPose(w, 4, carZ)).toEqual(a);
        if (w.idle) expect(b.z).toBe(a.z);
        else {
          const step = Math.abs(b.z - a.z);
          // 0.46-0.58 m per 0.4 s, unless the walker wrapped round the window in that step
          expect(step > 0.4 || step > 100, `walker moves (${step})`).toBe(true);
          expect(a.clip).toBe(WALKER_CLIPS.walk);
        }
      }
    }
  });

  it("the shared walker GLB plays its walk clip through the engine's per-frame dispatch (bones move, arms hang)", async () => {
    const r = await idolClipRig("apps/showcase-teleoperator/assets/idol/gdWalkerA.glb");
    const spec = { clip: WALKER_CLIPS.walk, loop: true, speed: 1 };
    let ms = 5000;
    let f = r.frame(spec, ms);
    const advance = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) f = r.frame(spec, (ms += 1000 / 60)); return f; };
    const a = advance(1);
    for (const d of r.handDrop(a)) expect(d).toBeGreaterThan(0.2);
    const b = advance(0.4);
    expect(maxTravel(a, b)).toBeGreaterThan(0.03);
  }, 60_000);
});
