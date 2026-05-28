import { describe, expect, it } from "vitest";
import { buildRainyNeonAlleySet } from "../../../packages/ai-scene/src/AuraProceduralAlleyBuilder";
import { buildProceduralNatureSet } from "../../../packages/ai-scene/src/AuraProceduralNatureBuilder";
import { buildProceduralStudioSet } from "../../../packages/ai-scene/src/AuraProceduralStudioBuilder";

describe("Aura procedural set builders", () => {
  it("builds rainy neon alley as renderer-owned set geometry with wet pavement, practical lights, rain, fog, and story blocking", () => {
    const set = buildRainyNeonAlleySet();

    expect(set.category).toBe("urban-environment");
    expect(set.renderables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "alley-wet-pavement",
        role: "ground",
        semanticTags: expect.arrayContaining(["wet-pavement"]),
        rendererOwned: true
      }),
      expect.objectContaining({
        id: "neon-practical-left",
        role: "practical-light",
        semanticTags: expect.arrayContaining(["neon-practical-light", "scene-geometry"]),
        light: expect.objectContaining({ castsLight: true })
      }),
      expect.objectContaining({
        id: "rain-particle-field",
        role: "vfx",
        semanticTags: expect.arrayContaining(["rain", "renderer-owned"])
      }),
      expect.objectContaining({
        id: "alley-fog-volume",
        role: "vfx",
        semanticTags: expect.arrayContaining(["fog", "renderer-owned"])
      })
    ]));
    expect(set.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "mat-procedural-wet-pavement",
        target: "ground",
        descriptors: expect.arrayContaining(["wet-pavement", "neon reflections"]),
        requiresRendererMaterial: true
      })
    ]));
    expect(set.storyBlocking).toMatchObject({
      robotPosition: [-0.7, 0, 0.35],
      flowerPosition: [0.2, 0.02, -1.2],
      cameraPosition: [0, 0.9, 4.2],
      cameraTarget: [-0.1, 0.55, -0.75],
      practicalLightIds: ["neon-practical-left"]
    });
    expect(set.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AURA_PROCEDURAL_ALLEY_SET_BUILT", severity: "info" })
    ]));
  });

  it("builds studio and nature fallbacks without DOM or CSS renderables", () => {
    const renderables = [...buildProceduralStudioSet().renderables, ...buildProceduralNatureSet().renderables];

    expect(renderables.length).toBeGreaterThan(0);
    for (const renderable of renderables) {
      expect(renderable.rendererOwned).toBe(true);
      expect(renderable.geometry).not.toBe("dom");
      expect(renderable.semanticTags.join(" ").toLowerCase()).not.toContain("css");
    }
  });
});
