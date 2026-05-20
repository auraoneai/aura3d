import { describe, expect, it } from "vitest";
import { sampleLearningAgentFixture } from "../../../packages/scripting/src";

describe("learning agent fixtures", () => {
  it("samples deterministic old-branch feature extraction, behavior cloning, PPO, and reward telemetry", () => {
    const fixture = sampleLearningAgentFixture({
      seed: 0x1ea5,
      targetDistance: 5.25,
      health: 0.68,
      energy: 0.54,
      nearbyCount: 3
    });

    expect(fixture).toMatchObject({
      source: "origin-master-ml-agent-adapted",
      observation: {
        featureSize: 27,
        nearbyEntitySlots: 3
      },
      behaviorCloning: {
        selectedAction: "move-to-target"
      },
      reinforcementLearning: {
        gamma: 0.99,
        lambda: 0.95,
        clipRange: 0.2
      },
      productionReadiness: {
        featureExtractionTelemetry: true,
        behaviorCloningTelemetry: true,
        ppoStatsTelemetry: true,
        rewardBreakdownTelemetry: true
      }
    });
    expect(fixture.observation.normalizedPosition).toHaveLength(3);
    expect(fixture.observation.normalizedVelocity).toHaveLength(3);
    expect(fixture.observation.featureHash).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.behaviorCloning.demonstrations).toBeGreaterThan(20);
    expect(fixture.behaviorCloning.validationAccuracy).toBeGreaterThan(0.7);
    expect(fixture.reinforcementLearning.avgReturn).toBe(fixture.reward.total);
    expect(fixture.reinforcementLearning.explainedVariance).toBeGreaterThan(0.6);
    expect(fixture.reward.total).toBeGreaterThan(0);
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "real neural-network training",
      "ONNX runtime inference parity",
      "Unity ML-Agents parity",
      "Unreal Learning Agents parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not train neural networks");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sampleLearningAgentFixture({
      seed: 0x1ea5,
      targetDistance: 5.25,
      health: 0.68,
      energy: 0.54,
      nearbyCount: 3
    }).hash).toBe(fixture.hash);
  });

  it("rejects invalid learning-agent fixture inputs", () => {
    expect(() => sampleLearningAgentFixture({ seed: -1 })).toThrow(/seed/);
    expect(() => sampleLearningAgentFixture({ targetDistance: -0.1 })).toThrow(/targetDistance/);
  });
});
