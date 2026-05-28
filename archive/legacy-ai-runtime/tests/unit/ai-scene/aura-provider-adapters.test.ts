import { describe, expect, it } from "vitest";
import { createMockProvider } from "../../../packages/ai-scene/src";
import { createNeonAlleyIR } from "./fixtures";

describe("AI scene provider adapters", () => {
  it("creates deterministic mock AuraSceneIR without network or API keys", async () => {
    const fixture = createNeonAlleyIR();
    const provider = createMockProvider({
      seed: "unit-neon-alley",
      fixture
    });

    const originalFetch = globalThis.fetch;
    let networkUsed = false;
    globalThis.fetch = (async () => {
      networkUsed = true;
      throw new Error("Mock provider must not use network.");
    }) as typeof fetch;
    try {
      const first = await provider.promptToScene({
        prompt: "Create a rainy neon alley at night. A lonely robot finds a glowing flower.",
        qualityTarget: "L3"
      });
      const second = await provider.promptToScene({
        prompt: "Create a rainy neon alley at night. A lonely robot finds a glowing flower.",
        qualityTarget: "L3"
      });

      expect(networkUsed).toBe(false);
      expect(first.ir).toEqual(second.ir);
      expect(first.ir).toMatchObject({
        schemaVersion: "aura-scene-ir/1.0",
        sceneId: "scene-neon-alley-001",
        qualityTarget: "L3",
        provenance: {
          provider: "mock",
          model: "aura-mock-scene-v1"
        }
      });
      expect(first.providerMode).toBe("mock");
      expect(first.networkUsed).toBe(false);
      expect(first.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "AURA_PROVIDER_MOCK_DETERMINISTIC",
          severity: "info"
        })
      ]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates deterministic scene patches from the mock provider", async () => {
    const provider = createMockProvider({ seed: "unit-patch" });

    const first = await provider.promptToPatch({
      sceneId: "scene-neon-alley-001",
      prompt: "Make the robot smaller, add more fog, and move the camera lower."
    });
    const second = await provider.promptToPatch({
      sceneId: "scene-neon-alley-001",
      prompt: "Make the robot smaller, add more fog, and move the camera lower."
    });

    expect(first.patch).toEqual(second.patch);
    expect(first.patch).toMatchObject({
      sceneId: "scene-neon-alley-001",
      objects: [expect.objectContaining({ id: "robot_01" })],
      vfx: [expect.objectContaining({ id: "fog_01" })],
      cameras: [expect.objectContaining({ id: "camera_hero" })]
    });
    expect(first.networkUsed).toBe(false);
  });
});
