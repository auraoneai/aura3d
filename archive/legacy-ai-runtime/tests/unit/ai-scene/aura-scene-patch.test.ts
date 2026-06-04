import { describe, expect, it } from "vitest";
import { applyScenePatch } from "../../../packages/ai-scene/src";
import { createNeonAlleyIR } from "./fixtures";

describe("Aura scene patches", () => {
  it("applies object, VFX, camera, material, lighting, and timeline patches with change records", () => {
    const before = createNeonAlleyIR();
    const result = applyScenePatch(before, {
      patchId: "patch_robot_smaller_fog_camera",
      sceneId: before.sceneId,
      createdAt: "2026-05-26T01:00:00.000Z",
      objects: [
        { id: "robot_01", transform: { scale: [0.65, 0.65, 0.65] } }
      ],
      vfx: [
        { id: "fog_01", density: 0.45 }
      ],
      cameras: [
        { id: "camera_hero", position: [0, 0.55, 3.4], lens: "wide" }
      ],
      materials: [
        { id: "mat_flower_glow", emissive: [0.45, 1, 1] }
      ],
      lighting: [
        { id: "light_rim_01", intensity: 3.1 }
      ],
      timeline: {
        durationSeconds: 14,
        cues: [{ id: "cue_rain_swell", atSeconds: 9.5, kind: "vfx-intensity", targetId: "rain_01" }]
      }
    });

    expect(result.scene).not.toBe(before);
    expect(before.characters[0]?.transform.scale).toEqual([1, 1, 1]);
    expect(result.scene.characters[0]?.transform.scale).toEqual([0.65, 0.65, 0.65]);
    expect(result.scene.vfx.find((cue: { readonly id: string }) => cue.id === "fog_01")?.density).toBe(0.45);
    expect(result.scene.cameras[0]).toMatchObject({ id: "camera_hero", position: [0, 0.55, 3.4] });
    expect(result.scene.materials.find((material: { readonly id: string }) => material.id === "mat_flower_glow")?.emissive).toEqual([0.45, 1, 1]);
    expect(result.scene.lighting.rim).toMatchObject({ id: "light_rim_01", intensity: 3.1 });
    expect(result.scene.timeline.durationSeconds).toBe(14);
    expect(result.scene.timeline.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "cue_rain_swell", targetId: "rain_01" })
    ]));
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "characters[robot_01].transform.scale", before: [1, 1, 1], after: [0.65, 0.65, 0.65] }),
      expect.objectContaining({ path: "vfx[fog_01].density", before: 0.28, after: 0.45 }),
      expect.objectContaining({ path: "cameras[camera_hero].position", before: [0, 0.85, 4.2], after: [0, 0.55, 3.4] })
    ]));
    expect(result.scene.provenance.patches).toEqual([
      expect.objectContaining({
        patchId: "patch_robot_smaller_fog_camera",
        changeCount: result.changes.length
      })
    ]);
  });

  it("rejects patches that target missing stable ids", () => {
    const scene = createNeonAlleyIR();

    try {
      applyScenePatch(scene, {
        patchId: "patch_missing_target",
        sceneId: scene.sceneId,
        objects: [{ id: "ghost_robot", transform: { scale: [0.5, 0.5, 0.5] } }]
      });
      throw new Error("Expected missing patch target to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "AURA_SCENE_PATCH_TARGET_MISSING",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "AURA_SCENE_PATCH_TARGET_MISSING",
            path: "objects[ghost_robot]",
            severity: "error"
          })
        ])
      });
    }
  });
});
