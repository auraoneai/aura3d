import { describe, expect, it } from "vitest";
import { sampleAnalyticsPrivacyFixture } from "../../../packages/scripting/src";

describe("analytics privacy fixtures", () => {
  it("samples deterministic old-branch analytics consent, anonymization, batching, and metrics telemetry", () => {
    const fixture = sampleAnalyticsPrivacyFixture({
      seed: 0xa11a,
      userId: "analytics-player",
      sessionId: "session-1",
      frameMs: 20,
      eventCount: 24,
      errorCount: 3,
      analyticsConsent: true
    });

    expect(fixture).toMatchObject({
      source: "origin-master-analytics-privacy-adapted",
      productionReadiness: {
        consentTelemetry: true,
        anonymizationTelemetry: true,
        batchingTelemetry: true,
        metricsTelemetry: true,
        providerBoundaryTelemetry: true
      }
    });
    expect(fixture.consent.categories.necessary).toBe(true);
    expect(fixture.consent.categories.analytics).toBe(true);
    expect(fixture.consent.deniedCount).toBeGreaterThanOrEqual(1);
    expect(fixture.consent.changeEvents.length).toBeGreaterThanOrEqual(2);
    expect(fixture.anonymization.userHash).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.anonymization.sessionHash).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.anonymization.emailRedacted).toBe(true);
    expect(fixture.anonymization.tokenRedacted).toBe(true);
    expect(fixture.anonymization.ipAnonymized).toMatch(/\d+\.\d+\.\d+\.0/);
    expect(fixture.batching.providerMode).toBe("batched-local");
    expect(fixture.batching.queuedEvents).toBe(24);
    expect(fixture.batching.flushedBatches).toBeGreaterThan(0);
    expect(fixture.metrics.fps).toBe(50);
    expect(fixture.metrics.errorCount).toBe(3);
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "GDPR/CCPA compliance certification",
      "Unity Analytics parity",
      "Unreal Insights/Analytics parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not send analytics events");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sampleAnalyticsPrivacyFixture({
      seed: 0xa11a,
      userId: "analytics-player",
      sessionId: "session-1",
      frameMs: 20,
      eventCount: 24,
      errorCount: 3,
      analyticsConsent: true
    }).hash).toBe(fixture.hash);
  });

  it("blocks event batching when analytics consent is absent", () => {
    const fixture = sampleAnalyticsPrivacyFixture({
      analyticsConsent: false,
      eventCount: 12
    });

    expect(fixture.consent.categories.analytics).toBe(false);
    expect(fixture.batching.providerMode).toBe("disabled");
    expect(fixture.batching.queuedEvents).toBe(0);
    expect(fixture.batching.blockedWithoutConsent).toBe(12);
  });

  it("rejects invalid analytics fixture inputs", () => {
    expect(() => sampleAnalyticsPrivacyFixture({ seed: -1 })).toThrow(/seed/);
    expect(() => sampleAnalyticsPrivacyFixture({ userId: " " })).toThrow(/userId/);
    expect(() => sampleAnalyticsPrivacyFixture({ sessionId: " " })).toThrow(/sessionId/);
    expect(() => sampleAnalyticsPrivacyFixture({ frameMs: 0 })).toThrow(/frameMs/);
    expect(() => sampleAnalyticsPrivacyFixture({ eventCount: -1 })).toThrow(/eventCount/);
    expect(() => sampleAnalyticsPrivacyFixture({ errorCount: -1 })).toThrow(/errorCount/);
  });
});
