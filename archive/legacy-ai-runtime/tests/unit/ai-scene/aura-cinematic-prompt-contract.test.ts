import { describe, expect, it } from "vitest";
import { createNorthStarCinematicSceneIntent } from "../../../packages/ai-scene/src/AuraCinematicSceneIntent";
import { AURA_CINEMATIC_PROMPT_CONTRACT, validateCinematicSceneIntent } from "../../../packages/ai-scene/src/AuraCinematicPromptContract";

describe("Aura cinematic prompt contract", () => {
  it("accepts the north-star cinematic intent with required camera, materials, VFX, assets, quality, and constraints", () => {
    const intent = createNorthStarCinematicSceneIntent();
    const result = validateCinematicSceneIntent(intent);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(intent.shots[0]).toEqual(expect.objectContaining({
      durationSeconds: 12,
      movement: "dolly",
      camera: expect.objectContaining({
        startPosition: [0, 0.9, 4.2],
        endPosition: [-0.15, 0.85, 2.2]
      })
    }));
    expect(intent.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: "hero-subject",
        descriptors: expect.arrayContaining(["wet", "brushed metal"])
      }),
      expect.objectContaining({
        target: "ground",
        descriptors: expect.arrayContaining(["wet-pavement", "reflective puddles"])
      })
    ]));
    expect(intent.vfx).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "rain", rendererOwned: true }),
      expect.objectContaining({ kind: "fog", rendererOwned: true }),
      expect.objectContaining({ kind: "glow", rendererOwned: true })
    ]));
    expect(intent.assetRequirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ semanticTags: expect.arrayContaining(["robot"]), fallbackPriority: expect.arrayContaining(["local-asset"]) }),
      expect.objectContaining({ semanticTags: expect.arrayContaining(["glowing-flower"]), fallbackPriority: expect.arrayContaining(["procedural-mesh"]) }),
      expect.objectContaining({ semanticTags: expect.arrayContaining(["rainy-neon-alley"]), fallbackPriority: expect.arrayContaining(["procedural-set"]) }),
      expect.objectContaining({ semanticTags: expect.arrayContaining(["wet-pavement"]) }),
      expect.objectContaining({ semanticTags: expect.arrayContaining(["neon-practical-light"]) })
    ]));
    expect(intent.backendPreference).toBe("webgl2");
    expect(intent.qualityTarget).toBe("L3-cinematic-realtime");
  });

  it("fails intent that omits concrete camera movement, ground material, asset fallback, and negative constraints", () => {
    const invalid = {
      ...createNorthStarCinematicSceneIntent(),
      shots: [
        {
          ...createNorthStarCinematicSceneIntent().shots[0],
          camera: { ...createNorthStarCinematicSceneIntent().shots[0].camera, endPosition: undefined }
        }
      ],
      materials: createNorthStarCinematicSceneIntent().materials.filter((material) => material.target !== "ground"),
      assetRequirements: [
        {
          ...createNorthStarCinematicSceneIntent().assetRequirements[0],
          fallbackPriority: [],
          disallowedSubstitutes: []
        }
      ],
      negativeConstraints: ["Make it look finished."]
    };

    const result = validateCinematicSceneIntent(invalid);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AURA_CINEMATIC_CAMERA_MOVEMENT_REQUIRED", path: "shots[0]" }),
      expect.objectContaining({ code: "AURA_CINEMATIC_GROUND_MATERIAL_REQUIRED", path: "materials" }),
      expect.objectContaining({ code: "AURA_CINEMATIC_ASSET_FALLBACK_REQUIRED", path: "assetRequirements[0].fallbackPriority" }),
      expect.objectContaining({ code: "AURA_CINEMATIC_DOM_CSS_DISALLOW_REQUIRED", path: "assetRequirements[0].disallowedSubstitutes" }),
      expect.objectContaining({ code: "AURA_CINEMATIC_FINAL_FILM_CLAIM_CONSTRAINT_REQUIRED", path: "negativeConstraints" }),
      expect.objectContaining({ code: "AURA_CINEMATIC_DOM_CSS_CONSTRAINT_REQUIRED", path: "negativeConstraints" })
    ]));
  });

  it("publishes contract instructions that forbid unsupported final-film claims and DOM/CSS-only substitutes", () => {
    const contractText = AURA_CINEMATIC_PROMPT_CONTRACT.join("\n").toLowerCase();

    expect(contractText).toContain("sceneType".toLowerCase());
    expect(contractText).toContain("fallback");
    expect(contractText).toContain("dom/css");
    expect(contractText).toContain("final-film");
    expect(contractText).toContain("qualitytarget");
    expect(contractText).toContain("backendpreference");
  });
});
