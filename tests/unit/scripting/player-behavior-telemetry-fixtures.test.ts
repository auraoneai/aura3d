import { describe, expect, it } from "vitest";
import { samplePlayerBehaviorTelemetryFixture } from "../../../packages/scripting/src";

describe("player behavior telemetry fixtures", () => {
  it("samples deterministic old-branch profile, event, and behavior-analysis telemetry", () => {
    const fixture = samplePlayerBehaviorTelemetryFixture({
      seed: 0xb34a,
      playerId: "player-test",
      sessionSeconds: 240,
      combatEvents: 14,
      movementEvents: 16,
      interactionEvents: 6,
      progressionEvents: 5,
      successEvents: 28
    });

    expect(fixture).toMatchObject({
      source: "origin-master-player-profile-event-analysis-adapted",
      playerId: "player-test",
      productionReadiness: {
        playerProfileTelemetry: true,
        eventTrackingTelemetry: true,
        behaviorPatternTelemetry: true,
        adaptiveSystemInputTelemetry: true
      }
    });
    expect(fixture.profile.skills.length).toBeGreaterThanOrEqual(4);
    expect(fixture.profile.patterns.length).toBeGreaterThanOrEqual(2);
    expect(fixture.profile.preferences.length).toBeGreaterThanOrEqual(2);
    expect(fixture.events.total).toBe(41);
    expect(fixture.events.byCategory.combat).toBe(14);
    expect(fixture.events.successRate).toBeGreaterThan(0.6);
    expect(fixture.events.eventsPerMinute).toBeGreaterThan(0);
    expect(fixture.sessionAnalysis.durationMs).toBe(240000);
    expect(fixture.sessionAnalysis.insights.length).toBeGreaterThanOrEqual(2);
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "production player modeling certification",
      "Unity Analytics/Remote Config parity",
      "Unreal Insights gameplay telemetry parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not claim production player modeling");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(samplePlayerBehaviorTelemetryFixture({
      seed: 0xb34a,
      playerId: "player-test",
      sessionSeconds: 240,
      combatEvents: 14,
      movementEvents: 16,
      interactionEvents: 6,
      progressionEvents: 5,
      successEvents: 28
    }).hash).toBe(fixture.hash);
  });

  it("rejects invalid telemetry fixture inputs", () => {
    expect(() => samplePlayerBehaviorTelemetryFixture({ playerId: " " })).toThrow(/playerId/);
    expect(() => samplePlayerBehaviorTelemetryFixture({ sessionSeconds: 0 })).toThrow(/sessionSeconds/);
    expect(() => samplePlayerBehaviorTelemetryFixture({ combatEvents: -1 })).toThrow(/combatEvents/);
  });
});
