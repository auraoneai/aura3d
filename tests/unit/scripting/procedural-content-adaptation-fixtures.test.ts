import { describe, expect, it } from "vitest";
import { samplePlayerBehaviorTelemetryFixture, sampleProceduralContentAdaptationFixture } from "../../../packages/scripting/src";

describe("procedural content adaptation fixtures", () => {
  it("samples deterministic old-branch content generation and adaptive AI telemetry", () => {
    const playerTelemetry = samplePlayerBehaviorTelemetryFixture({
      seed: 0xb34a,
      playerId: "content-player",
      sessionSeconds: 240,
      combatEvents: 14,
      movementEvents: 16,
      interactionEvents: 6,
      progressionEvents: 5,
      successEvents: 28
    });
    const fixture = sampleProceduralContentAdaptationFixture({
      seed: 0xc067,
      playerTelemetry,
      strategy: "counter"
    });

    expect(fixture).toMatchObject({
      source: "origin-master-content-generator-adaptive-ai-adapted",
      productionReadiness: {
        contentGenerationTelemetry: true,
        playstyleCustomizationTelemetry: true,
        skillScalingTelemetry: true,
        adaptiveAiParameterTelemetry: true
      }
    });
    expect(fixture.content.map((content) => content.type)).toEqual([
      "level",
      "enemy_encounter",
      "reward",
      "quest"
    ]);
    expect(fixture.content.every((content) => content.difficulty === "moderate" || content.difficulty === "challenging" || content.difficulty === "extreme")).toBe(true);
    expect(fixture.content.reduce((sum, content) => sum + content.estimatedDurationMs, 0)).toBeGreaterThan(0);
    expect(fixture.content.find((content) => content.type === "level")?.parameters.enemyCount ?? 0).toBeGreaterThan(0);
    expect(fixture.content.find((content) => content.type === "reward")?.parameters.rewardTier).toMatch(/standard|uncommon|rare/);
    expect(fixture.adaptiveAi.strategy).toBe("counter");
    expect(fixture.adaptiveAi.behaviorMode).toBe("adaptive");
    expect(fixture.adaptiveAi.tacticalAwareness).toBeGreaterThan(0);
    expect(fixture.adaptiveAi.reactionSpeed).toBeGreaterThan(0);
    expect(fixture.adaptiveAi.accuracy).toBeGreaterThan(0);
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "production procedural content generation parity",
      "Unity Adaptive Performance/Game Foundation parity",
      "Unreal PCG Framework/MassAI parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not create production PCG levels");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sampleProceduralContentAdaptationFixture({
      seed: 0xc067,
      playerTelemetry,
      strategy: "counter"
    }).hash).toBe(fixture.hash);
  });

  it("changes deterministic content plans when player telemetry changes", () => {
    const lowEngagement = samplePlayerBehaviorTelemetryFixture({
      seed: 0x11,
      combatEvents: 2,
      movementEvents: 8,
      interactionEvents: 2,
      progressionEvents: 1,
      successEvents: 4
    });
    const highSkill = samplePlayerBehaviorTelemetryFixture({
      seed: 0x22,
      sessionSeconds: 600,
      combatEvents: 24,
      movementEvents: 22,
      interactionEvents: 8,
      progressionEvents: 16,
      successEvents: 70
    });

    const lowFixture = sampleProceduralContentAdaptationFixture({ playerTelemetry: lowEngagement });
    const highFixture = sampleProceduralContentAdaptationFixture({ playerTelemetry: highSkill });

    expect(lowFixture.hash).not.toBe(highFixture.hash);
    expect(lowFixture.content[0]?.difficulty).not.toBe(highFixture.content[0]?.difficulty);
    expect(highFixture.adaptiveAi.tacticalAwareness).toBeGreaterThan(lowFixture.adaptiveAi.tacticalAwareness);
  });

  it("rejects invalid seeds", () => {
    const playerTelemetry = samplePlayerBehaviorTelemetryFixture();
    expect(() => sampleProceduralContentAdaptationFixture({ seed: -1, playerTelemetry })).toThrow(/seed/);
    expect(() => sampleProceduralContentAdaptationFixture({ seed: 1.5, playerTelemetry })).toThrow(/seed/);
  });
});
