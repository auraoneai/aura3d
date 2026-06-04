import { describe, expect, it } from "vitest";
import { createCinematicDirector } from "../../../packages/ai-scene/src";
import { createNeonAlleyIR } from "./fixtures";

describe("Aura cinematic director", () => {
  it("maps cinematic language into deterministic camera, lighting, timeline, and VFX plans", () => {
    const director = createCinematicDirector();
    const ir = {
      ...createNeonAlleyIR(),
      brief: "Rainy neon alley with a slow dolly camera, blue rim light, wet pavement, fog, and a 12-second emotional reveal."
    };

    const first = director.plan(ir);
    const second = director.plan(ir);

    expect(first).toEqual(second);
    expect(first.cameraPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        shotId: "shot_001",
        movement: "dolly",
        lens: "wide",
        startSeconds: 0,
        endSeconds: 12
      })
    ]));
    expect(first.lightingPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "rim",
        mood: "blue-rim-neon"
      })
    ]));
    expect(first.timelinePlan).toMatchObject({
      durationSeconds: 12,
      beats: expect.arrayContaining([
        expect.objectContaining({ kind: "look-at", targetId: "robot_01" }),
        expect.objectContaining({ kind: "emissive-pulse", targetId: "flower_01" })
      ])
    });
    expect(first.vfxPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "fog_01",
        kind: "fog",
        density: 0.28
      })
    ]));
    expect(first.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "AURA_CINEMATIC_PLAN_CREATED",
        severity: "info"
      })
    ]));
  });

  it("adds default shot plans when prompt IR omits camera direction", () => {
    const director = createCinematicDirector();
    const ir = {
      ...createNeonAlleyIR(),
      cameras: [],
      shots: []
    };

    const plan = director.plan(ir);

    expect(plan.cameraPlan).toEqual([
      expect.objectContaining({
        cameraId: "camera_default",
        movement: "locked",
        generated: true
      })
    ]);
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "AURA_CINEMATIC_DEFAULT_CAMERA_USED",
        severity: "warning"
      })
    ]));
  });
});
