import { describe, expect, it } from "vitest";
import { sampleCulturalBehaviorFixture } from "../../../packages/scripting/src";

describe("cultural behavior fixtures", () => {
  it("samples deterministic old-branch proxemics, communication, gesture, and decision telemetry", () => {
    const fixture = sampleCulturalBehaviorFixture({
      seed: 0xc017,
      relationship: "superior",
      initiatorPosition: [0, 0, 0],
      targetPosition: [0.82, 0, 0.34],
      message: "help me with the gate plan."
    });

    expect(fixture).toMatchObject({
      source: "origin-master-cultural-ai-adapted",
      proxemics: {
        relationship: "superior",
        zone: "personal"
      },
      communication: {
        directness: "indirect",
        formality: "formal",
        audienceAdapted: true
      },
      productionReadiness: {
        proxemicTelemetry: true,
        communicationStyleTelemetry: true,
        socialNormTelemetry: true,
        gestureBoundaryTelemetry: true
      }
    });
    expect(fixture.cultures).toHaveLength(2);
    expect(fixture.entities).toHaveLength(2);
    expect(fixture.proxemics.distanceMeters).toBeGreaterThan(0);
    expect(fixture.proxemics.acceptableDistanceMeters).toBeGreaterThan(fixture.proxemics.distanceMeters);
    expect(fixture.proxemics.comfort).toBeGreaterThanOrEqual(0);
    expect(fixture.communication.formatted).toContain("Please");
    expect(fixture.communication.formatted).toContain("might");
    expect(fixture.socialNorms.hierarchyAware).toBe(true);
    expect(fixture.socialNorms.normViolations).toContain("personal-space-too-close");
    expect(["request-distance", "formal-greeting"]).toContain(fixture.decision.selectedAction);
    expect(fixture.gesture.id).toBe("measured-handshake");
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "real cultural modeling certification",
      "Unity Behavior Designer or ML-Agents social AI parity",
      "Unreal MassAI/SmartObject social simulation parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not claim validated cultural modeling");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sampleCulturalBehaviorFixture({
      seed: 0xc017,
      relationship: "superior",
      initiatorPosition: [0, 0, 0],
      targetPosition: [0.82, 0, 0.34],
      message: "help me with the gate plan."
    }).hash).toBe(fixture.hash);
  });

  it("rejects invalid seeds instead of publishing unstable cultural telemetry", () => {
    expect(() => sampleCulturalBehaviorFixture({ seed: -1 })).toThrow(/seed/);
    expect(() => sampleCulturalBehaviorFixture({ seed: 1.5 })).toThrow(/seed/);
  });
});
