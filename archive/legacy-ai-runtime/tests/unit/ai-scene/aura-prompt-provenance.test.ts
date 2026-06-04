import { describe, expect, it } from "vitest";
import { createPromptProvenance } from "../../../packages/ai-scene/src";

describe("Aura prompt provenance", () => {
  it("records provider, model, generated time, prompt hash, and redacted metadata", () => {
    const first = createPromptProvenance({
      provider: "mock",
      model: "aura-mock-scene-v1",
      prompt: "Create a rainy neon alley at night.",
      generatedAt: "2026-05-26T00:00:00.000Z",
      requestId: "req-unit-001",
      metadata: {
        apiKey: "sk-do-not-serialize",
        userIntent: "previs"
      }
    });
    const second = createPromptProvenance({
      provider: "mock",
      model: "aura-mock-scene-v1",
      prompt: "Create a rainy neon alley at night.",
      generatedAt: "2026-05-26T00:00:00.000Z",
      requestId: "req-unit-001",
      metadata: {
        apiKey: "sk-do-not-serialize",
        userIntent: "previs"
      }
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      provider: "mock",
      model: "aura-mock-scene-v1",
      generatedAt: "2026-05-26T00:00:00.000Z",
      requestId: "req-unit-001",
      promptHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      promptPreview: "Create a rainy neon alley at night.",
      metadata: {
        apiKey: "[REDACTED]",
        userIntent: "previs"
      }
    });
    expect(JSON.stringify(first)).not.toContain("sk-do-not-serialize");
  });

  it("captures patch provenance without leaking prompt contents in full", () => {
    const provenance = createPromptProvenance({
      provider: "mock",
      model: "aura-mock-scene-v1",
      prompt: "Make the robot smaller, add more fog, and move the camera lower.",
      generatedAt: "2026-05-26T01:00:00.000Z",
      patchId: "patch_robot_smaller_fog_camera",
      sceneId: "scene-neon-alley-001"
    });

    expect(provenance).toMatchObject({
      sceneId: "scene-neon-alley-001",
      patchId: "patch_robot_smaller_fog_camera",
      promptHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(provenance.promptPreview.length).toBeLessThanOrEqual(96);
  });
});
