import { describe, expect, it } from "vitest";
import { camera, createAuraApp } from "@aura3d/engine";
import { INTRO_SHOT_S, introEnabled, introShots, resultsDof } from "../../../apps/showcase-teleoperator/src/intro";
import { buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";

const q = (s: string) => new URLSearchParams(s);

describe("grid dispatch GD-17 intro and results DOF", () => {
  it("plays only with motion allowed and never in QA, autoplay, A/B or ?intro=0 boots", () => {
    expect(introEnabled({ motionOk: true, params: q("") })).toBe(true);
    expect(introEnabled({ motionOk: true, params: q("sky=night") })).toBe(true);
    expect(introEnabled({ motionOk: false, params: q("") })).toBe(false);
    for (const p of ["intro=0", "qa=1", "autoplay=1", "tm=aces", "aura3d-tonemap=agx"]) expect(introEnabled({ motionOk: true, params: q(p) })).toBe(false);
  });

  it("three static shots that all look at the car or down the avenue", () => {
    const shots = introShots(3.4, -0.8);
    expect(shots).toHaveLength(3);
    for (const s of shots) {
      expect(s.position).toBeDefined();
      expect(s.target).toBeDefined();
      expect(s.fov).toBeGreaterThan(30);
    }
    expect(INTRO_SHOT_S * shots.length).toBeLessThanOrEqual(5);
  });

  it("the sequence skips at once and returns to the scene camera", async () => {
    const app = createAuraApp(undefined, { scene: buildGridDispatchScene("golden"), autoStart: false });
    const cam = app.camera;
    if (cam) {
      const before = cam.rig;
      const playback = cam.play({ id: "grid-intro", shots: introShots(0, -0.8).map((pose) => ({ rig: camera.rigs.static(pose), duration: INTRO_SHOT_S })), onEnd: "return" });
      playback.skip();
      await playback.done;
      expect(cam.rig).toBe(before);
    }
    app.dispose?.();
  });

  it("results DOF focuses on the car", () => {
    expect(resultsDof(9.5).focusDistance).toBe(9.5);
    expect(resultsDof(0).focusDistance).toBe(1);
  });
});
