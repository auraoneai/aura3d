import { describe, expect, it } from "vitest";
import { validateAuraSceneIR } from "../../../packages/ai-scene/src";
import { createNeonAlleyIR, expectDiagnosticShape } from "./fixtures";

describe("AuraSceneIR validation", () => {
  it("accepts a complete deterministic mock scene IR", () => {
    const result = validateAuraSceneIR(createNeonAlleyIR());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      schemaVersion: "aura-scene-ir/1.0",
      sceneId: "scene-neon-alley-001",
      backendPreference: "auto",
      qualityTarget: "L3"
    });
  });

  it("returns stable validation diagnostics with path, code, severity, and fix suggestion", () => {
    const invalid = {
      ...createNeonAlleyIR(),
      sceneId: "",
      objects: [
        {
          id: "robot_01",
          kind: "character",
          transform: {
            position: [0, Number.NaN, 0],
            rotation: [0, 0, 0],
            scale: [1, 1]
          }
        }
      ],
      shots: [
        {
          id: "shot_001",
          cameraId: "missing_camera",
          startSeconds: 5,
          endSeconds: 2,
          movement: "dolly"
        }
      ],
      qualityTarget: "final-film"
    };

    const result = validateAuraSceneIR(invalid);

    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    for (const error of result.errors) expectDiagnosticShape(error);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "AURA_SCENE_ID_REQUIRED",
        path: "sceneId",
        severity: "error"
      }),
      expect.objectContaining({
        code: "AURA_SCENE_VEC3_INVALID",
        path: "objects[0].transform.position",
        severity: "error"
      }),
      expect.objectContaining({
        code: "AURA_SCENE_SHOT_CAMERA_MISSING",
        path: "shots[0].cameraId",
        severity: "error"
      }),
      expect.objectContaining({
        code: "AURA_SCENE_QUALITY_TARGET_INVALID",
        path: "qualityTarget",
        severity: "error"
      })
    ]));
  });
});
