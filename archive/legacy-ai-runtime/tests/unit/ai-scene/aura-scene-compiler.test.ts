import { describe, expect, it } from "vitest";
import {
  createAuraSceneCompiler,
  createDefaultAssetResolver
} from "../../../packages/ai-scene/src";
import { createNeonAlleyIR } from "./fixtures";

describe("Aura scene compiler", () => {
  it("compiles AuraSceneIR into a deterministic no-network runtime plan", async () => {
    const ir = createNeonAlleyIR();
    const compiler = createAuraSceneCompiler({
      assetResolver: createDefaultAssetResolver({
        manifest: {
          assets: [
            {
              id: "robot-expressive",
              semantic: "robot",
              tags: ["robot", "character"],
              uri: "/fixtures/threejs-parity/assets/character/robot-expressive.glb",
              license: "fixture",
              source: "local-fixture"
            }
          ]
        }
      })
    });

    const result = await compiler.compile(ir);

    expect(result.networkUsed).toBe(false);
    expect(result.scene).toMatchObject({
      sceneId: "scene-neon-alley-001",
      title: "Rainy Neon Alley",
      backendPreference: "auto"
    });
    expect(result.scene.nodes.map((node: { readonly id: string }) => node.id)).toEqual(expect.arrayContaining([
      "env_alley_01",
      "robot_01",
      "flower_01",
      "camera_hero",
      "light_key_01"
    ]));
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "AURA_SCENE_COMPILED",
        severity: "info"
      }),
      expect.objectContaining({
        code: "AURA_ASSET_PLACEHOLDER_USED",
        severity: "warning"
      })
    ]));
    expect(result.assets.resolved).toEqual([
      expect.objectContaining({ requirementId: "asset_robot", assetId: "robot-expressive" })
    ]);
    expect(result.assets.placeholders).toEqual([
      expect.objectContaining({ requirementId: "asset_flower" })
    ]);
    expect(result.timeline).toMatchObject({
      durationSeconds: 12,
      cues: expect.arrayContaining([
        expect.objectContaining({ id: "cue_robot_look" }),
        expect.objectContaining({ id: "cue_flower_glow" })
      ])
    });
  });

  it("rejects invalid IR with structured validation diagnostics before compiling", async () => {
    const compiler = createAuraSceneCompiler();

    await expect(compiler.compile({ ...createNeonAlleyIR(), sceneId: "" })).rejects.toMatchObject({
      code: "AURA_SCENE_VALIDATION_FAILED",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "AURA_SCENE_ID_REQUIRED",
          path: "sceneId",
          severity: "error"
        })
      ])
    });
  });
});
